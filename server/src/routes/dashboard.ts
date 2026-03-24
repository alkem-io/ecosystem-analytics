import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { acquireDashboardData } from '../services/dashboard-service.js';
import { transformToDashboard } from '../transform/dashboard-transform.js';
import { getCacheEntry, setCacheEntry } from '../cache/cache-service.js';
import { getDatabase } from '../cache/db.js';
import { getLogger } from '../logging/logger.js';
import type { DashboardGenerationRequest } from '../types/api.js';
import type { DashboardDataset } from '../types/dashboard.js';

const logger = getLogger();
const CACHE_PREFIX = 'dashboard:';

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware);
dashboardRouter.use(resolveUser);

// POST /api/dashboard/generate — Generate dashboard dataset for a single space
dashboardRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const body = req.body as DashboardGenerationRequest;

    if (!body.spaceId || typeof body.spaceId !== 'string') {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'spaceId is required' });
      return;
    }

    const userId = req.auth!.userId!;
    const cacheKey = `${CACHE_PREFIX}${body.spaceId}`;

    // Check cache unless force refresh
    if (!body.forceRefresh) {
      const cached = getCacheEntry(userId, cacheKey);
      if (cached) {
        logger.info(`Dashboard cache hit for space ${body.spaceId}`, { context: 'Dashboard' });
        const dataset = JSON.parse(cached.datasetJson) as DashboardDataset;
        dataset.cacheInfo = {
          lastUpdated: new Date(cached.createdAt).toISOString(),
          fromCache: true,
        };
        res.json(dataset);
        return;
      }
    }

    // Acquire and transform
    const t0 = Date.now();
    const { root, errors } = await acquireDashboardData(req.auth!, body.spaceId);
    const tAcquire = Date.now();
    const dataset = transformToDashboard(root);
    const tTransform = Date.now();
    if (errors.length > 0) {
      dataset.errors = errors;
    }

    // Cache result
    setCacheEntry(userId, cacheKey, JSON.stringify(dataset));
    logger.info(
      `Dashboard generated for space ${body.spaceId}: ${dataset.callouts.length} callouts, ${dataset.contributors.length} contributors — acquire=${tAcquire - t0}ms, transform=${tTransform - tAcquire}ms, total=${tTransform - t0}ms`,
      { context: 'Dashboard' },
    );

    res.json(dataset);
  } catch (err) {
    const error = err as Error & { response?: { errors?: unknown } };
    const gqlErrors = error.response?.errors;
    logger.error(`Dashboard generation failed: ${error.message}`, { context: 'Dashboard', stack: error.stack, gqlErrors });
    res.status(502).json({
      error: 'GENERATION_FAILED',
      message: 'Failed to generate dashboard dataset',
      detail: error.message,
      gqlErrors: gqlErrors ?? undefined,
    });
  }
});

// POST /api/dashboard/clear-cache — Clear all dashboard cache entries for the current user
dashboardRouter.post('/clear-cache', async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.userId!;
    const db = getDatabase();
    const result = db.prepare("DELETE FROM cache_entries WHERE user_id = ? AND space_id LIKE 'dashboard:%'").run(userId);
    logger.info(`Dashboard cache cleared for user ${userId}: ${result.changes} entries removed`, { context: 'Dashboard' });
    res.json({ cleared: result.changes });
  } catch (err) {
    res.status(500).json({ error: 'CACHE_CLEAR_FAILED', message: (err as Error).message });
  }
});
