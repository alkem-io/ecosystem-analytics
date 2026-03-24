import { useMemo } from 'react';
import type { GraphDataset, GraphNode, GraphEdge } from '@server/types/graph.js';
import { NodeType, EdgeType } from '@server/types/graph.js';

// ── Type Definitions ──

export interface AggregateMetrics {
  totalUsers: number;
  totalOrganizations: number;
  totalSubspaces: number;
  totalL0Spaces: number;
  totalEdges: number;
  bridgeConnectorCount: number;
}

export interface BridgeConnector {
  nodeId: string;
  displayName: string;
  l0SpaceCount: number;
  l0SpaceNames: string[];
}

export interface MultiSpaceUser {
  nodeId: string;
  displayName: string;
  l0SpaceId: string;
  l0SpaceName: string;
  subspaceCount: number;
}

export interface SpaceRanking {
  nodeId: string;
  displayName: string;
  type: 'SPACE_L1' | 'SPACE_L2';
  memberCount: number;
  parentSpaceName: string | null;
}

export interface TopConnector {
  nodeId: string;
  displayName: string;
  type: 'USER' | 'ORGANIZATION';
  spaceCount: number;
  avatarUrl: string | null;
}

export interface OrgDistribution {
  l0SpaceId: string;
  l0SpaceName: string;
  orgCount: number;
}

export interface InsightAction {
  type: 'highlight' | 'select' | 'focus';
  nodeIds: string[];
}

export interface HeadlineInsight {
  id: string;
  message: string;
  priority: number;
  action: InsightAction;
}

export interface EcosystemMetrics {
  aggregates: AggregateMetrics;
  bridgeConnectors: BridgeConnector[];
  multiSpaceUsers: MultiSpaceUser[];
  spaceRankings: SpaceRanking[];
  topConnectors: TopConnector[];
  orgDistribution: OrgDistribution[];
  headlineInsights: HeadlineInsight[];
  hasRestrictedNodes: boolean;
}

export interface EcosystemMetricsFilters {
  showPeople: boolean;
  showOrganizations: boolean;
  showSpaces: boolean;
}

// ── Computation Helpers ──

const SPACE_TYPES = new Set<NodeType>([NodeType.SPACE_L0, NodeType.SPACE_L1, NodeType.SPACE_L2]);
const SUBSPACE_TYPES = new Set<NodeType>([NodeType.SPACE_L1, NodeType.SPACE_L2]);
const ROLE_EDGE_TYPES = new Set<EdgeType>([EdgeType.MEMBER, EdgeType.LEAD, EdgeType.ADMIN]);

function isSpaceNode(node: GraphNode): boolean {
  return SPACE_TYPES.has(node.type);
}

function isSubspaceNode(node: GraphNode): boolean {
  return SUBSPACE_TYPES.has(node.type);
}

function isRoleEdge(edge: GraphEdge): boolean {
  return ROLE_EDGE_TYPES.has(edge.type);
}

function shouldIncludeNodeType(node: GraphNode, filters: EcosystemMetricsFilters): boolean {
  switch (node.type) {
    case NodeType.USER:
      return filters.showPeople;
    case NodeType.ORGANIZATION:
      return filters.showOrganizations;
    case NodeType.SPACE_L0:
    case NodeType.SPACE_L1:
    case NodeType.SPACE_L2:
      return filters.showSpaces;
    default:
      return true;
  }
}

// ── Core Computation ──

function computeMetrics(dataset: GraphDataset, filters: EcosystemMetricsFilters): EcosystemMetrics {
  const isDev = import.meta.env.DEV;
  if (isDev) console.time('useEcosystemMetrics');

  // Step 1: Build node lookup
  const nodeMap = new Map<string, GraphNode>();
  for (const node of dataset.nodes) {
    nodeMap.set(node.id, node);
  }

  // Step 2: Filter nodes — exclude restricted and visibility-toggled
  let hasRestrictedNodes = false;
  const visibleNodes: GraphNode[] = [];
  for (const node of dataset.nodes) {
    if (node.restricted === true) {
      hasRestrictedNodes = true;
      continue;
    }
    if (!shouldIncludeNodeType(node, filters)) continue;
    visibleNodes.push(node);
  }

  // Step 3: Build visible node ID set
  const visibleIdSet = new Set<string>();
  for (const node of visibleNodes) {
    visibleIdSet.add(node.id);
  }

  // Step 4: Filter edges — both endpoints must be visible
  const visibleEdges: GraphEdge[] = [];
  for (const edge of dataset.edges) {
    if (visibleIdSet.has(edge.sourceId) && visibleIdSet.has(edge.targetId)) {
      visibleEdges.push(edge);
    }
  }

  // Step 5: Compute aggregates
  let totalUsers = 0;
  let totalOrganizations = 0;
  let totalSubspaces = 0;
  let totalL0Spaces = 0;
  for (const node of visibleNodes) {
    switch (node.type) {
      case NodeType.USER: totalUsers++; break;
      case NodeType.ORGANIZATION: totalOrganizations++; break;
      case NodeType.SPACE_L1: totalSubspaces++; break;
      case NodeType.SPACE_L2: totalSubspaces++; break;
      case NodeType.SPACE_L0: totalL0Spaces++; break;
    }
  }

  // Step 6: Bridge connectors — users in 2+ distinct L0 ecosystems
  // For each user, collect distinct scopeGroup values from their role edges
  const userScopeGroups = new Map<string, Set<string>>();
  for (const edge of visibleEdges) {
    if (!isRoleEdge(edge)) continue;
    if (!edge.scopeGroup) continue;

    // Determine which endpoint is the user
    const sourceNode = nodeMap.get(edge.sourceId);
    const targetNode = nodeMap.get(edge.targetId);
    const userNode = sourceNode?.type === NodeType.USER ? sourceNode
      : targetNode?.type === NodeType.USER ? targetNode
        : null;
    if (!userNode || !visibleIdSet.has(userNode.id)) continue;

    let groups = userScopeGroups.get(userNode.id);
    if (!groups) {
      groups = new Set<string>();
      userScopeGroups.set(userNode.id, groups);
    }
    groups.add(edge.scopeGroup);
  }

  // Build L0 space name lookup for bridge connector display
  const l0SpaceNames = new Map<string, string>();
  for (const node of visibleNodes) {
    if (node.type === NodeType.SPACE_L0) {
      // scopeGroup on edges uses the L0 nameId or id — try both
      if (node.nameId) l0SpaceNames.set(node.nameId, node.displayName);
      l0SpaceNames.set(node.id, node.displayName);
    }
  }

  const bridgeConnectors: BridgeConnector[] = [];
  for (const [userId, groups] of userScopeGroups) {
    if (groups.size >= 2) {
      const user = nodeMap.get(userId);
      if (!user) continue;
      const spaceNames = Array.from(groups).map((g) => l0SpaceNames.get(g) ?? g);
      bridgeConnectors.push({
        nodeId: userId,
        displayName: user.displayName,
        l0SpaceCount: groups.size,
        l0SpaceNames: spaceNames,
      });
    }
  }

  // Step 7: Multi-space users — users in 2+ L1/L2 subspaces within same L0
  // Group user→subspace edges by scopeGroup, count distinct L1/L2 targets per group
  const userSubspacesByL0 = new Map<string, Map<string, Set<string>>>();
  for (const edge of visibleEdges) {
    if (!isRoleEdge(edge)) continue;
    if (!edge.scopeGroup) continue;

    const sourceNode = nodeMap.get(edge.sourceId);
    const targetNode = nodeMap.get(edge.targetId);
    const userNode = sourceNode?.type === NodeType.USER ? sourceNode : targetNode?.type === NodeType.USER ? targetNode : null;
    const spaceNode = sourceNode && isSubspaceNode(sourceNode) ? sourceNode : targetNode && isSubspaceNode(targetNode) ? targetNode : null;
    if (!userNode || !spaceNode) continue;
    if (!visibleIdSet.has(userNode.id) || !visibleIdSet.has(spaceNode.id)) continue;

    let byL0 = userSubspacesByL0.get(userNode.id);
    if (!byL0) {
      byL0 = new Map<string, Set<string>>();
      userSubspacesByL0.set(userNode.id, byL0);
    }
    let spaces = byL0.get(edge.scopeGroup);
    if (!spaces) {
      spaces = new Set<string>();
      byL0.set(edge.scopeGroup, spaces);
    }
    spaces.add(spaceNode.id);
  }

  const multiSpaceUsers: MultiSpaceUser[] = [];
  for (const [userId, byL0] of userSubspacesByL0) {
    for (const [l0Group, subspaceIds] of byL0) {
      if (subspaceIds.size >= 2) {
        const user = nodeMap.get(userId);
        if (!user) continue;
        const l0Name = l0SpaceNames.get(l0Group) ?? l0Group;
        multiSpaceUsers.push({
          nodeId: userId,
          displayName: user.displayName,
          l0SpaceId: l0Group,
          l0SpaceName: l0Name,
          subspaceCount: subspaceIds.size,
        });
      }
    }
  }

  // Step 8: Space rankings — L1/L2 spaces sorted by member count (deduplicated)
  const spaceMemberSets = new Map<string, Set<string>>();
  for (const edge of visibleEdges) {
    if (!isRoleEdge(edge)) continue;
    const sourceNode = nodeMap.get(edge.sourceId);
    const targetNode = nodeMap.get(edge.targetId);

    // Determine user/org and space endpoints
    const personNode = sourceNode?.type === NodeType.USER || sourceNode?.type === NodeType.ORGANIZATION
      ? sourceNode
      : targetNode?.type === NodeType.USER || targetNode?.type === NodeType.ORGANIZATION
        ? targetNode
        : null;
    const spaceNode = sourceNode && isSubspaceNode(sourceNode)
      ? sourceNode
      : targetNode && isSubspaceNode(targetNode)
        ? targetNode
        : null;
    if (!personNode || !spaceNode) continue;
    if (!visibleIdSet.has(personNode.id) || !visibleIdSet.has(spaceNode.id)) continue;

    let members = spaceMemberSets.get(spaceNode.id);
    if (!members) {
      members = new Set<string>();
      spaceMemberSets.set(spaceNode.id, members);
    }
    members.add(personNode.id);
  }

  const spaceRankings: SpaceRanking[] = [];
  for (const node of visibleNodes) {
    if (!isSubspaceNode(node)) continue;
    const members = spaceMemberSets.get(node.id);
    const memberCount = members ? members.size : 0;
    // Find parent space name
    let parentSpaceName: string | null = null;
    if (node.parentSpaceId) {
      const parent = nodeMap.get(node.parentSpaceId);
      if (parent) parentSpaceName = parent.displayName;
    }
    spaceRankings.push({
      nodeId: node.id,
      displayName: node.displayName,
      type: node.type as 'SPACE_L1' | 'SPACE_L2',
      memberCount,
      parentSpaceName,
    });
  }
  spaceRankings.sort((a, b) => b.memberCount - a.memberCount);

  // Step 9: Top connectors — users/orgs by distinct space count (≥ 2), ties alphabetical
  const connectorSpaceSets = new Map<string, Set<string>>();
  for (const edge of visibleEdges) {
    if (!isRoleEdge(edge)) continue;
    const sourceNode = nodeMap.get(edge.sourceId);
    const targetNode = nodeMap.get(edge.targetId);

    const personNode = sourceNode?.type === NodeType.USER || sourceNode?.type === NodeType.ORGANIZATION
      ? sourceNode
      : targetNode?.type === NodeType.USER || targetNode?.type === NodeType.ORGANIZATION
        ? targetNode
        : null;
    const spaceNode = sourceNode && isSpaceNode(sourceNode)
      ? sourceNode
      : targetNode && isSpaceNode(targetNode)
        ? targetNode
        : null;
    if (!personNode || !spaceNode) continue;
    if (!visibleIdSet.has(personNode.id) || !visibleIdSet.has(spaceNode.id)) continue;

    let spaces = connectorSpaceSets.get(personNode.id);
    if (!spaces) {
      spaces = new Set<string>();
      connectorSpaceSets.set(personNode.id, spaces);
    }
    spaces.add(spaceNode.id);
  }

  const topConnectors: TopConnector[] = [];
  for (const [nodeId, spaces] of connectorSpaceSets) {
    if (spaces.size < 2) continue;
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    if (node.type !== NodeType.USER && node.type !== NodeType.ORGANIZATION) continue;
    topConnectors.push({
      nodeId,
      displayName: node.displayName,
      type: node.type as 'USER' | 'ORGANIZATION',
      spaceCount: spaces.size,
      avatarUrl: node.avatarUrl,
    });
  }
  topConnectors.sort((a, b) => {
    if (b.spaceCount !== a.spaceCount) return b.spaceCount - a.spaceCount;
    return a.displayName.localeCompare(b.displayName);
  });

  // Step 10: Org distribution per L0
  const orgsByL0 = new Map<string, Set<string>>();
  for (const edge of visibleEdges) {
    if (!isRoleEdge(edge)) continue;
    if (!edge.scopeGroup) continue;
    const sourceNode = nodeMap.get(edge.sourceId);
    const targetNode = nodeMap.get(edge.targetId);
    const orgNode = sourceNode?.type === NodeType.ORGANIZATION ? sourceNode
      : targetNode?.type === NodeType.ORGANIZATION ? targetNode
        : null;
    if (!orgNode || !visibleIdSet.has(orgNode.id)) continue;

    let orgs = orgsByL0.get(edge.scopeGroup);
    if (!orgs) {
      orgs = new Set<string>();
      orgsByL0.set(edge.scopeGroup, orgs);
    }
    orgs.add(orgNode.id);
  }

  const orgDistribution: OrgDistribution[] = [];
  for (const [l0Group, orgs] of orgsByL0) {
    orgDistribution.push({
      l0SpaceId: l0Group,
      l0SpaceName: l0SpaceNames.get(l0Group) ?? l0Group,
      orgCount: orgs.size,
    });
  }
  orgDistribution.sort((a, b) => b.orgCount - a.orgCount);

  // Step 11: Headline insights — threshold-based, 0–4
  const headlineInsights: HeadlineInsight[] = [];

  // Insight 1: Bridge connectors
  if (bridgeConnectors.length > 0) {
    const distinctL0Count = new Set(bridgeConnectors.flatMap((bc) => bc.l0SpaceNames)).size;
    headlineInsights.push({
      id: 'bridge-connectors',
      message: `${bridgeConnectors.length} user${bridgeConnectors.length !== 1 ? 's' : ''} active across ${distinctL0Count}+ ecosystems`,
      priority: 1,
      action: {
        type: 'highlight',
        nodeIds: bridgeConnectors.map((bc) => bc.nodeId),
      },
    });
  }

  // Insight 2: Busiest subspace (≥ 10 members)
  if (spaceRankings.length > 0 && spaceRankings[0].memberCount >= 10) {
    const busiest = spaceRankings[0];
    headlineInsights.push({
      id: 'busiest-subspace',
      message: `${busiest.displayName} has ${busiest.memberCount} members — busiest subspace`,
      priority: 2,
      action: {
        type: 'highlight',
        nodeIds: Array.from(spaceMemberSets.get(busiest.nodeId) ?? []),
      },
    });
  }

  // Insight 3: Top connector (≥ 3 spaces)
  if (topConnectors.length > 0 && topConnectors[0].spaceCount >= 3) {
    const top = topConnectors[0];
    headlineInsights.push({
      id: 'top-connector',
      message: `Top connector: ${top.displayName} — ${top.spaceCount} spaces`,
      priority: 3,
      action: {
        type: 'select',
        nodeIds: [top.nodeId],
      },
    });
  }

  // Insight 4: Organisation diversity (≥ 5 orgs total)
  if (totalOrganizations >= 5) {
    headlineInsights.push({
      id: 'org-diversity',
      message: `${totalOrganizations} organisations across the ecosystem`,
      priority: 4,
      action: {
        type: 'highlight',
        nodeIds: visibleNodes.filter((n) => n.type === NodeType.ORGANIZATION).map((n) => n.id),
      },
    });
  }

  const aggregates: AggregateMetrics = {
    totalUsers,
    totalOrganizations,
    totalSubspaces,
    totalL0Spaces,
    totalEdges: visibleEdges.length,
    bridgeConnectorCount: bridgeConnectors.length,
  };

  if (isDev) console.timeEnd('useEcosystemMetrics');

  return {
    aggregates,
    bridgeConnectors,
    multiSpaceUsers,
    spaceRankings,
    topConnectors,
    orgDistribution,
    headlineInsights,
    hasRestrictedNodes,
  };
}

// ── Hook ──

export function useEcosystemMetrics(
  dataset: GraphDataset | null,
  filters: EcosystemMetricsFilters,
): EcosystemMetrics | undefined {
  return useMemo(() => {
    if (!dataset) return undefined;
    return computeMetrics(dataset, filters);
  }, [dataset, filters.showPeople, filters.showOrganizations, filters.showSpaces]);
}
