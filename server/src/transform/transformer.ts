import type { AcquiredData, RawUser, RawOrganization, RawActivityEntry } from '../services/acquire-service.js';
import {
  type GraphNode,
  type GraphEdge,
  type GraphLocation,
  type ActivityPeriodCounts,
  type TagData,
  type ActivityTimeBucket,
  type SpaceTimeSeries,
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
  createdDate?: string | Date;
  visibility?: string;
  about: {
    isContentPublic?: boolean;
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
      tagsets?: Array<{ name: string; tags: string[]; type?: string; allowedValues?: string[] }>;
    };
  };
  community?: {
    roleSet: {
      memberUsers: Array<{ id: string }>;
      memberOrganizations: Array<{ id: string }>;
      leadOrganizations: Array<{ id: string }>;
      leadUsers: Array<{ id: string }>;
      adminUsers: Array<{ id: string }>;
    };
  } | null;
  subspaces?: SpaceLike[];
}

export interface TransformResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  timeSeries?: SpaceTimeSeries[];
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
        const l1Any = l1 as Record<string, unknown>;
        const l1Restricted = !l1Any.community;
        addSpaceNode(l1, NodeType.SPACE_L1, [l0ScopeGroup], space.id, nodes, nodeIds, l1Restricted);
        edges.push(createEdge(space.id, l1.id, EdgeType.CHILD, l0ScopeGroup));

        if (!l1Restricted) {
          // Process L2 subspaces (only when L1 is accessible)
          if (l1.subspaces) {
            for (const l2 of l1.subspaces) {
              const l2Any = l2 as Record<string, unknown>;
              const l2Restricted = !l2Any.community;
              addSpaceNode(l2, NodeType.SPACE_L2, [l0ScopeGroup], l1.id, nodes, nodeIds, l2Restricted);
              edges.push(createEdge(l1.id, l2.id, EdgeType.CHILD, l0ScopeGroup));

              // Add contributor edges for L2 (only if not restricted)
              if (!l2Restricted) {
                addContributorEdges(l2, l0ScopeGroup, data, nodes, edges, nodeIds);
              }
            }
          }

          // Add contributor edges for L1
          addContributorEdges(l1, l0ScopeGroup, data, nodes, edges, nodeIds);
        }
        // When L1 is restricted: CHILD edge is created above, but no contributor edges and no L2 processing
      }
    }

    // Add contributor edges for L0
    addContributorEdges(space, l0ScopeGroup, data, nodes, edges, nodeIds);
  }

  // Attach activity data to user→space edges if available
  if (data.activityEntries && data.activityEntries.length > 0) {
    const countMap = aggregateActivityCounts(data.activityEntries);
    const tierMap = computeActivityTiers(countMap);
    const periodMap = aggregateActivityCountsByPeriod(data.activityEntries);

    for (const edge of edges) {
      // Only user→space edges (MEMBER, LEAD, or ADMIN where source is a user)
      if (edge.type !== EdgeType.MEMBER && edge.type !== EdgeType.LEAD && edge.type !== EdgeType.ADMIN) continue;
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
      // Attach per-period breakdown
      const periods = periodMap.get(key);
      if (periods) {
        edge.activityByPeriod = periods;
      }
    }

    // Aggregate per-space totals and compute space activity tiers
    const spaceCountMap = aggregateSpaceActivityCounts(countMap);
    const spaceTierMap = computeActivityTiers(spaceCountMap);
    const spacePeriodMap = aggregateSpacePeriodCounts(periodMap);

    for (const node of nodes) {
      if (node.type !== NodeType.SPACE_L0 && node.type !== NodeType.SPACE_L1 && node.type !== NodeType.SPACE_L2) continue;
      const total = spaceCountMap.get(node.id);
      node.totalActivityCount = total ?? 0;
      node.spaceActivityTier = spaceTierMap.get(node.id) ?? ActivityTier.INACTIVE;
      node.activityByPeriod = spacePeriodMap.get(node.id) ?? { day: 0, week: 0, month: 0, allTime: 0 };
    }
  }

  // Build time series for Timeline view (T012/T014)
  let timeSeries: SpaceTimeSeries[] | undefined;
  if (data.activityEntries && data.activityEntries.length > 0) {
    timeSeries = buildTimeSeries(data.activityEntries, nodes);
  }

  // Estimate edge creation dates for Temporal Force view (T013/T014)
  if (data.activityEntries && data.activityEntries.length > 0) {
    const spaceNodeMap = new Map<string, GraphNode>();
    for (const n of nodes) {
      if (n.type === NodeType.SPACE_L0 || n.type === NodeType.SPACE_L1 || n.type === NodeType.SPACE_L2) {
        spaceNodeMap.set(n.id, n);
      }
    }
    for (const edge of edges) {
      // Only estimate for user→space relationship edges
      if (edge.type !== EdgeType.MEMBER && edge.type !== EdgeType.LEAD && edge.type !== EdgeType.ADMIN) continue;
      const estimated = estimateEdgeCreatedDate(edge, data.activityEntries, spaceNodeMap);
      if (estimated) edge.createdDate = estimated;
    }
  }

  return { nodes, edges, timeSeries };
}

function addSpaceNode(
  space: SpaceLike,
  type: NodeType,
  scopeGroups: string[],
  parentSpaceId: string | null,
  nodes: GraphNode[],
  nodeIds: Set<string>,
  restricted = false,
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
    privacyMode: space.about.isContentPublic !== false ? 'PUBLIC' : 'PRIVATE',
    restricted: restricted || undefined,
    createdDate: space.createdDate ? String(space.createdDate) : undefined,
    visibility: parseVisibility(space.visibility),
    tags: extractTags(profile.tagsets),
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

  // Admin users
  if (roleSet.adminUsers) {
    for (const { id } of roleSet.adminUsers) {
      ensureUserNode(id, data.users, scopeGroup, nodes, nodeIds);
      edges.push(createEdge(id, space.id, EdgeType.ADMIN, scopeGroup));
    }
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
    privacyMode: null,
    createdDate: (user as Record<string, unknown> | undefined)?.createdDate as string | undefined,
    tags: extractTags((user?.profile as Record<string, unknown> | undefined)?.tagsets as SpaceLike['about']['profile']['tagsets']),
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

  // Extract references (external links) from org profile
  const rawRefs = (org?.profile as Record<string, unknown> | undefined)?.references as
    | Array<{ name: string; uri: string; description?: string }>
    | undefined;
  const references = rawRefs?.filter((r) => r.uri)?.map((r) => ({ name: r.name, uri: r.uri }));

  // Extract owner and associate count from roleSet
  const roleSet = (org as Record<string, unknown> | undefined)?.roleSet as
    | { owners?: Array<{ id: string; profile?: { displayName?: string } }>; associates?: Array<{ id: string }> }
    | undefined;
  const ownerName = roleSet?.owners?.[0]?.profile?.displayName ?? null;
  const associateCount = roleSet?.associates?.length;

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
    tagline: (org?.profile as Record<string, unknown> | undefined)?.tagline as string | null ?? null,
    parentSpaceId: null,
    privacyMode: null,
    description: (org?.profile as Record<string, unknown> | undefined)?.description as string | null ?? null,
    website: (org as Record<string, unknown> | undefined)?.website as string | null ?? null,
    contactEmail: (org as Record<string, unknown> | undefined)?.contactEmail as string | null ?? null,
    references: references && references.length > 0 ? references : undefined,
    owner: ownerName,
    associateCount: associateCount ?? undefined,
    tags: extractTags((org?.profile as Record<string, unknown> | undefined)?.tagsets as SpaceLike['about']['profile']['tagsets']),
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
/**
 * Aggregate per-user-per-space counts into per-space totals.
 * Input keys are "userId:spaceId", output keys are "spaceId".
 */
export function aggregateSpaceActivityCounts(countMap: Map<string, number>): Map<string, number> {
  const spaceCounts = new Map<string, number>();
  for (const [key, count] of countMap) {
    const sep = key.indexOf(':');
    if (sep < 0) continue;
    const spaceId = key.slice(sep + 1);
    spaceCounts.set(spaceId, (spaceCounts.get(spaceId) ?? 0) + count);
  }
  return spaceCounts;
}

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
 * Aggregate activity counts per user:space key, broken down by time period.
 * Returns a map of "userId:spaceId" → { day, week, month, allTime }.
 */
export function aggregateActivityCountsByPeriod(entries: RawActivityEntry[]): Map<string, ActivityPeriodCounts> {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const periodCounts = new Map<string, ActivityPeriodCounts>();

  for (const entry of entries) {
    const spaceId = entry.space?.id;
    const userId = entry.triggeredBy.id;
    if (!spaceId || !userId) continue;
    const key = `${userId}:${spaceId}`;

    let rec = periodCounts.get(key);
    if (!rec) {
      rec = { day: 0, week: 0, month: 0, allTime: 0 };
      periodCounts.set(key, rec);
    }

    const ts = new Date(entry.createdDate).getTime();
    rec.allTime++;
    if (ts >= monthAgo) rec.month++;
    if (ts >= weekAgo) rec.week++;
    if (ts >= dayAgo) rec.day++;
  }

  return periodCounts;
}

/**
 * Aggregate per-period counts by space (sum across all users).
 */
export function aggregateSpacePeriodCounts(periodMap: Map<string, ActivityPeriodCounts>): Map<string, ActivityPeriodCounts> {
  const spacePeriods = new Map<string, ActivityPeriodCounts>();
  for (const [key, periods] of periodMap) {
    const sep = key.indexOf(':');
    if (sep < 0) continue;
    const spaceId = key.slice(sep + 1);
    let rec = spacePeriods.get(spaceId);
    if (!rec) {
      rec = { day: 0, week: 0, month: 0, allTime: 0 };
      spacePeriods.set(spaceId, rec);
    }
    rec.day += periods.day;
    rec.week += periods.week;
    rec.month += periods.month;
    rec.allTime += periods.allTime;
  }
  return spacePeriods;
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

// ---------------------------------------------------------------------------
// 009 — Helper utilities for alternative views
// ---------------------------------------------------------------------------

/**
 * Parse a visibility string from Alkemio into the typed union.
 * Returns undefined if the value is missing or unrecognised.
 */
function parseVisibility(raw?: string): 'ACTIVE' | 'ARCHIVED' | 'DEMO' | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (upper === 'ACTIVE' || upper === 'ARCHIVED' || upper === 'DEMO') return upper;
  return undefined;
}

/**
 * Extract tags from profile tagsets into the canonical TagData shape.
 * Groups tags by well-known tagset names (keywords, skills); everything
 * else lands in `default`.
 */
function extractTags(
  tagsets?: Array<{ name: string; tags: string[]; type?: string; allowedValues?: string[] }>,
): TagData | undefined {
  if (!tagsets || tagsets.length === 0) return undefined;
  const result: TagData = {};
  for (const ts of tagsets) {
    const key = ts.name.toLowerCase();
    if (ts.tags.length === 0) continue;
    if (key === 'keywords') {
      result.keywords = ts.tags;
    } else if (key === 'skills') {
      result.skills = ts.tags;
    } else {
      result.default = [...(result.default ?? []), ...ts.tags];
    }
  }
  // Return undefined when we didn't collect anything meaningful
  if (!result.keywords && !result.skills && !result.default) return undefined;
  return result;
}

/**
 * Build weekly activity time series from raw activity entries (T012).
 * Groups entries by (spaceId, ISO week) and returns one SpaceTimeSeries
 * per space that has any activity.
 */
export function buildTimeSeries(
  activityEntries: RawActivityEntry[],
  spaceNodes: GraphNode[],
): SpaceTimeSeries[] {
  // Build a lookup for space display names
  const spaceNameMap = new Map<string, string>();
  for (const n of spaceNodes) {
    if (n.type === NodeType.SPACE_L0 || n.type === NodeType.SPACE_L1 || n.type === NodeType.SPACE_L2) {
      spaceNameMap.set(n.id, n.displayName);
    }
  }

  // Group counts by spaceId → week → count
  const bySpace = new Map<string, Map<string, number>>();

  for (const entry of activityEntries) {
    const spaceId = entry.space?.id;
    if (!spaceId) continue;
    const week = toISOWeek(new Date(entry.createdDate));
    let weekMap = bySpace.get(spaceId);
    if (!weekMap) {
      weekMap = new Map();
      bySpace.set(spaceId, weekMap);
    }
    weekMap.set(week, (weekMap.get(week) ?? 0) + 1);
  }

  // Convert to SpaceTimeSeries[]
  const series: SpaceTimeSeries[] = [];
  for (const [spaceId, weekMap] of bySpace) {
    const buckets: ActivityTimeBucket[] = [];
    for (const [week, count] of weekMap) {
      buckets.push({ week, count });
    }
    // Sort buckets chronologically
    buckets.sort((a, b) => a.week.localeCompare(b.week));
    series.push({
      spaceId,
      spaceDisplayName: spaceNameMap.get(spaceId) ?? spaceId,
      buckets,
    });
  }

  // Sort series by spaceDisplayName for deterministic output
  series.sort((a, b) => a.spaceDisplayName.localeCompare(b.spaceDisplayName));
  return series;
}

/**
 * Estimate when a user→space edge was created (T013).
 * Priority: 1) earliest activity date for this (user, space) pair,
 *           2) target space's createdDate,
 *           3) undefined.
 *
 * Application.createdDate would be priority 1 per spec, but it is not
 * available in the current GraphQL schema data set — we use the next
 * best heuristic.
 */
export function estimateEdgeCreatedDate(
  edge: GraphEdge,
  activityEntries: RawActivityEntry[],
  spaceNodeMap: Map<string, GraphNode>,
): string | undefined {
  // Priority 1: earliest activity entry for this (user, space) pair
  let earliest: Date | undefined;
  for (const entry of activityEntries) {
    if (entry.triggeredBy.id !== edge.sourceId) continue;
    if (entry.space?.id !== edge.targetId) continue;
    const d = new Date(entry.createdDate);
    if (!earliest || d < earliest) earliest = d;
  }
  if (earliest) return earliest.toISOString();

  // Priority 2: target space's createdDate
  const spaceNode = spaceNodeMap.get(edge.targetId);
  if (spaceNode?.createdDate) return spaceNode.createdDate;

  return undefined;
}

/**
 * Convert a Date into an ISO week string like '2026-W09'.
 */
function toISOWeek(date: Date): string {
  // ISO week logic: week 1 is the week containing the first Thursday of the year.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day (Mon=1, Sun=7)
  const dayNum = d.getUTCDay() || 7; // Make Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
