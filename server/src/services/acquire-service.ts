import { getLogger } from '../logging/logger.js';
import { createAlkemioSdk } from '../graphql/client.js';
import type { AuthContext } from '../auth/middleware.js';
import { fetchSpaceByName, type RawSpace } from './space-service.js';
import type { UsersByIDsQuery, OrganizationByIdQuery } from '../graphql/generated/alkemio-schema.js';

/** Raw user profile — derived from codegen types */
export type RawUser = UsersByIDsQuery['users'][number];

/** Raw organization profile — derived from codegen types */
export type RawOrganization = NonNullable<OrganizationByIdQuery['lookup']['organization']>;

/** Lightweight activity entry — matches the fields returned by our activityFeedGrouped query */
export interface RawActivityEntry {
  id: string;
  type: string;
  createdDate: Date;
  triggeredBy: { id: string };
  space?: { id: string };
}

/** Complete acquired data for a set of spaces */
export interface AcquiredData {
  spacesL0: Array<{ space: RawSpace; nameId: string }>;
  users: Map<string, RawUser>;
  organizations: Map<string, RawOrganization>;
  /** Raw activity feed entries — undefined if fetch failed */
  activityEntries?: RawActivityEntry[];
}

/**
 * Acquire data for the given space nameIDs from Alkemio GraphQL.
 * Collects all user/org IDs from community roles and batch-fetches profiles.
 * All queries use the codegen-generated SDK (TR-016).
 */
export async function acquireSpaces(
  auth: AuthContext,
  spaceNameIds: string[],
): Promise<AcquiredData> {
  const logger = getLogger();
  const sdk = createAlkemioSdk(auth);

  const spacesL0: AcquiredData['spacesL0'] = [];
  const userIds = new Set<string>();
  const orgIds = new Set<string>();

  for (const nameId of spaceNameIds) {
    logger.info(`Acquiring space data: ${nameId}`, { context: 'Acquire' });
    let result;
    try {
      result = await fetchSpaceByName(sdk, nameId);
    } catch (fetchErr) {
      logger.warn(`Failed to fetch space "${nameId}", skipping: ${(fetchErr as Error).message}`, { context: 'Acquire' });
      continue;
    }
    const space = result.lookupByName?.space;
    if (!space) {
      logger.warn(`Space not found or fully restricted: ${nameId}`, { context: 'Acquire' });
      continue;
    }

    spacesL0.push({ space, nameId });
    collectContributorIds(space, userIds, orgIds);
  }

  logger.info(`Acquired ${spacesL0.length} space(s), found ${userIds.size} users and ${orgIds.size} organizations`, { context: 'Acquire' });

  // Contribution event types to track (excludes MEMBER_JOINED, SUBSPACE_CREATED, CALLOUT_PUBLISHED)
  const CONTRIBUTION_EVENT_TYPES: string[] = [
    'CALLOUT_POST_CREATED',
    'CALLOUT_POST_COMMENT',
    'CALLOUT_MEMO_CREATED',
    'CALLOUT_LINK_CREATED',
    'CALLOUT_WHITEBOARD_CREATED',
    'CALLOUT_WHITEBOARD_CONTENT_MODIFIED',
    'DISCUSSION_COMMENT',
    'UPDATE_SENT',
    'CALENDAR_EVENT_CREATED',
  ];

  // Run user fetch, org fetch, and activity fetch in parallel
  const allSpaceIds = spacesL0.map((s) => s.space.id);

  const [usersResult, orgsResult, activityResult] = await Promise.allSettled([
    // Batch-fetch user profiles
    (async () => {
      const users = new Map<string, RawUser>();
      if (userIds.size > 0) {
        const { data } = await sdk.usersByIDs({ ids: Array.from(userIds) });
        for (const user of data.users) {
          users.set(user.id, user);
        }
      }
      return users;
    })(),

    // Fetch organization profiles one by one
    (async () => {
      const organizations = new Map<string, RawOrganization>();
      for (const id of orgIds) {
        try {
          const { data } = await sdk.organizationByID({ id });
          if (data.lookup.organization) {
            organizations.set(id, data.lookup.organization);
          }
        } catch {
          logger.warn(`Failed to fetch organization ${id}, skipping`, { context: 'Acquire' });
        }
      }
      return organizations;
    })(),

    // Fetch activity data
    (async () => {
      if (allSpaceIds.length === 0) return undefined;
      const { data } = await sdk.ActivityFeedGrouped({
        args: {
          spaceIds: allSpaceIds,
          limit: 5000,
          types: CONTRIBUTION_EVENT_TYPES as any,
        },
      });
      return data.activityFeedGrouped as RawActivityEntry[];
    })(),
  ]);

  const users = usersResult.status === 'fulfilled' ? usersResult.value : new Map<string, RawUser>();
  if (usersResult.status === 'rejected') {
    logger.warn(`Failed to fetch user profiles: ${(usersResult.reason as Error).message}`, { context: 'Acquire' });
  }

  const organizations = orgsResult.status === 'fulfilled' ? orgsResult.value : new Map<string, RawOrganization>();
  if (orgsResult.status === 'rejected') {
    logger.warn(`Failed to fetch organization profiles: ${(orgsResult.reason as Error).message}`, { context: 'Acquire' });
  }

  let activityEntries: RawActivityEntry[] | undefined;
  if (activityResult.status === 'fulfilled') {
    activityEntries = activityResult.value;
    logger.info(`Fetched ${activityEntries?.length ?? 0} activity entries for ${allSpaceIds.length} space(s)`, { context: 'Acquire' });
  } else {
    activityEntries = undefined;
    logger.warn(`Failed to fetch activity data, pulse will be unavailable: ${(activityResult.reason as Error).message}`, { context: 'Acquire' });
  }

  return { spacesL0, users, organizations, activityEntries };
}

/** Common shape for collecting contributor IDs across space levels */
interface SpaceWithCommunity {
  community?: {
    roleSet: {
      memberUsers: Array<{ id: string }>;
      memberOrganizations: Array<{ id: string }>;
      leadOrganizations: Array<{ id: string }>;
      leadUsers: Array<{ id: string }>;
    };
  } | null;
  subspaces?: SpaceWithCommunity[];
}

/** Recursively collect user and org IDs from a space's community roles */
function collectContributorIds(
  space: SpaceWithCommunity,
  userIds: Set<string>,
  orgIds: Set<string>,
): void {
  const roleSet = space.community?.roleSet;
  if (roleSet) {
    roleSet.memberUsers.forEach((u) => userIds.add(u.id));
    roleSet.leadUsers.forEach((u) => userIds.add(u.id));
    roleSet.memberOrganizations.forEach((o) => orgIds.add(o.id));
    roleSet.leadOrganizations.forEach((o) => orgIds.add(o.id));
  }

  if (space.subspaces) {
    for (const sub of space.subspaces) {
      collectContributorIds(sub, userIds, orgIds);
    }
  }
}
