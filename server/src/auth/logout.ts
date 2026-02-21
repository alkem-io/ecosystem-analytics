import { Request, Response } from 'express';

/**
 * POST /api/auth/logout
 * Clears the auth session. The frontend discards the in-memory token.
 */
export function logoutHandler(_req: Request, res: Response) {
  // Token is stateless (base64-encoded payload held in frontend memory).
  // Server-side logout is a no-op — the frontend simply discards the token.
  // In a production system with a session store, we'd invalidate the session here.
  res.json({ message: 'Logged out successfully' });
}
