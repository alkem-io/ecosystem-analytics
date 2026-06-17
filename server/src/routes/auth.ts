import { Router } from 'express';
import { loginHandler } from '../auth/oidc/login.js';
import { callbackHandler } from '../auth/oidc/callback.js';
import { logoutHandler } from '../auth/oidc/logout.js';
import { meHandler } from '../auth/me.js';
import { authMiddleware } from '../auth/middleware.js';

export const authRouter = Router();

// Public — begin redirect-based OIDC sign-in (302 to Alkemio/Hydra)
authRouter.get('/login', loginHandler);

// Public — OIDC redirect URI; completes sign-in and establishes the EA session
authRouter.get('/oidc/callback', callbackHandler);

// Protected — current signed-in identity (never echoes tokens)
authRouter.get('/me', authMiddleware, meHandler);

// Public + idempotent — end the EA session (delete record, best-effort token
// revocation). Reads the cookie itself so an already-expired session still clears.
authRouter.post('/logout', logoutHandler);
