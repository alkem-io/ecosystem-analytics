import { Router, Request, Response } from 'express';
import { authMiddleware, invalidateAndReject } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { fetchInnovationHubs, resolveHubByNameId } from '../services/hub-service.js';
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
    const configuredDefault = config.vng.defaultHubNameId || null;

    // The configured default hub may NOT be store-listed (so absent from the list
    // above). Resolve it directly by nameID and prepend it so it is always
    // selectable + preselectable on first load. If it can't be resolved (bad/absent
    // nameID), DON'T preselect anything — the user still gets the full hub list.
    let defaultHubNameId = configuredDefault;
    if (configuredDefault && !hubs.some((h) => h.nameId === configuredDefault)) {
      const def = await resolveHubByNameId(req.auth!, configuredDefault).catch(() => null);
      if (def) {
        hubs.unshift(def);
      } else {
        logger.warn(
          `Configured default innovation hub '${configuredDefault}' is not loadable — ` +
            `offering the full hub list with no preselection`,
          { context: 'Hubs' },
        );
        defaultHubNameId = null;
      }
    }

    res.json({
      defaultHubNameId,
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
    const nameId = String(req.params.nameId);
    // Prefer the store-listed hubs query — it reliably returns each hub's
    // `spaceListFilter` (the dropdown's spaceCount comes from it). Only fall back to
    // by-nameID lookup for hubs that aren't store-listed (e.g. some VNG hubs), where
    // the lookup path is the only way to reach them.
    const listed = await fetchInnovationHubs(req.auth!);
    const hub = listed.find((h) => h.nameId === nameId) ?? (await resolveHubByNameId(req.auth!, nameId));
    if (!hub) {
      logger.warn(`Hub '${req.params.nameId}' not found (nameID unresolvable)`, { context: 'Hubs' });
      res.status(404).json({ error: 'HUB_NOT_FOUND', message: 'Innovation hub not found' });
      return;
    }
    logger.info(
      `Hub '${hub.nameId}' resolved → ${hub.spaces.length} space(s) in spaceListFilter` +
        (hub.spaces.length === 0
          ? ' (empty — the hub may be a VISIBILITY-type hub, whose spaces come from spaceVisibilityFilter, not an explicit list)'
          : ''),
      { context: 'Hubs' },
    );
    res.json({ nameId: hub.nameId, spaces: hub.spaces });
  } catch (err) {
    if (isAlkemioAuthError(err)) return invalidateAndReject(req, res);
    logger.error(`Hub spaces failed: ${(err as Error).message}`, { context: 'Hubs' });
    res.status(502).json({ error: 'HUB_SPACES_FAILED', message: 'Failed to resolve hub spaces' });
  }
});
