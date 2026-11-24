import type { AuthContext } from '../auth/middleware.js';
import { isAlkemioAuthError } from '../graphql/client.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';
import { loadGdSubgraphForAdmin, type GdSubgraph } from '../services/graph-service.js';
import { NodeType, type GraphNode } from '../types/graph.js';
import type { GdSourceSummaryView } from '../types/admin.js';
import {
  resolveDesignated,
  unionVocabularies,
  vocabularyOf,
} from '../transform/classifications.js';
import { resolveInitiativeCategories } from '../transform/initiatives.js';
import type { VngConfig } from '../config.js';

type Designations = Pick<VngConfig['classifications'], 'nds' | 'vng2030'>;

/**
 * The initiatives of a GD subgraph with their NDS / VNG-2030 labels resolved. The cached
 * row holds them RAW — subspaces carry classification entries, posts only tags — and the
 * dashboard resolves them when it merges the layer in (`resolveInitiativeCategories`).
 * The admin area reads the row directly, so it must run the same step, or every
 * initiative shows as unclassified. Vocabularies come from the GD subspaces' own
 * classifications (the same template as the Groei Spaces); posts are matched against
 * their labels. Works on copies: the subgraph object is left as it was.
 */
function categorisedInitiatives(nodes: GraphNode[], designations: Designations): GraphNode[] {
  const initiatives = nodes.filter((n) => n.type === NodeType.INITIATIVE).map((n) => ({ ...n }));
  const vocabulary = (designation: Designations['nds']) =>
    unionVocabularies(
      initiatives
        .filter((n) => n.classificationEntries?.length)
        .map((n) => vocabularyOf(resolveDesignated(n.classificationEntries!, designation))),
    );
  resolveInitiativeCategories(initiatives, vocabulary(designations.nds), vocabulary(designations.vng2030), designations);
  return initiatives;
}

/**
 * The GemeenteDelers source in detail for the admin area (feature 027, research R13), from
 * the MANAGER's own GD row — built if absent, exactly as a dashboard load would. Counts
 * agree with the browser's `[GemeenteDelers]` console summary (`summariseGdSources`), which
 * reads the same INITIATIVE nodes (SC-006). LEGACY-GD-POSTS: the posts counts, the
 * superseded list and `migrationComplete` go with the posts path.
 */
export function summariseGdSubgraph(
  subgraph: GdSubgraph,
  age: { readAt: number | null; expiresAt: number | null },
  space: GdSourceSummaryView['space'],
  designations: Designations = loadConfig().dashboards.vng.classifications,
): GdSourceSummaryView {
  const initiatives: GdSourceSummaryView['initiatives'] = [];
  let viaSubspaces = 0;
  let viaPosts = 0;
  let unknown = 0;
  for (const node of categorisedInitiatives(subgraph.nodes, designations)) {
    const nameId = node.nameId ?? node.id;
    if (node.initiativeSource === 'subspace') viaSubspaces += 1;
    else if (node.initiativeSource === 'post') viaPosts += 1;
    else unknown += 1;
    if (node.initiativeSource) {
      initiatives.push({
        nameId,
        displayName: node.displayName,
        source: node.initiativeSource,
        url: node.url ?? null,
        nds: node.ndsCategories ?? [],
        vng2030: node.vng2030Categories ?? [],
      });
    }
  }
  const total = viaSubspaces + viaPosts + unknown;
  const sources = subgraph.sources;
  return {
    space,
    available: true,
    error: null,
    total,
    viaSubspaces,
    viaPosts,
    initiatives: initiatives.sort((a, b) => a.displayName.localeCompare(b.displayName, 'nl')),
    superseded: (sources?.superseded ?? []).map((s) => ({
      postNameId: s.postNameId,
      subspaceNameId: s.subspaceNameId,
      subspaceDisplayName: s.subspaceDisplayName ?? null,
      subspaceUrl: s.subspaceUrl ?? null,
      rule: s.rule,
    })),
    ambiguous: sources?.ambiguous ? sources.ambiguous.map((a) => a.subspaceNameId) : null,
    readAt: age.readAt ? new Date(age.readAt).toISOString() : null,
    nextRefreshAt: age.expiresAt ? new Date(age.expiresAt).toISOString() : null,
    // Only a row that records sources can prove there are no posts left.
    migrationComplete: viaPosts === 0 && unknown === 0 && total > 0,
  };
}

const unavailable = (
  error: 'GD_SPACE_UNREADABLE' | 'LOAD_FAILED',
  space: GdSourceSummaryView['space'],
): GdSourceSummaryView => ({
  space,
  available: false,
  error,
  total: 0,
  viaSubspaces: 0,
  viaPosts: 0,
  initiatives: [],
  superseded: [],
  ambiguous: null,
  readAt: null,
  nextRefreshAt: null,
  migrationComplete: false,
});

/** `GET /api/vng/admin/gd-source` (contracts/api-admin.md §7). */
export async function buildGdSourceSummary(auth: AuthContext): Promise<GdSourceSummaryView> {
  const config = loadConfig();
  const nameId = config.vng.gemeentedelersSpaceNameId;
  const space = { displayName: nameId, url: `${config.alkemioServerUrl.replace(/\/+$/, '')}/${nameId}` };
  try {
    const { subgraph, readAt, expiresAt } = await loadGdSubgraphForAdmin(auth);
    return summariseGdSubgraph(subgraph, { readAt, expiresAt }, space);
  } catch (err) {
    if (isAlkemioAuthError(err)) throw err;
    const message = (err as Error).message ?? '';
    getLogger().warn(`GD source summary unavailable: ${message}`, { context: 'Admin' });
    return unavailable(/GD_SPACE_UNREADABLE|FORBIDDEN/i.test(message) ? 'GD_SPACE_UNREADABLE' : 'LOAD_FAILED', space);
  }
}
