import { Request, Response } from 'express';

/**
 * GET /api/auth/me — returns the current signed-in identity straight from the
 * server-side session (FR-011). Never echoes tokens. Session-protected: runs
 * behind {@link authMiddleware}, so `req.auth` is present here.
 */
export function meHandler(req: Request, res: Response): void {
  if (!req.auth) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  res.json({
    userId: req.auth.userId,
    displayName: req.auth.displayName ?? 'Unknown',
    avatarUrl: req.auth.session.avatarUrl,
  });
}
