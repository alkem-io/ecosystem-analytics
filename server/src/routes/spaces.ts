import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { listUserSpaces, listUserSpacesCached, findRelatedSpaces } from '../services/space-service.js';
import { getLogger } from '../logging/logger.js';

const logger = getLogger();

export const spacesRouter = Router();
spacesRouter.use(authMiddleware);
spacesRouter.use(resolveUser);

// GET /api/spaces — List user's L0 Spaces
spacesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const refresh = req.query.refresh === 'true';
    const spaces = refresh
      ? await listUserSpaces(req.auth!)
      : await listUserSpacesCached(req.auth!.userId!, req.auth!);
    res.json(spaces);
  } catch (err) {
    logger.error(`Failed to list spaces: ${(err as Error).message}`, { context: 'Spaces' });
    res.status(502).json({ error: 'UPSTREAM_ERROR', message: 'Failed to fetch spaces from Alkemio' });
  }
});

// GET /api/spaces/:entityId/related — Find expandable Spaces for an entity
spacesRouter.get('/:entityId/related', async (req: Request, res: Response) => {
  try {
    const entityId = req.params.entityId as string;
    const raw = req.query.currentSpaceIds;
    const currentSpaceIds = (typeof raw === 'string' ? raw : '').split(',').filter(Boolean);
    const related = await findRelatedSpaces(req.auth!, entityId, currentSpaceIds);
    res.json(related);
  } catch (err) {
    logger.error(`Failed to find related spaces: ${(err as Error).message}`, { context: 'Spaces' });
    res.status(502).json({ error: 'UPSTREAM_ERROR', message: 'Failed to find related spaces' });
  }
});
