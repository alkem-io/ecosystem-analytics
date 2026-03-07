import { createAlkemioSdk } from '../graphql/client.js';
import { getLogger } from '../logging/logger.js';
import { getCacheEntry, setCacheEntry } from '../cache/cache-service.js';
import type { AuthContext } from '../auth/middleware.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import type { SpaceByNameQuery, SubspaceCommunityQuery } from '../graphql/generated/alkemio-schema.js';
import type { SpaceSelectionItem } from '../types/api.js';

const SPACES_CACHE_KEY = '__spaces__';

/**
 * Fetches the user's L0 Space memberships from Alkemio.
 * Uses the codegen-generated mySpacesHierarchical query (TR-016).
 */
export async function listUserSpaces(auth: AuthContext): Promise<SpaceSelectionItem[]> {
  const sdk = createAlkemioSdk(auth);

  const { data } = await sdk.mySpacesHierarchical();
  const currentUserId = data.me.user?.id;
  getLogger().info(`Listing spaces for user ${currentUserId} — ${data.me.spaceMembershipsHierarchical.length} space(s) found`, { context: 'Spaces' });

  const spaces = data.me.spaceMembershipsHierarchical.map((membership) => {
    const space = membership.space;
    const isLead = currentUserId
      ? space.community.roleSet.leadUsers.some((u) => u.id === currentUserId)
      : false;

    return {
      id: space.id,
      nameId: space.nameID,
      displayName: space.about.profile.displayName,
      role: isLead ? 'LEAD' : 'MEMBER',
      visibility: 'PUBLIC',
    } satisfies SpaceSelectionItem;
  });

  // Lead spaces first, then alphabetical by name
  const sorted = spaces.sort((a, b) => {
    if (a.role === 'LEAD' && b.role !== 'LEAD') return -1;
    if (a.role !== 'LEAD' && b.role === 'LEAD') return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  // Update server-side cache
  if (currentUserId) {
    setCacheEntry(currentUserId, SPACES_CACHE_KEY, JSON.stringify(sorted));
  }

  return sorted;
}

/**
 * Returns cached spaces list if available, otherwise fetches fresh.
 */
export async function listUserSpacesCached(userId: string, auth: AuthContext): Promise<SpaceSelectionItem[]> {
  const cached = getCacheEntry(userId, SPACES_CACHE_KEY);
  if (cached) {
    getLogger().info(`Returning cached spaces for user ${userId}`, { context: 'Spaces' });
    return JSON.parse(cached.datasetJson);
  }

  return listUserSpaces(auth);
}

/**
 * Fetches a specific space by nameID with full hierarchy and community data.
 * Returns the typed query result for the transformer.
 *
 * The Alkemio API may return partial errors when the user lacks permission on
 * nested subspaces (FORBIDDEN_POLICY). We catch these and return whatever data
 * is available, logging a warning for the skipped parts.
 */
export async function fetchSpaceByName(sdk: Sdk, nameId: string) {
  try {
    const { data } = await sdk.spaceByName({ nameId });
    return data;
  } catch (err: unknown) {
    // graphql-request throws ClientError which contains the partial response
    const clientErr = err as { response?: { data?: unknown; errors?: Array<{ message: string; path?: string[] }> } };
    if (clientErr.response?.data) {
      const partialErrors = clientErr.response.errors || [];
      for (const e of partialErrors) {
        getLogger().warn(
          `Partial auth error fetching space "${nameId}": ${e.message} (path: ${e.path?.join('.')})`,
          { context: 'Spaces' },
        );
      }
      return clientErr.response.data as SpaceByNameQuery;
    }
    throw err;
  }
}

/**
 * Find Spaces related to a given entity that are not in the current dataset.
 * Used for graph expansion (US3).
 */
export async function findRelatedSpaces(
  auth: AuthContext,
  entityId: string,
  currentSpaceIds: string[],
): Promise<SpaceSelectionItem[]> {
  const allSpaces = await listUserSpaces(auth);
  return allSpaces.filter((s) => !currentSpaceIds.includes(s.id));
}

/**
 * Fetches community/roleSet data for a single subspace by ID (Phase 2 query).
 * Returns the community data or null if the fetch fails.
 * Errors are logged and collected (not thrown).
 */
export async function fetchSubspaceCommunity(
  sdk: Sdk,
  subspaceId: string,
  errors: string[],
): Promise<{ id: string; community: NonNullable<SubspaceCommunityQuery['lookup']['space']>['community'] } | null> {
  const logger = getLogger();
  try {
    logger.info(`Fetching community data for subspace ${subspaceId}`, { context: 'Spaces' });
    const { data } = await sdk.subspaceCommunity({ subspaceId });
    const space = data.lookup.space;
    if (!space) {
      const msg = `Subspace community not found for ID: ${subspaceId}`;
      logger.error(msg, { context: 'Spaces' });
      errors.push(msg);
      return null;
    }
    logger.info(`Community data retrieved for subspace ${subspaceId}`, { context: 'Spaces' });
    return { id: space.id, community: space.community };
  } catch (err: unknown) {
    const msg = `Failed to fetch community data for subspace ${subspaceId}: ${(err as Error).message}`;
    logger.error(msg, { context: 'Spaces' });
    errors.push(msg);
    return null;
  }
}

/** Extract the space type from the codegen-generated SpaceByNameQuery */
type SpaceByNameResult = NonNullable<SpaceByNameQuery['lookupByName']['space']>;

/** Raw space shape — derived from the codegen types */
export type RawSpace = SpaceByNameResult;
