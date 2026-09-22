import { Router, Request, Response } from 'express';
import { authMiddleware, invalidateAndReject } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { generateGraph, generateGraphBundle, getProgress } from '../services/graph-service.js';
import { isAlkemioAuthError } from '../graphql/client.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';
import type { ActivityRequest, GraphGenerationRequest, LoadEvent, OrganizationsRequest } from '../types/api.js';
import { NodeType, type GraphNode } from '../types/graph.js';
import { clearUserCache, getCacheEntry } from '../cache/cache-service.js';
import { loadActivityEntries, toActivityItem, type ActivitySpace } from '../services/activity-service.js';
import { loadExtendedProfiles, MAX_ORGANIZATIONS_PER_REQUEST } from '../services/organization-service.js';
import { LoadReporter } from '../services/progress/load-reporter.js';
import { destroySession, SESSION_COOKIE, clearCookieOptions } from '../auth/session.js';

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

    if (body.spaceIds.length > config.maxSpacesPerRequest) {
      res.status(400).json({
        error: 'TOO_MANY_SPACES',
        message: `Maximum ${config.maxSpacesPerRequest} spaces per request`,
      });
      return;
    }

    // Feature 025: the dashboards stream. Once the stream is open, the outcome —
    // including a session that Alkemio rejected — must travel as events, because the
    // response status is already sent (contracts/api-graph-generate-stream.md).
    if (req.accepts(['json', 'text/event-stream']) === 'text/event-stream') {
      await streamGenerate(req, res, body);
      return;
    }
    // A dashboard on the JSON fallback asks for the bundle (dataset + counts computed
    // from the same data, FR-015) with `X-EA-Bundle: 1`; every other caller — the
    // Explorer — gets the bare dataset exactly as before (FR-018).
    if (req.get('X-EA-Bundle') === '1') {
      const bundle = await generateGraphBundle(req.auth!.userId!, req.auth!, body);
      res.json(bundle);
      return;
    }
    const dataset = await generateGraph(req.auth!.userId!, req.auth!, body);
    res.json(dataset);
  } catch (err) {
    if (isAlkemioAuthError(err)) {
      invalidateAndReject(req, res);
      return;
    }
    // The stack names WHICH stage failed (acquisition, snapshot/registry load, transform)
    // — the message alone has proven not to (see the dashboard route).
    logger.error(`Graph generation failed: ${(err as Error).message}`, {
      context: 'Graph',
      stack: (err as Error).stack,
    });
    res.status(502).json({ error: 'GENERATION_FAILED', message: 'Failed to generate graph dataset' });
  }
});

/**
 * The streamed generate (feature 025): `stage`/`item` events as the build progresses,
 * a keep-alive comment every 10 s, then a terminal `result` or `error` frame.
 */
async function streamGenerate(req: Request, res: Response, body: GraphGenerationRequest): Promise<void> {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: LoadEvent) => {
    if (res.writableEnded) return;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, KEEP_ALIVE_MS);

  try {
    const bundle = await generateGraphBundle(req.auth!.userId!, req.auth!, body, new LoadReporter(send));
    send({ type: 'result', dataset: bundle.dataset, dashboard: bundle.dashboard });
  } catch (err) {
    if (isAlkemioAuthError(err)) {
      // Same invalidation as invalidateAndReject(), minus the 401 the stream can no
      // longer send: the client routes to sign-in on this key.
      if (req.auth?.session) destroySession(req.auth.session.sessionId);
      res.clearCookie(SESSION_COOKIE, clearCookieOptions());
      send({ type: 'error', error: { key: 'session.expired' } });
    } else {
      logger.error(`Graph generation failed: ${(err as Error).message}`, {
        context: 'Graph',
        stack: (err as Error).stack,
      });
      send({ type: 'error', error: { key: 'load.failed.spaces', detail: (err as Error).message } });
    }
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
}

const KEEP_ALIVE_MS = 10_000;

/**
 * Reject an invalid Space selection the same way `/generate` does; true when rejected.
 */
function rejectInvalidSpaceIds(res: Response, spaceIds: unknown): boolean {
  if (!Array.isArray(spaceIds) || spaceIds.length === 0) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'spaceIds is required and must not be empty' });
    return true;
  }
  const max = loadConfig().maxSpacesPerRequest;
  if (spaceIds.length > max) {
    res.status(400).json({ error: 'TOO_MANY_SPACES', message: `Maximum ${max} spaces per request` });
    return true;
  }
  return false;
}

// POST /api/graph/activity — the on-demand ACTIVITY item (feature 025,
// contracts/api-graph-activity.md). Reads the L0 Spaces off the viewer's relational
// cache rows; a Space not loaded yet is reported unavailable rather than fetched.
graphRouter.post('/activity', async (req: Request, res: Response) => {
  try {
    const body = req.body as ActivityRequest;
    if (rejectInvalidSpaceIds(res, body.spaceIds)) return;
    const userId = req.auth!.userId!;
    const spaces: ActivitySpace[] = [];
    const spaceIdToL0 = new Map<string, string>();
    const unavailable: string[] = [];
    for (const nameId of body.spaceIds) {
      const row = getCacheEntry(userId, nameId);
      if (!row) {
        unavailable.push(nameId);
        continue;
      }
      const { nodes } = JSON.parse(row.datasetJson) as { nodes: GraphNode[] };
      const l0 = nodes.find((n) => n.type === NodeType.SPACE_L0 && n.nameId === nameId);
      if (!l0) {
        unavailable.push(nameId);
        continue;
      }
      spaces.push({ nameId, id: l0.id });
      for (const n of nodes) spaceIdToL0.set(n.id, l0.id);
    }
    const loaded = await loadActivityEntries(userId, req.auth!, spaces, spaceIdToL0, body.forceRefresh ?? false);
    res.json(toActivityItem(loaded.entries, [...unavailable, ...loaded.unavailable]));
  } catch (err) {
    if (isAlkemioAuthError(err)) return invalidateAndReject(req, res);
    logger.error(`Activity load failed: ${(err as Error).message}`, { context: 'Graph', stack: (err as Error).stack });
    res.status(502).json({ error: 'ACTIVITY_FAILED', message: 'Failed to load activity' });
  }
});

// POST /api/graph/organizations — the on-demand EXTENDED organisation profiles
// (feature 025, contracts/api-graph-organizations.md).
graphRouter.post('/organizations', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as OrganizationsRequest;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_ORGANIZATIONS_PER_REQUEST) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: `ids must hold 1–${MAX_ORGANIZATIONS_PER_REQUEST} organisation ids` });
      return;
    }
    res.json(await loadExtendedProfiles(req.auth!.userId!, req.auth!, ids));
  } catch (err) {
    if (isAlkemioAuthError(err)) return invalidateAndReject(req, res);
    logger.error(`Organization profiles failed: ${(err as Error).message}`, { context: 'Graph', stack: (err as Error).stack });
    res.status(502).json({ error: 'ORGANIZATIONS_FAILED', message: 'Failed to load organisation profiles' });
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
    if (allSpaceIds.length > config.maxSpacesPerRequest) {
      res.status(400).json({
        error: 'TOO_MANY_SPACES',
        message: `Maximum ${config.maxSpacesPerRequest} spaces per request`,
      });
      return;
    }

    const dataset = await generateGraph(req.auth!.userId!, req.auth!, {
      spaceIds: allSpaceIds,
    });
    res.json(dataset);
  } catch (err) {
    if (isAlkemioAuthError(err)) {
      invalidateAndReject(req, res);
      return;
    }
    logger.error(`Graph expansion failed: ${(err as Error).message}`, {
      context: 'Graph',
      stack: (err as Error).stack,
    });
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

    const dataset = await generateGraph(req.auth!.userId!, req.auth!, {
      spaceIds: body.spaceIds,
    });

    const filename = `ecosystem-graph-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(dataset);
  } catch (err) {
    if (isAlkemioAuthError(err)) {
      invalidateAndReject(req, res);
      return;
    }
    logger.error(`Graph export failed: ${(err as Error).message}`, {
      context: 'Graph',
      stack: (err as Error).stack,
    });
    res.status(502).json({ error: 'EXPORT_FAILED', message: 'Failed to export graph dataset' });
  }
});

// DELETE /api/graph/cache — Clear all cached data for the current user
graphRouter.delete('/cache', (req: Request, res: Response) => {
  const deleted = clearUserCache(req.auth!.userId!);
  logger.info(`Cleared ${deleted} cache entries for user ${req.auth!.userId}`, { context: 'Graph' });
  res.json({ cleared: deleted });
});

// GET /api/graph/progress — Check generation progress
graphRouter.get('/progress', (req: Request, res: Response) => {
  const progress = getProgress(req.auth!.userId!);
  res.json(progress);
});
