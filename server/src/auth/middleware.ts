import { Request, Response, NextFunction } from 'express';

/** Auth mode: bearer token (manual login) or cookie (SSO session) */
export type AuthMode = 'bearer' | 'cookie';

/** Auth context attached to each authenticated request */
export interface AuthContext {
  /** How the user authenticated */
  mode: AuthMode;
  /** The raw Alkemio-issued bearer token, forwarded to the GraphQL API */
  bearerToken: string;
  /** User ID resolved via Alkemio /me query (populated by resolveUser middleware) */
  userId?: string;
  /** Display name resolved via Alkemio /me query */
  userDisplayName?: string;
}

/** Extend Express Request with auth context */
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Auth middleware — extracts the Alkemio-issued bearer token from the
 * Authorization header and attaches it to req.auth. The BFF does NOT
 * validate or decode the token; Alkemio's GraphQL API does that.
 */
/**
 * SSO cookie tokens are prefixed with this marker so the BFF can distinguish
 * them from regular Kratos session tokens and use cookie-based auth against
 * the interactive GraphQL endpoint.
 */
export const SSO_COOKIE_PREFIX = 'sso-cookie:';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' });
    return;
  }

  const bearerToken = authHeader.slice(7);
  if (!bearerToken) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Empty bearer token' });
    return;
  }

  if (bearerToken.startsWith(SSO_COOKIE_PREFIX)) {
    req.auth = { mode: 'cookie', bearerToken: bearerToken.slice(SSO_COOKIE_PREFIX.length) };
  } else {
    req.auth = { mode: 'bearer', bearerToken };
  }
  next();
}
