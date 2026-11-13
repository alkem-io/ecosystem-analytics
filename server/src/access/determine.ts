import type { AuthContext } from '../auth/middleware.js';
import { createAlkemioSdk, isAlkemioAuthError } from '../graphql/client.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import { levelFromRoles, type AccessLevel, type GateRef } from './policy.js';

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

/**
 * Ask Alkemio, as the person, which roles they hold in the gate Space's community, and
 * turn the answer into an outcome (research R7):
 *
 * | Alkemio's answer                                         | Outcome              |
 * |----------------------------------------------------------|----------------------|
 * | roles                                                    | none / read / manage |
 * | gate null, or FORBIDDEN / NOT_FOUND, probe found the gate | none                 |
 * | the same, probe never confirmed the gate                 | unverified           |
 * | an auth error (expired / invalid session)                | rethrown             |
 * | network, timeout, 5xx, anything else                     | unverified           |
 *
 * A refusal is classified BEFORE the auth-error check: Alkemio refuses a non-member
 * with an error that must never be mistaken for an expired session, or a refused
 * person would be bounced round the sign-in loop (FR-015).
 */
export async function determineLevel(
  auth: AuthContext,
  gate: GateRef,
  gateExists: GateExistence,
  deps: DetermineDeps,
): Promise<DetermineOutcome> {
  const sdkFor = deps.sdkFor ?? ((a, timeoutMs) => createAlkemioSdk(a, { timeoutMs }));
  const cannotSee: DetermineOutcome = gateExists === 'yes' ? 'none' : 'unverified';

  try {
    const sdk = await sdkFor(auth, deps.timeoutMs);
    const node = await queryGate(sdk, gate);
    if (!node) return cannotSee;
    return levelFromRoles(node.community?.roleSet?.myRoles);
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
