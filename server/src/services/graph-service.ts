import { acquireSpaces } from './acquire-service.js';
import { transformToGraph, computeActivityTiers } from '../transform/transformer.js';
import { computeMetrics } from '../transform/metrics.js';
import { computeInsights } from '../transform/insights.js';
import { getCacheEntry, setCacheEntry, invalidateCache } from '../cache/cache-service.js';
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
  bearerToken: string,
  request: GraphGenerationRequest,
): Promise<GraphDataset> {
  const { spaceIds, forceRefresh } = request;

  logger.info(`Graph generation requested for spaces [${spaceIds.join(', ')}] by user ${userId}`, { context: 'Graph' });

  // If force refresh, invalidate all cache entries for these spaces
  if (forceRefresh) {
    logger.info(`Force refresh: invalidating cache for spaces [${spaceIds.join(', ')}]`, { context: 'Graph' });
    invalidateCache(userId, spaceIds);
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
  // Detect activity data from cached edges (if any edge has activityTier, cache had activity)
  let hasActivity = cachedEdges.some((e) => e.activityTier !== undefined);

  if (spacesToFetch.length > 0) {
    logger.info(`Fetching ${spacesToFetch.length} space(s) from Alkemio: [${spacesToFetch.join(', ')}]`, { context: 'Graph' });
    const acquired = await acquireSpaces(bearerToken, spacesToFetch);

    setProgress(userId, {
      step: 'transforming',
      spacesTotal: spaceIds.length,
      spacesCompleted: spaceIds.length - spacesToFetch.length,
    });

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
  };
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
