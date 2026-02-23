import { Request, Response, NextFunction } from 'express';
import { createAlkemioSdk } from '../graphql/client.js';

/**
 * Middleware that resolves the authenticated user's ID by calling Alkemio's `me` query.
 * Must run after authMiddleware. Populates req.auth.userId.
 * Result is cached on the request object for the duration of the request.
 */
export async function resolveUser(req: Request, res: Response, next: NextFunction) {
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

    req.auth.userId = user.id;
    req.auth.userDisplayName = user.profile?.displayName;
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}
