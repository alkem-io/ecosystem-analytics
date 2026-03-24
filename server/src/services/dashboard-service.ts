import { createAlkemioSdk } from '../graphql/client.js';
import { getLogger } from '../logging/logger.js';
import type { AuthContext } from '../auth/middleware.js';
import type { SpaceAnalyticsQuery } from '../graphql/generated/alkemio-schema.js';
import type { RawAnalyticsSpace, RawCallout } from '../types/dashboard.js';

const logger = getLogger();

/** The GraphQL result type for a single space from SpaceAnalytics query */
type GqlSpace = NonNullable<SpaceAnalyticsQuery['lookup']['space']>;
type GqlCallout = GqlSpace['collaboration']['calloutsSet']['callouts'][number];
type GqlContribution = GqlCallout['contributions'][number];
type GqlRoleUser = GqlSpace['community']['roleSet']['memberUsers'][number];
type GqlRoleOrg = GqlSpace['community']['roleSet']['memberOrganizations'][number];

/** Run an array of async tasks with a concurrency limit */
async function parallelBatch<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

const CONCURRENCY = 10;

/**
 * Fetch analytics data for a single space (and all its subspaces) from the
 * Alkemio GraphQL API. Returns a tree of RawAnalyticsSpace objects.
 *
 * Strategy: fetch the L0 space with its callout data + shallow subspace list,
 * then iterate L1/L2 subspaces with bounded concurrency.
 */
export async function acquireDashboardData(
  auth: AuthContext,
  spaceId: string,
): Promise<{ root: RawAnalyticsSpace; errors: string[] }> {
  const sdk = createAlkemioSdk(auth);
  const errors: string[] = [];

  logger.info(`Dashboard: acquiring analytics for space ${spaceId}`, { context: 'Dashboard' });

  // Fetch the L0 space
  const t0 = Date.now();
  const { data: l0Data } = await sdk.SpaceAnalytics({ spaceId });
  const tL0 = Date.now();
  logger.info(`Dashboard: L0 fetch took ${tL0 - t0}ms`, { context: 'Dashboard' });
  const gqlSpace = l0Data.lookup.space;
  if (!gqlSpace) {
    throw new Error(`Space not found: ${spaceId}`);
  }

  const root = mapGqlToRaw(gqlSpace, 0, null);

  // Fetch L1 subspaces with bounded concurrency
  const l1Ids = gqlSpace.subspaces.map((s) => s.id);
  if (l1Ids.length > 0) {
    logger.info(`Dashboard: fetching ${l1Ids.length} L1 subspace(s) (concurrency=${CONCURRENCY})`, { context: 'Dashboard' });
    const tL1Start = Date.now();
    const l1Results = await parallelBatch(
      l1Ids.map((id) => () => sdk.SpaceAnalytics({ spaceId: id })),
      CONCURRENCY,
    );
    const tL1End = Date.now();
    logger.info(`Dashboard: L1 batch (${l1Ids.length} subspaces) took ${tL1End - tL1Start}ms`, { context: 'Dashboard' });

    // Collect all L2 fetch tasks across all L1 results
    type L2Task = { l1Idx: number; l2Id: string };
    const l2Tasks: L2Task[] = [];
    const l1Spaces: (GqlSpace | null)[] = [];

    for (let i = 0; i < l1Results.length; i++) {
      const result = l1Results[i];
      if (result.status === 'fulfilled') {
        const l1Space = result.value.data.lookup.space;
        l1Spaces.push(l1Space ?? null);
        if (l1Space) {
          for (const sub of l1Space.subspaces) {
            l2Tasks.push({ l1Idx: i, l2Id: sub.id });
          }
        }
      } else {
        l1Spaces.push(null);
        const msg = `Failed to fetch L1 subspace ${l1Ids[i]}: ${result.reason}`;
        logger.warn(msg, { context: 'Dashboard' });
        errors.push(msg);
      }
    }

    // Fetch all L2 subspaces with bounded concurrency
    const l2Results = l2Tasks.length > 0
      ? await (async () => {
          const tL2Start = Date.now();
          const results = await parallelBatch(
            l2Tasks.map(({ l2Id }) => () => sdk.SpaceAnalytics({ spaceId: l2Id })),
            CONCURRENCY,
          );
          logger.info(`Dashboard: L2 batch (${l2Tasks.length} subspaces) took ${Date.now() - tL2Start}ms`, { context: 'Dashboard' });
          return results;
        })()
      : [];

    // Build L2 lookup: l1Idx → RawAnalyticsSpace[]
    const l2ByL1 = new Map<number, RawAnalyticsSpace[]>();
    for (let j = 0; j < l2Tasks.length; j++) {
      const { l1Idx, l2Id } = l2Tasks[j];
      const l2Result = l2Results[j];
      if (l2Result.status === 'fulfilled') {
        const l2Space = l2Result.value.data.lookup.space;
        if (l2Space) {
          const l1Space = l1Spaces[l1Idx];
          const l1Id = l1Space ? l1Space.id : l1Ids[l1Idx];
          if (!l2ByL1.has(l1Idx)) l2ByL1.set(l1Idx, []);
          l2ByL1.get(l1Idx)!.push(mapGqlToRaw(l2Space, 2, l1Id));
        }
      } else {
        const msg = `Failed to fetch L2 subspace ${l2Id}: ${l2Result.reason}`;
        logger.warn(msg, { context: 'Dashboard' });
        errors.push(msg);
      }
    }

    // Assemble tree
    for (let i = 0; i < l1Spaces.length; i++) {
      const l1Space = l1Spaces[i];
      if (l1Space) {
        const l1Raw = mapGqlToRaw(l1Space, 1, root.id);
        l1Raw.subspaces = l2ByL1.get(i) ?? [];
        root.subspaces.push(l1Raw);
      }
    }
  }

  logger.info(
    `Dashboard: acquired L0 + ${root.subspaces.length} L1 + ${root.subspaces.reduce((n, s) => n + s.subspaces.length, 0)} L2 subspace(s)`,
    { context: 'Dashboard' },
  );

  return { root, errors };
}

/** Map a GraphQL space result to our internal RawAnalyticsSpace structure */
function mapGqlToRaw(space: GqlSpace, level: number, parentId: string | null): RawAnalyticsSpace {
  return {
    id: space.id,
    nameID: space.nameID,
    level,
    parentId,
    displayName: space.about.profile.displayName,
    avatarUrl: space.about.profile.avatar?.uri ?? null,
    tagline: space.about.profile.tagline ?? null,
    community: {
      memberUsers: mapRoleUsers(space.community.roleSet.memberUsers),
      leadUsers: mapRoleUsers(space.community.roleSet.leadUsers),
      adminUsers: mapRoleUsers(space.community.roleSet.adminUsers),
      memberOrganizations: mapRoleOrgs(space.community.roleSet.memberOrganizations),
      leadOrganizations: mapRoleOrgs(space.community.roleSet.leadOrganizations),
    },
    calloutsSet: {
      id: space.collaboration.calloutsSet.id,
      type: space.collaboration.calloutsSet.type as 'COLLABORATION' | 'KNOWLEDGE_BASE',
      callouts: space.collaboration.calloutsSet.callouts.map(mapCallout),
    },
    innovationFlow: {
      states: space.collaboration.innovationFlow.states.map((s) => ({
        displayName: s.displayName,
        sortOrder: s.sortOrder,
      })),
    },
    subspaces: [],
  };
}

function mapRoleUsers(users: GqlRoleUser[]): RawAnalyticsSpace['community']['memberUsers'] {
  return users.map((u) => ({
    id: u.id,
    displayName: u.profile?.displayName ?? 'Unknown',
    avatarUrl: u.profile?.avatar?.uri ?? null,
  }));
}

function mapRoleOrgs(orgs: GqlRoleOrg[]): RawAnalyticsSpace['community']['memberOrganizations'] {
  return orgs.map((o) => ({
    id: o.id,
    displayName: o.profile?.displayName ?? 'Unknown',
    avatarUrl: o.profile?.avatar?.uri ?? null,
  }));
}

function mapCallout(callout: GqlCallout): RawCallout {
  const contributions = callout.contributions.map((c: GqlContribution) => ({
    id: c.id,
    createdDate: new Date(c.createdDate).toISOString(),
    createdBy: c.createdBy?.id ?? null,
    type: detectContributionType(c),
  }));

  const commentSenders: RawCallout['commentSenders'] = [];

  // Collect comment senders from callout-level comments
  if (callout.comments?.messages) {
    for (const msg of callout.comments.messages) {
      if (msg.sender?.id) {
        commentSenders.push({ senderId: msg.sender.id, timestamp: msg.timestamp });
      }
    }
  }

  // Collect comment senders from post-level comments
  for (const c of callout.contributions) {
    if (c.post?.comments?.messages) {
      for (const msg of c.post.comments.messages) {
        if (msg.sender?.id) {
          commentSenders.push({ senderId: msg.sender.id, timestamp: msg.timestamp });
        }
      }
    }
  }

  // Total comments = callout-level messagesCount + sum of post-level messagesCount
  let commentsCount = callout.comments?.messagesCount ?? 0;
  for (const c of callout.contributions) {
    if (c.post?.comments?.messagesCount) {
      commentsCount += c.post.comments.messagesCount;
    }
  }

  return {
    id: callout.id,
    nameID: callout.nameID,
    createdDate: new Date(callout.createdDate).toISOString(),
    createdBy: callout.createdBy?.id ?? null,
    title: callout.framing.profile.displayName,
    framingType: (callout.framing.type ?? 'NONE') as RawCallout['framingType'],
    flowStateName: callout.classification?.tagset?.tags?.[0] ?? null,
    contributionsCount: {
      post: callout.contributionsCount.post,
      memo: callout.contributionsCount.memo,
      link: callout.contributionsCount.link,
      whiteboard: callout.contributionsCount.whiteboard,
    },
    contributions,
    commentsCount,
    commentSenders,
  };
}

function detectContributionType(c: GqlContribution): 'post' | 'memo' | 'link' | 'whiteboard' {
  if (c.post) return 'post';
  if (c.memo) return 'memo';
  if (c.link) return 'link';
  if (c.whiteboard) return 'whiteboard';
  return 'post'; // fallback
}
