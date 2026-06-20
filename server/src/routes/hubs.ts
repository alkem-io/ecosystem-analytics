import { Router, Request, Response } from 'express';
import { authMiddleware, invalidateAndReject } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { fetchInnovationHubs } from '../services/hub-service.js';
import { isAlkemioAuthError } from '../graphql/client.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';

const logger = getLogger();

export const hubsRouter = Router();
hubsRouter.use(authMiddleware);
hubsRouter.use(resolveUser);

// GET /api/hubs — list innovation hubs available to the user + the default (FR-009/010).
hubsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const config = loadConfig();
    const hubs = await fetchInnovationHubs(req.auth!);
    res.json({
      defaultHubNameId: config.vng.defaultHubNameId || null,
      hubs: hubs.map((h) => ({
        nameId: h.nameId,
        displayName: h.displayName,
        spaceCount: h.spaces.length,
      })),
    });
  } catch (err) {
    if (isAlkemioAuthError(err)) return invalidateAndReject(req, res);
    logger.error(`Hub listing failed: ${(err as Error).message}`, { context: 'Hubs' });
    res.status(502).json({ error: 'HUB_LIST_FAILED', message: 'Failed to list innovation hubs' });
  }
});

// GET /api/hubs/:nameId/spaces — resolve a hub's listed spaces (FR-009).
hubsRouter.get('/:nameId/spaces', async (req: Request, res: Response) => {
  try {
    const hubs = await fetchInnovationHubs(req.auth!);
    const hub = hubs.find((h) => h.nameId === req.params.nameId);
    if (!hub) {
      res.status(404).json({ error: 'HUB_NOT_FOUND', message: 'Innovation hub not found' });
      return;
    }
    res.json({ nameId: hub.nameId, spaces: hub.spaces });
  } catch (err) {
    if (isAlkemioAuthError(err)) return invalidateAndReject(req, res);
    logger.error(`Hub spaces failed: ${(err as Error).message}`, { context: 'Hubs' });
    res.status(502).json({ error: 'HUB_SPACES_FAILED', message: 'Failed to resolve hub spaces' });
  }
});
