import { Request, Response } from 'express';
import type { UserProfile } from '../types/api.js';

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile from the session token.
 */
export function meHandler(req: Request, res: Response) {
  if (!req.auth) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }

  const profile: UserProfile = {
    id: req.auth.userId,
    displayName: req.auth.displayName,
    avatarUrl: null, // Avatar is fetched from Alkemio GraphQL when needed
  };

  res.json(profile);
}
