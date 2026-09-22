import { getLogger } from '../logging/logger.js';
import { loadConfig } from '../config.js';
import { createAlkemioSdk, getRequestStats } from '../graphql/client.js';
import type { AuthContext } from '../auth/middleware.js';
import {
  fetchSpaceByName,
  fetchSpaceAboutOnlyByName,
  fetchSubspaceDetails,
  type RawSpace,
} from './space-service.js';
import type { UsersByIDsQuery, OrganizationCoreProfileFragment } from '../graphql/generated/alkemio-schema.js';
import type { Sdk } from '../graphql/generated/graphql.js';

/** Raw user profile — derived from codegen types */
export type RawUser = UsersByIDsQuery['users'][number];

/**
 * Raw organisation CORE profile — carried inline by the roles fragment (feature 025), so
 * the core load makes no per-organisation lookup. The extended profile (description,
 * website, references, …) is the on-demand `organization-service` item.
 */
export type RawOrganization = OrganizationCoreProfileFragment;

/** Lightweight activity entry — matches the fields returned by our activityFeedGrouped query */
export interface RawActivityEntry {
  id: string;
  type: string;
  createdDate: Date;
  triggeredBy: { id: string };
  space?: { id: string };
  /** For MEMBER_JOINED events: the actual actor who joined (may differ from triggeredBy if an admin added them) */
  actor?: { id: string };
  /** For MEMBER_JOINED events: whether the actor is a user or organization */
  actorType?: string;
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
  onSpaceAcquired?: (nameId: string) => void,
  /** Fired just before a space is fetched (before the slow network call), so the
   *  loading UI can name the space it is currently waiting on. */
  onSpaceStart?: (nameId: string) => void,
  options: { includeActivity?: boolean } = {},
): Promise<AcquiredData> {
  const logger = getLogger();
  const sdk = await createAlkemioSdk(auth);

  const spacesL0: AcquiredData['spacesL0'] = [];
  const userIds = new Set<string>();
  const organizations = new Map<string, RawOrganization>();
  const errors: string[] = [];
  let aboutOnlyCount = 0;

  for (const nameId of spaceNameIds) {
    logger.info(`Acquiring space data: ${nameId}`, { context: 'Acquire' });
    onSpaceStart?.(nameId);
    let result;
    try {
      result = await fetchSpaceByName(sdk, nameId);
    } catch (fetchErr) {
      const msg = `Failed to fetch space "${nameId}": ${(fetchErr as Error).message}`;
      logger.error(msg, { context: 'Acquire' });
      errors.push(msg);
      continue;
    }
    let space = result.data.lookupByName?.space;
    if (!space && result.forbidden) {
      // The caller may READ_ABOUT this Space but not READ it (a private Space they are
      // not a member of). Degrade to the about-only shape so the Space still counts and
      // places on every dashboard panel — members and subspaces are simply not visible
      // to this caller, and the transformer marks the node `restricted`.
      const aboutOnly = await fetchSpaceAboutOnlyByName(sdk, nameId);
      if (aboutOnly) {
        logger.info(
          `Space "${nameId}" is read-about only for this user — acquired without community/subspaces`,
          { context: 'Acquire' },
        );
        // `community`/`account` are non-nullable in the generated type but the transformer
        // already reads them null-safely (`space.community?.roleSet`), as it does for
        // restricted subspaces.
        space = { ...aboutOnly, community: null, subspaces: [], account: null } as unknown as RawSpace;
        aboutOnlyCount += 1;
      }
    }
    if (!space) {
      const msg = `Space not found or fully restricted: ${nameId}`;
      logger.error(msg, { context: 'Acquire' });
      errors.push(msg);
      continue;
    }

    // Phase 2: Check privileges on subspaces and selectively fetch community data.
    // An about-only Space has no subspaces for this caller — nothing to check.
    if (space.community) {
      await enrichSubspacesWithCommunityData(sdk, space, errors, logger);
    }

    spacesL0.push({ space, nameId });
    collectContributors(space as SpaceWithCommunity, userIds, organizations);
    onSpaceAcquired?.(nameId);
  }

  logger.info(
    `Acquired ${spacesL0.length} space(s), found ${userIds.size} users and ${organizations.size} organizations` +
      (aboutOnlyCount > 0 ? ` (${aboutOnlyCount} read-about only: no members/subspaces visible)` : '') +
      ` requests=${getRequestStats(auth).requests} bytes=${getRequestStats(auth).bytes}`,
    { context: 'Acquire' },
  );

  // Feature 025: the core load is RELATIONAL — Spaces, roles, organisations (inline),
  // user profiles (one batched call). Activity is a separate item (activity-service) that
  // only the Explorer's JSON path folds in here; the dashboards never ask for it.
  const users = new Map<string, RawUser>();
  try {
    if (userIds.size > 0) {
      const { data } = await sdk.usersByIDs({ ids: Array.from(userIds) });
      for (const user of data.users) users.set(user.id, user);
    }
  } catch (err) {
    const msg = `Failed to fetch user profiles: ${(err as Error).message}`;
    logger.warn(msg, { context: 'Acquire' });
    errors.push(msg);
  }

  let activityEntries: RawActivityEntry[] | undefined;
  if (options.includeActivity && spacesL0.length > 0) {
    try {
      activityEntries = await fetchActivityEntries(sdk, spacesL0.map((s) => s.space.id));
    } catch (err) {
      const msg = `Failed to fetch activity data, pulse will be unavailable: ${(err as Error).message}`;
      logger.warn(msg, { context: 'Acquire' });
      errors.push(msg);
    }
  }

  return { spacesL0, users, organizations, activityEntries, errors };
}

/** Activity event types that count as contributions (MEMBER_JOINED is fetched separately). */
export const CONTRIBUTION_EVENT_TYPES: string[] = [
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

/**
 * Both activity sweeps for a set of L0 Space ids: contributions, and MEMBER_JOINED on
 * its own so join events are not crowded out by the contribution limit.
 */
export async function fetchActivityEntries(sdk: Sdk, spaceIds: string[]): Promise<RawActivityEntry[]> {
  const [contributions, joins] = await Promise.all([
    fetchActivityFeedChunked(sdk, spaceIds, CONTRIBUTION_EVENT_TYPES),
    fetchActivityFeedChunked(sdk, spaceIds, ['MEMBER_JOINED']),
  ]);
  getLogger().info(
    `Fetched ${contributions.length} contribution + ${joins.length} MEMBER_JOINED activity entries for ${spaceIds.length} space(s)`,
    { context: 'Acquire' },
  );
  return [...contributions, ...joins];
}

/**
 * Alkemio caps `activityFeedGrouped` at `limits.activity_spaces_per_query` spaces
 * per query. Split the space IDs into chunks of that size, fetch each chunk in
 * parallel, and merge — so the activity feed works for arbitrarily many spaces.
 */
async function fetchActivityFeedChunked(
  sdk: Sdk,
  spaceIds: string[],
  types: string[],
): Promise<RawActivityEntry[]> {
  const chunkSize = Math.max(1, loadConfig().activitySpacesPerQuery);
  const chunks: string[][] = [];
  for (let i = 0; i < spaceIds.length; i += chunkSize) {
    chunks.push(spaceIds.slice(i, i + chunkSize));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data } = await sdk.ActivityFeedGrouped({
        args: { spaceIds: chunk, limit: 5000, types: types as any },
      });
      return data.activityFeedGrouped as RawActivityEntry[];
    }),
  );
  return results.flat();
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
      memberOrganizations: RawOrganization[];
      leadOrganizations: RawOrganization[];
      leadUsers: Array<{ id: string }>;
    };
  } | null;
  subspaces?: SpaceWithCommunity[];
}

/** Recursively collect user ids and the inline organisation profiles from a space's roles */
function collectContributors(
  space: SpaceWithCommunity,
  userIds: Set<string>,
  organizations: Map<string, RawOrganization>,
): void {
  const roleSet = space.community?.roleSet;
  if (roleSet) {
    roleSet.memberUsers.forEach((u) => userIds.add(u.id));
    roleSet.leadUsers.forEach((u) => userIds.add(u.id));
    for (const o of [...roleSet.memberOrganizations, ...roleSet.leadOrganizations]) {
      if (!organizations.has(o.id)) organizations.set(o.id, o);
    }
  }
  for (const sub of space.subspaces ?? []) collectContributors(sub, userIds, organizations);
}
