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
import { generateGraph } from './graph-service.js';
import { NodeType, type GraphDataset } from '../types/graph.js';
import type {
  DashboardCountable,
  DashboardDimension,
  GemeenteDistribution,
  VngDashboardResponse,
} from '../types/api.js';

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
): Promise<GemeenteDistribution> {
  // Groei: the base graph is enough (no GD layer needed for space↔gemeente links).
  const dataset = await generateGraph(userId, auth, { spaceIds, includeInitiatives: false });
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

  for (const entity of entities) {
    const src = entity.source ?? 'spaces';
    if (src === 'gd') gdIncluded = true;
    const normTags = entity.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    let categorisedAnywhere = false;

    for (const dim of dimensionDefs) {
      const hit = new Set<string>();
      for (const tag of normTags) {
        const category = dim.map[tag];
        if (category) hit.add(category);
      }
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

  return { gdIncluded, totalCounted: entities.length, uncategorisedCount, dimensions };
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
): Promise<VngDashboardResponse> {
  const config = loadConfig();
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

  return countDashboard(entities, config.vng.tagCategoryMapping);
}
