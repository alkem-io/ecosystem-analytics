import { Router } from 'express';
import { loginHandler } from '../auth/login.js';
import { meHandler } from '../auth/me.js';
import { ssoDetectHandler } from '../auth/sso.js';
import { authMiddleware } from '../auth/middleware.js';

export const authRouter = Router();

// Public — authenticate via Kratos API flow
authRouter.post('/login', loginHandler);

// Public — detect existing Alkemio/Kratos browser session
authRouter.post('/sso/detect', ssoDetectHandler);

// Protected — requires valid Alkemio bearer token
authRouter.get('/me', authMiddleware, meHandler);
