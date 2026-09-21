import { Request, Response } from 'express';
import * as oidc from 'openid-client';
import { loadConfig } from '../../config.js';
import { getLogger } from '../../logging/logger.js';
import { getOidcConfiguration } from './client.js';
import { consumeAuthTxByState } from '../../cache/session-store.js';
import { timingSafeEqualStr } from './crypto.js';
import { createSession, SESSION_COOKIE, PREAUTH_COOKIE, sessionCookieOptions } from '../session.js';

const DEFAULT_ACCESS_TTL_MS = 10 * 60 * 1000; // Hydra access token ~10 min

/** Subset of ID-token claims we consume. The `alkemio` scope emits `alkemio_actor_id`. */
interface IdClaims extends Record<string, unknown> {
  sub?: string;
  alkemio_actor_id?: string;
  name?: string;
  picture?: string;
}

function reject(res: Response, message: string): void {
  res.status(400).json({ error: 'INVALID_AUTH_RESPONSE', message });
}

/**
 * A sign-in response we cannot complete but that a legitimate visitor plausibly
 * produced (the browser went back/reloaded onto an already-used callback, the
 * pre-auth record or cookie timed out): no session, no raw error — a clean login
 * state that never re-prompts on its own (FR-009), so there is no loop.
 */
function expired(res: Response, reason: string): void {
  getLogger().info(`OIDC callback could not be completed: ${reason}`, { context: 'OIDC' });
  res.redirect('/login?error=expired');
}

/**
 * GET /api/auth/oidc/callback — complete sign-in.
 *
 * Order matters: a Hydra `error` is a clean "sign in to continue" (no loop);
 * an unknown, replayed or timed-out sign-in request lands on `/login?error=expired`
 * with no session; a pre-auth record that exists but is NOT bound to this browser
 * is a forged response and a hard `400` (FR-013); a successful exchange whose
 * identity lacks `alkemio_actor_id` routes to `/not-authorized` (FR-015);
 * otherwise an EA session is created and the visitor is sent to their validated
 * `returnTo`.
 *
 * The record is looked up by the `state` Hydra echoes back, and the `ea_preauth`
 * cookie is only COMPARED against it — never cleared. The cookie is domain-wide
 * and shared by every tab, so clearing it here (or looking the record up through
 * it) made concurrent sign-ins from one browser fail each other: when a deploy
 * invalidates every session, one page reload fires several 401s, each starting
 * its own flow.
 */
export async function callbackHandler(req: Request, res: Response): Promise<void> {
  const config = loadConfig();

  // 1. Provider returned an error (user cancelled / consent denied). No loop.
  if (typeof req.query.error === 'string') {
    getLogger().info(`OIDC callback returned provider error: ${req.query.error}`, {
      context: 'OIDC',
    });
    res.redirect('/login?error=cancelled');
    return;
  }

  // 2. `state` → single-use transaction lookup (replay defense).
  const returnedState = typeof req.query.state === 'string' ? req.query.state : '';
  if (!returnedState) {
    reject(res, 'Missing state');
    return;
  }
  const tx = consumeAuthTxByState(returnedState);
  if (!tx) {
    expired(res, 'unknown or already-used sign-in request');
    return;
  }
  if (tx.expiresAt < Date.now()) {
    expired(res, 'sign-in request expired');
    return;
  }

  // 3. The response must come from the browser that started this flow (FR-013).
  // A missing cookie means it outlived its own TTL; a different one is a forgery.
  const browserKey = req.cookies?.[PREAUTH_COOKIE];
  if (!browserKey || typeof browserKey !== 'string') {
    expired(res, 'pre-auth cookie absent');
    return;
  }
  if (!timingSafeEqualStr(browserKey, tx.browserKey)) {
    reject(res, 'Sign-in request is not bound to this browser');
    return;
  }

  try {
    const oidcConfig = await getOidcConfiguration();

    // Build the current callback URL (the library reads code/state and validates
    // iss/nonce/aud/exp against it). Base it on the configured redirect_uri so a
    // proxy-mangled host/proto cannot interfere.
    const currentUrl = new URL(config.oidc.redirectUri);
    const qIndex = req.originalUrl.indexOf('?');
    currentUrl.search = qIndex >= 0 ? req.originalUrl.slice(qIndex) : '';

    const tokens = await oidc.authorizationCodeGrant(oidcConfig, currentUrl, {
      pkceCodeVerifier: tx.codeVerifier,
      expectedState: tx.state,
      expectedNonce: tx.nonce,
    });

    const claims = tokens.claims() as IdClaims | undefined;
    const actorId = claims?.alkemio_actor_id;
    if (!actorId) {
      // Authenticated at Alkemio but not authorized for this client (FR-015).
      getLogger().info('Sign-in succeeded but `alkemio_actor_id` claim absent — not authorized', {
        context: 'OIDC',
      });
      res.redirect('/not-authorized');
      return;
    }

    const now = Date.now();
    const rawTokens = tokens as unknown as Record<string, unknown>;
    const accessExpiresAt =
      typeof tokens.expires_in === 'number' ? now + tokens.expires_in * 1000 : now + DEFAULT_ACCESS_TTL_MS;
    const refreshExpiresAt =
      typeof rawTokens.refresh_expires_in === 'number'
        ? now + (rawTokens.refresh_expires_in as number) * 1000
        : undefined; // session.ts defaults to +14d

    const session = createSession(
      {
        userId: actorId,
        displayName: typeof claims?.name === 'string' ? claims.name : null,
        avatarUrl: typeof claims?.picture === 'string' ? claims.picture : null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? '',
        accessExpiresAt,
        refreshExpiresAt,
      },
      now,
    );

    res.cookie(SESSION_COOKIE, session.sessionId, sessionCookieOptions());
    getLogger().info(`Session established for actor ${actorId}`, { context: 'OIDC' });
    res.redirect(tx.returnTo);
  } catch (err) {
    // Code-exchange / token-validation failure (Hydra error, clock skew, network,
    // misconfiguration). This is the failure a legitimate visitor is most likely to
    // hit, so surface it as a clean, informative login state (FR-009) rather than a
    // raw 400 JSON body. The specifics stay server-side; the client shows a generic
    // "sign-in couldn't be completed" message and never re-prompts for credentials.
    const e = err as { error?: string; error_description?: string };
    const detail = e.error ? ` (${e.error}: ${e.error_description ?? ''})` : '';
    getLogger().warn(`OIDC code exchange failed: ${(err as Error).message}${detail}`, {
      context: 'OIDC',
    });
    res.redirect('/login?error=failed');
  }
}
