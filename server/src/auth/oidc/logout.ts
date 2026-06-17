import { Request, Response } from 'express';
import * as oidc from 'openid-client';
import { loadConfig } from '../../config.js';
import { getLogger } from '../../logging/logger.js';
import { getOidcConfiguration } from './client.js';
import { decrypt } from './crypto.js';
import { getSessionRecord } from '../../cache/session-store.js';
import { destroySession, SESSION_COOKIE, clearCookieOptions } from '../session.js';

function safeDecrypt(blob: Buffer, key: Buffer): string | null {
  try {
    const v = decrypt(blob, key);
    return v || null;
  } catch {
    return null;
  }
}

/**
 * POST /api/auth/logout — end the EA session (FR-012/FR-012a).
 *
 * Local-cleanup-first: delete the session record and clear the cookie before
 * any network call, so EA is guaranteed signed out even if revocation fails.
 * Then best-effort revoke the access + refresh tokens at Hydra. Always returns
 * `204` and is idempotent (no/invalid session also returns `204`). Public (not
 * behind authMiddleware) so an already-expired session can still be cleared.
 */
export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  res.clearCookie(SESSION_COOKIE, clearCookieOptions());

  if (sessionId && typeof sessionId === 'string') {
    const session = getSessionRecord(sessionId);
    if (session) {
      destroySession(session.sessionId);
      try {
        const key = loadConfig().session.encKey;
        const access = safeDecrypt(session.accessTokenEnc, key);
        const refresh = safeDecrypt(session.refreshTokenEnc, key);
        if (access || refresh) {
          const oidcConfig = await getOidcConfiguration();
          await Promise.allSettled([
            access
              ? oidc.tokenRevocation(oidcConfig, access, { token_type_hint: 'access_token' })
              : Promise.resolve(),
            refresh
              ? oidc.tokenRevocation(oidcConfig, refresh, { token_type_hint: 'refresh_token' })
              : Promise.resolve(),
          ]);
        }
      } catch (err) {
        getLogger().warn(`Best-effort token revocation failed: ${(err as Error).message}`, {
          context: 'OIDC',
        });
      }
    }
  }

  res.status(204).end();
}
