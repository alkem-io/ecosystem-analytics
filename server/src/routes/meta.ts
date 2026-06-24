import { Router, Request, Response } from 'express';
import { loadConfig } from '../config.js';
import { getBuildInfo } from '../build-info.js';
import type { MetaResponse } from '../types/api.js';

export const metaRouter = Router();

// GET /api/meta — build provenance + behaviour-tuning settings (public, no auth).
// Deliberately excludes connection/OIDC/secret values; only the knobs that tune
// behaviour, so operators can verify what is actually deployed.
metaRouter.get('/', (_req: Request, res: Response) => {
  const config = loadConfig();
  const body: MetaResponse = {
    build: getBuildInfo(),
    settings: {
      maxSpacesPerQuery: config.maxSpacesPerQuery,
      activitySpacesPerQuery: config.activitySpacesPerQuery,
      cacheTtlHours: config.cacheTtlHours,
      gdCacheTtlHours: config.vng.gdCacheTtlHours,
      aiQueryEnabled: config.features.aiQueryEnabled,
      querySessionTtlMinutes: config.query.sessionTtlMinutes,
      maxQueryLength: config.query.maxQueryLength,
      maxFeedbackLength: config.query.maxFeedbackLength,
    },
  };
  res.json(body);
});
