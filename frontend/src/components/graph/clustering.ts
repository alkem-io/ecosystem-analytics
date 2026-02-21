import type { GraphNode } from '@server/types/graph.js';

export type ClusterMode = 'space' | 'organization';

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
  return clusterByOrganization(nodes);
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

/** Cluster by Organization membership */
function clusterByOrganization(nodes: GraphNode[]): Cluster[] {
  // For org clustering, we group users/spaces by which orgs they share edges with.
  // Since we don't have edge info here, we cluster org nodes together with
  // other nodes that share the same scope groups.
  // A more complete implementation would take edges as input.

  const orgNodes = nodes.filter((n) => n.type === 'ORGANIZATION');
  const groups = new Map<string, string[]>();

  // Each org becomes a cluster center
  for (const org of orgNodes) {
    groups.set(org.id, [org.id]);
  }

  // Assign non-org nodes to the org cluster they share the most scope groups with
  const nonOrgNodes = nodes.filter((n) => n.type !== 'ORGANIZATION');
  for (const node of nonOrgNodes) {
    let bestOrg: string | null = null;
    let bestOverlap = 0;

    for (const org of orgNodes) {
      const overlap = node.scopeGroups.filter((sg) => org.scopeGroups.includes(sg)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestOrg = org.id;
      }
    }

    if (bestOrg) {
      groups.get(bestOrg)!.push(node.id);
    } else {
      // No matching org — put in "ungrouped"
      if (!groups.has('ungrouped')) groups.set('ungrouped', []);
      groups.get('ungrouped')!.push(node.id);
    }
  }

  return Array.from(groups).map(([id, nodeIds]) => {
    const orgNode = orgNodes.find((n) => n.id === id);
    return {
      id,
      label: orgNode?.displayName || 'Ungrouped',
      nodeIds,
    };
  });
}
