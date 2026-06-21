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
 * Fixed gemeente-count buckets for the distribution chart. A value falls in the
 * first bucket whose `max` it does not exceed (boundaries go to the lower bucket,
 * e.g. 3 → "1-3", 6 → "3-6"). Counts of 0 are excluded.
 */
const GEMEENTE_BUCKETS: { key: string; max: number }[] = [
  { key: '1-3', max: 3 },
  { key: '3-6', max: 6 },
  { key: '6-10', max: 10 },
  { key: '10-20', max: 20 },
  { key: '20-50', max: 50 },
  { key: '50+', max: Infinity },
];

function bucketIndex(count: number): number {
  if (count <= 0) return -1;
  return GEMEENTE_BUCKETS.findIndex((b) => count <= b.max);
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
  const groeiItems: string[][] = GEMEENTE_BUCKETS.map(() => []);
  const gdItems: string[][] = GEMEENTE_BUCKETS.map(() => []);
  for (const it of groei) {
    const i = bucketIndex(it.count);
    if (i >= 0) groeiItems[i].push(it.label);
  }
  for (const it of gd) {
    const i = bucketIndex(it.count);
    if (i >= 0) gdItems[i].push(it.label);
  }
  const sortNames = (a: string[]) => a.sort((x, y) => x.localeCompare(y));
  return {
    gdIncluded,
    buckets: GEMEENTE_BUCKETS.map((b, i) => ({
      key: b.key,
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

/** Count entities into the configured NDS and VNG-2030 category dimensions. */
export function countDashboard(
  entities: DashboardCountable[],
  mapping: VngConfig['tagCategoryMapping'],
  source: VngDashboardResponse['source'],
): VngDashboardResponse {
  const dimensionDefs: { key: string; map: Record<string, string> }[] = [
    { key: 'nds', map: mapping.nds },
    { key: 'vng2030', map: mapping.vng2030 },
  ];

  // Pre-seed every category key (so zero-count bars still render — US3 scenario 3).
  // Each category accumulates the entity LABELS that fall into it (for tooltips).
  const items: Record<string, Map<string, string[]>> = {};
  for (const dim of dimensionDefs) {
    items[dim.key] = new Map(Object.values(dim.map).map((cat) => [cat, []]));
  }

  let uncategorisedCount = 0;

  for (const entity of entities) {
    const normTags = entity.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    let categorisedAnywhere = false;

    for (const dim of dimensionDefs) {
      const hit = new Set<string>();
      for (const tag of normTags) {
        const category = dim.map[tag];
        if (category) hit.add(category);
      }
      for (const category of hit) {
        items[dim.key].get(category)?.push(entity.label);
        categorisedAnywhere = true;
      }
    }

    if (!categorisedAnywhere) uncategorisedCount += 1;
  }

  const dimensions: DashboardDimension[] = dimensionDefs.map((dim) => ({
    key: dim.key,
    categories: [...items[dim.key].entries()].map(([key, labels]) => ({
      key,
      count: labels.length,
      items: labels.sort((a, b) => a.localeCompare(b)),
    })),
  }));

  return { source, totalCounted: entities.length, uncategorisedCount, dimensions };
}

/**
 * Assemble the dashboard for the selected spaces (data-source aware, FR-022):
 * when `includeInitiatives`, count GD initiatives; otherwise count selected spaces.
 */
export async function assembleDashboard(
  auth: AuthContext,
  spaceIds: string[],
  includeInitiatives: boolean,
): Promise<VngDashboardResponse> {
  const config = loadConfig();
  const sdk = await createAlkemioSdk(auth);

  let entities: DashboardCountable[];
  let source: VngDashboardResponse['source'];

  if (includeInitiatives) {
    source = 'gd-initiatives';
    const callouts = await fetchGemeentedelersCallouts(auth, sdk);
    entities = callouts.map((c) => ({ id: c.id, label: c.displayName, tags: c.tags }));
  } else {
    source = 'spaces';
    const tagsPerSpace = await Promise.all(
      spaceIds.map(async (nameId) => {
        const res = await sdk.SpaceProfileTags({ nameId });
        const space = res.data.lookupByName.space;
        const tagsets = space?.about.profile.tagsets ?? [];
        return {
          id: nameId,
          label: space?.about.profile.displayName ?? nameId,
          tags: tagsets.flatMap((ts) => ts.tags),
        };
      }),
    );
    entities = tagsPerSpace;
  }

  return countDashboard(entities, config.vng.tagCategoryMapping, source);
}
