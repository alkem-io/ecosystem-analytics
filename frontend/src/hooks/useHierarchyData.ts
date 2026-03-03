/**
 * Hook: useHierarchyData
 * Transforms flat GraphNode[] + GraphEdge[] into a HierarchyDatum tree
 * compatible with d3.hierarchy() for Treemap and Sunburst views.
 *
 * Tree construction algorithm (per data-model.md Section 6):
 * 1. Create root: { id: 'ecosystem', name: 'Ecosystem', children: [] }
 * 2. For each SPACE_L0 → child of root
 * 3. For each SPACE_L1 → child of its parentSpaceId
 * 4. For each SPACE_L2 → child of its parentSpaceId
 * 5. Optionally (showMembers) → users/orgs as leaf children of their deepest space
 * 6. Compute value based on sizeMetric; floor to 1
 */

import { useMemo } from 'react';
import type { GraphDataset, GraphNode, GraphEdge } from '@server/types/graph.js';
import type { ActivityPeriod, ActivityTier } from '@server/types/graph.js';
import { NodeType, EdgeType } from '@server/types/graph.js';
import type { HierarchyDatum, HierarchySizeMetric } from '../types/views.js';
import { getNodeDisplayImage } from '../services/imageUtils.js';

export interface UseHierarchyDataReturn {
  /** Root datum for d3.hierarchy() */
  root: HierarchyDatum | null;
}

interface UseHierarchyDataOptions {
  dataset: GraphDataset | null;
  sizeMetric: HierarchySizeMetric;
  activityPeriod: ActivityPeriod;
  /** Include user/org leaf nodes (for sunburst) */
  showMembers?: boolean;
}

export function useHierarchyData({
  dataset,
  sizeMetric,
  activityPeriod,
  showMembers = false,
}: UseHierarchyDataOptions): UseHierarchyDataReturn {
  const root = useMemo(() => {
    if (!dataset) return null;
    return buildHierarchy(dataset.nodes, dataset.edges, sizeMetric, activityPeriod, showMembers);
  }, [dataset, sizeMetric, activityPeriod, showMembers]);

  return { root };
}

/**
 * Build the hierarchy tree from flat graph data.
 */
function buildHierarchy(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sizeMetric: HierarchySizeMetric,
  activityPeriod: ActivityPeriod,
  showMembers: boolean,
): HierarchyDatum {
  // Index nodes by id
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Build lookup: spaceId → member count (USER + ORG edges)
  const memberCountBySpace = new Map<string, number>();
  // Build lookup: spaceId → array of contributor node IDs
  const contributorsBySpace = new Map<string, string[]>();

  for (const edge of edges) {
    if (edge.type === EdgeType.MEMBER || edge.type === EdgeType.LEAD || edge.type === EdgeType.ADMIN) {
      const sourceNode = nodeMap.get(edge.sourceId);
      if (sourceNode && (sourceNode.type === NodeType.USER || sourceNode.type === NodeType.ORGANIZATION)) {
        memberCountBySpace.set(edge.targetId, (memberCountBySpace.get(edge.targetId) ?? 0) + 1);
        let list = contributorsBySpace.get(edge.targetId);
        if (!list) {
          list = [];
          contributorsBySpace.set(edge.targetId, list);
        }
        list.push(edge.sourceId);
      }
    }
  }

  // Create root
  const root: HierarchyDatum = {
    id: 'ecosystem',
    name: 'Ecosystem',
    type: NodeType.SPACE_L0,
    value: 0,
    isPrivate: false,
    children: [],
  };

  // Build datum map for parent lookups
  const datumMap = new Map<string, HierarchyDatum>();

  // Step 2: Add L0 spaces
  for (const node of nodes) {
    if (node.type !== NodeType.SPACE_L0) continue;
    const datum = nodeToDatum(node, sizeMetric, activityPeriod, memberCountBySpace);
    datumMap.set(node.id, datum);
    root.children!.push(datum);
  }

  // Step 3: Add L1 spaces
  for (const node of nodes) {
    if (node.type !== NodeType.SPACE_L1) continue;
    const datum = nodeToDatum(node, sizeMetric, activityPeriod, memberCountBySpace);
    datumMap.set(node.id, datum);
    const parent = node.parentSpaceId ? datumMap.get(node.parentSpaceId) : null;
    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(datum);
    } else {
      // Orphan L1 — attach to root
      root.children!.push(datum);
    }
  }

  // Step 4: Add L2 spaces
  for (const node of nodes) {
    if (node.type !== NodeType.SPACE_L2) continue;
    const datum = nodeToDatum(node, sizeMetric, activityPeriod, memberCountBySpace);
    datumMap.set(node.id, datum);
    const parent = node.parentSpaceId ? datumMap.get(node.parentSpaceId) : null;
    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(datum);
    } else {
      root.children!.push(datum);
    }
  }

  // Step 5: Optionally add member/org leaves (for sunburst)
  if (showMembers) {
    // For each space, add its unique contributors as leaf children
    const addedToSpace = new Set<string>(); // "nodeId:spaceId" dedup

    for (const [spaceId, contributorIds] of contributorsBySpace) {
      const spaceDatum = datumMap.get(spaceId);
      if (!spaceDatum) continue;

      for (const contribId of contributorIds) {
        const key = `${contribId}:${spaceId}`;
        if (addedToSpace.has(key)) continue;
        addedToSpace.add(key);

        const contribNode = nodeMap.get(contribId);
        if (!contribNode) continue;

        const leaf: HierarchyDatum = {
          id: `${contribId}@${spaceId}`,
          name: contribNode.displayName,
          type: contribNode.type,
          value: 1,
          isPrivate: false,
          avatarUrl: getNodeDisplayImage({ type: contribNode.type, avatarUrl: contribNode.avatarUrl, bannerUrl: contribNode.bannerUrl }),
          tagline: contribNode.tagline ?? null,
        };

        if (!spaceDatum.children) spaceDatum.children = [];
        spaceDatum.children.push(leaf);
      }
    }
  }

  // Step 7: Ensure minimum value of 1 for all leaf nodes
  ensureMinValues(root);

  return root;
}

/**
 * Convert a GraphNode to a HierarchyDatum.
 */
function nodeToDatum(
  node: GraphNode,
  sizeMetric: HierarchySizeMetric,
  activityPeriod: ActivityPeriod,
  memberCountBySpace: Map<string, number>,
): HierarchyDatum {
  let value: number;

  if (sizeMetric === 'members') {
    value = memberCountBySpace.get(node.id) ?? 0;
  } else {
    // sizeMetric === 'activity'
    if (node.activityByPeriod) {
      value = node.activityByPeriod[activityPeriod] ?? 0;
    } else {
      value = node.totalActivityCount ?? 0;
    }
  }

  const allTags: string[] = [];
  if (node.tags?.keywords) allTags.push(...node.tags.keywords);
  if (node.tags?.skills) allTags.push(...node.tags.skills);
  if (node.tags?.default) allTags.push(...node.tags.default);

  const activityCount = node.activityByPeriod
    ? (node.activityByPeriod[activityPeriod] ?? 0)
    : (node.totalActivityCount ?? 0);

  return {
    id: node.id,
    name: node.displayName,
    type: node.type,
    value: Math.max(value, 0), // will be floored to 1 later for leaves
    activityTier: (node.spaceActivityTier ?? undefined) as ActivityTier | undefined,
    tags: allTags.length > 0 ? allTags : undefined,
    isPrivate: node.privacyMode === 'PRIVATE',
    children: [],
    avatarUrl: getNodeDisplayImage({ type: node.type, avatarUrl: node.avatarUrl, bannerUrl: node.bannerUrl }),
    bannerUrl: node.bannerUrl ? getNodeDisplayImage({ type: 'SPACE_L0', avatarUrl: null, bannerUrl: node.bannerUrl }) : null,
    tagline: node.tagline ?? null,
    memberCount: memberCountBySpace.get(node.id) ?? 0,
    activityCount,
    url: node.url ?? null,
  };
}

/**
 * Recursively ensure all leaf nodes have value >= 1.
 * For branch nodes, d3 computes value as sum of children, so we only set leaves.
 */
function ensureMinValues(datum: HierarchyDatum): void {
  if (!datum.children || datum.children.length === 0) {
    // Leaf: floor to 1
    datum.value = Math.max(datum.value, 1);
    return;
  }
  for (const child of datum.children) {
    ensureMinValues(child);
  }
}
