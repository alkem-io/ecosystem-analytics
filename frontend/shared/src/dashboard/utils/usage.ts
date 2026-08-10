import type { GemeenteLocation } from '@server/types/api.js';
import type { CityRow, CityInitiativeRef } from './cities.js';

/**
 * Usage Explorer aggregation (feature 019).
 *
 * Geometry and ranking for the map: which gemeente sits where, how big its marker is,
 * which gemeentes are currently in view, and what those gemeentes collectively use.
 *
 * THE RULES HERE ARE NORMATIVE — see specs/019-usage-explorer/contracts/usage-aggregation.md,
 * pinned by frontend/vng/src/dashboard/usage.test.ts.
 *
 * This module deliberately does NOT count initiatives. That rule belongs to feature 018
 * (`buildCityRows` in ./cities.ts, mirrored server-side by `countCityInitiatives`), and four
 * places already agree on it. Here we consume `CityRow.initiativeCount` and add only
 * position, marker geometry, and viewport filtering — which is what makes FR-029
 * ("the count matches the Cities view") structural rather than a coincidence.
 */

/** Smallest participating dot, in SVG units. The grey zero-initiative square matches it. */
export const MIN_DIAMETER = 7;

/** The 3× rule (FR-008): the busiest gemeente's dot is exactly three times the smallest. */
export const MAX_DIAMETER = MIN_DIAMETER * 3;

/** One gemeente on the map — position joined to count. */
export interface UsageMarker {
  nameId: string;
  name: string;
  provinceCode: string;
  provinceName: string;
  /** Distinct initiatives in the current selection. 0 for a non-participating gemeente. */
  initiativeCount: number;
  /** Projected position in SVG coordinates. Static: computed once, never on zoom. */
  x: number;
  y: number;
  /** Dot for a participant, grey square for a gemeente with no initiatives (FR-006). */
  shape: 'dot' | 'square';
  /** Rendered size (diameter for a dot, edge for a square) before any zoom counter-scale. */
  diameter: number;
  /** The underlying city row — for the focus panel and the route into city details. */
  cityRow: CityRow | null;
}

/** The ranked list under the map. */
export interface AreaInitiativeEntry {
  id: string;
  name: string;
  kind: 'groei' | 'gd';
  /** Distinct visible gemeentes using this initiative. */
  cityCount: number;
  /** True when the focused gemeente also uses it (FR-026). */
  usedByFocused: boolean;
}

export interface AreaRanking {
  entries: AreaInitiativeEntry[];
  /** Total gemeentes in view — the shared denominator for every entry (FR-019b). */
  denominator: number;
}

/** What is currently on screen. */
export interface VisibleArea {
  markers: UsageMarker[];
  /** All gemeentes in view, including those participating in nothing. */
  total: number;
  /** How many of those take part in at least one initiative. */
  participating: number;
}

/** A projection function — lon/lat to SVG coordinates. Supplied by the basemap. */
export type ProjectFn = (point: [number, number]) => [number, number] | null;

/**
 * Marker diameter for an initiative count.
 *
 * Linear in count and ANCHORED AT 1, so the smallest dot always means "exactly one
 * initiative" no matter what is selected (FR-007, FR-008a). `maxCount` spans the whole
 * selection rather than the viewport, which is what stops dots resizing as the user
 * zooms — see the invariant table in the aggregation contract.
 */
export function markerDiameter(count: number, maxCount: number): number {
  if (count <= 0) return MIN_DIAMETER;
  // No range to interpolate across: everything sits at the smallest size rather than
  // everything jumping to the largest (FR-008b).
  if (maxCount <= 1) return MIN_DIAMETER;
  const clamped = Math.min(count, maxCount);
  return MIN_DIAMETER + ((clamped - 1) / (maxCount - 1)) * (MAX_DIAMETER - MIN_DIAMETER);
}

/**
 * Build one marker per Dutch gemeente, joining cached positions to current counts.
 *
 * Gemeentes without usable coordinates cannot be placed and are returned separately as
 * `unplaced` so the view can disclose the number rather than silently losing them (FR-030).
 */
export function buildUsageMarkers(
  locations: GemeenteLocation[],
  cityRows: CityRow[],
  project: ProjectFn,
): { markers: UsageMarker[]; unplaced: number } {
  const rowByNameId = new Map<string, CityRow>();
  for (const r of cityRows) {
    if (r.nameId) rowByNameId.set(r.nameId, r);
  }

  // The scale spans EVERY eligible gemeente in the selection, not just the placeable or
  // visible ones, so the legend means the same thing everywhere on the map.
  let maxCount = 0;
  for (const loc of locations) {
    const c = rowByNameId.get(loc.nameId)?.initiativeCount ?? 0;
    if (c > maxCount) maxCount = c;
  }

  const markers: UsageMarker[] = [];
  let unplaced = 0;

  for (const loc of locations) {
    if (loc.latitude == null || loc.longitude == null) {
      unplaced += 1;
      continue;
    }
    const projected = project([loc.longitude, loc.latitude]);
    if (!projected) {
      unplaced += 1;
      continue;
    }
    const row = rowByNameId.get(loc.nameId) ?? null;
    const count = row?.initiativeCount ?? 0;
    markers.push({
      nameId: loc.nameId,
      name: loc.title,
      provinceCode: loc.provinceCode,
      provinceName: loc.provinceName,
      initiativeCount: count,
      x: projected[0],
      y: projected[1],
      shape: count > 0 ? 'dot' : 'square',
      diameter: markerDiameter(count, maxCount),
      // Null when the gemeente is absent from the graph entirely — it has no row, which
      // is different from having a row with zero initiatives.
      cityRow: row,
    });
  }

  return { markers, unplaced };
}

/** The highest initiative count across a marker set — exposed for the legend. */
export function maxInitiativeCount(markers: UsageMarker[]): number {
  return markers.reduce((m, x) => Math.max(m, x.initiativeCount), 0);
}

/**
 * Which markers fall inside the current viewport.
 *
 * Containment is tested on the marker's ANCHOR POINT, not its bounding box, so a count
 * doesn't flicker as a large dot straddles the edge of the screen (FR-016, contract §4).
 */
export function computeVisibleArea(
  markers: UsageMarker[],
  bounds: { x0: number; y0: number; x1: number; y1: number },
): VisibleArea {
  const visible = markers.filter(
    (m) => m.x >= bounds.x0 && m.x <= bounds.x1 && m.y >= bounds.y0 && m.y <= bounds.y1,
  );
  return {
    markers: visible,
    total: visible.length,
    participating: visible.filter((m) => m.initiativeCount > 0).length,
  };
}

/**
 * Rank the initiatives in use across the visible gemeentes.
 *
 * Counting uses a Set of gemeente nameIDs per initiative, so a gemeente linked to the
 * same initiative more than once still counts once (FR-028) — structurally, rather than
 * depending on upstream de-duplication.
 *
 * Ordering is count descending then name ascending; both keys are required, or ties fall
 * back to map-iteration order and the list can reshuffle between identical renders (FR-020).
 */
export function buildAreaRanking(
  area: VisibleArea,
  focused: UsageMarker | null = null,
): AreaRanking {
  const citiesByInitiative = new Map<string, Set<string>>();
  const refByInitiative = new Map<string, CityInitiativeRef>();

  for (const marker of area.markers) {
    for (const initiative of marker.cityRow?.initiatives ?? []) {
      let cities = citiesByInitiative.get(initiative.id);
      if (!cities) citiesByInitiative.set(initiative.id, (cities = new Set()));
      cities.add(marker.nameId);
      if (!refByInitiative.has(initiative.id)) refByInitiative.set(initiative.id, initiative);
    }
  }

  const focusedInitiativeIds = new Set(
    (focused?.cityRow?.initiatives ?? []).map((i) => i.id),
  );

  const entries: AreaInitiativeEntry[] = [...citiesByInitiative.entries()].map(([id, cities]) => {
    const ref = refByInitiative.get(id)!;
    return {
      id,
      name: ref.name,
      kind: ref.kind,
      cityCount: cities.size,
      usedByFocused: focusedInitiativeIds.has(id),
    };
  });

  entries.sort((a, b) => b.cityCount - a.cityCount || a.name.localeCompare(b.name));

  return { entries, denominator: area.total };
}
