import { acquireSpaces } from './acquire-service.js';
import type { AuthContext } from '../auth/middleware.js';
import { transformToGraph, computeActivityTiers } from '../transform/transformer.js';
import { computeMetrics } from '../transform/metrics.js';
import { computeInsights } from '../transform/insights.js';
import { getCacheEntry, setCacheEntry, invalidateCache, GD_CACHE_SPACE_ID } from '../cache/cache-service.js';
import { loadConfig } from '../config.js';
import { createAlkemioSdk } from '../graphql/client.js';
import { loadVngRegistry } from './vng-registry.js';
import { fetchGemeentedelersCallouts, resolveGemeenteOrgNode } from './gd-initiatives-service.js';
import { buildInitiativeLayer, resolveCategories, resolveThemeTitles } from '../transform/initiatives.js';
import { getLogger } from '../logging/logger.js';
import { type GraphDataset, type GraphNode, type GraphEdge, type SpaceCacheInfo, type SpaceTimeSeries, type ActivityPeriodCounts, NodeType, EdgeType, ActivityTier } from '../types/graph.js';
import type { GraphGenerationRequest, GraphProgress } from '../types/api.js';

const logger = getLogger();

// In-memory progress tracking per user
const progressMap = new Map<string, GraphProgress>();

/**
 * Generate a complete graph dataset for the requested spaces.
 * Orchestrates: cache check → acquire missing → transform → merge → compute metrics → cache → return.
 */
export async function generateGraph(
  userId: string,
  auth: AuthContext,
  request: GraphGenerationRequest,
): Promise<GraphDataset> {
  const { spaceIds, forceRefresh } = request;

  logger.info(`Graph generation requested for spaces [${spaceIds.join(', ')}] by user ${userId}`, { context: 'Graph' });

  // If force refresh, invalidate the listed space rows AND the long-TTL GD
  // initiative subgraph. Gemeente ORGANIZATION nodes (and their avatar URLs)
  // resolved only via the GemeenteDelers layer live in the __gd_initiatives__
  // row, which invalidateCache(spaceIds) does NOT cover — so without this a
  // Refresh leaves stale/missing gemeente images untouched for the full
  // gdCacheTtlHours window. Deleting the row also forces a rebuild even when the
  // includeInitiatives checkbox is off at refresh time (loadGdSubgraph isn't
  // called in that case, so the bypass there is not enough on its own).
  if (forceRefresh) {
    logger.info(`Force refresh: invalidating cache for spaces [${spaceIds.join(', ')}] + GD layer`, { context: 'Graph' });
    invalidateCache(userId, [...spaceIds, GD_CACHE_SPACE_ID]);
  }

  // Check cache for each space
  const spaceNameIds: string[] = [];
  const cachedNodes: GraphNode[] = [];
  const cachedEdges: GraphEdge[] = [];
  const cacheInfo: SpaceCacheInfo[] = [];
  const spacesToFetch: string[] = [];

  for (const spaceId of spaceIds) {
    const cached = getCacheEntry(userId, spaceId);
    if (cached) {
      const partial = JSON.parse(cached.datasetJson) as { nodes: GraphNode[]; edges: GraphEdge[]; nameId: string };
      cachedNodes.push(...partial.nodes);
      cachedEdges.push(...partial.edges);
      cacheInfo.push({
        spaceId,
        lastUpdated: new Date(cached.createdAt).toISOString(),
        fromCache: true,
      });
      spaceNameIds.push(partial.nameId);
    } else {
      spacesToFetch.push(spaceId);
    }
  }

  // Update progress
  setProgress(userId, {
    step: 'acquiring',
    spacesTotal: spaceIds.length,
    spacesCompleted: spaceIds.length - spacesToFetch.length,
  });

  if (cachedNodes.length > 0) {
    logger.info(`Loaded ${cachedNodes.length} nodes from cache for ${spaceIds.length - spacesToFetch.length} space(s)`, { context: 'Graph' });
  }

  // Acquire missing spaces
  let freshNodes: GraphNode[] = [];
  let freshEdges: GraphEdge[] = [];
  let timeSeries: SpaceTimeSeries[] | undefined;
  const errors: string[] = [];
  // Detect activity data from cached edges (if any edge has activityTier, cache had activity)
  let hasActivity = cachedEdges.some((e) => e.activityTier !== undefined);

  if (spacesToFetch.length > 0) {
    logger.info(`Fetching ${spacesToFetch.length} space(s) from Alkemio: [${spacesToFetch.join(', ')}]`, { context: 'Graph' });
    const cachedCount = spaceIds.length - spacesToFetch.length;
    let acquiredCount = 0;
    const acquired = await acquireSpaces(
      auth,
      spacesToFetch,
      () => {
        acquiredCount++;
        setProgress(userId, {
          step: 'acquiring',
          spacesTotal: spaceIds.length,
          spacesCompleted: cachedCount + acquiredCount,
        });
      },
      // Name the space we're about to fetch so the loading UI can say
      // "Loading data… <space>" instead of a bare spinner.
      (nameId) => {
        setProgress(userId, {
          step: 'acquiring',
          spacesTotal: spaceIds.length,
          spacesCompleted: cachedCount + acquiredCount,
          currentSpace: nameId,
        });
      },
    );

    setProgress(userId, {
      step: 'transforming',
      spacesTotal: spaceIds.length,
      spacesCompleted: spaceIds.length,
    });

    // Collect non-fatal errors from acquisition
    errors.push(...acquired.errors);

    const transformed = transformToGraph(acquired);
    freshNodes = transformed.nodes;
    freshEdges = transformed.edges;
    timeSeries = transformed.timeSeries;

    // Track whether activity data was successfully fetched
    hasActivity = acquired.activityEntries !== undefined;

    // Cache each space's partial dataset (keyed by nameId to match frontend request keys)
    for (const { space, nameId } of acquired.spacesL0) {
      const partialNodes = transformed.nodes.filter((n) => n.scopeGroups.includes(space.id));
      const partialEdges = transformed.edges.filter((e) => e.scopeGroup === space.id);
      setCacheEntry(userId, nameId, JSON.stringify({ nodes: partialNodes, edges: partialEdges, nameId }));

      cacheInfo.push({
        spaceId: nameId,
        lastUpdated: new Date().toISOString(),
        fromCache: false,
      });
    }
  }

  // Merge all nodes and edges (deduplicate by ID)
  const allNodes = deduplicateNodes([...cachedNodes, ...freshNodes]);
  const allEdges = [...cachedEdges, ...freshEdges];

  // Recompute space activity totals from merged edge data.
  // This ensures cached spaces also get correct totalActivityCount / spaceActivityTier
  // without requiring a force-refresh.
  recomputeSpaceActivity(allNodes, allEdges);

  // Tag gemeente organisations from the snapshot registry (FR-032/035) and resolve
  // the classification dimensions (NDS / VNG-2030 / themes) onto SPACE nodes from
  // their already-fetched profile tags. Done here (post-cache) so cached spaces are
  // enriched too, with NO extra Alkemio fetch — the table + graph filters read these
  // fields straight off the node. Uses the VNG taxonomy (currently shared with
  // GovTech); revisit if per-app mappings diverge.
  const registry = loadVngRegistry();
  const mapping = loadConfig().vng.tagCategoryMapping;
  for (const node of allNodes) {
    if (node.type === NodeType.ORGANIZATION) {
      node.isGemeente = registry.isGemeenteNameId(node.nameId);
      if (node.isGemeente) {
        const info = registry.municipalityInfoByNameId(node.nameId);
        node.provinceCode = info?.provinceCode ?? null;
        node.provinceName = info?.provinceName ?? null;
        node.population = info?.population ?? null;
      }
    } else if (
      node.type === NodeType.SPACE_L0 ||
      node.type === NodeType.SPACE_L1 ||
      node.type === NodeType.SPACE_L2
    ) {
      const tags = [
        ...(node.tags?.keywords ?? []),
        ...(node.tags?.skills ?? []),
        ...(node.tags?.default ?? []),
      ];
      const nds = resolveCategories(tags, mapping.nds);
      const vng2030 = resolveCategories(tags, mapping.vng2030);
      const themes = resolveThemeTitles(tags, registry);
      node.ndsCategories = nds.length ? nds : undefined;
      node.vng2030Categories = vng2030.length ? vng2030 : undefined;
      node.vngThemes = themes.length ? themes : undefined;
    }
  }

  // Optionally fold in the GemeenteDelers initiative layer (US10). Non-fatal.
  let gdLayer: GraphDataset['gdLayer'];
  if (request.includeInitiatives) {
    const meta = registry.meta();
    const source = {
      programme: meta.programme.name,
      years: meta.programme.years,
      url: meta.programme.sourceUrl,
    };
    try {
      const subgraph = await loadGdSubgraph(userId, auth, registry, forceRefresh);

      // Dedupe ORGANIZATION nodes by nameId so initiatives attach to existing
      // gemeente nodes rather than spawning duplicates (FR-040/043).
      const orgNameIdsInGraph = new Set<string>();
      for (const node of allNodes) {
        if (node.type === NodeType.ORGANIZATION && node.nameId) orgNameIdsInGraph.add(node.nameId);
      }
      for (const node of subgraph.nodes) {
        if (node.type === NodeType.ORGANIZATION && node.nameId && orgNameIdsInGraph.has(node.nameId)) {
          continue; // already present in the base graph
        }
        allNodes.push(node);
      }
      allEdges.push(...subgraph.edges);
      gdLayer = { available: true, initiativeCount: subgraph.initiativeCount, source };
    } catch (err) {
      logger.warn(`GD initiative layer unavailable: ${(err as Error).message}`, { context: 'Graph' });
      gdLayer = { available: false, initiativeCount: 0, source, error: 'GD_LAYER_UNAVAILABLE' };
    }
  }

  // Compute metrics and insights
  const metrics = computeMetrics(allNodes, allEdges);
  const insights = computeInsights(allNodes, allEdges);

  setProgress(userId, {
    step: 'ready',
    spacesTotal: spaceIds.length,
    spacesCompleted: spaceIds.length,
  });

  logger.info(`Graph generation complete: ${allNodes.length} nodes, ${allEdges.length} edges for user ${userId}`, { context: 'Graph' });

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    spaces: spaceIds,
    nodes: allNodes,
    edges: allEdges,
    metrics,
    cacheInfo,
    insights,
    hasActivityData: hasActivity,
    timeSeries,
    errors: errors.length > 0 ? errors : undefined,
    gdLayer,
  };
}

interface GdSubgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  initiativeCount: number;
}

/**
 * Build (or load from the long-TTL per-user cache) the GemeenteDelers initiative
 * subgraph: INITIATIVE/THEME nodes, resolved gemeente ORGANIZATION nodes, and the
 * INITIATIVE_GEMEENTE/INITIATIVE_THEME edges. Org node ids are the real Alkemio
 * UUIDs, so the subgraph is independent of which spaces are currently selected and
 * can be cached once per user (Constitution IV). Throws if the GD space is
 * unreadable so the caller can fall back to gdLayer.available=false (FR-044).
 */
async function loadGdSubgraph(
  userId: string,
  auth: AuthContext,
  registry: ReturnType<typeof loadVngRegistry>,
  forceRefresh: boolean | undefined,
): Promise<GdSubgraph> {
  if (!forceRefresh) {
    const cached = getCacheEntry(userId, GD_CACHE_SPACE_ID);
    if (cached) {
      logger.info(`GD initiative subgraph served from cache for user ${userId}`, { context: 'Graph' });
      return JSON.parse(cached.datasetJson) as GdSubgraph;
    }
  }

  const sdk = await createAlkemioSdk(auth);
  const callouts = await fetchGemeentedelersCallouts(auth, sdk);

  // First pass: build the layer, collecting gemeente nameIds we couldn't resolve
  // to a node (the GD subgraph starts with no org nodes of its own).
  const resolvedOrgNodeIdByNameId = new Map<string, string>();
  const mapping = loadConfig().vng.tagCategoryMapping;
  const firstPass = buildInitiativeLayer(
    callouts,
    registry,
    (nameId) => resolvedOrgNodeIdByNameId.get(nameId) ?? null,
    mapping,
  );

  // Resolve each missing gemeente org exactly once (dedup via the map), creating
  // one ORGANIZATION node per gemeente (FR-043). Non-fatal: unresolvable ones are
  // simply dropped from the edge set.
  const extraOrgNodes: GraphNode[] = [];
  for (const gemeenteNameId of firstPass.unresolvedGemeenteNameIds) {
    if (resolvedOrgNodeIdByNameId.has(gemeenteNameId)) continue;
    const node = await resolveGemeenteOrgNode(sdk, gemeenteNameId);
    if (!node) continue;
    resolvedOrgNodeIdByNameId.set(gemeenteNameId, node.id);
    extraOrgNodes.push(node);
  }

  // Second pass: now the resolver knows the newly added org node ids, so the
  // INITIATIVE_GEMEENTE edges to previously-missing gemeentes get created.
  const finalLayer = buildInitiativeLayer(
    callouts,
    registry,
    (nameId) => resolvedOrgNodeIdByNameId.get(nameId) ?? null,
    mapping,
  );

  const subgraph: GdSubgraph = {
    nodes: [...finalLayer.nodes, ...extraOrgNodes],
    edges: finalLayer.edges,
    initiativeCount: callouts.length,
  };

  // Cache under the reserved space_id with the long archival TTL (FR-046).
  const ttlHours = loadConfig().vng.gdCacheTtlHours;
  setCacheEntry(userId, GD_CACHE_SPACE_ID, JSON.stringify(subgraph), ttlHours);

  return subgraph;
}

/** Get current generation progress for a user */
export function getProgress(userId: string): GraphProgress {
  return progressMap.get(userId) || { step: 'ready', spacesTotal: 0, spacesCompleted: 0 };
}

function setProgress(userId: string, progress: GraphProgress): void {
  progressMap.set(userId, progress);
}

/** Deduplicate nodes by ID, merging scope groups */
function deduplicateNodes(nodes: GraphNode[]): GraphNode[] {
  const map = new Map<string, GraphNode>();
  for (const node of nodes) {
    const existing = map.get(node.id);
    if (existing) {
      for (const sg of node.scopeGroups) {
        if (!existing.scopeGroups.includes(sg)) {
          existing.scopeGroups.push(sg);
        }
      }
    } else {
      map.set(node.id, { ...node });
    }
  }
  return Array.from(map.values());
}

/**
 * Recompute totalActivityCount and spaceActivityTier on space nodes
 * from the merged edge data. This ensures cached datasets (which may
 * predate the space-activity feature) get correct values without
 * requiring a force-refresh.
 */
function recomputeSpaceActivity(nodes: GraphNode[], edges: GraphEdge[]): void {
  // Sum activityCount and per-period counts from user→space edges, grouped by target spaceId
  const spaceCountMap = new Map<string, number>();
  const spacePeriodMap = new Map<string, ActivityPeriodCounts>();

  for (const edge of edges) {
    if (edge.type !== EdgeType.MEMBER && edge.type !== EdgeType.LEAD && edge.type !== EdgeType.ADMIN) continue;
    if (edge.activityCount === undefined || edge.activityCount === 0) continue;
    const prev = spaceCountMap.get(edge.targetId) ?? 0;
    spaceCountMap.set(edge.targetId, prev + edge.activityCount);

    // Accumulate per-period counts if available
    if (edge.activityByPeriod) {
      let rec = spacePeriodMap.get(edge.targetId);
      if (!rec) {
        rec = { day: 0, week: 0, month: 0, allTime: 0 };
        spacePeriodMap.set(edge.targetId, rec);
      }
      rec.day += edge.activityByPeriod.day;
      rec.week += edge.activityByPeriod.week;
      rec.month += edge.activityByPeriod.month;
      rec.allTime += edge.activityByPeriod.allTime;
    }
  }

  if (spaceCountMap.size === 0) return;

  const spaceTierMap = computeActivityTiers(spaceCountMap);

  for (const node of nodes) {
    if (node.type !== NodeType.SPACE_L0 && node.type !== NodeType.SPACE_L1 && node.type !== NodeType.SPACE_L2) continue;
    const total = spaceCountMap.get(node.id);
    node.totalActivityCount = total ?? 0;
    node.spaceActivityTier = spaceTierMap.get(node.id) ?? ActivityTier.INACTIVE;
    node.activityByPeriod = spacePeriodMap.get(node.id) ?? { day: 0, week: 0, month: 0, allTime: 0 };
  }
}
