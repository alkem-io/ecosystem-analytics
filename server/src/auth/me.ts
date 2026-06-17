import { Request, Response } from 'express';
import { loadConfig } from '../config.js';
import { createAlkemioSdk, isAlkemioAuthError } from '../graphql/client.js';
import { invalidateAndReject } from './middleware.js';
import { getLogger } from '../logging/logger.js';

/**
 * GET /api/auth/me — returns the current signed-in identity plus the Alkemio
 * server the BFF is connected to (FR-011). Never echoes tokens.
 *
 * The display name and avatar are resolved from Alkemio's own profile via the
 * GraphQL `me` query (authorized with the session access token) rather than the
 * OIDC ID-token claims, which Hydra does not populate with `name`/`picture`.
 * On any non-auth failure we degrade gracefully to whatever the session holds.
 * Session-protected: runs behind {@link authMiddleware}, so `req.auth` is present.
 */
export async function meHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }

  const alkemioServerUrl = loadConfig().alkemioServerUrl;
  let displayName = req.auth.displayName ?? null;
  let avatarUrl = req.auth.session.avatarUrl;

  try {
    const sdk = await createAlkemioSdk(req.auth);
    const { data } = await sdk.me();
    const profile = data.me.user?.profile;
    if (profile?.displayName) displayName = profile.displayName;
    if (profile?.avatar?.uri) avatarUrl = profile.avatar.uri;
  } catch (err) {
    if (isAlkemioAuthError(err)) {
      invalidateAndReject(req, res);
      return;
    }
    getLogger().warn(`Failed to resolve identity from Alkemio me query: ${(err as Error).message}`, {
      context: 'Auth',
    });
  }

  res.json({
    userId: req.auth.userId,
    displayName: displayName ?? 'Unknown',
    avatarUrl,
    alkemioServerUrl,
  });
}
