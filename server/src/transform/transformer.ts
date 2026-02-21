import type { AcquiredData, RawUser, RawOrganization } from '../services/acquire-service.js';
import type { RawSpace } from '../services/space-service.js';
import {
  type GraphNode,
  type GraphEdge,
  type GraphLocation,
  NodeType,
  EdgeType,
  NODE_WEIGHT,
  EDGE_WEIGHT,
} from '../types/graph.js';

export interface TransformResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Transform acquired Alkemio data into graph nodes and edges.
 * Adapted from analytics-playground AlkemioGraphTransformer pattern.
 */
export function transformToGraph(data: AcquiredData): TransformResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  for (const { space, nameId } of data.spacesL0) {
    const l0ScopeGroup = space.id;

    // Add L0 Space node
    addSpaceNode(space, NodeType.SPACE_L0, [l0ScopeGroup], nodes, nodeIds);

    // Process L1 subspaces
    if (space.subspaces) {
      for (const l1 of space.subspaces) {
        addSpaceNode(l1, NodeType.SPACE_L1, [l0ScopeGroup], nodes, nodeIds);
        edges.push(createEdge(space.id, l1.id, EdgeType.CHILD, l0ScopeGroup));

        // Process L2 subspaces
        if (l1.subspaces) {
          for (const l2 of l1.subspaces) {
            addSpaceNode(l2, NodeType.SPACE_L2, [l0ScopeGroup], nodes, nodeIds);
            edges.push(createEdge(l1.id, l2.id, EdgeType.CHILD, l0ScopeGroup));

            // Add contributor edges for L2
            addContributorEdges(l2, l0ScopeGroup, data, nodes, edges, nodeIds);
          }
        }

        // Add contributor edges for L1
        addContributorEdges(l1, l0ScopeGroup, data, nodes, edges, nodeIds);
      }
    }

    // Add contributor edges for L0
    addContributorEdges(space, l0ScopeGroup, data, nodes, edges, nodeIds);
  }

  return { nodes, edges };
}

function addSpaceNode(
  space: RawSpace,
  type: NodeType,
  scopeGroups: string[],
  nodes: GraphNode[],
  nodeIds: Set<string>,
): void {
  if (nodeIds.has(space.id)) {
    // Node already exists (shared across L0 selections) — merge scope groups
    const existing = nodes.find((n) => n.id === space.id);
    if (existing) {
      for (const sg of scopeGroups) {
        if (!existing.scopeGroups.includes(sg)) existing.scopeGroups.push(sg);
      }
    }
    return;
  }

  nodeIds.add(space.id);
  const profile = space.about.profile;
  const location = profile.location;

  nodes.push({
    id: space.id,
    type,
    displayName: profile.displayName,
    weight: NODE_WEIGHT[type],
    avatarUrl: null,
    url: profile.url || null,
    location: location
      ? {
          country: location.country || null,
          city: location.city || null,
          latitude: location.geoLocation?.latitude ?? null,
          longitude: location.geoLocation?.longitude ?? null,
        }
      : null,
    scopeGroups,
    nameId: space.nameID,
    tagline: profile.tagline || null,
  });
}

function addContributorEdges(
  space: RawSpace,
  scopeGroup: string,
  data: AcquiredData,
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeIds: Set<string>,
): void {
  const roleSet = space.community.roleSet;

  // Member users
  for (const { id } of roleSet.memberUsers) {
    ensureUserNode(id, data.users, scopeGroup, nodes, nodeIds);
    edges.push(createEdge(id, space.id, EdgeType.MEMBER, scopeGroup));
  }

  // Lead users
  for (const { id } of roleSet.leadUsers) {
    ensureUserNode(id, data.users, scopeGroup, nodes, nodeIds);
    edges.push(createEdge(id, space.id, EdgeType.LEAD, scopeGroup));
  }

  // Member organizations
  for (const { id } of roleSet.memberOrganizations) {
    ensureOrgNode(id, data.organizations, scopeGroup, nodes, nodeIds);
    edges.push(createEdge(id, space.id, EdgeType.MEMBER, scopeGroup));
  }

  // Lead organizations
  for (const { id } of roleSet.leadOrganizations) {
    ensureOrgNode(id, data.organizations, scopeGroup, nodes, nodeIds);
    edges.push(createEdge(id, space.id, EdgeType.LEAD, scopeGroup));
  }
}

function ensureUserNode(
  id: string,
  users: Map<string, RawUser>,
  scopeGroup: string,
  nodes: GraphNode[],
  nodeIds: Set<string>,
): void {
  if (nodeIds.has(id)) {
    const existing = nodes.find((n) => n.id === id);
    if (existing && !existing.scopeGroups.includes(scopeGroup)) {
      existing.scopeGroups.push(scopeGroup);
    }
    return;
  }

  nodeIds.add(id);
  const user = users.get(id);
  const location = extractLocation(user?.profile?.location);

  nodes.push({
    id,
    type: NodeType.USER,
    displayName: user?.profile?.displayName || 'Unknown User',
    weight: NODE_WEIGHT[NodeType.USER],
    avatarUrl: user?.profile?.avatar?.uri || null,
    url: user?.profile?.url || null,
    location,
    scopeGroups: [scopeGroup],
    nameId: user?.nameID || null,
    tagline: null,
  });
}

function ensureOrgNode(
  id: string,
  orgs: Map<string, RawOrganization>,
  scopeGroup: string,
  nodes: GraphNode[],
  nodeIds: Set<string>,
): void {
  if (nodeIds.has(id)) {
    const existing = nodes.find((n) => n.id === id);
    if (existing && !existing.scopeGroups.includes(scopeGroup)) {
      existing.scopeGroups.push(scopeGroup);
    }
    return;
  }

  nodeIds.add(id);
  const org = orgs.get(id);
  const location = extractLocation(org?.profile?.location);

  nodes.push({
    id,
    type: NodeType.ORGANIZATION,
    displayName: org?.profile?.displayName || 'Unknown Organization',
    weight: NODE_WEIGHT[NodeType.ORGANIZATION],
    avatarUrl: org?.profile?.avatar?.uri || null,
    url: org?.profile?.url || null,
    location,
    scopeGroups: [scopeGroup],
    nameId: org?.nameID || null,
    tagline: null,
  });
}

function extractLocation(
  loc?: { country?: string; city?: string; geoLocation?: { latitude: number; longitude: number } },
): GraphLocation | null {
  if (!loc) return null;
  if (!loc.country && !loc.city && !loc.geoLocation) return null;
  return {
    country: loc.country || null,
    city: loc.city || null,
    latitude: loc.geoLocation?.latitude ?? null,
    longitude: loc.geoLocation?.longitude ?? null,
  };
}

function createEdge(
  sourceId: string,
  targetId: string,
  type: EdgeType,
  scopeGroup: string,
): GraphEdge {
  return {
    sourceId,
    targetId,
    type,
    weight: EDGE_WEIGHT[type],
    scopeGroup,
  };
}
