import { Router, Request, Response } from 'express';
import { authMiddleware, invalidateAndReject } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { assembleDashboard } from '../services/vng-dashboard-service.js';
import { isAlkemioAuthError } from '../graphql/client.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';

const logger = getLogger();

export const vngRouter = Router();
vngRouter.use(authMiddleware);
vngRouter.use(resolveUser);

interface DashboardRequest {
  spaceIds: string[];
  includeGemeentes?: boolean;
  includeInitiatives?: boolean;
}

// POST /api/vng/dashboard — category counts for the dashboard charts (FR-020/022).
vngRouter.post('/dashboard', async (req: Request, res: Response) => {
  try {
    const config = loadConfig();
    const body = req.body as DashboardRequest;

    if (!body.spaceIds || body.spaceIds.length === 0) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'spaceIds is required' });
      return;
    }
    if (body.spaceIds.length > config.maxSpacesPerQuery) {
      res.status(400).json({
        error: 'TOO_MANY_SPACES',
        message: `Maximum ${config.maxSpacesPerQuery} spaces per query`,
      });
      return;
    }

    const result = await assembleDashboard(
      req.auth!,
      body.spaceIds,
      body.includeInitiatives ?? false,
    );
    res.json(result);
  } catch (err) {
    if (isAlkemioAuthError(err)) return invalidateAndReject(req, res);
    logger.error(`Dashboard failed: ${(err as Error).message}`, { context: 'VNG' });
    res.status(502).json({ error: 'DASHBOARD_FAILED', message: 'Failed to compute dashboard' });
  }
});
