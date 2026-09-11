import { createAlkemioSdk } from '../graphql/client.js';
import { getLogger } from '../logging/logger.js';
import { getCacheEntry, setCacheEntry } from '../cache/cache-service.js';
import type { AuthContext } from '../auth/middleware.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import type {
  SpaceByNameQuery,
  SpaceAboutOnlyByNameQuery,
  SubspaceDetailsQuery,
} from '../graphql/generated/alkemio-schema.js';
import type { SpaceSelectionItem } from '../types/api.js';

const SPACES_CACHE_KEY = '__spaces__';

/**
 * Fetches the user's L0 Space memberships from Alkemio.
 * Uses the lean codegen-generated SpacesForSelector query (TR-016): L0 fields
 * only, no `subspaces`, so a single orphaned child About can't null the list.
 */
export async function listUserSpaces(auth: AuthContext): Promise<SpaceSelectionItem[]> {
  const sdk = await createAlkemioSdk(auth);

  const { data } = await sdk.SpacesForSelector();
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
      visibility: space.about.isContentPublic ? 'PUBLIC' : 'PRIVATE',
      status: space.visibility,
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

/** The partial-response shape graphql-request attaches to a thrown ClientError. */
interface PartialGraphqlError {
  response?: {
    data?: unknown;
    errors?: Array<{ message: string; path?: Array<string | number>; extensions?: { code?: string } }>;
  };
}

/** True when any of a ClientError's GraphQL errors is an Alkemio authorization refusal. */
export function hasForbiddenError(err: unknown): boolean {
  const errors = (err as PartialGraphqlError)?.response?.errors ?? [];
  return errors.some((e) => /^FORBIDDEN/.test(e.extensions?.code ?? ''));
}

/**
 * Result of {@link fetchSpaceByName}. `forbidden` is set when the Space came back null
 * because the caller lacks READ on it (a private Space they are not a member of) rather
 * than because it does not exist — the caller can then degrade to an about-only fetch.
 */
export interface SpaceByNameFetch {
  data: SpaceByNameQuery;
  forbidden: boolean;
}

/**
 * Fetches a specific space by nameID with full hierarchy and community data.
 * Returns the typed query result for the transformer.
 *
 * The Alkemio API may return partial errors when the user lacks permission on
 * nested subspaces (FORBIDDEN_POLICY). We catch these and return whatever data
 * is available, logging a warning for the skipped parts.
 *
 * When the refusal is on the Space ITSELF — `community` / `account` are READ-guarded
 * and non-nullable, so a non-member of a private Space gets `space: null` — the result
 * is flagged `forbidden` so {@link fetchSpaceAboutOnlyByName} can still place it.
 */
export async function fetchSpaceByName(sdk: Sdk, nameId: string): Promise<SpaceByNameFetch> {
  try {
    const { data } = await sdk.spaceByName({ nameId });
    return { data, forbidden: false };
  } catch (err: unknown) {
    // graphql-request throws ClientError which contains the partial response
    const clientErr = err as PartialGraphqlError;
    if (clientErr.response?.data) {
      const data = clientErr.response.data as SpaceByNameQuery;
      const forbidden = !data.lookupByName?.space && hasForbiddenError(err);
      // A refusal on the Space itself is the expected, handled case (the caller degrades
      // to about-only and logs that once) — only unexpected partial errors deserve a warn.
      const level = forbidden ? 'debug' : 'warn';
      for (const e of clientErr.response.errors ?? []) {
        getLogger()[level](
          `Partial auth error fetching space "${nameId}": ${e.message} (path: ${e.path?.join('.')})`,
          { context: 'Spaces' },
        );
      }
      return { data, forbidden };
    }
    throw err;
  }
}

/** A Space fetched with READ_ABOUT only: no community, no subspaces, no account. */
export type RawSpaceAboutOnly = NonNullable<SpaceAboutOnlyByNameQuery['lookupByName']['space']>;

/**
 * Degraded fetch for a Space the caller may READ_ABOUT but not READ. Everything the
 * dashboards need to count and place a Space (name, classifications, tags, location,
 * visuals) lives under `about`, which READ_ABOUT grants; members and subspaces do not
 * exist for this caller and the node is marked restricted downstream. Returns null when
 * even the About is refused or the Space does not exist.
 */
export async function fetchSpaceAboutOnlyByName(
  sdk: Sdk,
  nameId: string,
): Promise<RawSpaceAboutOnly | null> {
  try {
    const { data } = await sdk.SpaceAboutOnlyByName({ nameId });
    return data.lookupByName.space ?? null;
  } catch (err: unknown) {
    const clientErr = err as PartialGraphqlError;
    if (clientErr.response?.data) {
      for (const e of clientErr.response.errors ?? []) {
        getLogger().warn(
          `About-only fetch of space "${nameId}" refused: ${e.message} (path: ${e.path?.join('.')})`,
          { context: 'Spaces' },
        );
      }
      return null;
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

/** Result type for fetchSubspaceDetails */
export type SubspaceDetailsResult = NonNullable<SubspaceDetailsQuery['lookup']['space']>;

/**
 * Fetches community data and child subspaces for a single subspace by ID.
 * Combines what was previously two separate queries (community + children)
 * into a single request. Returns null if the fetch fails.
 * Errors are logged and collected (not thrown).
 */
export async function fetchSubspaceDetails(
  sdk: Sdk,
  spaceId: string,
  errors: string[],
): Promise<SubspaceDetailsResult | null> {
  const logger = getLogger();
  try {
    logger.info(`Fetching details (community + children) for subspace ${spaceId}`, { context: 'Spaces' });
    const { data } = await sdk.subspaceDetails({ spaceId });
    const space = data.lookup.space;
    if (!space) {
      const msg = `Subspace not found for ID: ${spaceId}`;
      logger.error(msg, { context: 'Spaces' });
      errors.push(msg);
      return null;
    }
    return space;
  } catch (err: unknown) {
    const msg = `Failed to fetch details for subspace ${spaceId}: ${(err as Error).message}`;
    logger.error(msg, { context: 'Spaces' });
    errors.push(msg);
    return null;
  }
}

/** Extract the space type from the codegen-generated SpaceByNameQuery */
type SpaceByNameResult = NonNullable<SpaceByNameQuery['lookupByName']['space']>;

/** Raw space shape — derived from the codegen types */
export type RawSpace = SpaceByNameResult;
