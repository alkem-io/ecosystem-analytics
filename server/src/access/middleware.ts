import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  resolveSession,
  SESSION_COOKIE,
  destroySession,
  clearCookieOptions,
} from '../auth/session.js';
import type { AuthContext } from '../auth/middleware.js';
import { isAlkemioAuthError } from '../graphql/client.js';
import { getLogger } from '../logging/logger.js';
import type { AccessDeniedBody } from '../types/access.js';
import { decide, policyFor } from './access-service.js';
import { admits, type AccessPolicy, type AppId } from './policy.js';
import { appsForRequest } from './request-apps.js';

/**
 * Paths a signed-in person must reach whatever their access (FR-010): sign in, sign
 * out, identity + access report, "check again" — plus the public probes.
 */
const EXEMPT = [/^\/api\/auth(\/|$)/, /^\/api\/health$/, /^\/api\/features$/, /^\/api\/meta(\/|$)/];

const isExempt = (path: string) => !path.startsWith('/api/') || EXEMPT.some((re) => re.test(path));

/**
 * The session behind the request's cookie — read only; `authMiddleware` still owns
 * touching it and answering 401. `null` when there is no usable session.
 */
function sessionAuth(req: Request): AuthContext | null {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId || typeof sessionId !== 'string') return null;
  const session = resolveSession(sessionId);
  if (!session) return null;
  return { session, userId: session.userId, displayName: session.displayName ?? undefined };
}

/**
 * Check `policies` in order against the person's (held or fresh) decision. Resolves to
 * `null` when every policy admits, else the 403 body for the first one that does not.
 * An Alkemio auth error propagates.
 */
async function firstRefusal(
  auth: AuthContext,
  policies: AccessPolicy[],
  opts: { force?: boolean } = {},
): Promise<AccessDeniedBody | null> {
  for (const policy of policies) {
    if (policy.gate === null) continue;
    const outcome = await decide(auth, policy.app, opts);
    if (outcome === 'unverified') {
      return {
        error: 'ACCESS_DENIED',
        reason: 'unverified',
        app: policy.app,
        message: 'Access could not be verified',
      };
    }
    if (!admits(policy, outcome)) {
      return {
        error: 'ACCESS_DENIED',
        reason: 'none',
        app: policy.app,
        message: 'No access to this application',
      };
    }
  }
  return null;
}

/** Answer a refusal: 403 with the contract body, logged without any secret (FR-019). */
function refuse(req: Request, res: Response, auth: AuthContext, body: AccessDeniedBody): void {
  getLogger().info(
    `refused ${req.method} ${req.path} for user ${auth.userId}: app=${body.app} reason=${body.reason}`,
    { context: 'Access' },
  );
  res.status(403).json(body);
}

/** Same invalidation as `invalidateAndReject`, for a session Alkemio no longer accepts. */
function rejectSession(res: Response, auth: AuthContext): void {
  destroySession(auth.session.sessionId);
  res.clearCookie(SESSION_COOKIE, clearCookieOptions());
  res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired' });
}

/**
 * The application-level gate (research R8), mounted in `createApp` before every
 * router so no route can forget it (FR-009). For each request with a usable session,
 * every application the request belongs to (its listener plus any it names) must
 * admit the person; otherwise 403 `ACCESS_DENIED` — before any handler or cache read
 * (FR-011), and before an SSE stream could open. No session → straight through, so
 * the route's own `authMiddleware` answers 401 exactly as before.
 */
export const accessGate: RequestHandler = (req, res, next) => {
  if (isExempt(req.path)) return next();
  const auth = sessionAuth(req);
  if (!auth) return next();

  const apps = appsForRequest(res.locals.appId as AppId, req);
  firstRefusal(auth, apps.map(policyFor))
    .then((refusal) => (refusal ? refuse(req, res, auth, refusal) : next()))
    .catch((err) => (isAlkemioAuthError(err) ? rejectSession(res, auth) : next(err)));
};

/**
 * Require a level of an application's access on one router or route — the management area
 * declares `requireAccess({ app: 'vng', required: 'manage' })` and gets the same sets, the
 * same held decision, the same "check again" and the same refusal shape as the
 * application gate (026 FR-018, FR-018b). Mount it after `authMiddleware`. A decision
 * records a LEVEL, so the held decision answers a Manage requirement without asking
 * Alkemio again.
 *
 * `fresh: true` (feature 027, research R4) re-determines the level from Alkemio before
 * comparing — for writes, so a manager whose ADMIN role was removed is refused at once
 * (FR-009). The fresh decision replaces the held one.
 *
 * On an ungated application every signed-in person passes a Read requirement, but nobody
 * passes Manage: an ungated app has no admin Spaces, so nobody can be a manager.
 */
export function requireAccess(need: {
  app: AppId;
  required: 'read' | 'manage';
  fresh?: boolean;
}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth ?? sessionAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }
    const base = policyFor(need.app);
    if (base.gate === null) {
      if (need.required === 'read') return next();
      refuse(req, res, auth, {
        error: 'ACCESS_DENIED',
        reason: 'none',
        app: need.app,
        message: 'No access to this application',
      });
      return;
    }
    const policy: AccessPolicy = { app: need.app, gate: base.gate, required: need.required };
    firstRefusal(auth, [policy], { force: need.fresh === true })
      .then((refusal) => (refusal ? refuse(req, res, auth, refusal) : next()))
      .catch((err) => (isAlkemioAuthError(err) ? rejectSession(res, auth) : next(err)));
  };
}
