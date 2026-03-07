import { getLogger } from '../logging/logger.js';
import { createAlkemioSdk } from '../graphql/client.js';
import type { AuthContext } from '../auth/middleware.js';
import { fetchSpaceByName, fetchSubspaceCommunity, type RawSpace } from './space-service.js';
import type { UsersByIDsQuery, OrganizationByIdQuery } from '../graphql/generated/alkemio-schema.js';
import type { Sdk } from '../graphql/generated/graphql.js';

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
  /** Non-fatal errors encountered during acquisition */
  errors: string[];
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
  const errors: string[] = [];

  for (const nameId of spaceNameIds) {
    logger.info(`Acquiring space data: ${nameId}`, { context: 'Acquire' });
    let result;
    try {
      result = await fetchSpaceByName(sdk, nameId);
    } catch (fetchErr) {
      const msg = `Failed to fetch space "${nameId}": ${(fetchErr as Error).message}`;
      logger.error(msg, { context: 'Acquire' });
      errors.push(msg);
      continue;
    }
    const space = result.lookupByName?.space;
    if (!space) {
      const msg = `Space not found or fully restricted: ${nameId}`;
      logger.error(msg, { context: 'Acquire' });
      errors.push(msg);
      continue;
    }

    // Phase 2: Check privileges on subspaces and selectively fetch community data
    await enrichSubspacesWithCommunityData(sdk, space, errors, logger);

    spacesL0.push({ space, nameId });
    collectContributorIds(space as SpaceWithCommunity, userIds, orgIds);
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

  return { spacesL0, users, organizations, activityEntries, errors };
}

/**
 * Check user privileges on each subspace and selectively fetch community data.
 * - READ privilege: fetch community data and merge it onto the subspace
 * - READ_ABOUT only: mark as restricted (no community fetch), skip L2 children
 * - Neither: omit from subspaces array, log error
 * - Missing privileges: omit from subspaces array, log error
 *
 * Mutates the space.subspaces array in-place (filters out inaccessible subspaces,
 * adds community data to accessible ones).
 */
async function enrichSubspacesWithCommunityData(
  sdk: Sdk,
  space: RawSpace,
  errors: string[],
  logger: ReturnType<typeof getLogger>,
): Promise<void> {
  if (!space.subspaces) return;

  logger.info(`Checking privileges for ${space.subspaces.length} L1 subspace(s) under space "${space.nameID}"`, { context: 'Acquire' });

  const enrichedL1: typeof space.subspaces = [];
  let readCount = 0;
  let restrictedCount = 0;
  let omittedCount = 0;

  for (const l1 of space.subspaces) {
    const privileges = (l1.about as Record<string, unknown>).membership as
      | { myPrivileges?: string[] }
      | undefined;
    const privList = privileges?.myPrivileges;

    if (!privList || privList.length === 0) {
      const msg = `No privileges returned for subspace "${l1.nameID}" (${l1.id}) — omitting from graph`;
      logger.error(msg, { context: 'Acquire' });
      errors.push(msg);
      omittedCount++;
      continue;
    }

    const hasRead = privList.includes('READ');
    const hasReadAbout = privList.includes('READ_ABOUT');

    if (hasRead) {
      // Fetch community data for this L1 subspace
      logger.info(`L1 "${l1.nameID}" (${l1.id}): READ privilege — fetching community data`, { context: 'Acquire' });
      const communityData = await fetchSubspaceCommunity(sdk, l1.id, errors);
      if (communityData) {
        // Merge community data onto the subspace object
        (l1 as Record<string, unknown>).community = communityData.community;
      }

      // Process L2 children with same logic
      if (l1.subspaces) {
        const enrichedL2: typeof l1.subspaces = [];
        for (const l2 of l1.subspaces) {
          const l2Privs = (l2.about as Record<string, unknown>).membership as
            | { myPrivileges?: string[] }
            | undefined;
          const l2PrivList = l2Privs?.myPrivileges;

          if (!l2PrivList || l2PrivList.length === 0) {
            const msg = `No privileges returned for L2 subspace "${l2.nameID}" (${l2.id}) — omitting from graph`;
            logger.error(msg, { context: 'Acquire' });
            errors.push(msg);
            continue;
          }

          const l2HasRead = l2PrivList.includes('READ');
          const l2HasReadAbout = l2PrivList.includes('READ_ABOUT');

          if (l2HasRead) {
            logger.info(`  L2 "${l2.nameID}" (${l2.id}): READ privilege — fetching community data`, { context: 'Acquire' });
            const l2Community = await fetchSubspaceCommunity(sdk, l2.id, errors);
            if (l2Community) {
              (l2 as Record<string, unknown>).community = l2Community.community;
            }
            enrichedL2.push(l2);
          } else if (l2HasReadAbout) {
            // L2 restricted — include with about-only data, no community
            logger.info(`  L2 "${l2.nameID}" (${l2.id}): READ_ABOUT only — marking as restricted`, { context: 'Acquire' });
            enrichedL2.push(l2);
          } else {
            const msg = `L2 subspace "${l2.nameID}" (${l2.id}) has neither READ nor READ_ABOUT — omitting from graph`;
            logger.error(msg, { context: 'Acquire' });
            errors.push(msg);
          }
        }
        (l1 as Record<string, unknown>).subspaces = enrichedL2;
      }

      readCount++;
      enrichedL1.push(l1);
    } else if (hasReadAbout) {
      // L1 restricted — include with about-only data, skip all L2 children
      logger.info(`L1 "${l1.nameID}" (${l1.id}): READ_ABOUT only — marking as restricted, skipping L2 children`, { context: 'Acquire' });
      (l1 as Record<string, unknown>).subspaces = [];
      restrictedCount++;
      enrichedL1.push(l1);
    } else {
      const msg = `Subspace "${l1.nameID}" (${l1.id}) has neither READ nor READ_ABOUT — omitting from graph`;
      logger.error(msg, { context: 'Acquire' });
      errors.push(msg);
      omittedCount++;
    }
  }

  logger.info(
    `Subspace enrichment complete for "${space.nameID}": ${readCount} accessible, ${restrictedCount} restricted, ${omittedCount} omitted (of ${space.subspaces.length} total)`,
    { context: 'Acquire' },
  );

  // Replace subspaces with enriched ones
  (space as Record<string, unknown>).subspaces = enrichedL1;
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
