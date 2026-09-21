import { createAlkemioSdk } from '../graphql/client.js';
import { getLogger } from '../logging/logger.js';
import type { AuthContext } from '../auth/middleware.js';

const logger = getLogger();

/**
 * Can THIS caller see this Space at all? (Feature 024, Constitution IV.)
 *
 * The ecosystem map's community preset is built from choices saved by every viewer, and
 * some of those viewers can read Spaces others cannot. Returning the winning nameID
 * blindly would leak the existence and name of a private Space to everyone who opens the
 * tab — which is precisely what "data MUST NOT leak across users" forbids. So the route
 * asks this question, with the CALLER's own token, before it puts a nameID in a response.
 *
 * `SpaceAboutOnlyByName` is the right probe: it is the READ_ABOUT-safe lookup the
 * dashboards already use for partially-visible Spaces, so "readable" here means the same
 * thing it means everywhere else in the app. A thrown error is not readable — never a
 * 500: a failed probe must cost the viewer a preset, not the whole tab.
 */

/** How long a probe result is trusted, in ms. Access changes are rare; tab mounts are not. */
const TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { readable: boolean; expires: number }>();

export function canReadSpaceCacheKey(userId: string, spaceNameId: string): string {
  return `${userId}\u0000${spaceNameId}`;
}

export async function canReadSpace(auth: AuthContext, spaceNameId: string): Promise<boolean> {
  const key = canReadSpaceCacheKey(auth.userId, spaceNameId);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.readable;

  let readable = false;
  try {
    const sdk = await createAlkemioSdk(auth);
    const res = await sdk.SpaceAboutOnlyByName({ nameId: spaceNameId });
    readable = Boolean(res.data?.lookupByName?.space?.id);
  } catch {
    // Not readable, not reachable, or not there — all the same answer here. No detail is
    // logged beyond the nameID, and nothing is re-thrown.
    logger.debug(`Space '${spaceNameId}' is not readable for this caller`, { context: 'Ecosystem' });
    readable = false;
  }

  cache.set(key, { readable, expires: now + TTL_MS });
  return readable;
}

/** Test seam — drops the memo so a probe result does not leak between cases. */
export function resetSpaceReadabilityCache(): void {
  cache.clear();
}
