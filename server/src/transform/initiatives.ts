/**
 * GemeenteDelers initiative layer (feature 016, US10).
 *
 * Pure transform: given GD Knowledge-Base callouts (as data), the snapshot
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
import type { GdCalloutInput } from '../types/api.js';
import type { VngRegistry } from '../services/vng-registry.js';

export interface InitiativeLayer {
  /** INITIATIVE + canonical THEME nodes (gemeente org nodes are owned by the caller). */
  nodes: GraphNode[];
  /** INITIATIVE_GEMEENTE + INITIATIVE_THEME edges. */
  edges: GraphEdge[];
  /** Gemeente nameIDs referenced by an initiative but not resolvable to a node. */
  unresolvedGemeenteNameIds: string[];
}

const YEAR_RE = /^gd-(\d{4})$/i;
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

/** A tag→category map for one dashboard dimension (lower-cased tag keys). */
export type DimensionMap = Record<string, string>;

/** The NDS + VNG-2030 tag→category mappings used to classify entities. */
export interface TagCategoryMapping {
  nds: DimensionMap;
  vng2030: DimensionMap;
}

/** Distinct category keys an entity's tags map into for one dimension (sorted). */
export function resolveCategories(tags: readonly string[], map: DimensionMap): string[] {
  const hit = new Set<string>();
  for (const t of tags) {
    const cat = map[t.trim().toLowerCase()];
    if (cat) hit.add(cat);
  }
  return [...hit].sort();
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
  callouts: GdCalloutInput[],
  registry: VngRegistry,
  /** Resolve a gemeente org nameID to an existing/added node id (null if unresolvable). */
  resolveGemeenteNodeId: (gemeenteNameId: string) => string | null,
  /** NDS / VNG-2030 tag→category mappings, used to classify each initiative. */
  mapping?: TagCategoryMapping,
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
    let year: number | undefined;
    const classifications: string[] = [];
    const globalGoals: string[] = [];

    const node = baseNode(callout.id, NodeType.INITIATIVE, callout.displayName, callout.nameId);
    node.sourceUrl = callout.sourceUrl ?? null;
    nodes.push(node);

    for (const rawTag of callout.tags) {
      const tag = rawTag.trim();
      if (!tag) continue;

      const yearMatch = tag.match(YEAR_RE);
      if (yearMatch) {
        year = Number(yearMatch[1]);
        continue;
      }
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

    // Resolved classification dimensions (stored on the node for the table + graph
    // filtering). All computed in-memory from the callout tags — no extra fetch.
    const themeTitles = resolveThemeTitles(callout.tags, registry);
    if (themeTitles.length) node.vngThemes = themeTitles;
    if (mapping) {
      const nds = resolveCategories(callout.tags, mapping.nds);
      const vng2030 = resolveCategories(callout.tags, mapping.vng2030);
      if (nds.length) node.ndsCategories = nds;
      if (vng2030.length) node.vng2030Categories = vng2030;
    }
  }

  return { nodes, edges, unresolvedGemeenteNameIds: [...unresolved] };
}
