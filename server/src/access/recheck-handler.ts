import type { Request, Response } from 'express';
import { invalidateAndReject } from '../auth/middleware.js';
import { isAlkemioAuthError } from '../graphql/client.js';
import type { AccessReport } from '../types/access.js';
import { report } from './access-service.js';
import type { AppId } from './policy.js';

/** One re-determination per session per application per window (contracts §2). */
export const RECHECK_WINDOW_MS = 5_000;
const lastRecheck = new Map<string, number>();

/** Test helper. */
export function resetRecheckWindow(): void {
  lastRecheck.clear();
}

/**
 * POST /api/auth/access/recheck — "check again" (feature 026, US3). Discards the held
 * decision for the listener's application and asks Alkemio again, so a person admitted
 * on Alkemio a moment ago gets in without signing in again (SC-005). Behind
 * `authMiddleware`; exempt from the gate. A repeat within the window answers with the
 * held report instead of asking Alkemio again.
 */
export async function recheckHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth!;
  const app = res.locals.appId as AppId;
  const key = `${auth.session.sessionId}\u0000${app}`;
  const now = Date.now();
  const force = now - (lastRecheck.get(key) ?? 0) >= RECHECK_WINDOW_MS;
  if (force) {
    // Entries only matter inside the window; keep the map from growing with sessions.
    if (lastRecheck.size > 1_000) {
      for (const [k, at] of lastRecheck) if (now - at >= RECHECK_WINDOW_MS) lastRecheck.delete(k);
    }
    lastRecheck.set(key, now);
  }

  let access: AccessReport;
  try {
    access = await report(auth, app, { force });
  } catch (err) {
    if (isAlkemioAuthError(err)) {
      invalidateAndReject(req, res);
      return;
    }
    throw err;
  }
  res.json({ access });
}
