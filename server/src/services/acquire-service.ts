import { getLogger } from '../logging/logger.js';
import { createAlkemioSdk } from '../graphql/client.js';
import type { AuthContext } from '../auth/middleware.js';
import { fetchSpaceByName, fetchSubspaceDetails, type RawSpace } from './space-service.js';
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
  /** For MEMBER_JOINED events: the actual contributor who joined (may differ from triggeredBy if an admin added them) */
  contributor?: { id: string };
  /** For MEMBER_JOINED events: whether the contributor is a user or organization */
  contributorType?: string;
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

  // Activity event types to track — contributions only (excludes MEMBER_JOINED, SUBSPACE_CREATED, CALLOUT_PUBLISHED)
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

  const [usersResult, orgsResult, activityResult, memberJoinedResult] = await Promise.allSettled([
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

    // Fetch contribution activity data
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

    // Fetch MEMBER_JOINED events separately with its own limit
    // so join events aren't crowded out by contribution events
    (async () => {
      if (allSpaceIds.length === 0) return undefined;
      const { data } = await sdk.ActivityFeedGrouped({
        args: {
          spaceIds: allSpaceIds,
          limit: 5000,
          types: ['MEMBER_JOINED'] as any,
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
  const contributions = activityResult.status === 'fulfilled' ? activityResult.value : undefined;
  const joinEvents = memberJoinedResult.status === 'fulfilled' ? memberJoinedResult.value : undefined;

  if (contributions || joinEvents) {
    activityEntries = [...(contributions ?? []), ...(joinEvents ?? [])];
    const joinCount = joinEvents?.length ?? 0;
    const contribCount = contributions?.length ?? 0;
    logger.info(`Fetched ${contribCount} contribution + ${joinCount} MEMBER_JOINED = ${activityEntries.length} total activity entries for ${allSpaceIds.length} space(s)`, { context: 'Acquire' });
  } else {
    activityEntries = undefined;
    if (activityResult.status === 'rejected') {
      logger.warn(`Failed to fetch activity data, pulse will be unavailable: ${(activityResult.reason as Error).message}`, { context: 'Acquire' });
    }
    if (memberJoinedResult.status === 'rejected') {
      logger.warn(`Failed to fetch MEMBER_JOINED events: ${(memberJoinedResult.reason as Error).message}`, { context: 'Acquire' });
    }
  }

  return { spacesL0, users, organizations, activityEntries, errors };
}

/**
 * Recursively check user privileges on subspaces and fetch community data.
 * Works layer by layer: for each subspace with READ access, fetches its
 * children via a separate query (since private subspaces hide their children
 * from the parent query).
 *
 * - READ privilege: fetch community data, then recursively fetch + enrich children
 * - READ_ABOUT only: mark as restricted (no community fetch), no children
 * - Neither / missing: omit from subspaces array, log error
 *
 * Mutates the space.subspaces array in-place.
 */
async function enrichSubspacesWithCommunityData(
  sdk: Sdk,
  space: RawSpace,
  errors: string[],
  logger: ReturnType<typeof getLogger>,
): Promise<void> {
  if (!space.subspaces) return;

  logger.info(
    `Checking privileges for ${space.subspaces.length} subspace(s) under space "${space.nameID}"`,
    { context: 'Acquire' },
  );

  const enriched = await enrichSubspaceLevel(sdk, space.subspaces, errors, logger);

  // Replace subspaces with enriched ones
  (space as Record<string, unknown>).subspaces = enriched;
}

/**
 * Process a list of subspaces at any depth: check privileges, fetch community
 * data for accessible ones, and recursively fetch + process their children.
 */
async function enrichSubspaceLevel(
  sdk: Sdk,
  subspaces: RawSpace['subspaces'],
  errors: string[],
  logger: ReturnType<typeof getLogger>,
): Promise<NonNullable<RawSpace['subspaces']>> {
  if (!subspaces || subspaces.length === 0) return [];

  const enriched: NonNullable<RawSpace['subspaces']> = [];
  let readCount = 0;
  let restrictedCount = 0;
  let omittedCount = 0;

  for (const sub of subspaces) {
    const privileges = (sub.about as Record<string, unknown>).membership as
      | { myPrivileges?: string[] }
      | undefined;
    const privList = privileges?.myPrivileges;

    if (!privList || privList.length === 0) {
      const msg = `No privileges returned for subspace "${sub.nameID}" (${sub.id}) — omitting from graph`;
      logger.error(msg, { context: 'Acquire' });
      errors.push(msg);
      omittedCount++;
      continue;
    }

    const hasRead = privList.includes('READ');
    const hasReadAbout = privList.includes('READ_ABOUT');

    if (hasRead) {
      // Fetch community data + children in a single query
      logger.info(`"${sub.nameID}" (${sub.id}): READ privilege — fetching details`, { context: 'Acquire' });
      const details = await fetchSubspaceDetails(sdk, sub.id, errors);
      if (details) {
        (sub as Record<string, unknown>).community = details.community;

        if (details.subspaces && details.subspaces.length > 0) {
          logger.info(
            `"${sub.nameID}" (${sub.id}): found ${details.subspaces.length} child subspace(s), processing recursively`,
            { context: 'Acquire' },
          );
          const enrichedChildren = await enrichSubspaceLevel(
            sdk,
            details.subspaces as typeof subspaces,
            errors,
            logger,
          );
          (sub as Record<string, unknown>).subspaces = enrichedChildren;
        } else {
          (sub as Record<string, unknown>).subspaces = [];
        }
      } else {
        (sub as Record<string, unknown>).subspaces = [];
      }

      readCount++;
      enriched.push(sub);
    } else if (hasReadAbout) {
      // Restricted — include with about-only data, no community, no children
      logger.info(`"${sub.nameID}" (${sub.id}): READ_ABOUT only — marking as restricted`, { context: 'Acquire' });
      (sub as Record<string, unknown>).subspaces = [];
      restrictedCount++;
      enriched.push(sub);
    } else {
      const msg = `Subspace "${sub.nameID}" (${sub.id}) has neither READ nor READ_ABOUT — omitting from graph`;
      logger.error(msg, { context: 'Acquire' });
      errors.push(msg);
      omittedCount++;
    }
  }

  logger.info(
    `Subspace enrichment: ${readCount} accessible, ${restrictedCount} restricted, ${omittedCount} omitted (of ${subspaces.length} total)`,
    { context: 'Acquire' },
  );

  return enriched;
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
