import type {
  DashboardDataset,
  DashboardSpaceInfo,
  HeadlineMetrics,
  CalloutDetail,
  ContributorDetail,
  SubspaceMetrics,
  SubspaceNode,
  TimelineBucket,
  PhaseInfo,
  MemberInfo,
  OrganizationActivity,
  RawAnalyticsSpace,
  RawCallout,
} from '../types/dashboard.js';

/**
 * Transform a raw analytics space tree into a pre-aggregated DashboardDataset.
 * MUST aggregate across all subspace levels (L0+L1+L2) when computing totals (FR-009).
 */
export function transformToDashboard(root: RawAnalyticsSpace): DashboardDataset {
  // Collect all spaces (L0 + L1 + L2) into a flat list
  const allSpaces = flattenSpaces(root);

  // Collect all callouts across all spaces
  const allCalloutDetails = buildCalloutDetails(allSpaces);

  // Build per-contributor data
  const contributors = buildContributorDetails(allSpaces, allCalloutDetails);

  // Build headline metrics from aggregated data
  const headline = buildHeadlineMetrics(allSpaces, allCalloutDetails, contributors);

  // Build subspace metrics (L1 + L2 only)
  const subspaces = buildSubspaceMetrics(allSpaces);

  // Build timeline buckets
  const timeline = buildTimelineBuckets(allCalloutDetails, allSpaces);

  // Build phase info
  const phases = buildPhaseInfo(allSpaces);

  // Build member info
  const members = buildMemberInfo(allSpaces, contributors);

  // Build organization activity
  const organizations = buildOrganizationActivity(allSpaces, contributors);

  const spaceInfo: DashboardSpaceInfo = {
    id: root.id,
    nameId: root.nameID,
    displayName: root.displayName,
    avatarUrl: root.avatarUrl,
    tagline: root.tagline,
    hasSubspaces: root.subspaces.length > 0,
    subspaceCount: allSpaces.length - 1,
  };

  // Determine available space levels
  const subspaceTree = buildSubspaceTree(root);

  return {
    generatedAt: new Date().toISOString(),
    space: spaceInfo,
    headline,
    callouts: allCalloutDetails,
    contributors,
    subspaces,
    timeline,
    phases,
    members,
    organizations,
    subspaceTree,
    cacheInfo: { lastUpdated: new Date().toISOString(), fromCache: false },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Flatten the space tree into a list */
function flattenSpaces(root: RawAnalyticsSpace): RawAnalyticsSpace[] {
  const result: RawAnalyticsSpace[] = [root];
  for (const l1 of root.subspaces) {
    result.push(l1);
    for (const l2 of l1.subspaces) {
      result.push(l2);
    }
  }
  return result;
}

/** Build CalloutDetail[] from all spaces */
function buildCalloutDetails(allSpaces: RawAnalyticsSpace[]): CalloutDetail[] {
  const details: CalloutDetail[] = [];

  for (const space of allSpaces) {
    const subspaceId = space.level === 0 ? null : space.id;
    const subspaceName = space.level === 0 ? null : space.displayName;

    for (const callout of space.calloutsSet.callouts) {
      const totalContributions =
        callout.contributionsCount.post +
        callout.contributionsCount.memo +
        callout.contributionsCount.link +
        callout.contributionsCount.whiteboard;

      // Phase = the innovation flow state this callout belongs to
      const phaseName = callout.flowStateName ?? 'Uncategorized';
      const phaseId = phaseName;

      // Find last activity date from contribution dates
      let lastActivity: string | null = null;
      for (const c of callout.contributions) {
        if (!lastActivity || c.createdDate > lastActivity) {
          lastActivity = c.createdDate;
        }
      }
      // Also check comment timestamps
      for (const cs of callout.commentSenders) {
        const ts = new Date(cs.timestamp).toISOString();
        if (!lastActivity || ts > lastActivity) {
          lastActivity = ts;
        }
      }

      details.push({
        id: callout.id,
        title: callout.title,
        postType: framingTypeToPostType(callout.framingType),
        phaseId,
        phaseName,
        spaceLevel: space.level,
        subspaceId,
        subspaceName,
        contributionCount: totalContributions,
        contributionsByType: { ...callout.contributionsCount },
        commentCount: callout.commentsCount,
        totalEngagement: totalContributions + callout.commentsCount,
        createdDate: callout.createdDate,
        lastActivityDate: lastActivity,
        createdById: callout.createdBy,
      });
    }
  }

  return details;
}

/** Build headline metrics from aggregated data */
function buildHeadlineMetrics(
  allSpaces: RawAnalyticsSpace[],
  callouts: CalloutDetail[],
  contributors: ContributorDetail[],
): HeadlineMetrics {
  const totalCallouts = callouts.length;
  const totalContributions = callouts.reduce((sum, c) => sum + c.contributionCount, 0);
  const totalComments = callouts.reduce((sum, c) => sum + c.commentCount, 0);

  const contributionsByType = {
    post: callouts.reduce((sum, c) => sum + c.contributionsByType.post, 0),
    memo: callouts.reduce((sum, c) => sum + c.contributionsByType.memo, 0),
    link: callouts.reduce((sum, c) => sum + c.contributionsByType.link, 0),
    whiteboard: callouts.reduce((sum, c) => sum + c.contributionsByType.whiteboard, 0),
  };

  // Unique members across all spaces (deduplicate by ID)
  const memberSet = new Set<string>();
  for (const space of allSpaces) {
    for (const u of space.community.memberUsers) memberSet.add(u.id);
    for (const u of space.community.leadUsers) memberSet.add(u.id);
    for (const u of space.community.adminUsers) memberSet.add(u.id);
  }
  const totalMembers = memberSet.size;

  const totalUniqueContributors = contributors.filter(
    (c) => c.totalContributions > 0 || c.totalComments > 0,
  ).length;

  const unansweredCallouts = callouts.filter((c) => c.contributionCount === 0).length;

  const totalWhiteboards = contributionsByType.whiteboard;

  return {
    totalCallouts,
    totalContributions,
    contributionsByType,
    totalComments,
    totalMembers,
    totalUniqueContributors,
    engagementRatio: totalMembers > 0 ? Math.min(totalUniqueContributors / totalMembers, 1) : 0,
    unansweredCalloutPct: totalCallouts > 0 ? Math.min(unansweredCallouts / totalCallouts, 1) : 0,
    avgContributionsPerCallout: totalCallouts > 0 ? totalContributions / totalCallouts : 0,
    avgCommentsPerContribution: totalContributions > 0 ? totalComments / totalContributions : 0,
    totalWhiteboards,
    totalWhiteboardModifications: 0, // Would need activity feed data; 0 for now
    avgWhiteboardModifications: 0,
  };
}

/** Build per-contributor details */
function buildContributorDetails(
  allSpaces: RawAnalyticsSpace[],
  callouts: CalloutDetail[],
): ContributorDetail[] {
  // Build a map of userId → contributor info
  const userMap = new Map<
    string,
    {
      displayName: string;
      avatarUrl: string | null;
      role: 'admin' | 'lead' | 'member';
      organizationId: string | null;
      organizationName: string | null;
    }
  >();

  // Resolve org memberships: build org map and track which users belong to which org
  const orgMap = new Map<string, { displayName: string; avatarUrl: string | null }>();
  const userToOrg = new Map<string, string>();

  for (const space of allSpaces) {
    for (const org of [...space.community.memberOrganizations, ...space.community.leadOrganizations]) {
      orgMap.set(org.id, { displayName: org.displayName, avatarUrl: org.avatarUrl });
    }

    // Collect all users with their highest role (admin > lead > member)
    const roleEntries: Array<{ users: typeof space.community.memberUsers; role: 'admin' | 'lead' | 'member' }> = [
      { users: space.community.adminUsers, role: 'admin' },
      { users: space.community.leadUsers, role: 'lead' },
      { users: space.community.memberUsers, role: 'member' },
    ];

    for (const { users, role } of roleEntries) {
      for (const user of users) {
        const existing = userMap.get(user.id);
        if (!existing || roleRank(role) > roleRank(existing.role)) {
          userMap.set(user.id, {
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            role,
            organizationId: userToOrg.get(user.id) ?? null,
            organizationName: null,
          });
        }
      }
    }
  }

  // Build contribution counts from raw callout data
  const contribCounts = new Map<
    string,
    {
      total: number;
      comments: number;
      byType: { post: number; memo: number; link: number; whiteboard: number };
      subspaces: Map<string, number>;
      months: Map<string, number>;
      firstDate: string | null;
      lastDate: string | null;
    }
  >();

  for (const space of allSpaces) {
    const spaceId = space.id;
    for (const callout of space.calloutsSet.callouts) {
      for (const contrib of callout.contributions) {
        if (!contrib.createdBy) continue;
        const uid = contrib.createdBy;
        let rec = contribCounts.get(uid);
        if (!rec) {
          rec = {
            total: 0,
            comments: 0,
            byType: { post: 0, memo: 0, link: 0, whiteboard: 0 },
            subspaces: new Map(),
            months: new Map(),
            firstDate: null,
            lastDate: null,
          };
          contribCounts.set(uid, rec);
        }
        rec.total++;
        rec.byType[contrib.type]++;
        rec.subspaces.set(spaceId, (rec.subspaces.get(spaceId) ?? 0) + 1);
        const month = contrib.createdDate.slice(0, 7);
        rec.months.set(month, (rec.months.get(month) ?? 0) + 1);
        if (!rec.firstDate || contrib.createdDate < rec.firstDate) rec.firstDate = contrib.createdDate;
        if (!rec.lastDate || contrib.createdDate > rec.lastDate) rec.lastDate = contrib.createdDate;
      }

      // Count comments per sender
      for (const cs of callout.commentSenders) {
        let rec = contribCounts.get(cs.senderId);
        if (!rec) {
          rec = {
            total: 0,
            comments: 0,
            byType: { post: 0, memo: 0, link: 0, whiteboard: 0 },
            subspaces: new Map(),
            months: new Map(),
            firstDate: null,
            lastDate: null,
          };
          contribCounts.set(cs.senderId, rec);
        }
        rec.comments++;
      }
    }
  }

  // Merge into ContributorDetail[]
  const result: ContributorDetail[] = [];

  for (const [userId, info] of userMap) {
    const counts = contribCounts.get(userId);
    const orgId = info.organizationId;
    const orgInfo = orgId ? orgMap.get(orgId) : null;

    result.push({
      userId,
      displayName: info.displayName,
      avatarUrl: info.avatarUrl,
      organizationId: orgId,
      organizationName: orgInfo?.displayName ?? null,
      role: info.role,
      totalContributions: counts?.total ?? 0,
      totalComments: counts?.comments ?? 0,
      contributionsByType: counts?.byType ?? { post: 0, memo: 0, link: 0, whiteboard: 0 },
      activeSubspaceCount: counts?.subspaces.size ?? 0,
      firstContributionDate: counts?.firstDate ?? null,
      lastContributionDate: counts?.lastDate ?? null,
      perSubspace: counts
        ? Array.from(counts.subspaces.entries()).map(([subspaceId, count]) => ({ subspaceId, count }))
        : [],
      perMonth: counts
        ? Array.from(counts.months.entries()).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month))
        : [],
    });
  }

  // Sort by total contributions descending
  result.sort((a, b) => b.totalContributions - a.totalContributions);
  return result;
}

function roleRank(role: 'admin' | 'lead' | 'member'): number {
  return role === 'admin' ? 3 : role === 'lead' ? 2 : 1;
}

function framingTypeToPostType(ft: RawCallout['framingType']): CalloutDetail['postType'] {
  switch (ft) {
    case 'MEMO': return 'memo';
    case 'WHITEBOARD': return 'whiteboard';
    case 'LINK': return 'link';
    case 'MEDIA_GALLERY': return 'media_gallery';
    default: return 'text';
  }
}

/** Build per-subspace metrics (L1 + L2 only) */
function buildSubspaceMetrics(allSpaces: RawAnalyticsSpace[]): SubspaceMetrics[] {
  return allSpaces
    .filter((s) => s.level > 0)
    .map((space) => {
      const totalCallouts = space.calloutsSet.callouts.length;
      let totalContributions = 0;
      let totalComments = 0;
      const contributorSet = new Set<string>();

      for (const callout of space.calloutsSet.callouts) {
        totalContributions +=
          callout.contributionsCount.post +
          callout.contributionsCount.memo +
          callout.contributionsCount.link +
          callout.contributionsCount.whiteboard;
        totalComments += callout.commentsCount;
        for (const c of callout.contributions) {
          if (c.createdBy) contributorSet.add(c.createdBy);
        }
        for (const cs of callout.commentSenders) {
          contributorSet.add(cs.senderId);
        }
      }

      const memberSet = new Set<string>();
      for (const u of space.community.memberUsers) memberSet.add(u.id);
      for (const u of space.community.leadUsers) memberSet.add(u.id);
      for (const u of space.community.adminUsers) memberSet.add(u.id);

      return {
        id: space.id,
        displayName: space.displayName,
        level: space.level,
        parentId: space.parentId,
        totalCallouts,
        totalContributions,
        totalComments,
        totalMembers: memberSet.size,
        uniqueContributors: contributorSet.size,
      };
    });
}

/** Build lightweight subspace hierarchy for cascading filter dropdowns */
function buildSubspaceTree(root: RawAnalyticsSpace): SubspaceNode[] {
  return root.subspaces.map((l1) => ({
    id: l1.id,
    displayName: l1.displayName,
    level: 1,
    children: l1.subspaces.map((l2) => ({
      id: l2.id,
      displayName: l2.displayName,
      level: 2,
      children: [],
    })),
  }));
}

/** Build monthly timeline buckets from contribution data */
function buildTimelineBuckets(
  _callouts: CalloutDetail[],
  allSpaces: RawAnalyticsSpace[],
): TimelineBucket[] {
  // Build per-subspace timeline entries so the client can filter/aggregate.
  // Key: "subspaceId|period" (subspaceId is empty string for L0 root)
  type BucketData = {
    contributions: number;
    byType: { post: number; memo: number; link: number; whiteboard: number };
    comments: number;
    contributors: Set<string>;
  };
  const bucketMap = new Map<string, BucketData>();
  const contributorFirstMonth = new Map<string, string>();

  const getOrCreate = (key: string): BucketData => {
    let b = bucketMap.get(key);
    if (!b) {
      b = { contributions: 0, byType: { post: 0, memo: 0, link: 0, whiteboard: 0 }, comments: 0, contributors: new Set() };
      bucketMap.set(key, b);
    }
    return b;
  };

  for (const space of allSpaces) {
    const sid = space.level === 0 ? '' : space.id;
    for (const callout of space.calloutsSet.callouts) {
      for (const contrib of callout.contributions) {
        const month = contrib.createdDate.slice(0, 7);
        const bucket = getOrCreate(`${sid}|${month}`);
        bucket.contributions++;
        bucket.byType[contrib.type]++;
        if (contrib.createdBy) {
          bucket.contributors.add(contrib.createdBy);
          const existing = contributorFirstMonth.get(contrib.createdBy);
          if (!existing || month < existing) {
            contributorFirstMonth.set(contrib.createdBy, month);
          }
        }
      }
      for (const cs of callout.commentSenders) {
        const month = new Date(cs.timestamp).toISOString().slice(0, 7);
        const bucket = getOrCreate(`${sid}|${month}`);
        bucket.comments++;
      }
    }
  }

  const results: TimelineBucket[] = [];
  for (const [key, data] of bucketMap) {
    const [sid, period] = key.split('|');
    let newContributors = 0;
    for (const uid of data.contributors) {
      if (contributorFirstMonth.get(uid) === period) newContributors++;
    }
    results.push({
      period,
      subspaceId: sid || null,
      contributions: data.contributions,
      byType: data.byType,
      comments: data.comments,
      uniqueContributors: data.contributors.size,
      newContributors,
    });
  }

  return results.sort((a, b) => a.period.localeCompare(b.period));
}

/** Build phase info from CalloutsSet metadata */
function buildPhaseInfo(allSpaces: RawAnalyticsSpace[]): PhaseInfo[] {
  const phaseMap = new Map<string, PhaseInfo>();

  for (const space of allSpaces) {
    // Collect innovation flow states as phases
    for (const state of space.innovationFlow.states) {
      const existing = phaseMap.get(state.displayName);
      if (existing) {
        // Keep the lowest sortOrder
        existing.sortOrder = Math.min(existing.sortOrder, state.sortOrder);
      } else {
        phaseMap.set(state.displayName, {
          id: state.displayName,
          displayName: state.displayName,
          sortOrder: state.sortOrder,
          calloutCount: 0,
        });
      }
    }

    // Count callouts per phase
    for (const callout of space.calloutsSet.callouts) {
      const phaseName = callout.flowStateName;
      if (phaseName) {
        const phase = phaseMap.get(phaseName);
        if (phase) {
          phase.calloutCount++;
        } else {
          // Callout references a phase not in innovation flow states
          phaseMap.set(phaseName, {
            id: phaseName,
            displayName: phaseName,
            sortOrder: 999,
            calloutCount: 1,
          });
        }
      }
    }
  }

  return Array.from(phaseMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Build member info from community data */
function buildMemberInfo(
  allSpaces: RawAnalyticsSpace[],
  contributors: ContributorDetail[],
): MemberInfo[] {
  const activeSet = new Set(
    contributors.filter((c) => c.totalContributions > 0 || c.totalComments > 0).map((c) => c.userId),
  );
  const memberMap = new Map<string, MemberInfo>();

  for (const space of allSpaces) {
    const roleEntries: Array<{ users: typeof space.community.memberUsers; role: 'admin' | 'lead' | 'member' }> = [
      { users: space.community.adminUsers, role: 'admin' },
      { users: space.community.leadUsers, role: 'lead' },
      { users: space.community.memberUsers, role: 'member' },
    ];

    for (const { users, role } of roleEntries) {
      for (const u of users) {
        const existing = memberMap.get(u.id);
        if (!existing || roleRank(role) > roleRank(existing.role)) {
          memberMap.set(u.id, {
            userId: u.id,
            displayName: u.displayName,
            role,
            organizationId: null,
            isActive: activeSet.has(u.id),
          });
        }
      }
    }
  }

  return Array.from(memberMap.values());
}

/** Build organization activity summary */
function buildOrganizationActivity(
  allSpaces: RawAnalyticsSpace[],
  contributors: ContributorDetail[],
): OrganizationActivity[] {
  const orgMap = new Map<string, { displayName: string; avatarUrl: string | null; memberIds: Set<string> }>();

  for (const space of allSpaces) {
    for (const org of [...space.community.memberOrganizations, ...space.community.leadOrganizations]) {
      let entry = orgMap.get(org.id);
      if (!entry) {
        entry = { displayName: org.displayName, avatarUrl: org.avatarUrl, memberIds: new Set() };
        orgMap.set(org.id, entry);
      }
    }
  }

  // Match contributors to their organizations
  const orgContribs = new Map<string, { activeCount: number; totalContributions: number }>();
  for (const c of contributors) {
    if (c.organizationId && orgMap.has(c.organizationId)) {
      const org = orgMap.get(c.organizationId)!;
      org.memberIds.add(c.userId);
      let rec = orgContribs.get(c.organizationId);
      if (!rec) {
        rec = { activeCount: 0, totalContributions: 0 };
        orgContribs.set(c.organizationId, rec);
      }
      if (c.totalContributions > 0) rec.activeCount++;
      rec.totalContributions += c.totalContributions;
    }
  }

  return Array.from(orgMap.entries()).map(([orgId, info]) => {
    const contribs = orgContribs.get(orgId);
    return {
      organizationId: orgId,
      displayName: info.displayName,
      avatarUrl: info.avatarUrl,
      memberCount: info.memberIds.size,
      activeContributorCount: contribs?.activeCount ?? 0,
      totalContributions: contribs?.totalContributions ?? 0,
    };
  });
}
