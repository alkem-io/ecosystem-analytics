import { Router } from 'express';
import { loginHandler } from '../auth/login.js';
import { callbackHandler } from '../auth/callback.js';
import { devLoginHandler } from '../auth/dev-login.js';
import { meHandler } from '../auth/me.js';
import { logoutHandler } from '../auth/logout.js';
import { authMiddleware } from '../auth/middleware.js';

export const authRouter = Router();

// Public routes (no auth required)
authRouter.get('/login', loginHandler);        // Production: SSO redirect
authRouter.get('/callback', callbackHandler);  // Production: SSO callback
authRouter.post('/dev-login', devLoginHandler); // Dev only: API flow (DEV_AUTH_BYPASS=true)

// Protected routes
authRouter.get('/me', authMiddleware, meHandler);
authRouter.post('/logout', authMiddleware, logoutHandler);
