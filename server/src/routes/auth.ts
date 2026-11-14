import { Router } from 'express';
import { loginHandler } from '../auth/oidc/login.js';
import { callbackHandler } from '../auth/oidc/callback.js';
import { logoutHandler } from '../auth/oidc/logout.js';
import { meHandler } from '../auth/me.js';
import { authMiddleware } from '../auth/middleware.js';
import { recheckHandler } from '../access/recheck-handler.js';
import { publicSpacesHandler } from '../access/public-spaces-handler.js';

export const authRouter = Router();

// Public — begin redirect-based OIDC sign-in (302 to Alkemio/Hydra)
authRouter.get('/login', loginHandler);

// Public — OIDC redirect URI; completes sign-in and establishes the EA session
authRouter.get('/oidc/callback', callbackHandler);

// Protected — current signed-in identity (never echoes tokens)
authRouter.get('/me', authMiddleware, meHandler);

// Protected — "check again": re-decide this person's access to the listener's
// application from Alkemio now (feature 026). Reachable by a refused person (FR-010).
authRouter.post('/access/recheck', authMiddleware, recheckHandler);

// Feature 027 — PUBLIC: the viewer Spaces of this listener's application, for the sign-in
// screen. No session needed; nothing per person.
authRouter.get('/access/spaces', publicSpacesHandler);

// Public + idempotent — end the EA session (delete record, best-effort token
// revocation). Reads the cookie itself so an already-expired session still clears.
authRouter.post('/logout', logoutHandler);
