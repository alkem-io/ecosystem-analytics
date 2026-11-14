import type { AuthContext } from '../auth/middleware.js';
import { createAlkemioSdk, isAlkemioAuthError } from '../graphql/client.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import { levelFromSets, type AccessLevel, type AccessSets, type GateRef } from './policy.js';

/** The slice of the typed SDK the per-person check uses. */
export type GateSdk = Pick<Sdk, 'accessGateL0' | 'accessGateL1' | 'accessGateL2'>;

/** The outcome of one check: a level, or "could not verify" (never held, FR-006/FR-007). */
export type DetermineOutcome = AccessLevel | 'unverified';

/** Whether the start-up probe confirmed the gate Space exists (research R6). */
export type GateExistence = 'yes' | 'no' | 'unknown';

export interface DetermineDeps {
  /** Build the person's SDK (injectable for tests). */
  sdkFor?: (auth: AuthContext, timeoutMs: number) => Promise<GateSdk>;
  timeoutMs: number;
}

interface GateNode {
  community?: { roleSet?: { myRoles?: readonly string[] | null } | null } | null;
}

/** One Space's answer: the roles held (possibly none), or "could not tell". */
type SpaceOutcome = { roles: readonly string[] } | 'unverified';

/**
 * Ask Alkemio, as the person, which roles they hold in each Space of the application's
 * two sets, and combine the answers into one outcome (feature 027, research R1).
 *
 * One role query per DISTINCT Space (a Space in both sets is asked once and yields both
 * roles), all in parallel under `timeoutMs`. Per Space (026 research R7):
 *
 * | Alkemio's answer                                          | Space outcome     |
 * |-----------------------------------------------------------|-------------------|
 * | roles                                                     | those roles       |
 * | Space null, or FORBIDDEN / NOT_FOUND, probe found it      | no roles          |
 * | the same, probe never confirmed the Space                 | unverified        |
 * | an auth error (expired / invalid session)                 | rethrown          |
 * | network, timeout, 5xx, anything else                      | unverified        |
 *
 * Combined: any proven MEMBER on a viewer Space or ADMIN on an admin Space admits, at the
 * highest level proven (`read` while an admin Space is unverified is `read`); every Space
 * answered with no admitting role is `none`; anything else is `unverified`.
 *
 * A refusal is classified BEFORE the auth-error check: Alkemio refuses a non-member
 * with an error that must never be mistaken for an expired session, or a refused
 * person would be bounced round the sign-in loop (FR-015).
 */
export async function determineLevel(
  auth: AuthContext,
  sets: Pick<AccessSets, 'viewers' | 'admins'>,
  existsFor: (key: string) => GateExistence,
  deps: DetermineDeps,
): Promise<DetermineOutcome> {
  const sdkFor = deps.sdkFor ?? ((a, timeoutMs) => createAlkemioSdk(a, { timeoutMs }));
  const spaces = new Map<string, GateRef>();
  for (const ref of [...sets.viewers, ...sets.admins]) spaces.set(ref.key, ref);

  let sdk: GateSdk;
  try {
    sdk = await sdkFor(auth, deps.timeoutMs);
  } catch {
    return 'unverified';
  }

  const keys = [...spaces.keys()];
  const settled = await Promise.allSettled(
    keys.map((key) => checkSpace(sdk, spaces.get(key)!, existsFor(key))),
  );
  // An expired session anywhere ends the whole check: the caller signs the person out.
  for (const r of settled) if (r.status === 'rejected') throw r.reason;

  const roles = new Map<string, readonly string[]>();
  let anyUnverified = false;
  settled.forEach((r, i) => {
    const outcome = (r as PromiseFulfilledResult<SpaceOutcome>).value;
    if (outcome === 'unverified') anyUnverified = true;
    else roles.set(keys[i], outcome.roles);
  });

  const level = levelFromSets(sets, roles);
  if (level !== 'none') return level;
  return anyUnverified ? 'unverified' : 'none';
}

/** One Space's role check. Rejects only with an Alkemio auth error. */
async function checkSpace(
  sdk: GateSdk,
  gate: GateRef,
  exists: GateExistence,
): Promise<SpaceOutcome> {
  const cannotSee: SpaceOutcome = exists === 'yes' ? { roles: [] } : 'unverified';
  try {
    const node = await queryGate(sdk, gate);
    if (!node) return cannotSee;
    return { roles: node.community?.roleSet?.myRoles ?? [] };
  } catch (err) {
    if (isRefusal(err)) return cannotSee;
    if (isAlkemioAuthError(err)) throw err;
    return 'unverified';
  }
}

/** Run the query for the gate's depth and return the gate Space node, if visible. */
async function queryGate(sdk: GateSdk, gate: GateRef): Promise<GateNode | null | undefined> {
  const [space, sub, subsub] = gate.path;
  switch (gate.path.length) {
    case 1:
      return (await sdk.accessGateL0({ space })).data.lookupByName.space;
    case 2:
      return (await sdk.accessGateL1({ space, sub })).data.lookupByName.space?.subspaceByNameID;
    case 3:
      return (await sdk.accessGateL2({ space, sub, subsub })).data.lookupByName.space
        ?.subspaceByNameID?.subspaceByNameID;
    default:
      throw new Error(`gate depth ${gate.path.length} is not supported`);
  }
}

/** Alkemio's way of saying "you may not see this Space" — not a session problem. */
function isRefusal(err: unknown): boolean {
  const response = (err as { response?: { status?: number; errors?: unknown[] } })?.response;
  if (!response || response.status === 401) return false;
  const errors = (response.errors ?? []) as Array<{
    message?: string;
    extensions?: { code?: string };
  }>;
  return errors.some(
    (e) =>
      /FORBIDDEN|NOT_FOUND/i.test(e?.extensions?.code ?? '') ||
      /does not have credentials|not found/i.test(e?.message ?? ''),
  );
}
