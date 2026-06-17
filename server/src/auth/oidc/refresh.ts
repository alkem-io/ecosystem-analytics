import * as oidc from 'openid-client';
import { loadConfig } from '../../config.js';
import { getLogger } from '../../logging/logger.js';
import { getOidcConfiguration } from './client.js';
import { encrypt, decrypt } from './crypto.js';
import {
  getSessionRecord,
  updateSessionTokens,
  type SessionRecord,
} from '../../cache/session-store.js';

/** Refresh this many ms before the access token actually expires. */
const REFRESH_SKEW_MS = 30_000;
/** Fallback refresh-grant lifetime when the response omits `refresh_expires_in`. */
const DEFAULT_REFRESH_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Transparent access-token refresh (FR-008). When the stored access token is
 * at/near expiry but the refresh grant is still valid, perform the
 * `refresh_token` grant, persist the **rotated** tokens (newest refresh token
 * always overwrites the old one), and return the updated session record.
 *
 * Any failure (no/expired refresh grant, network error) returns the session
 * unchanged — the caller's upstream Alkemio call will then 401, which drives
 * re-authentication / session invalidation (FR-009, handled in US4).
 */
export async function ensureFreshAccessToken(
  session: SessionRecord,
  now = Date.now(),
): Promise<SessionRecord> {
  // Still fresh enough → use as-is.
  if (now < session.accessExpiresAt - REFRESH_SKEW_MS) return session;
  // Refresh grant gone → cannot refresh.
  if (now >= session.refreshExpiresAt) return session;

  const key = loadConfig().session.encKey;
  let refreshToken: string;
  try {
    refreshToken = decrypt(session.refreshTokenEnc, key);
  } catch {
    return session;
  }
  if (!refreshToken) return session;

  try {
    const oidcConfig = await getOidcConfiguration();
    const tokens = await oidc.refreshTokenGrant(oidcConfig, refreshToken);
    const raw = tokens as unknown as Record<string, unknown>;

    const accessExpiresAt =
      typeof tokens.expires_in === 'number'
        ? now + tokens.expires_in * 1000
        : session.accessExpiresAt;
    // Rotation: persist the new refresh token if one was issued, else keep current.
    const newRefreshToken = tokens.refresh_token ?? refreshToken;
    const refreshExpiresAt =
      typeof raw.refresh_expires_in === 'number'
        ? now + (raw.refresh_expires_in as number) * 1000
        : now + DEFAULT_REFRESH_LIFETIME_MS;

    updateSessionTokens(session.sessionId, {
      accessTokenEnc: encrypt(tokens.access_token, key),
      refreshTokenEnc: encrypt(newRefreshToken, key),
      accessExpiresAt,
      refreshExpiresAt,
    });

    return getSessionRecord(session.sessionId) ?? session;
  } catch (err) {
    getLogger().warn(`Token refresh failed: ${(err as Error).message}`, { context: 'OIDC' });
    return session;
  }
}
