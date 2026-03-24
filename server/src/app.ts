import express from 'express';
import cors from 'cors';
import path from 'path';
import { authRouter } from './routes/auth.js';
import { spacesRouter } from './routes/spaces.js';
import { graphRouter } from './routes/graph.js';
import { imageProxyRouter } from './routes/image-proxy.js';
import { queryRouter } from './routes/query.js';
import { dashboardRouter } from './routes/dashboard.js';
import { loadConfig } from './config.js';
import { getLogger } from './logging/logger.js';
import type { ApiError } from './types/api.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/spaces', spacesRouter);
  app.use('/api/graph', graphRouter);
  app.use('/api/image-proxy', imageProxyRouter);
  app.use('/api/query', queryRouter);
  app.use('/api/dashboard', dashboardRouter);

  // Feature flags (public, no auth required)
  app.get('/api/features', (_req, res) => {
    const config = loadConfig();
    res.json({ aiQueryEnabled: config.features.aiQueryEnabled });
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
