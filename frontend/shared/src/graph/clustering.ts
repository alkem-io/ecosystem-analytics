import type { GraphNode } from '@server/types/graph.js';

export type ClusterMode = 'space' | 'people';

export interface Cluster {
  id: string;
  label: string;
  nodeIds: string[];
}

/**
 * Group nodes into clusters based on the selected mode.
 */
export function computeClusters(nodes: GraphNode[], mode: ClusterMode): Cluster[] {
  if (mode === 'space') {
    return clusterBySpace(nodes);
  }
  return clusterByPeople(nodes);
}

/** Cluster by L0 Space scope group */
function clusterBySpace(nodes: GraphNode[]): Cluster[] {
  const groups = new Map<string, string[]>();

  for (const node of nodes) {
    // Use the first scope group as the primary cluster
    const scopeGroup = node.scopeGroups[0] || 'uncategorized';
    if (!groups.has(scopeGroup)) groups.set(scopeGroup, []);
    groups.get(scopeGroup)!.push(node.id);
  }

  // Find the L0 Space node for each group to get a label
  const clusters: Cluster[] = [];
  for (const [groupId, nodeIds] of groups) {
    const spaceNode = nodes.find((n) => n.id === groupId);
    clusters.push({
      id: groupId,
      label: spaceNode?.displayName || groupId,
      nodeIds,
    });
  }

  return clusters;
}

/**
 * Cluster by People — the most connected users become cluster anchors.
 * Every non-user node (space, org) is assigned to the person it shares
 * the most scope-group overlap with, giving a "who works where" view.
 */
function clusterByPeople(nodes: GraphNode[]): Cluster[] {
  const userNodes = nodes.filter((n) => n.type === 'USER');

  // Rank users by number of scope groups (proxy for connectivity)
  const ranked = [...userNodes].sort((a, b) => b.scopeGroups.length - a.scopeGroups.length);

  // Take the top N as cluster anchors (max 20 to keep it readable)
  const MAX_ANCHORS = 20;
  const anchors = ranked.slice(0, MAX_ANCHORS);

  const groups = new Map<string, string[]>();
  for (const anchor of anchors) {
    groups.set(anchor.id, [anchor.id]);
  }

  // Users that didn't become anchors + all non-user nodes
  const remaining = nodes.filter((n) => !groups.has(n.id));

  for (const node of remaining) {
    let bestAnchor: string | null = null;
    let bestOverlap = 0;

    for (const anchor of anchors) {
      const overlap = node.scopeGroups.filter((sg) => anchor.scopeGroups.includes(sg)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestAnchor = anchor.id;
      }
    }

    if (bestAnchor) {
      groups.get(bestAnchor)!.push(node.id);
    } else {
      if (!groups.has('ungrouped')) groups.set('ungrouped', []);
      groups.get('ungrouped')!.push(node.id);
    }
  }

  return Array.from(groups).map(([id, nodeIds]) => {
    const anchor = userNodes.find((n) => n.id === id);
    return {
      id,
      label: anchor?.displayName || 'Ungrouped',
      nodeIds,
    };
  });
}
