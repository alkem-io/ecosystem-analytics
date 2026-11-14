import type { AuthContext } from '../auth/middleware.js';
import { isAlkemioAuthError } from '../graphql/client.js';
import { parseGateRef } from '../access/policy.js';
import { loadConfig } from '../config.js';
import { getScope } from '../settings/store.js';
import type { IncludedSpaceProblem, SpaceCandidate } from '../types/admin.js';
import { adminSdkFor, lookupSpaceByName, mapLimit, type AdminSdk } from './space-lookup.js';

/** A refusal the router turns into its status code. */
export class AdminRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const includedSet = () => new Set(getScope().spaceNameIds);

/**
 * `GET /api/vng/admin/space-search?q=` (research R14): Alkemio search with the manager's
 * token, top-level Spaces only (`SPACE`, never `SUBSPACE`), at most 20.
 */
export async function searchSpaces(auth: AuthContext, q: string, sdk?: AdminSdk): Promise<SpaceCandidate[]> {
  const text = (q ?? '').trim();
  if (text.length < 2) throw new AdminRequestError(422, 'QUERY_TOO_SHORT');
  const terms = text.split(/\s+/).filter(Boolean).slice(0, 5);
  const client = sdk ?? (await adminSdkFor(auth));
  const res = await client.AdminSpaceSearch({ terms });
  const included = includedSet();
  const seen = new Set<string>();
  const out: SpaceCandidate[] = [];
  for (const result of res.data.search.spaceResults.results) {
    const space = (result as { space?: { nameID: string; level: string; about?: { profile?: { displayName?: string; url?: string } } } }).space;
    if (!space || space.level !== 'L0' || seen.has(space.nameID)) continue;
    seen.add(space.nameID);
    out.push({
      nameId: space.nameID,
      displayName: space.about?.profile?.displayName || space.nameID,
      url: space.about?.profile?.url || '',
      included: included.has(space.nameID),
    });
  }
  return out.slice(0, 20);
}

/**
 * Resolve a pasted Alkemio link or nameID to a top-level Space the manager can read
 * (research R14). Not found and not readable are deliberately the same answer.
 */
export async function resolveSpaceRef(auth: AuthContext, ref: string, sdk?: AdminSdk): Promise<SpaceCandidate> {
  let path: string[];
  try {
    const parsed = parseGateRef(String(ref ?? ''));
    if (!parsed) throw new Error('none');
    path = parsed.path;
  } catch {
    throw new AdminRequestError(422, 'UNPARSEABLE');
  }
  if (path.length > 1) throw new AdminRequestError(422, 'NOT_TOP_LEVEL');
  const client = sdk ?? (await adminSdkFor(auth));
  const found = await lookupSpaceByName(client, path[0]);
  if (found.status !== 'ok') throw new AdminRequestError(404, 'NOT_READABLE');
  if (found.space.level !== 'L0') throw new AdminRequestError(422, 'NOT_TOP_LEVEL');
  return {
    nameId: found.space.nameId,
    displayName: found.space.displayName,
    url: found.space.url ?? '',
    included: includedSet().has(found.space.nameId),
  };
}

/**
 * Check a proposed Included Spaces list (FR-016, FR-017): no duplicates, within the limit,
 * and every ADDED Space re-resolved with the manager's token as a readable top-level
 * Space — so a forged request cannot add a Space the manager cannot see. Spaces already in
 * the set are not re-checked: a manager may keep or remove one they can no longer read.
 */
export async function validateIncludedSpaces(
  auth: AuthContext,
  current: readonly string[],
  next: readonly string[],
  sdk?: AdminSdk,
): Promise<Array<{ nameId: string; problem: IncludedSpaceProblem }>> {
  const problems: Array<{ nameId: string; problem: IncludedSpaceProblem }> = [];
  const seen = new Set<string>();
  for (const nameId of next) {
    if (seen.has(nameId)) problems.push({ nameId, problem: 'DUPLICATE' });
    seen.add(nameId);
  }
  const max = loadConfig().maxSpacesPerRequest;
  if (seen.size > max) problems.push({ nameId: next[max] ?? '', problem: 'TOO_MANY' });

  const before = new Set(current);
  const added = [...seen].filter((n) => !before.has(n));
  if (added.length) {
    const client = sdk ?? (await adminSdkFor(auth));
    const checks = await mapLimit(added, 5, async (nameId) => {
      try {
        return { nameId, result: await lookupSpaceByName(client, nameId) };
      } catch (err) {
        if (isAlkemioAuthError(err)) throw err;
        throw new AdminRequestError(502, 'LOOKUP_FAILED');
      }
    });
    for (const { nameId, result } of checks) {
      if (result.status !== 'ok') problems.push({ nameId, problem: 'NOT_READABLE' });
      else if (result.space.level !== 'L0' || result.space.nameId !== nameId) {
        problems.push({ nameId, problem: 'NOT_TOP_LEVEL' });
      }
    }
  }
  return problems;
}
