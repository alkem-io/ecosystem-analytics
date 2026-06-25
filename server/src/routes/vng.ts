import { Router, Request, Response } from 'express';
import { authMiddleware, invalidateAndReject } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { assembleDashboard, assembleGemeenteDistribution } from '../services/vng-dashboard-service.js';
import { fetchGemeentedelersCallouts } from '../services/gd-initiatives-service.js';
import { loadVngRegistry } from '../services/vng-registry.js';
import { createAlkemioSdk, isAlkemioAuthError } from '../graphql/client.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';

const logger = getLogger();

export const vngRouter = Router();
vngRouter.use(authMiddleware);
vngRouter.use(resolveUser);

interface DashboardRequest {
  spaceIds: string[];
  includeGemeentes?: boolean;
  /** GD checkbox — stack GD initiatives into the NDS / VNG-2030 category charts. */
  includeInitiatives?: boolean;
  /** GD checkbox — fold GD initiatives into the gemeente-distribution chart. */
  includeGemeenteDelers?: boolean;
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
    if (body.spaceIds.length > config.maxSpacesPerRequest) {
      res.status(400).json({
        error: 'TOO_MANY_SPACES',
        message: `Maximum ${config.maxSpacesPerRequest} spaces per request`,
      });
      return;
    }

    const result = await assembleDashboard(
      req.auth!,
      body.spaceIds,
      body.includeInitiatives ?? false,
    );
    // Initiatives-by-gemeente-count distribution (stacked Groei + GD). Always
    // includes Groei (selected spaces); folds in GD when the GD checkbox is on.
    result.gemeenteDistribution = await assembleGemeenteDistribution(
      req.auth!.userId!,
      req.auth!,
      body.spaceIds,
      body.includeGemeenteDelers ?? false,
    );
    res.json(result);
  } catch (err) {
    if (isAlkemioAuthError(err)) return invalidateAndReject(req, res);
    logger.error(`Dashboard failed: ${(err as Error).message}`, { context: 'VNG' });
    res.status(502).json({ error: 'DASHBOARD_FAILED', message: 'Failed to compute dashboard' });
  }
});

// GET /api/vng/initiatives — the GemeenteDelers initiatives (id + name + the
// gemeentes each is associated with), so the selection panel can list them all
// under "Include GD initiatives" and show gemeente info on hover (US10).
vngRouter.get('/initiatives', async (req: Request, res: Response) => {
  try {
    const sdk = await createAlkemioSdk(req.auth!);
    const callouts = await fetchGemeentedelersCallouts(req.auth!, sdk);
    const registry = loadVngRegistry();
    res.json(
      callouts
        .map((c) => {
          // Gemeentes are named in the description; themes are tagsets on the callout.
          const gemeentes = registry.findGemeentesInText(c.description).map((g) => g.title);
          const themes = [
            ...new Set(
              c.tags.map((tag) => registry.resolveThemeByTag(tag)?.title).filter((x): x is string => !!x),
            ),
          ].sort((a, b) => a.localeCompare(b));
          return { id: c.id, nameId: c.nameId, displayName: c.displayName, gemeentes, themes };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    );
  } catch (err) {
    if (isAlkemioAuthError(err)) return invalidateAndReject(req, res);
    logger.error(`GD initiatives list failed: ${(err as Error).message}`, { context: 'VNG' });
    res.status(502).json({ error: 'GD_LIST_FAILED', message: 'Failed to list GD initiatives' });
  }
});
