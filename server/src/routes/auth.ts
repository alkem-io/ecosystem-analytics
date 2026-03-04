import { Router } from 'express';
import { loginHandler } from '../auth/login.js';
import { meHandler } from '../auth/me.js';
import { ssoConfigHandler } from '../auth/sso.js';
import { authMiddleware } from '../auth/middleware.js';

export const authRouter = Router();

// Public — authenticate via Kratos API flow
authRouter.post('/login', loginHandler);

// Public — return Kratos whoami URL for frontend-side SSO detection
authRouter.get('/sso/config', ssoConfigHandler);

// Protected — requires valid Alkemio bearer token
authRouter.get('/me', authMiddleware, meHandler);
