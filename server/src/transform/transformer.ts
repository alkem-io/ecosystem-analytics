import type { AcquiredData, RawUser, RawOrganization, RawActivityEntry } from '../services/acquire-service.js';
import {
  type GraphNode,
  type GraphEdge,
  type GraphLocation,
  NodeType,
  EdgeType,
  ActivityTier,
  NODE_WEIGHT,
  EDGE_WEIGHT,
} from '../types/graph.js';

/** Common shape for any space level (L0/L1/L2) used by the transformer */
interface SpaceLike {
  id: string;
  nameID: string;
  about: {
    profile: {
      displayName: string;
      tagline?: string;
      url: string;
      location?: {
        country?: string;
        city?: string;
        geoLocation: { latitude?: number; longitude?: number };
      };
      avatar?: { uri: string } | null;
      banner?: { uri: string } | null;
      bannerWide?: { uri: string } | null;
    };
  };
  community?: {
    roleSet: {
      memberUsers: Array<{ id: string }>;
      memberOrganizations: Array<{ id: string }>;
      leadOrganizations: Array<{ id: string }>;
      leadUsers: Array<{ id: string }>;
    };
  } | null;
  subspaces?: SpaceLike[];
}

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
    addSpaceNode(space, NodeType.SPACE_L0, [l0ScopeGroup], null, nodes, nodeIds);

    // Process L1 subspaces
    if (space.subspaces) {
      for (const l1 of space.subspaces) {
        addSpaceNode(l1, NodeType.SPACE_L1, [l0ScopeGroup], space.id, nodes, nodeIds);
        edges.push(createEdge(space.id, l1.id, EdgeType.CHILD, l0ScopeGroup));

        // Process L2 subspaces
        if (l1.subspaces) {
          for (const l2 of l1.subspaces) {
            addSpaceNode(l2, NodeType.SPACE_L2, [l0ScopeGroup], l1.id, nodes, nodeIds);
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

  // Attach activity data to user→space edges if available
  if (data.activityEntries && data.activityEntries.length > 0) {
    const countMap = aggregateActivityCounts(data.activityEntries);
    const tierMap = computeActivityTiers(countMap);

    for (const edge of edges) {
      // Only user→space edges (MEMBER or LEAD where source is a user)
      if (edge.type !== EdgeType.MEMBER && edge.type !== EdgeType.LEAD) continue;
      const sourceNode = nodes.find((n) => n.id === edge.sourceId);
      if (!sourceNode || sourceNode.type !== NodeType.USER) continue;

      const key = `${edge.sourceId}:${edge.targetId}`;
      const count = countMap.get(key);
      const tier = tierMap.get(key);
      if (count !== undefined) {
        edge.activityCount = count;
      }
      if (tier !== undefined) {
        edge.activityTier = tier;
      } else if (count === undefined || count === 0) {
        edge.activityTier = ActivityTier.INACTIVE;
      }
    }
  }

  return { nodes, edges };
}

function addSpaceNode(
  space: SpaceLike,
  type: NodeType,
  scopeGroups: string[],
  parentSpaceId: string | null,
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
    avatarUrl: profile.avatar?.uri || null,
    bannerUrl: profile.bannerWide?.uri || profile.banner?.uri || null,
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
    parentSpaceId,
  });
}

function addContributorEdges(
  space: SpaceLike,
  scopeGroup: string,
  data: AcquiredData,
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeIds: Set<string>,
): void {
  const roleSet = space.community?.roleSet;
  if (!roleSet) return; // community may be null when user lacks access to this subspace

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
    bannerUrl: null,
    url: user?.profile?.url || null,
    location,
    scopeGroups: [scopeGroup],
    nameId: user?.nameID || null,
    tagline: null,
    parentSpaceId: null,
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
    bannerUrl: null,
    url: org?.profile?.url || null,
    location,
    scopeGroups: [scopeGroup],
    nameId: org?.nameID || null,
    tagline: null,
    parentSpaceId: null,
  });
}

function extractLocation(
  loc?: { country?: string; city?: string; geoLocation?: { latitude?: number; longitude?: number } },
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

/**
 * Aggregate activity log entries into per-user-per-space counts.
 * Key format: "userId:spaceId" → total contribution count.
 * Entries without a space are filtered out.
 */
export function aggregateActivityCounts(entries: RawActivityEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const spaceId = entry.space?.id;
    const userId = entry.triggeredBy.id;
    if (!spaceId || !userId) continue;
    const key = `${userId}:${spaceId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Compute activity tiers from a count map using percentile-based quartiles.
 * Edge cases:
 *   - Zero count → INACTIVE
 *   - All non-zero counts equal → MEDIUM
 *   - Fewer than 3 non-zero entries → fixed thresholds (1-2=LOW, 3-10=MEDIUM, 11+=HIGH)
 *   - Otherwise: ≤p25 → LOW, p25<x≤p75 → MEDIUM, >p75 → HIGH
 */
export function computeActivityTiers(countMap: Map<string, number>): Map<string, ActivityTier> {
  const tiers = new Map<string, ActivityTier>();

  // Separate zero and non-zero entries
  const nonZeroEntries: Array<{ key: string; count: number }> = [];
  for (const [key, count] of countMap) {
    if (count === 0) {
      tiers.set(key, ActivityTier.INACTIVE);
    } else {
      nonZeroEntries.push({ key, count });
    }
  }

  if (nonZeroEntries.length === 0) return tiers;

  // Sort ascending for percentile calculation
  nonZeroEntries.sort((a, b) => a.count - b.count);

  // Edge case: all same count → MEDIUM
  const allSame = nonZeroEntries.every((e) => e.count === nonZeroEntries[0].count);
  if (allSame) {
    for (const { key } of nonZeroEntries) {
      tiers.set(key, ActivityTier.MEDIUM);
    }
    return tiers;
  }

  // Edge case: fewer than 3 non-zero entries → fixed thresholds
  if (nonZeroEntries.length < 3) {
    for (const { key, count } of nonZeroEntries) {
      if (count <= 2) tiers.set(key, ActivityTier.LOW);
      else if (count <= 10) tiers.set(key, ActivityTier.MEDIUM);
      else tiers.set(key, ActivityTier.HIGH);
    }
    return tiers;
  }

  // Normal case: percentile-based quartiles
  const n = nonZeroEntries.length;
  const p25Index = Math.floor(n * 0.25);
  const p75Index = Math.floor(n * 0.75);
  const p25 = nonZeroEntries[p25Index].count;
  const p75 = nonZeroEntries[p75Index].count;

  for (const { key, count } of nonZeroEntries) {
    if (count <= p25) tiers.set(key, ActivityTier.LOW);
    else if (count <= p75) tiers.set(key, ActivityTier.MEDIUM);
    else tiers.set(key, ActivityTier.HIGH);
  }

  return tiers;
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
