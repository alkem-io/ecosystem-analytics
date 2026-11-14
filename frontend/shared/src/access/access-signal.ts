import type { AccessDeniedBody } from '@server/types/access.js';

/**
 * Mid-session refusals (feature 026, FR-015). When any data request comes back
 * `403 ACCESS_DENIED`, the shell must switch to the "no access" (or "could not verify")
 * screen — never an error toast, never a sign-in redirect. A page fires many requests
 * in parallel, so the signal fires ONCE until the shell has handled it and calls
 * {@link resetAccessSignal}.
 */

export type AccessDeniedReason = AccessDeniedBody['reason'];

/** Thrown by the request helpers on a 403 ACCESS_DENIED, so callers stop quietly. */
export class AccessDeniedError extends Error {
  readonly reason: AccessDeniedReason;
  constructor(reason: AccessDeniedReason) {
    super(
      reason === 'unverified' ? 'Access could not be verified' : 'No access to this application',
    );
    this.name = 'AccessDeniedError';
    this.reason = reason;
  }
}

type Listener = (reason: AccessDeniedReason) => void;
const listeners = new Set<Listener>();
let signalled = false;

/** Tell the shell this page has been refused. Fires at most once until reset. */
export function signalAccessDenied(reason: AccessDeniedReason): void {
  if (signalled) return;
  signalled = true;
  for (const listener of listeners) listener(reason);
}

/** Subscribe to refusals; returns the unsubscribe function. */
export function onAccessDenied(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-arm the signal once access has been re-established (after "check again"). */
export function resetAccessSignal(): void {
  signalled = false;
}

/**
 * If `response` is a gate refusal, signal it and throw {@link AccessDeniedError};
 * otherwise return without consuming the body. Any other 403 is left to the caller.
 */
export async function throwIfAccessDenied(response: Response): Promise<void> {
  if (response.status !== 403) return;
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as Partial<AccessDeniedBody> | null;
  if (body?.error !== 'ACCESS_DENIED') return;
  const reason: AccessDeniedReason = body.reason === 'unverified' ? 'unverified' : 'none';
  signalAccessDenied(reason);
  throw new AccessDeniedError(reason);
}
