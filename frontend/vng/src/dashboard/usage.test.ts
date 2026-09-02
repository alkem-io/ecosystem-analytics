import { describe, expect, it } from 'vitest';
import {
  MIN_DIAMETER,
  MAX_DIAMETER,
  markerDiameter,
  buildUsageMarkers,
  computeVisibleArea,
  buildAreaRanking,
  type UsageMarker,
} from '@ea/shared/dashboard/utils/usage.js';
import { buildCityRows, type CityRow } from '@ea/shared/dashboard/utils/cities.js';
import type { GemeenteLocation } from '@server/types/api.js';
import type { GraphDataset, GraphEdge, GraphNode } from '@server/types/graph.js';

/**
 * Conformance test for the Usage Explorer aggregation rules.
 *
 * The expectations below are NORMATIVE — they implement the ten test obligations listed
 * in specs/019-usage-explorer/contracts/usage-aggregation.md §8. If a rule changes, the
 * contract, `usage.ts`, and this file change in the same commit.
 *
 * The final block is the important one: it asserts the counts here agree with
 * `buildCityRows`, which is the feature-018 rule the Cities view uses. That agreement is
 * FR-029, and it holds because this module consumes those counts rather than recomputing.
 */

/** Identity projection — lon/lat pass through as x/y so geometry assertions read plainly. */
const project = (p: [number, number]): [number, number] => [p[0], p[1]];

function location(nameId: string, title: string, lon: number, lat: number): GemeenteLocation {
  return {
    nameId,
    title,
    cbsCode: `GM${nameId.length.toString().padStart(4, '0')}`,
    latitude: lat,
    longitude: lon,
    provinceCode: 'PV20',
    provinceName: 'Groningen',
  };
}

/** A CityRow carrying `count` synthetic initiatives, named so ordering is predictable. */
function row(nameId: string, name: string, initiativeNames: string[]): CityRow {
  const initiatives = initiativeNames.map((n) => ({
    id: `init-${n}`,
    name: n,
    kind: 'groei' as const,
    vng2030: [],
    nds: [],
    themes: [],
  }));
  return {
    id: `org-${nameId}`,
    nameId,
    cbsCode: null,
    name,
    provinceName: 'Groningen',
    population: 1000,
    initiatives,
    initiativeCount: initiatives.length,
    groeiCount: initiatives.length,
    gdCount: 0,
    vng2030: [],
    nds: [],
    themes: [],
    node: {} as GraphNode,
  };
}

const ALL_BOUNDS = { x0: -1000, y0: -1000, x1: 1000, y1: 1000 };

// ─────────────────────────────────────────────────────────────────────────────
// Obligations 1–4: the marker-size rule
// ─────────────────────────────────────────────────────────────────────────────

describe('markerDiameter — the anchored 3× scale', () => {
  it('always renders a count of 1 at the smallest size, whatever the maximum (obligation 1)', () => {
    for (const maxCount of [2, 3, 9, 40, 137]) {
      expect(markerDiameter(1, maxCount), `maxCount=${maxCount}`).toBe(MIN_DIAMETER);
    }
  });

  it('renders the selection maximum at exactly 3× the smallest (obligation 1)', () => {
    for (const maxCount of [2, 3, 9, 40, 137]) {
      expect(markerDiameter(maxCount, maxCount), `maxCount=${maxCount}`).toBeCloseTo(MAX_DIAMETER, 10);
      expect(markerDiameter(maxCount, maxCount) / markerDiameter(1, maxCount)).toBeCloseTo(3, 10);
    }
  });

  it('interpolates linearly — half way up the range is half way between the sizes', () => {
    // The worked example from the contract: maxCount 9, a gemeente on 5.
    expect(markerDiameter(5, 9)).toBeCloseTo(MIN_DIAMETER + 0.5 * (MAX_DIAMETER - MIN_DIAMETER), 10);
  });

  it('collapses to the SMALLEST size when nothing exceeds one initiative (obligation 2)', () => {
    expect(markerDiameter(1, 1)).toBe(MIN_DIAMETER);
  });

  it('never produces a diameter outside [MIN, MAX]', () => {
    for (let max = 1; max <= 20; max++) {
      for (let c = 0; c <= max; c++) {
        const d = markerDiameter(c, max);
        expect(d).toBeGreaterThanOrEqual(MIN_DIAMETER);
        expect(d).toBeLessThanOrEqual(MAX_DIAMETER);
      }
    }
  });
});

describe('buildUsageMarkers', () => {
  it('marks a zero-initiative gemeente as a square, never a dot (obligation 3)', () => {
    const locations = [location('a', 'Aa', 5, 52), location('b', 'Bee', 6, 53)];
    const { markers } = buildUsageMarkers(locations, [row('a', 'Aa', ['X'])], project);

    expect(markers.find((m) => m.nameId === 'a')!.shape).toBe('dot');
    const zero = markers.find((m) => m.nameId === 'b')!;
    expect(zero.shape).toBe('square');
    expect(zero.initiativeCount).toBe(0);
    expect(zero.diameter).toBe(MIN_DIAMETER);
  });

  it('scales against the whole selection, so zooming cannot resize markers (obligation 4)', () => {
    const locations = [
      location('a', 'Aa', 5, 52),
      location('b', 'Bee', 6, 53),
      location('c', 'Cee', 7, 54),
    ];
    const rows = [
      row('a', 'Aa', ['X']),
      row('b', 'Bee', ['X', 'Y', 'Z', 'W', 'V']), // the selection maximum, 5
      row('c', 'Cee', ['X', 'Y', 'Z']),
    ];
    const { markers } = buildUsageMarkers(locations, rows, project);
    const sizeOf = (id: string) => markers.find((m) => m.nameId === id)!.diameter;

    // 'b' is the maximum → 3×; 'c' sits half way (3 of 1..5).
    expect(sizeOf('b')).toBeCloseTo(MAX_DIAMETER, 10);
    expect(sizeOf('c')).toBeCloseTo(MIN_DIAMETER + 0.5 * (MAX_DIAMETER - MIN_DIAMETER), 10);

    // Now view an area containing ONLY 'a' and 'c'. Sizes must be unchanged — the scale
    // is a property of the selection, not of what happens to be on screen.
    const area = computeVisibleArea(markers, { x0: 4.5, y0: 51.5, x1: 7.5, y1: 54.5 });
    for (const m of area.markers) {
      expect(m.diameter).toBe(sizeOf(m.nameId));
    }
  });

  it('excludes an unplaced gemeente from the map but counts it (obligations 9)', () => {
    const locations: GemeenteLocation[] = [
      location('a', 'Aa', 5, 52),
      { ...location('b', 'Bee', 0, 0), latitude: null, longitude: null },
    ];
    const { markers, unplaced } = buildUsageMarkers(locations, [row('a', 'Aa', ['X'])], project);

    expect(markers).toHaveLength(1);
    expect(unplaced).toBe(1);
  });

  it('carries the Groei/GD split through for the marker pie, without recounting', () => {
    const mixed = row('a', 'Aa', ['X', 'Y', 'Z']);
    // Make one of the three a GemeenteDelers initiative.
    mixed.initiatives[2] = { ...mixed.initiatives[2], kind: 'gd' };
    mixed.groeiCount = 2;
    mixed.gdCount = 1;

    const { markers } = buildUsageMarkers([location('a', 'Aa', 5, 52)], [mixed], project);
    const marker = markers[0];

    expect(marker.groeiCount).toBe(2);
    expect(marker.gdCount).toBe(1);
    // The split must always sum to the total the Cities view reports (FR-029).
    expect(marker.groeiCount + marker.gdCount).toBe(marker.initiativeCount);
  });

  it('gives a gemeente outside the graph a zero split, so its pie draws nothing', () => {
    const { markers } = buildUsageMarkers([location('a', 'Aa', 5, 52)], [], project);
    expect(markers[0].groeiCount).toBe(0);
    expect(markers[0].gdCount).toBe(0);
  });

  it('treats a gemeente absent from the graph as zero, not as missing (FR-006)', () => {
    const { markers } = buildUsageMarkers([location('a', 'Aa', 5, 52)], [], project);

    expect(markers).toHaveLength(1);
    expect(markers[0].initiativeCount).toBe(0);
    expect(markers[0].shape).toBe('square');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Obligations 5–7: the ranking
// ─────────────────────────────────────────────────────────────────────────────

describe('computeVisibleArea', () => {
  it('tests the anchor point, so a marker straddling the edge does not flicker', () => {
    const locations = [location('a', 'Aa', 5, 52), location('b', 'Bee', 50, 52)];
    const { markers } = buildUsageMarkers(locations, [], project);

    const area = computeVisibleArea(markers, { x0: 0, y0: 0, x1: 10, y1: 100 });
    expect(area.markers.map((m) => m.nameId)).toEqual(['a']);
    expect(area.total).toBe(1);
  });

  it('reports participating separately from total (FR-017)', () => {
    const locations = [location('a', 'Aa', 5, 52), location('b', 'Bee', 6, 52)];
    const { markers } = buildUsageMarkers(locations, [row('a', 'Aa', ['X'])], project);

    const area = computeVisibleArea(markers, ALL_BOUNDS);
    expect(area.total).toBe(2);
    expect(area.participating).toBe(1);
  });
});

describe('buildAreaRanking', () => {
  it('counts each gemeente once per initiative even when duplicated upstream (obligation 5)', () => {
    const duplicated = row('a', 'Aa', ['X']);
    // Same initiative id appearing twice on one city — the Set is what makes this safe.
    duplicated.initiatives = [...duplicated.initiatives, ...duplicated.initiatives];
    duplicated.initiativeCount = 1;

    const { markers } = buildUsageMarkers([location('a', 'Aa', 5, 52)], [duplicated], project);
    const ranking = buildAreaRanking(computeVisibleArea(markers, ALL_BOUNDS));

    expect(ranking.entries).toHaveLength(1);
    expect(ranking.entries[0].cityCount).toBe(1);
  });

  it('breaks ties alphabetically and stays stable across repeated runs (obligation 6)', () => {
    const locations = [location('a', 'Aa', 5, 52), location('b', 'Bee', 6, 52)];
    // Zebra and Alpha are each used by both gemeentes — a tie that must resolve by name.
    const rows = [row('a', 'Aa', ['Zebra', 'Alpha']), row('b', 'Bee', ['Zebra', 'Alpha'])];
    const { markers } = buildUsageMarkers(locations, rows, project);

    const orders = Array.from({ length: 5 }, () =>
      buildAreaRanking(computeVisibleArea(markers, ALL_BOUNDS)).entries.map((e) => e.name),
    );

    expect(orders[0]).toEqual(['Alpha', 'Zebra']);
    for (const o of orders) expect(o).toEqual(orders[0]);
  });

  it('orders by count descending before name (FR-020)', () => {
    const locations = [location('a', 'Aa', 5, 52), location('b', 'Bee', 6, 52)];
    const rows = [row('a', 'Aa', ['Zebra', 'Alpha']), row('b', 'Bee', ['Zebra'])];
    const { markers } = buildUsageMarkers(locations, rows, project);

    const ranking = buildAreaRanking(computeVisibleArea(markers, ALL_BOUNDS));
    expect(ranking.entries.map((e) => [e.name, e.cityCount])).toEqual([
      ['Zebra', 2],
      ['Alpha', 1],
    ]);
  });

  it('uses a denominator that INCLUDES zero-initiative gemeentes (obligation 7)', () => {
    const locations = [
      location('a', 'Aa', 5, 52),
      location('b', 'Bee', 6, 52),
      location('c', 'Cee', 7, 52), // no initiatives
      location('d', 'Dee', 8, 52), // no initiatives
    ];
    const rows = [row('a', 'Aa', ['X']), row('b', 'Bee', ['X'])];
    const { markers } = buildUsageMarkers(locations, rows, project);

    const area = computeVisibleArea(markers, ALL_BOUNDS);
    const ranking = buildAreaRanking(area);

    // "X — 2 of 4 in view": low adoption across a well-covered area stays visible.
    expect(ranking.denominator).toBe(4);
    expect(ranking.entries[0].cityCount).toBe(2);
  });

  it('lists only initiatives used inside the viewport (FR-018)', () => {
    const locations = [location('a', 'Aa', 5, 52), location('b', 'Bee', 50, 52)];
    const rows = [row('a', 'Aa', ['Near']), row('b', 'Bee', ['Far'])];
    const { markers } = buildUsageMarkers(locations, rows, project);

    const ranking = buildAreaRanking(computeVisibleArea(markers, { x0: 0, y0: 0, x1: 10, y1: 100 }));
    expect(ranking.entries.map((e) => e.name)).toEqual(['Near']);
  });

  it('returns an empty ranking rather than throwing when nothing participates (FR-022)', () => {
    const { markers } = buildUsageMarkers([location('a', 'Aa', 5, 52)], [], project);
    const ranking = buildAreaRanking(computeVisibleArea(markers, ALL_BOUNDS));

    expect(ranking.entries).toEqual([]);
    expect(ranking.denominator).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Focus is a presentation overlay only (aggregation contract §6)
// ─────────────────────────────────────────────────────────────────────────────

describe('focus', () => {
  function setup(): { markers: UsageMarker[]; focused: UsageMarker } {
    const locations = [location('a', 'Aa', 5, 52), location('b', 'Bee', 6, 52)];
    const rows = [row('a', 'Aa', ['Shared', 'OnlyA']), row('b', 'Bee', ['Shared', 'OnlyB'])];
    const { markers } = buildUsageMarkers(locations, rows, project);
    return { markers, focused: markers.find((m) => m.nameId === 'a')! };
  }

  it('changes no count, order, denominator, or diameter', () => {
    const { markers, focused } = setup();
    const area = computeVisibleArea(markers, ALL_BOUNDS);

    const without = buildAreaRanking(area);
    const withFocus = buildAreaRanking(area, focused);

    expect(withFocus.denominator).toBe(without.denominator);
    expect(withFocus.entries.map((e) => [e.name, e.cityCount])).toEqual(
      without.entries.map((e) => [e.name, e.cityCount]),
    );
    for (const m of area.markers) {
      expect(m.diameter).toBe(markers.find((x) => x.nameId === m.nameId)!.diameter);
    }
  });

  it('flags exactly the initiatives the focused gemeente also uses (FR-026)', () => {
    const { markers, focused } = setup();
    const ranking = buildAreaRanking(computeVisibleArea(markers, ALL_BOUNDS), focused);

    const flagged = ranking.entries.filter((e) => e.usedByFocused).map((e) => e.name).sort();
    expect(flagged).toEqual(['OnlyA', 'Shared']);
    expect(ranking.entries.find((e) => e.name === 'OnlyB')!.usedByFocused).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Obligation 10: agreement with the Cities view (FR-029)
// ─────────────────────────────────────────────────────────────────────────────

describe('agreement with buildCityRows', () => {
  /** Minimal node factory, matching cities.test.ts. */
  function node(id: string, type: string, displayName: string, extra: Partial<GraphNode> = {}): GraphNode {
    return {
      id,
      type: type as GraphNode['type'],
      displayName,
      weight: 1,
      avatarUrl: null,
      bannerUrl: null,
      url: null,
      location: null,
      scopeGroups: [],
      nameId: id,
      tagline: null,
      parentSpaceId: null,
      privacyMode: null,
      ...extra,
    };
  }
  function edge(sourceId: string, targetId: string): GraphEdge {
    return { sourceId, targetId, type: 'MEMBER' as GraphEdge['type'], weight: 1, scopeGroup: null };
  }

  it('reports the same initiative count the Cities view shows for the same dataset', () => {
    const dataset: GraphDataset = {
      version: '1.0.0',
      generatedAt: '',
      spaces: [],
      nodes: [
        node('gemeente-groningen', 'ORGANIZATION', 'Groningen', { isGemeente: true }),
        node('gemeente-utrecht', 'ORGANIZATION', 'Utrecht', { isGemeente: true }),
        node('space-1', 'SPACE_L0', 'Initiative One'),
        node('space-2', 'SPACE_L0', 'Initiative Two'),
        node('sub-1', 'SPACE_L1', 'A subspace, which is NOT an initiative'),
      ],
      edges: [
        edge('gemeente-groningen', 'space-1'),
        edge('gemeente-groningen', 'space-1'), // duplicate — must count once
        edge('space-2', 'gemeente-groningen'), // reverse direction — still counts
        edge('gemeente-utrecht', 'space-1'),
        edge('gemeente-groningen', 'sub-1'), // L1 is not an initiative
      ],
      metrics: { totalNodes: 5, totalEdges: 5, averageDegree: 0, density: 0 },
      cacheInfo: [],
    };

    const cityRows = buildCityRows(dataset);
    const locations = [
      location('gemeente-groningen', 'Groningen', 6.5, 53.2),
      location('gemeente-utrecht', 'Utrecht', 5.1, 52.1),
    ];
    const { markers } = buildUsageMarkers(locations, cityRows, project);

    for (const marker of markers) {
      const cityRow = cityRows.find((r) => r.nameId === marker.nameId)!;
      expect(marker.initiativeCount, marker.name).toBe(cityRow.initiativeCount);
    }
    expect(markers.find((m) => m.nameId === 'gemeente-groningen')!.initiativeCount).toBe(2);
    expect(markers.find((m) => m.nameId === 'gemeente-utrecht')!.initiativeCount).toBe(1);
  });
});

describe('buildUsageMarkers — joining across independently cached datasets', () => {
  /** A location whose nameId is STALE relative to the graph, but whose cbsCode is not. */
  const location = (nameId: string, cbsCode: string) => ({
    nameId,
    title: 'Den Haag',
    cbsCode,
    latitude: 52.0799838,
    longitude: 4.3113461,
    provinceCode: 'PV28',
    provinceName: 'Zuid-Holland',
  });

  const identity = (p: [number, number]): [number, number] => p;

  it('matches on cbsCode when Alkemio renamed the org after the locations were cached', () => {
    const rows = [{ ...row('gemeente-den-haag', 'Den Haag', ['A', 'B']), cbsCode: 'GM0518' }];
    const { markers } = buildUsageMarkers([location('gemeente-gravenhage', 'GM0518')], rows, identity);
    expect(markers).toHaveLength(1);
    // Without the cbsCode join this was 0 — the gemeente plotted as "no initiatives".
    expect(markers[0].initiativeCount).toBe(2);
  });

  it('still matches on nameId when no cbsCode is available on the row', () => {
    const rows = [row('gemeente-groningen', 'Groningen', ['A'])];
    const { markers } = buildUsageMarkers(
      [{ ...location('gemeente-groningen', 'GM0014'), title: 'Groningen' }],
      rows,
      identity,
    );
    expect(markers[0].initiativeCount).toBe(1);
  });
});
