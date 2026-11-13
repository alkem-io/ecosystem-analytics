/**
 * GemeenteDelers initiative layer (feature 016, US10).
 *
 * Pure transform: given the GD initiatives (subspaces and posts, as data), the snapshot
 * registry, and a gemeente-node resolver, produce the INITIATIVE/THEME nodes and
 * INITIATIVE_GEMEENTE/INITIATIVE_THEME edges to fold into the graph.
 *
 * Themes and gemeentes survive into Alkemio only as flat Callout tag strings, so
 * we resolve each tag against the registry (FR-040/041). Gemeente nodes are reused
 * by the caller via `resolveGemeenteNodeId` (one canonical node per gemeente — no
 * duplicates, FR-043); theme nodes are canonical `theme:<slug>` (shared across
 * initiatives, FR-041).
 */
import {
  EdgeType,
  NodeType,
  NODE_WEIGHT,
  EDGE_WEIGHT,
  type GraphEdge,
  type GraphNode,
} from '../types/graph.js';
import type { GdInitiativeInput } from '../types/api.js';
import type { VngConfig } from '../config.js';
import type { VngRegistry } from '../services/vng-registry.js';
import {
  presentClassifications,
  resolveByLabel,
  resolveDesignated,
  selectionOf,
  type Vocabulary,
} from './classifications.js';
import { submissionYearOf } from './gd-initiative-sources.js';

export interface InitiativeLayer {
  /** INITIATIVE + canonical THEME nodes (gemeente org nodes are owned by the caller). */
  nodes: GraphNode[];
  /** INITIATIVE_GEMEENTE + INITIATIVE_THEME edges. */
  edges: GraphEdge[];
  /** Gemeente nameIDs referenced by an initiative but not resolvable to a node. */
  unresolvedGemeenteNameIds: string[];
}

const SDG_RE = /^sdg-\d{1,}$/i;
/** GemeenteDelers award/classification tags (winner/finalist/…). Exported for the
 *  initiatives table, which surfaces them as a column. */
export const CLASSIFICATIONS = new Set([
  'winner',
  'finalist',
  'kanshebber',
  'publieksprijs',
  'global-goals-prijs',
]);

/** Tag spellings that flag an entity as Common Ground (classification column). */
const COMMON_GROUND_TAGS = new Set(['common ground', 'commonground', 'common-ground']);

/** True when any tag marks the entity as Common Ground (case/space-insensitive). */
export function hasCommonGroundTag(tags: readonly string[]): boolean {
  return tags.some((t) => COMMON_GROUND_TAGS.has(t.trim().toLowerCase().replace(/\s+/g, ' ')));
}

/** Distinct GemeenteDelers theme titles an entity's tags resolve to (sorted). */
export function resolveThemeTitles(tags: readonly string[], registry: VngRegistry): string[] {
  const hit = new Set<string>();
  for (const t of tags) {
    const theme = registry.resolveThemeByTag(t);
    if (theme) hit.add(theme.title);
  }
  return [...hit].sort((a, b) => a.localeCompare(b));
}

function baseNode(id: string, type: NodeType, displayName: string, nameId: string | null): GraphNode {
  return {
    id,
    type,
    displayName,
    weight: NODE_WEIGHT[type],
    avatarUrl: null,
    bannerUrl: null,
    url: null,
    location: null,
    scopeGroups: [],
    nameId,
    tagline: null,
    parentSpaceId: null,
    privacyMode: null,
  };
}

export function buildInitiativeLayer(
  callouts: GdInitiativeInput[],
  registry: VngRegistry,
  /** Resolve a gemeente org nameID to an existing/added node id (null if unresolvable). */
  resolveGemeenteNodeId: (gemeenteNameId: string) => string | null,
): InitiativeLayer {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const themeIds = new Set<string>();
  const unresolved = new Set<string>();
  const seenEdge = new Set<string>();

  const addEdge = (sourceId: string, targetId: string, type: EdgeType) => {
    const key = `${sourceId}|${targetId}|${type}`;
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    edges.push({ sourceId, targetId, type, weight: EDGE_WEIGHT[type], scopeGroup: null });
  };

  for (const callout of callouts) {
    const year = submissionYearOf(callout.tags);
    const classifications: string[] = [];
    const globalGoals: string[] = [];

    const node = baseNode(callout.id, NodeType.INITIATIVE, callout.displayName, callout.nameId);
    node.sourceUrl = callout.sourceUrl ?? null;
    node.initiativeSource = callout.source;
    // A subspace initiative is a real page on Alkemio; a post has no page of its own.
    node.url = callout.url ?? null;
    // Subspace initiatives are categorised by their own Classifications, resolved post-
    // merge in resolveInitiativeCategories (which also strips them before the browser).
    if (callout.classificationEntries?.length) {
      node.classificationEntries = callout.classificationEntries;
    }
    nodes.push(node);

    for (const rawTag of callout.tags) {
      const tag = rawTag.trim();
      if (!tag) continue;

      if (submissionYearOf([tag]) !== undefined) continue;
      if (SDG_RE.test(tag)) {
        globalGoals.push(tag.toLowerCase());
        continue;
      }
      if (CLASSIFICATIONS.has(tag.toLowerCase())) {
        classifications.push(tag.toLowerCase());
        continue;
      }

      const theme = registry.resolveThemeByTag(tag);
      if (theme) {
        const themeId = `theme:${theme.slug}`;
        if (!themeIds.has(themeId)) {
          themeIds.add(themeId);
          nodes.push(baseNode(themeId, NodeType.THEME, theme.title, theme.slug));
        }
        addEdge(callout.id, themeId, EdgeType.INITIATIVE_THEME);
      }
    }

    // Associated gemeentes are named in the DESCRIPTION (after "Deelnemende
    // gemeente:"), not the tags — resolve them from there.
    for (const g of registry.findGemeentesInText(callout.description)) {
      const nodeId = resolveGemeenteNodeId(g.nameId);
      if (nodeId) addEdge(callout.id, nodeId, EdgeType.INITIATIVE_GEMEENTE);
      else unresolved.add(g.nameId);
    }

    if (year !== undefined) node.initiativeYear = year;
    if (classifications.length) node.initiativeClassifications = classifications;
    if (globalGoals.length) node.globalGoals = globalGoals;
    if (hasCommonGroundTag(callout.tags)) node.commonGround = true;

    // GemeenteDelers themes stay tag-derived and out of scope (spec A-006).
    const themeTitles = resolveThemeTitles(callout.tags, registry);
    if (themeTitles.length) node.vngThemes = themeTitles;
    // The NDS / VNG-2030 categories are NOT resolved here any more (feature 020). The GD
    // subgraph is cached independently of any space selection, while the vocabulary comes
    // from the selected spaces' snapshots — so the resolution happens post-merge in
    // graph-service, which has both. The callout's tags travel on the node for it.
    if (callout.tags.length) node.tags = { default: [...callout.tags] };
  }

  return { nodes, edges, unresolvedGemeenteNameIds: [...unresolved] };
}

/**
 * Resolve the NDS / VNG-2030 categories of the GemeenteDelers INITIATIVE nodes in a
 * merged graph. Non-INITIATIVE nodes are left untouched.
 *
 *  • A SUBSPACE initiative carries real Alkemio Classifications and is placed by them,
 *    exactly as a selected Space is: the designated entry's selected value ids, labelled
 *    from the selection's vocabulary. Its tags are never consulted.
 *  • A POST initiative carries no classifications, so its tags are matched against the
 *    vocabulary LABELS (research R-006). LEGACY-GD-POSTS: temporary, see
 *    transform/gd-initiative-sources.ts.
 *
 * Either way the raw `classificationEntries` are stripped here — they are internal and
 * must never reach the browser — so this MUST run for every dataset carrying the GD
 * layer, even when the vocabularies are empty.
 *
 * Deliberately a separate pass over the FINAL node set rather than part of the graph's
 * enrichment loop: INITIATIVE nodes only join the graph when the GD subgraph is merged
 * in (it lives in its own cache row, not the per-space rows), so a caller that runs this
 * before the merge silently categorises nothing. Returns the counts so the caller can
 * report a vocabulary whose wording matches none of the tags.
 */
export function resolveInitiativeCategories(
  nodes: GraphNode[],
  ndsVocabulary: Vocabulary,
  vng2030Vocabulary: Vocabulary,
  designations: Pick<VngConfig['classifications'], 'nds' | 'vng2030'>,
): { total: number; matched: number } {
  const labelsFor = (vocabulary: Vocabulary, ids: string[]): string[] =>
    ids.map((id) => vocabulary.find((v) => v.key === id)?.label).filter((l): l is string => !!l);

  let total = 0;
  let matched = 0;
  for (const node of nodes) {
    if (node.type !== NodeType.INITIATIVE) continue;
    total += 1;
    const entries = node.classificationEntries;
    let ndsIds: string[];
    let vng2030Ids: string[];
    if (entries?.length) {
      ndsIds = selectionOf(resolveDesignated(entries, designations.nds));
      vng2030Ids = selectionOf(resolveDesignated(entries, designations.vng2030));
      const presented = presentClassifications(entries);
      node.classifications = presented.length ? presented : undefined;
      delete node.classificationEntries;
    } else {
      // LEGACY-GD-POSTS: posts are the only initiatives without classifications. Delete
      // this branch with the posts path.
      const tags = node.tags?.default ?? [];
      ndsIds = resolveByLabel(tags, ndsVocabulary);
      vng2030Ids = resolveByLabel(tags, vng2030Vocabulary);
    }
    const nds = labelsFor(ndsVocabulary, ndsIds);
    const vng2030 = labelsFor(vng2030Vocabulary, vng2030Ids);
    node.ndsCategories = nds.length ? nds : undefined;
    node.vng2030Categories = vng2030.length ? vng2030 : undefined;
    if (nds.length || vng2030.length) matched += 1;
  }
  return { total, matched };
}
