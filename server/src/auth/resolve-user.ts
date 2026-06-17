import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../logging/logger.js';

/**
 * Confirms the authenticated identity is present on `req.auth` (populated by
 * {@link authMiddleware} from the server-side session). Identity now derives
 * from the session's ID-token claims (`alkemio_actor_id`) rather than a
 * per-request Alkemio `me()` call (FR-011), removing a GraphQL round-trip per
 * request.
 *
 * The cache scoping key (`user_id`) is this stable actor id; cache reads remain
 * owner-scoped by `user_id` (FR-010 / Constitution IV — access control verified
 * at read time in `cache/cache-service.ts`).
 */
export function resolveUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth?.userId) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  getLogger().debug(`Authenticated user: ${req.auth.userId}`, { context: 'Auth' });
  next();
}
