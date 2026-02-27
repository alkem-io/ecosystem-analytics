import { Request, Response } from 'express';
import { createAlkemioSdk } from '../graphql/client.js';
import type { UserProfile } from '../types/api.js';

/**
 * GET /api/auth/me
 * Queries Alkemio's `me` endpoint using the forwarded bearer token
 * and returns the authenticated user's profile.
 */
export async function meHandler(req: Request, res: Response) {
  if (!req.auth?.bearerToken) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }

  try {
    const sdk = createAlkemioSdk(req.auth.bearerToken);
    const { data } = await sdk.me();
    const user = data.me.user;

    if (!user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Unable to resolve user identity' });
      return;
    }

    const profile: UserProfile = {
      id: user.id,
      displayName: user.profile?.displayName ?? 'Unknown',
      avatarUrl: null,
    };

    res.json(profile);
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}
