import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { generateGraph, getProgress } from '../services/graph-service.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';
import type { GraphGenerationRequest } from '../types/api.js';

const logger = getLogger();

export const graphRouter = Router();
graphRouter.use(authMiddleware);
graphRouter.use(resolveUser);

// POST /api/graph/generate — Generate graph dataset
graphRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const config = loadConfig();
    const body = req.body as GraphGenerationRequest;

    if (!body.spaceIds || body.spaceIds.length === 0) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'spaceIds is required and must not be empty' });
      return;
    }

    if (body.spaceIds.length > config.maxSpacesPerQuery) {
      res.status(400).json({
        error: 'TOO_MANY_SPACES',
        message: `Maximum ${config.maxSpacesPerQuery} spaces per query`,
      });
      return;
    }

    const dataset = await generateGraph(req.auth!.userId!, req.auth!.bearerToken, body);
    res.json(dataset);
  } catch (err) {
    logger.error(`Graph generation failed: ${(err as Error).message}`, { context: 'Graph' });
    res.status(502).json({ error: 'GENERATION_FAILED', message: 'Failed to generate graph dataset' });
  }
});

// POST /api/graph/expand — Add a single Space to the current dataset
graphRouter.post('/expand', async (req: Request, res: Response) => {
  try {
    const config = loadConfig();
    const { spaceId, currentSpaceIds } = req.body as { spaceId: string; currentSpaceIds: string[] };

    if (!spaceId) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'spaceId is required' });
      return;
    }

    const allSpaceIds = [...(currentSpaceIds || []), spaceId];
    if (allSpaceIds.length > config.maxSpacesPerQuery) {
      res.status(400).json({
        error: 'TOO_MANY_SPACES',
        message: `Maximum ${config.maxSpacesPerQuery} spaces per query`,
      });
      return;
    }

    const dataset = await generateGraph(req.auth!.userId!, req.auth!.bearerToken, {
      spaceIds: allSpaceIds,
    });
    res.json(dataset);
  } catch (err) {
    logger.error(`Graph expansion failed: ${(err as Error).message}`, { context: 'Graph' });
    res.status(502).json({ error: 'EXPANSION_FAILED', message: 'Failed to expand graph' });
  }
});

// POST /api/graph/export — Export graph dataset as downloadable JSON (FR-016)
graphRouter.post('/export', async (req: Request, res: Response) => {
  try {
    const body = req.body as { spaceIds: string[]; includeMetrics?: boolean };

    if (!body.spaceIds || body.spaceIds.length === 0) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'spaceIds is required' });
      return;
    }

    const dataset = await generateGraph(req.auth!.userId!, req.auth!.bearerToken, {
      spaceIds: body.spaceIds,
    });

    const filename = `ecosystem-graph-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(dataset);
  } catch (err) {
    logger.error(`Graph export failed: ${(err as Error).message}`, { context: 'Graph' });
    res.status(502).json({ error: 'EXPORT_FAILED', message: 'Failed to export graph dataset' });
  }
});

// GET /api/graph/progress — Check generation progress
graphRouter.get('/progress', (req: Request, res: Response) => {
  const progress = getProgress(req.auth!.userId!);
  res.json(progress);
});
