/**
 * VNG dashboard category counting (feature 016, US3).
 *
 * Pure counting core: given countable entities (selected spaces, or GD initiatives
 * when that layer is active — FR-022) each carrying tags, and the operator-defined
 * tag→category mapping (from analytics.yml), produce per-dimension category counts.
 *
 * Each entity contributes at most once per category it maps into; entities that map
 * to no category in any dimension are counted as uncategorised (FR-024).
 */
import { loadConfig, type VngConfig } from '../config.js';
import { createAlkemioSdk } from '../graphql/client.js';
import type { AuthContext } from '../auth/middleware.js';
import { fetchGemeentedelersCallouts } from './gd-initiatives-service.js';
import { countGroeiPhases } from './groei-phases.js';
import { generateGraph } from './graph-service.js';
import { NodeType, type GraphDataset, type GraphNode } from '../types/graph.js';
import type {
  CategoryMatrix,
  CityPopulationPoint,
  CityPopulationSeries,
  DashboardCountable,
  DashboardDimension,
  GemeenteDistribution,
  VngDashboardResponse,
} from '../types/api.js';
import type { RegistryMunicipalityEntry } from './vng-registry.js';

/**
 * Bucket key for initiatives associated with NO gemeente (count 0). Rendered as the
 * leading "No classification" bar, mirroring the NDS / VNG-2030 charts' leading bucket.
 */
const NO_GEMEENTE_KEY = 'none';

/**
 * Fixed gemeente-count buckets for the distribution chart. A value falls in the
 * first bucket whose `max` it does not exceed (boundaries go to the lower bucket,
 * e.g. 3 → "1-3", 6 → "3-6"). Count 0 falls into the leading `none` bucket.
 */
const GEMEENTE_BUCKETS: { key: string; max: number }[] = [
  { key: '1-3', max: 3 },
  { key: '3-6', max: 6 },
  { key: '6-10', max: 10 },
  { key: '10-20', max: 20 },
  { key: '20-50', max: 50 },
  { key: '50+', max: Infinity },
];

/** Index into the `[none, ...GEMEENTE_BUCKETS]` bucket list (none = 0 gemeentes). */
function bucketIndex(count: number): number {
  if (count <= 0) return 0;
  return 1 + GEMEENTE_BUCKETS.findIndex((b) => count <= b.max);
}

/** A counted initiative: its display name + how many gemeentes it is associated with. */
export interface InitiativeGemeenteCount {
  label: string;
  count: number;
}

/** Bucket two lists of counted initiatives into the stacked distribution (with names). */
export function bucketGemeenteDistribution(
  groei: InitiativeGemeenteCount[],
  gd: InitiativeGemeenteCount[],
  gdIncluded: boolean,
): GemeenteDistribution {
  // Bucket list is [none, ...GEMEENTE_BUCKETS] so 0-gemeente initiatives lead.
  const keys = [NO_GEMEENTE_KEY, ...GEMEENTE_BUCKETS.map((b) => b.key)];
  const groeiItems: string[][] = keys.map(() => []);
  const gdItems: string[][] = keys.map(() => []);
  for (const it of groei) groeiItems[bucketIndex(it.count)].push(it.label);
  for (const it of gd) gdItems[bucketIndex(it.count)].push(it.label);
  const sortNames = (a: string[]) => a.sort((x, y) => x.localeCompare(y));
  return {
    gdIncluded,
    buckets: keys.map((key, i) => ({
      key,
      groei: groeiItems[i].length,
      gd: gdItems[i].length,
      groeiItems: sortNames(groeiItems[i]),
      gdItems: sortNames(gdItems[i]),
    })),
  };
}

/**
 * Groei side: for each selected initiative (SPACE_L0 node) count its DISTINCT
 * associated gemeente organisations (ORGANIZATION nodes with `isGemeente`, connected
 * by any edge) — the same association the Graph/details tabs show. Returns the
 * initiative name + count. Pure over a GraphDataset so it is unit-testable.
 */
export function countSpaceGemeentes(dataset: GraphDataset): InitiativeGemeenteCount[] {
  const gemeenteIds = new Set(
    dataset.nodes.filter((n) => n.type === NodeType.ORGANIZATION && n.isGemeente).map((n) => n.id),
  );
  const bySpace = new Map<string, Set<string>>();
  for (const e of dataset.edges) {
    if (gemeenteIds.has(e.sourceId)) addToSet(bySpace, e.targetId, e.sourceId);
    if (gemeenteIds.has(e.targetId)) addToSet(bySpace, e.sourceId, e.targetId);
  }
  return dataset.nodes
    .filter((n) => n.type === NodeType.SPACE_L0)
    .map((n) => ({ label: n.displayName, count: bySpace.get(n.id)?.size ?? 0 }));
}

function addToSet(map: Map<string, Set<string>>, key: string, value: string): void {
  let s = map.get(key);
  if (!s) map.set(key, (s = new Set()));
  s.add(value);
}

/**
 * Build the initiatives-by-gemeente-count distribution for the selected set:
 *  • Groei — from the graph (each L0 space → its associated gemeente organisations).
 *  • GD    — from the GemeenteDelers callouts directly (distinct gemeente-resolving
 *            tags per callout); this is the source of truth for GD gemeente links and
 *            avoids the graph layer's node-dedup complexity. Only when `includeGd`.
 */
export async function assembleGemeenteDistribution(
  userId: string,
  auth: AuthContext,
  spaceIds: string[],
  includeGd: boolean,
  /**
   * Pre-generated graph, so a single dashboard request generates the graph once and
   * shares it with the city-population assembler instead of paying for two cold
   * generations under different cache keys. Only the Groei side reads it, and only
   * SPACE_L0 ↔ gemeente edges — which a GD-layer dataset carries unchanged.
   */
  prebuiltDataset?: GraphDataset,
): Promise<GemeenteDistribution> {
  // Groei: the base graph is enough (no GD layer needed for space↔gemeente links).
  const dataset =
    prebuiltDataset ?? (await generateGraph(userId, auth, { spaceIds, includeInitiatives: false }));
  const groeiCounts = countSpaceGemeentes(dataset);

  let gdCounts: InitiativeGemeenteCount[] = [];
  if (includeGd) {
    const { loadVngRegistry } = await import('./vng-registry.js');
    const registry = loadVngRegistry();
    const sdk = await createAlkemioSdk(auth);
    const callouts = await fetchGemeentedelersCallouts(auth, sdk);
    // GD initiatives mention their gemeentes in the DESCRIPTION (not the tags).
    gdCounts = callouts.map((c) => ({
      label: c.displayName,
      count: registry.findGemeentesInText(c.description).length,
    }));
  }

  return bucketGemeenteDistribution(groeiCounts, gdCounts, includeGd);
}

// ── City perspective (feature 018, US3) ──────────────────────────────────────

/** A gemeente and how many initiatives it takes part in, in one selection. */
export interface CityInitiativeCount {
  nameId: string | null;
  name: string;
  provinceName: string | null;
  /** Inhabitants, or null when UNKNOWN. Never coerced to 0. */
  population: number | null;
  initiativeCount: number;
  /** Groei (SPACE_L0) share of `initiativeCount` — feeds the per-dot pie. */
  groeiCount: number;
  /** GemeenteDelers (INITIATIVE) share of `initiativeCount`. */
  gdCount: number;
}

/**
 * THE city ↔ initiative count rule, server side — the transpose of
 * {@link countSpaceGemeentes} and the twin of `buildCityRows` in
 * frontend/shared/src/dashboard/utils/cities.ts.
 *
 * A city participates in an initiative when the dataset holds at least one edge, in
 * either direction, between that gemeente ORGANIZATION node and a SPACE_L0 or
 * INITIATIVE node. Edge type is irrelevant, repeated edges count once, and L1/L2
 * subspaces are not initiatives.
 *
 * Deliberately NOT the description-text rule that {@link assembleGemeenteDistribution}
 * uses for its GD side: that one counts gemeentes named in a description even when no
 * organisation node exists for them, and a city with no node cannot be a row in the
 * city views. Using the edge rule on both sides is what makes FR-028 hold. The rule is
 * specified in specs/018-city-analysis/contracts/city-aggregation.md and pinned by
 * mirrored tests (vng-cities.test.ts here, cities.test.ts in frontend/vng).
 */
export function countCityInitiatives(dataset: GraphDataset): CityInitiativeCount[] {
  const cityNodes = new Map<string, GraphNode>();
  // Initiative id → kind, so a city's participation can be split Groei vs GD (per-dot pie).
  const initiativeKind = new Map<string, 'groei' | 'gd'>();
  for (const n of dataset.nodes) {
    if (n.type === NodeType.ORGANIZATION && n.isGemeente) cityNodes.set(n.id, n);
    else if (n.type === NodeType.SPACE_L0) initiativeKind.set(n.id, 'groei');
    else if (n.type === NodeType.INITIATIVE) initiativeKind.set(n.id, 'gd');
  }

  const byCity = new Map<string, Set<string>>();
  for (const e of dataset.edges) {
    if (cityNodes.has(e.sourceId) && initiativeKind.has(e.targetId)) {
      addToSet(byCity, e.sourceId, e.targetId);
    } else if (cityNodes.has(e.targetId) && initiativeKind.has(e.sourceId)) {
      addToSet(byCity, e.targetId, e.sourceId);
    }
  }

  return [...cityNodes.values()].map((n) => {
    const ids = byCity.get(n.id) ?? new Set<string>();
    let groeiCount = 0;
    let gdCount = 0;
    for (const id of ids) (initiativeKind.get(id) === 'gd' ? gdCount++ : groeiCount++);
    return {
      nameId: n.nameId,
      name: n.displayName,
      provinceName: n.provinceName ?? null,
      population: n.population ?? null,
      initiativeCount: ids.size,
      groeiCount,
      gdCount,
    };
  });
}

/**
 * Join the per-city counts against the full municipality registry to produce the
 * scatter series: participating cities, non-participating municipalities at zero, and
 * a count of those omitted for unknown population (FR-021/023).
 *
 * Pure over its inputs so it is unit-testable without a graph or a registry on disk.
 */
export function buildCityPopulationSeries(
  dataset: GraphDataset,
  municipalities: RegistryMunicipalityEntry[],
  gdIncluded: boolean,
): CityPopulationSeries {
  const counts = countCityInitiatives(dataset);
  const byNameId = new Map(counts.filter((c) => c.nameId).map((c) => [c.nameId as string, c]));

  const participating: CityPopulationPoint[] = [];
  const nonParticipating: CityPopulationPoint[] = [];
  let excludedUnknownPopulation = 0;
  const seen = new Set<string>();

  const place = (point: CityPopulationPoint) =>
    (point.initiativeCount > 0 ? participating : nonParticipating).push(point);

  for (const m of municipalities) {
    seen.add(m.nameId);
    // Unknown population cannot be plotted on a population axis — count it, don't zero it.
    if (m.info.population == null) {
      excludedUnknownPopulation += 1;
      continue;
    }
    const hit = byNameId.get(m.nameId);
    place({
      nameId: m.nameId,
      name: m.title,
      provinceName: m.info.provinceName,
      population: m.info.population,
      initiativeCount: hit?.initiativeCount ?? 0,
      groeiCount: hit?.groeiCount ?? 0,
      gdCount: hit?.gdCount ?? 0,
    });
  }

  // A gemeente present in the graph but missing from the registry (should not happen)
  // must still be plotted — never silently drop a participating city.
  for (const c of counts) {
    if (!c.nameId || seen.has(c.nameId)) continue;
    if (c.population == null) {
      excludedUnknownPopulation += 1;
      continue;
    }
    place({
      nameId: c.nameId,
      name: c.name,
      provinceName: c.provinceName,
      population: c.population,
      initiativeCount: c.initiativeCount,
      groeiCount: c.groeiCount,
      gdCount: c.gdCount,
    });
  }

  const bySize = (a: CityPopulationPoint, b: CityPopulationPoint) =>
    b.population - a.population || a.name.localeCompare(b.name);

  return {
    gdIncluded,
    participating: participating.sort(bySize),
    nonParticipating: nonParticipating.sort(bySize),
    excludedUnknownPopulation,
  };
}

/**
 * Assemble the city-population series for the selected set. Uses the SAME cached graph
 * the other dashboard panels use; the GD layer is folded in only when the GD checkbox
 * is on, so a city's count reflects exactly what the Cities table shows.
 */
export async function assembleCityPopulation(
  userId: string,
  auth: AuthContext,
  spaceIds: string[],
  includeGd: boolean,
  /** Pre-generated graph — see {@link assembleGemeenteDistribution}. */
  prebuiltDataset?: GraphDataset,
): Promise<CityPopulationSeries> {
  const dataset =
    prebuiltDataset ??
    (await generateGraph(userId, auth, { spaceIds, includeInitiatives: includeGd }));
  const { loadVngRegistry } = await import('./vng-registry.js');
  return buildCityPopulationSeries(dataset, loadVngRegistry().municipalities(), includeGd);
}

/**
 * Synthetic category for entities that match no configured category in a dimension.
 * Rendered as a trailing "no classification" bar (only when non-empty). Most GD
 * initiatives land here because they carry GemeenteDelers themes, not NDS/VNG-2030 tags.
 */
const UNCATEGORISED_KEY = 'uncategorised';

/**
 * Count entities into the configured NDS and VNG-2030 category dimensions, keeping the
 * selected-spaces and GD-initiative contributions separate so each category bar can be
 * stacked. Entities matching no category in a dimension are collected into that
 * dimension's `uncategorised` bucket (per dimension); `uncategorisedCount` on the
 * response is the stricter global count (matched nothing in ANY dimension).
 */
export function countDashboard(
  entities: DashboardCountable[],
  mapping: VngConfig['tagCategoryMapping'],
): VngDashboardResponse {
  const dimensionDefs: { key: string; map: Record<string, string> }[] = [
    { key: 'nds', map: mapping.nds },
    { key: 'vng2030', map: mapping.vng2030 },
  ];

  // Per dimension: category key → { spaces names, gd names }. The uncategorised bucket
  // is seeded FIRST so it always renders as the leftmost bar in the same position across
  // both charts; every configured category is then pre-seeded so zero-count bars still
  // render (US3 scenario 3). Each segment accumulates the entity LABELS (for tooltips).
  type Segments = { spaces: string[]; gd: string[] };
  const segs = (): Segments => ({ spaces: [], gd: [] });
  const items: Record<string, Map<string, Segments>> = {};
  for (const dim of dimensionDefs) {
    const m = new Map<string, Segments>();
    m.set(UNCATEGORISED_KEY, segs());
    for (const cat of Object.values(dim.map)) if (!m.has(cat)) m.set(cat, segs());
    items[dim.key] = m;
  }

  let gdIncluded = false;
  let uncategorisedCount = 0;

  // NDS × VNG-2030 cross-tab (the 4th chart). Each entity is placed at ONE cell using
  // its PRIMARY category per axis (first mapped category in tag order; `uncategorised`
  // when it maps into none). Entities with >1 category on either axis are also recorded
  // in `multiCategoryItems` so the primary-only placement loses no information.
  const cellSegs = new Map<
    string,
    { nds: string; vng2030: string; spaces: string[]; gd: string[] }
  >();
  // NUL separator: category keys are operator-defined in analytics.yml, so any printable
  // delimiter could in principle occur inside a key and collide two distinct cells. Kept
  // as an escape rather than a literal NUL byte so this file stays plain text — git can
  // diff it and grep can match it.
  const cellKey = (nds: string, vng: string) => `${nds}\u0000${vng}`;
  const multiCategoryItems: CategoryMatrix['multiCategoryItems'] = [];

  for (const entity of entities) {
    const src = entity.source ?? 'spaces';
    if (src === 'gd') gdIncluded = true;
    const normTags = entity.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    let categorisedAnywhere = false;

    // Ordered, de-duplicated category hits per dimension (insertion order = tag order,
    // so element [0] is the primary category for the matrix).
    const hitsByDim: Record<string, string[]> = {};

    for (const dim of dimensionDefs) {
      const hit = new Set<string>();
      for (const tag of normTags) {
        const category = dim.map[tag];
        if (category) hit.add(category);
      }
      hitsByDim[dim.key] = [...hit];
      if (hit.size === 0) {
        items[dim.key].get(UNCATEGORISED_KEY)![src].push(entity.label);
      } else {
        for (const category of hit) {
          items[dim.key].get(category)![src].push(entity.label);
          categorisedAnywhere = true;
        }
      }
    }

    if (!categorisedAnywhere) uncategorisedCount += 1;

    const ndsHits = hitsByDim.nds ?? [];
    const vngHits = hitsByDim.vng2030 ?? [];
    const primaryNds = ndsHits[0] ?? UNCATEGORISED_KEY;
    const primaryVng = vngHits[0] ?? UNCATEGORISED_KEY;
    const key = cellKey(primaryNds, primaryVng);
    let seg = cellSegs.get(key);
    if (!seg) cellSegs.set(key, (seg = { nds: primaryNds, vng2030: primaryVng, spaces: [], gd: [] }));
    seg[src].push(entity.label);

    if (ndsHits.length > 1 || vngHits.length > 1) {
      multiCategoryItems.push({ label: entity.label, source: src, nds: ndsHits, vng2030: vngHits });
    }
  }

  const sortNames = (a: string[]) => a.sort((x, y) => x.localeCompare(y));
  const dimensions: DashboardDimension[] = dimensionDefs.map((dim) => ({
    key: dim.key,
    // All categories render (even zero), including the leading uncategorised bucket so
    // its position is identical across both charts.
    categories: [...items[dim.key].entries()].map(([key, s]) => {
        const spacesItems = sortNames(s.spaces);
        const gdItems = sortNames(s.gd);
        return {
          key,
          count: spacesItems.length + gdItems.length,
          items: sortNames([...spacesItems, ...gdItems]),
          spacesItems,
          gdItems,
          spacesCount: spacesItems.length,
          gdCount: gdItems.length,
        };
      }),
  }));

  // Axis keys reuse the per-dimension ordering already computed above (uncategorised
  // first, then the configured categories) so the matrix axes match the bar charts.
  const categoryMatrix: CategoryMatrix = {
    ndsCategories: [...items.nds.keys()],
    vng2030Categories: [...items.vng2030.keys()],
    cells: [...cellSegs.values()].map((c) => {
      const spacesItems = sortNames(c.spaces);
      const gdItems = sortNames(c.gd);
      return {
        nds: c.nds,
        vng2030: c.vng2030,
        count: spacesItems.length + gdItems.length,
        spacesItems,
        gdItems,
      };
    }),
    multiCategoryItems: multiCategoryItems.sort((a, b) => a.label.localeCompare(b.label)),
  };

  return {
    gdIncluded,
    totalCounted: entities.length,
    uncategorisedCount,
    dimensions,
    categoryMatrix,
    // Growth phases come off the same profile tags, so no extra fetching is needed.
    phaseDistribution: countGroeiPhases(entities),
  };
}

/**
 * Assemble the dashboard for the selected spaces (US3). Always counts the selected
 * spaces by their NDS / VNG-2030 profile tags; when `includeGd` is set, additionally
 * counts GD initiatives as a separate stacked segment (FR-022). GD callouts mostly
 * carry GemeenteDelers themes rather than NDS/VNG-2030 tags, so they land largely in
 * the per-dimension `uncategorised` bucket.
 */
export async function assembleDashboard(
  auth: AuthContext,
  spaceIds: string[],
  includeGd: boolean,
  /** Per-app dashboard profile (feature 017) — its `tagCategoryMapping` drives the counts.
   *  Defaults to the VNG profile for back-compat with existing callers/tests. */
  profile: VngConfig = loadConfig().vng,
): Promise<VngDashboardResponse> {
  const sdk = await createAlkemioSdk(auth);

  const tagsPerSpace = await Promise.all(
    spaceIds.map(async (nameId) => {
      const res = await sdk.SpaceProfileTags({ nameId });
      const space = res.data.lookupByName.space;
      const tagsets = space?.about.profile.tagsets ?? [];
      return {
        id: nameId,
        label: space?.about.profile.displayName ?? nameId,
        tags: tagsets.flatMap((ts) => ts.tags),
        source: 'spaces' as const,
      };
    }),
  );
  const entities: DashboardCountable[] = [...tagsPerSpace];

  if (includeGd) {
    const callouts = await fetchGemeentedelersCallouts(auth, sdk);
    entities.push(
      ...callouts.map((c) => ({
        id: c.id,
        label: c.displayName,
        tags: c.tags,
        source: 'gd' as const,
      })),
    );
  }

  return countDashboard(entities, profile.tagCategoryMapping);
}
