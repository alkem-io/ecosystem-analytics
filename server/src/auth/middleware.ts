import { Request, Response, NextFunction } from 'express';
import type { SessionRecord } from '../cache/session-store.js';
import {
  resolveSession,
  touchSession,
  destroySession,
  SESSION_COOKIE,
  clearCookieOptions,
} from './session.js';

/**
 * Auth context attached to each authenticated request. Identity is sourced from
 * EA's own server-side session (the browser only holds an opaque cookie); no
 * token ever reaches the client.
 */
export interface AuthContext {
  /** The validated server-side session row (holds encrypted tokens). */
  session: SessionRecord;
  /** Stable Alkemio identity (`alkemio_actor_id`) — the cache scoping key. */
  userId: string;
  /** Display name for personalization (FR-011). */
  displayName?: string;
}

/** Extend Express Request with auth context */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Resolve the session from the `ea_session` cookie (was `Authorization: Bearer`).
 * A missing/expired/idle session yields `401`; the stale cookie is cleared so the
 * SPA routes cleanly to sign-in (FR-009). Activity refreshes `last_seen_at`,
 * feeding the idle timeout (FR-009a).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }

  const session = resolveSession(sessionId);
  if (!session) {
    res.clearCookie(SESSION_COOKIE, clearCookieOptions());
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    return;
  }

  touchSession(session.sessionId);
  req.auth = {
    session,
    userId: session.userId,
    displayName: session.displayName ?? undefined,
  };
  next();
}

/**
 * Invalidate the current session and respond `401` — used when an upstream
 * Alkemio call rejects auth in a way a refresh cannot fix (FR-009). Deletes the
 * server-side record, clears the cookie, and tells the SPA to re-authenticate.
 */
export function invalidateAndReject(req: Request, res: Response): void {
  if (req.auth?.session) destroySession(req.auth.session.sessionId);
  res.clearCookie(SESSION_COOKIE, clearCookieOptions());
  res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired' });
}
