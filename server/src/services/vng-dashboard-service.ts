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
import {
  resolveByLabel,
  resolveDesignated,
  selectionOf,
  unionVocabularies,
  vocabularyOf,
  type ClassificationEntryInput,
  type Vocabulary,
} from '../transform/classifications.js';
import { getLogger } from '../logging/logger.js';

const logger = getLogger();

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
 * Synthetic category for entities with NO selected value in a dimension. Rendered as the
 * leading "no classification" bar, in the same position across every chart. Since the
 * rollout deliberately has no tag fallback, a Space the classification programme has not
 * yet reached lands here — a visible gap rather than an inferred count (spec US4).
 */
const UNCATEGORISED_KEY = 'uncategorised';

/** The vocabularies driving the two category dimensions, unioned across the selection. */
export interface DashboardVocabularies {
  nds: Vocabulary;
  vng2030: Vocabulary;
}

/**
 * Count entities into the NDS and VNG-2030 dimensions from their CLASSIFICATION
 * SELECTIONS (feature 020).
 *
 * Placement is a pure function of `entity.selections` — an entity's free-text `tags` are
 * never read here, which is what makes invariant I-1 hold by construction. A GD
 * initiative's selections were resolved upstream from its callout tags (research R-006),
 * so this function does not need to know which kind of entity it is holding.
 *
 * Categories come from `vocabularies`, not from the entities: every value renders, even
 * at count 0 (invariant I-6), in the vocabulary's authored order. A selected id absent
 * from the vocabulary is dropped rather than rendered as a phantom bar — that keeps the
 * "counts account for every entity" identity (invariant I-5) intact.
 *
 * Entities selecting nothing in a dimension go to that dimension's `uncategorised`
 * bucket; `uncategorisedCount` is the stricter global count (nothing in ANY dimension),
 * and `unclassifiedCount` is the narrower rollout gap (Spaces with no classification data
 * at all — invariant I-8).
 */
export function countDashboard(
  entities: DashboardCountable[],
  vocabularies: DashboardVocabularies,
  /** Vocabulary of the designated growth-phase classification. Empty ⇒ no phase panel. */
  phaseVocabulary: Vocabulary = [],
): VngDashboardResponse {
  const dimensionDefs: { key: string; vocabulary: Vocabulary }[] = [
    { key: 'nds', vocabulary: vocabularies.nds },
    { key: 'vng2030', vocabulary: vocabularies.vng2030 },
  ];

  // Per dimension: category key → { spaces names, gd names } plus the label to render.
  // The uncategorised bucket is seeded FIRST so it sits in the same leading position on
  // every chart; the vocabulary is then seeded in authored order so zero-count categories
  // still render (invariant I-6). Each segment accumulates entity LABELS for tooltips.
  type Segments = { label: string | null; spaces: string[]; gd: string[] };
  const segs = (label: string | null): Segments => ({ label, spaces: [], gd: [] });
  const items: Record<string, Map<string, Segments>> = {};
  for (const dim of dimensionDefs) {
    const m = new Map<string, Segments>();
    m.set(UNCATEGORISED_KEY, segs(null));
    for (const value of dim.vocabulary) if (!m.has(value.key)) m.set(value.key, segs(value.label));
    items[dim.key] = m;
  }

  let gdIncluded = false;
  let uncategorisedCount = 0;
  let unclassifiedCount = 0;

  // NDS × VNG-2030 cross-tab (the 4th chart). Each entity is placed at ONE cell using its
  // PRIMARY value per axis (the first selected value in the classification's authored
  // order; `uncategorised` when it selected none). Entities with >1 value on either axis
  // are also recorded in `multiCategoryItems` so the primary-only placement loses nothing.
  const cellSegs = new Map<
    string,
    { nds: string; vng2030: string; spaces: string[]; gd: string[] }
  >();
  // NUL separator: cell keys are Alkemio value ids, and while a UUID cannot contain a
  // printable delimiter today, keying on an escape rather than a literal NUL byte keeps
  // this file plain text — git can diff it and grep can match it.
  const cellKey = (nds: string, vng: string) => `${nds}\u0000${vng}`;
  const multiCategoryItems: CategoryMatrix['multiCategoryItems'] = [];

  for (const entity of entities) {
    const src = entity.source ?? 'spaces';
    if (src === 'gd') gdIncluded = true;
    // The rollout gap counts SPACES only: GD initiatives are Callouts, carry no
    // classifications by design (FR-020), and would otherwise inflate a number that is
    // meant to say "how much of the classification programme is left".
    if (src === 'spaces' && !entity.hasClassifications) unclassifiedCount += 1;

    let categorisedAnywhere = false;
    // Ordered, de-duplicated value hits per dimension. Order is the entity's selection
    // order, which Alkemio reports "in authored order", so element [0] is the primary.
    const hitsByDim: Record<string, string[]> = {};

    for (const dim of dimensionDefs) {
      const bucket = items[dim.key];
      const hit: string[] = [];
      const seen = new Set<string>();
      for (const valueId of entity.selections?.[dim.key] ?? []) {
        // Unknown to the vocabulary → not renderable, so not countable (invariant I-5).
        if (seen.has(valueId) || !bucket.has(valueId) || valueId === UNCATEGORISED_KEY) continue;
        seen.add(valueId);
        hit.push(valueId);
      }
      hitsByDim[dim.key] = hit;
      if (hit.length === 0) {
        bucket.get(UNCATEGORISED_KEY)![src].push(entity.label);
      } else {
        for (const valueId of hit) {
          bucket.get(valueId)![src].push(entity.label);
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
        label: s.label,
        count: spacesItems.length + gdItems.length,
        items: sortNames([...spacesItems, ...gdItems]),
        spacesItems,
        gdItems,
        spacesCount: spacesItems.length,
        gdCount: gdItems.length,
      };
    }),
  }));

  // Axis entries reuse the per-dimension ordering already computed above (uncategorised
  // first, then the vocabulary in authored order) so the matrix axes match the bar charts,
  // and carry the label so the client renders them without a lookup.
  const axis = (dimKey: string) =>
    [...items[dimKey].entries()].map(([key, s]) => ({ key, label: s.label }));

  const categoryMatrix: CategoryMatrix = {
    ndsCategories: axis('nds'),
    vng2030Categories: axis('vng2030'),
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
    unclassifiedCount,
    dimensions,
    categoryMatrix,
    // Growth phases come off the same classifications, so no extra fetching is needed.
    phaseDistribution: countGroeiPhases(entities, phaseVocabulary),
  };
}

/**
 * Resolve the vocabularies + per-entity selections for one Space's classifications.
 * Returns the designated vocabularies (this Space's snapshot) and what it selected.
 */
function readSpaceClassifications(
  entries: ClassificationEntryInput[] | undefined,
  designations: VngConfig['classifications'],
): {
  vocabularies: DashboardVocabularies;
  phaseVocabulary: Vocabulary;
  selections: Record<string, string[]>;
} {
  const nds = resolveDesignated(entries, designations.nds);
  const vng2030 = resolveDesignated(entries, designations.vng2030);
  const phase = resolveDesignated(entries, designations.phase);
  return {
    vocabularies: { nds: vocabularyOf(nds), vng2030: vocabularyOf(vng2030) },
    phaseVocabulary: vocabularyOf(phase),
    selections: {
      nds: selectionOf(nds),
      vng2030: selectionOf(vng2030),
      phase: selectionOf(phase),
    },
  };
}

/**
 * Assemble the dashboard for the selected spaces (US3).
 *
 * Reads each selected Space's Alkemio Classifications and counts it by what an editor
 * SELECTED there — never by its free-text tags (FR-002). Chart categories come from the
 * union of the Spaces' snapshot vocabularies, so adding a value in Alkemio shows up here
 * with no configuration change (FR-007).
 *
 * When `includeGd` is set, GemeenteDelers initiatives are counted as a separate stacked
 * segment. They are Callouts and carry no classifications at all, so their tags are
 * matched against the same vocabulary's LABELS (research R-006) — the one place in the
 * dashboard where a tag still places anything, and only for the layer the spec declares
 * tag-derived (FR-020).
 */
export async function assembleDashboard(
  auth: AuthContext,
  spaceIds: string[],
  includeGd: boolean,
  /** Per-app dashboard profile (feature 017) — its `classifications` designations drive
   *  which vocabulary feeds which panel. Defaults to the VNG profile for back-compat. */
  profile: VngConfig = loadConfig().vng,
): Promise<VngDashboardResponse> {
  const sdk = await createAlkemioSdk(auth);
  const designations = profile.classifications;

  const perSpace = await Promise.all(
    spaceIds.map(async (nameId) => {
      const res = await sdk.SpaceClassifications({ nameId });
      const space = res.data.lookupByName.space;
      const entries = space?.about.classifications;
      const read = readSpaceClassifications(entries, designations);
      return {
        // Diagnostics only (never rendered). `resolved: false` means the nameID did not
        // resolve to an L0 space at all — indistinguishable from "unclassified" in the
        // counts, but a completely different problem, so it is reported separately.
        resolved: !!space,
        presentLabels: (entries ?? []).map((e) => e.displayLabel),
        countable: {
          id: nameId,
          label: space?.about.profile.displayName ?? nameId,
          // Retained for provenance only; the counting path never reads it for a Space.
          tags: (space?.about.profile.tagsets ?? []).flatMap((ts) => ts.tags),
          selections: read.selections,
          // An absent or empty array both mean "the programme has not reached this
          // Space yet" — the rollout gap, reported but never tag-inferred (FR-014/016).
          hasClassifications: (entries?.length ?? 0) > 0,
          source: 'spaces' as const,
        } satisfies DashboardCountable,
        vocabularies: read.vocabularies,
        phaseVocabulary: read.phaseVocabulary,
      };
    }),
  );

  // Union the per-Space snapshots: a selection can straddle template versions, so a value
  // present in only some snapshots must still render (research R-003).
  const vocabularies: DashboardVocabularies = {
    nds: unionVocabularies(perSpace.map((p) => p.vocabularies.nds)),
    vng2030: unionVocabularies(perSpace.map((p) => p.vocabularies.vng2030)),
  };
  const phaseVocabulary = unionVocabularies(perSpace.map((p) => p.phaseVocabulary));

  warnOnUnmatchedDesignations(
    designations,
    vocabularies,
    phaseVocabulary,
    perSpace.map((p) => ({ resolved: p.resolved, presentLabels: p.presentLabels })),
  );

  const entities: DashboardCountable[] = perSpace.map((p) => p.countable);

  if (includeGd) {
    const callouts = await fetchGemeentedelersCallouts(auth, sdk);
    entities.push(
      ...callouts.map((c) => ({
        id: c.id,
        label: c.displayName,
        tags: c.tags,
        selections: {
          nds: resolveByLabel(c.tags, vocabularies.nds),
          vng2030: resolveByLabel(c.tags, vocabularies.vng2030),
          // GD is a completed programme with no growth phase.
          phase: [],
        },
        // GD initiatives are never part of the classification rollout.
        hasClassifications: false,
        source: 'gd' as const,
      })),
    );
  }

  return countDashboard(entities, vocabularies, phaseVocabulary);
}

/**
 * Report, once per request, anything that would make every space look unclassified.
 *
 * Three very different causes produce an identical-looking dashboard — a full "no
 * classification" bar — and before this they were indistinguishable from the outside:
 *
 *   1. the nameIDs did not resolve to L0 spaces (nothing was read at all);
 *   2. the spaces carry no classifications yet (the expected rollout state);
 *   3. the spaces ARE classified, but under a different `displayLabel` than the
 *      dashboard designates — a one-line config fix, if you know to make it.
 *
 * For (3) the message names the labels that WERE found, because "no classification
 * named 'VNG 2030'" without them sends you looking in the wrong place. Only
 * classification group names are logged — never a space name, id, or any user data.
 */
function warnOnUnmatchedDesignations(
  designations: VngConfig['classifications'],
  vocabularies: DashboardVocabularies,
  phaseVocabulary: Vocabulary,
  diagnostics: { resolved: boolean; presentLabels: string[] }[],
): void {
  if (diagnostics.length === 0) return;

  const unresolved = diagnostics.filter((d) => !d.resolved).length;
  if (unresolved > 0) {
    logger.warn(
      `${unresolved} of ${diagnostics.length} selected space ids did not resolve to an L0 space — ` +
        `they are counted as unclassified, but the cause is the lookup, not the classification rollout.`,
      { context: 'Dashboard' },
    );
  }

  const present = [...new Set(diagnostics.flatMap((d) => d.presentLabels))].sort();
  const classified = diagnostics.filter((d) => d.presentLabels.length > 0).length;

  const panels: [string, string, Vocabulary][] = [
    ['nds', designations.nds, vocabularies.nds],
    ['vng2030', designations.vng2030, vocabularies.vng2030],
    ['phase', designations.phase, phaseVocabulary],
  ];
  for (const [panel, designation, vocabulary] of panels) {
    if (!designation || vocabulary.length > 0) continue;
    const found = present.length
      ? `Classifications present on the selection: ${present.map((l) => `'${l}'`).join(', ')}.`
      : `No selected space carries ANY classification yet (${classified}/${diagnostics.length} classified) — ` +
        `this is the expected state until the classification rollout reaches them.`;
    logger.warn(
      `The '${panel}' panel designates a classification named '${designation}', which matched nothing. ` +
        `${found} It will render with only the "no classification" bucket.`,
      { context: 'Dashboard' },
    );
  }
}
