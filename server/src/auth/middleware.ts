import { Request, Response, NextFunction } from 'express';

/** Decoded session from the bearer token */
export interface AuthSession {
  userId: string;
  email: string;
  displayName: string;
  kratosCookies: string;
  expiresAt: number;
}

/** Extend Express Request with auth session */
declare global {
  namespace Express {
    interface Request {
      auth?: AuthSession;
    }
  }
}

/**
 * Auth middleware — validates the bearer token and attaches the session to req.auth.
 * Tokens that are expired or malformed result in 401.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf-8'),
    ) as AuthSession;

    if (!payload.userId || !payload.expiresAt) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid token payload' });
      return;
    }

    if (payload.expiresAt < Date.now()) {
      res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'Session has expired, please log in again' });
      return;
    }

    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid token' });
  }
}
