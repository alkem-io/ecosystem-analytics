import { Request, Response } from 'express';
import * as oidc from 'openid-client';
import { loadConfig } from '../../config.js';
import { getLogger } from '../../logging/logger.js';
import { getOidcConfiguration } from './client.js';
import { consumeAuthTx } from '../../cache/session-store.js';
import { timingSafeEqualStr } from './crypto.js';
import {
  createSession,
  SESSION_COOKIE,
  PREAUTH_COOKIE,
  sessionCookieOptions,
  clearCookieOptions,
} from '../session.js';

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
 * GET /api/auth/oidc/callback — complete sign-in.
 *
 * Order matters: a Hydra `error` is a clean "sign in to continue" (no loop);
 * a missing/forged/replayed pre-auth or `state` is a hard `400` with no session
 * (FR-013); a successful exchange whose identity lacks `alkemio_actor_id` routes
 * to `/not-authorized` (FR-015); otherwise an EA session is created and the
 * visitor is sent to their validated `returnTo`.
 */
export async function callbackHandler(req: Request, res: Response): Promise<void> {
  const config = loadConfig();
  const clearOpts = clearCookieOptions();

  // 1. Provider returned an error (user cancelled / consent denied). No loop.
  if (typeof req.query.error === 'string') {
    res.clearCookie(PREAUTH_COOKIE, clearOpts);
    getLogger().info(`OIDC callback returned provider error: ${req.query.error}`, {
      context: 'OIDC',
    });
    res.redirect('/login?error=cancelled');
    return;
  }

  // 2. Pre-auth cookie → single-use transaction lookup (replay defense).
  const txId = req.cookies?.[PREAUTH_COOKIE];
  res.clearCookie(PREAUTH_COOKIE, clearOpts);
  if (!txId || typeof txId !== 'string') {
    reject(res, 'Missing pre-auth context');
    return;
  }
  const tx = consumeAuthTx(txId);
  if (!tx) {
    reject(res, 'Unknown or already-used sign-in request');
    return;
  }
  if (tx.expiresAt < Date.now()) {
    reject(res, 'Sign-in request expired');
    return;
  }

  // 3. Timing-safe anti-forgery state comparison (FR-013).
  const returnedState = typeof req.query.state === 'string' ? req.query.state : '';
  if (!timingSafeEqualStr(returnedState, tx.state)) {
    reject(res, 'State mismatch');
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
