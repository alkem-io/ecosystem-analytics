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
const CLASSIFICATIONS = new Set([
  'winner',
  'finalist',
  'kanshebber',
  'publieksprijs',
  'global-goals-prijs',
]);

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

      const gemeenteNameId = registry.resolveGemeenteByTag(tag);
      if (gemeenteNameId) {
        const nodeId = resolveGemeenteNodeId(gemeenteNameId);
        if (nodeId) addEdge(callout.id, nodeId, EdgeType.INITIATIVE_GEMEENTE);
        else unresolved.add(gemeenteNameId);
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

    if (year !== undefined) node.initiativeYear = year;
    if (classifications.length) node.initiativeClassifications = classifications;
    if (globalGoals.length) node.globalGoals = globalGoals;
  }

  return { nodes, edges, unresolvedGemeenteNameIds: [...unresolved] };
}
