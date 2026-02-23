import { Router } from 'express';
import { meHandler } from '../auth/me.js';
import { authMiddleware } from '../auth/middleware.js';

export const authRouter = Router();

// All auth routes require a valid Alkemio-issued bearer token
authRouter.get('/me', authMiddleware, meHandler);
