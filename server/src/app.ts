import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { authRouter } from './routes/auth.js';
import { spacesRouter } from './routes/spaces.js';
import { graphRouter } from './routes/graph.js';
import { imageProxyRouter } from './routes/image-proxy.js';
import { queryRouter } from './routes/query.js';
import { hubsRouter } from './routes/hubs.js';
import { vngRouter } from './routes/vng.js';
import { loadConfig } from './config.js';
import { getLogger } from './logging/logger.js';
import type { ApiError } from './types/api.js';

export function createApp() {
  const app = express();
  const config = loadConfig();

  // Middleware — CORS is restricted to the configured deployment origin(s)
  // (no longer `origin: true`). Same-origin requests (no Origin header) and
  // requests from an allow-listed origin are permitted with credentials so the
  // browser sends the httpOnly `ea_session` cookie.
  const allowedOrigins = config.session.allowedOrigins;
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin / non-browser requests carry no Origin header → allow.
        // A cross-origin request is allowed ONLY if explicitly allow-listed.
        // An empty allow-list therefore denies all cross-origin requests — it is
        // never treated as a wildcard (which, with credentials:true, would leak
        // the session cookie to any site).
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/spaces', spacesRouter);
  app.use('/api/graph', graphRouter);
  app.use('/api/image-proxy', imageProxyRouter);
  app.use('/api/query', queryRouter);
  app.use('/api/hubs', hubsRouter);
  app.use('/api/vng', vngRouter);

  // Feature flags + environment info (public, no auth required).
  // `alkemioServerUrl` lets the login screens display which environment they
  // connect to (user feedback) — shown before sign-in, so it must be public.
  app.get('/api/features', (_req, res) => {
    const config = loadConfig();
    res.json({
      aiQueryEnabled: config.features.aiQueryEnabled,
      alkemioServerUrl: config.alkemioServerUrl,
    });
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Serve frontend static files in production
  if (process.env.NODE_ENV === 'production') {
    const frontendDist = path.resolve(import.meta.dirname, '../frontend/dist');
    app.use(express.static(frontendDist));
    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  // Error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      getLogger().error(`Unhandled error: ${err.message}`, { context: 'App' });
      const body: ApiError = {
        error: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      };
      res.status(500).json(body);
    },
  );

  return app;
}
