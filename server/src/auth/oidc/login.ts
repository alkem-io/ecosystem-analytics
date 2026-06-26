import { Request, Response } from 'express';
import * as oidc from 'openid-client';
import { loadConfig } from '../../config.js';
import { getLogger } from '../../logging/logger.js';
import { getOidcConfiguration } from './client.js';
import { insertAuthTx } from '../../cache/session-store.js';
import { generateOpaqueId, PREAUTH_COOKIE, preauthCookieOptions } from '../session.js';

/** Where a visitor lands after sign-in when no (valid) returnTo is supplied. */
export const DEFAULT_RETURN_TO = '/spaces';

/**
 * Validate the requested post-login landing target against an open-redirect
 * allow-list (FR-013).
 *
 * Accepts EITHER:
 *  - a clean EA-internal SPA path (relative, `/…`), OR
 *  - an ABSOLUTE URL whose origin is in the trusted `allowedOrigins` list — this
 *    is what lets sign-in started from the VNG frontend (a different origin/port
 *    than the OIDC `redirect_uri`) land back on the VNG app rather than the
 *    Explorer (US5 cross-frontend auth). The two frontends share the `ea_session`
 *    cookie (parent-domain in prod; port-agnostic `localhost` in dev).
 *
 * Anything protocol-relative, API-targeted, cross-origin-but-not-allow-listed, or
 * malformed falls back to the default landing page.
 */
export function validateReturnTo(raw: unknown, allowedOrigins: string[] = []): string {
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_RETURN_TO;
  // Printable ASCII only — rejects control chars, spaces, and Unicode slash
  // look-alikes (e.g. U+FF0F) a downstream parser might normalize to '/'.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 0x21 || c > 0x7e) return DEFAULT_RETURN_TO;
  }
  if (raw.includes('\\')) return DEFAULT_RETURN_TO; // backslash tricks
  if (/%2f|%5c/i.test(raw)) return DEFAULT_RETURN_TO; // encoded slash/backslash smuggling

  // Absolute URL → accept only if its origin is explicitly allow-listed.
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (allowedOrigins.includes(u.origin) && !u.pathname.startsWith('/api')) {
        return raw;
      }
    } catch {
      /* fall through to default */
    }
    return DEFAULT_RETURN_TO;
  }

  // Otherwise must be a clean relative same-origin path.
  if (!raw.startsWith('/')) return DEFAULT_RETURN_TO;
  if (raw.startsWith('//')) return DEFAULT_RETURN_TO; // protocol-relative //host
  if (raw.startsWith('/api')) return DEFAULT_RETURN_TO; // SPA paths only, not the BFF
  try {
    const base = 'http://ea.internal';
    const resolved = new URL(raw, base);
    if (resolved.origin !== base) return DEFAULT_RETURN_TO;
    if (resolved.pathname.startsWith('//')) return DEFAULT_RETURN_TO;
  } catch {
    return DEFAULT_RETURN_TO;
  }
  return raw;
}

/**
 * Upgrade a RELATIVE returnTo (e.g. "/") to an ABSOLUTE URL on the originating
 * frontend's origin, taken from the request `Referer` and accepted only if that
 * origin is allow-listed.
 *
 * Why this is needed: the OIDC `redirect_uri` is a single fixed origin (the
 * Explorer), so Hydra always returns to that origin's callback. A relative
 * returnTo therefore resolves to the Explorer — meaning sign-in started on VNG
 * (:5174) or GovTech (:5175) would wrongly land on the Explorer (:5173). Making
 * the returnTo absolute (on the originating, allow-listed origin) lets the final
 * post-callback redirect cross back to the app the user actually started from.
 *
 * Absolute, missing, or non-relative returnTo is passed through unchanged; a
 * blank or non-allow-listed Referer leaves it relative (→ default landing).
 */
export function resolveReturnToOrigin(
  rawReturnTo: unknown,
  referer: string | string[] | undefined,
  allowedOrigins: string[] = [],
): unknown {
  // Only upgrade a clean relative path; leave absolute/protocol-relative/non-string alone.
  if (
    typeof rawReturnTo !== 'string' ||
    !rawReturnTo.startsWith('/') ||
    rawReturnTo.startsWith('//')
  ) {
    return rawReturnTo;
  }
  const refererStr = Array.isArray(referer) ? referer[0] : referer;
  if (!refererStr) return rawReturnTo;
  try {
    const origin = new URL(refererStr).origin;
    if (allowedOrigins.includes(origin)) return origin + rawReturnTo;
  } catch {
    /* malformed Referer → leave relative */
  }
  return rawReturnTo;
}

/**
 * GET /api/auth/login — begin the Authorization Code + PKCE flow.
 * Generates anti-forgery material, stashes it in a one-time pre-auth record,
 * sets the `ea_preauth` cookie, and 302-redirects to Hydra's authorization
 * endpoint. No secret/PKCE values are ever logged (FR-014).
 */
export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const config = loadConfig();
    const oidcConfig = await getOidcConfiguration();

    // Return the user to the frontend they STARTED from (VNG/GovTech/Explorer),
    // not the fixed redirect_uri origin: upgrade a relative returnTo to the
    // originating allow-listed origin (from Referer) before validation.
    const requestedReturnTo = resolveReturnToOrigin(
      req.query.returnTo,
      req.headers?.referer,
      config.session.allowedOrigins,
    );
    const returnTo = validateReturnTo(requestedReturnTo, config.session.allowedOrigins);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    const txId = generateOpaqueId();
    const now = Date.now();
    insertAuthTx({
      txId,
      state,
      nonce,
      codeVerifier,
      returnTo,
      createdAt: now,
      expiresAt: now + config.oidc.preauthTtlMinutes * 60 * 1000,
    });

    res.cookie(PREAUTH_COOKIE, txId, preauthCookieOptions());

    const parameters: Record<string, string> = {
      redirect_uri: config.oidc.redirectUri,
      scope: config.oidc.scopes,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    };
    if (config.oidc.audience) parameters.audience = config.oidc.audience;

    const authorizationUrl = oidc.buildAuthorizationUrl(oidcConfig, parameters);
    res.redirect(authorizationUrl.href);
  } catch (err) {
    getLogger().error(`Login initialization failed: ${(err as Error).message}`, { context: 'OIDC' });
    res.status(500).json({ error: 'CONFIG_ERROR', message: 'Unable to start sign-in' });
  }
}
