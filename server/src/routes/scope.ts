import { Router } from 'express';
import { authMiddleware } from '../auth/middleware.js';
import { requireAccess } from '../access/middleware.js';
import { getLogger } from '../logging/logger.js';
import { getScope } from '../settings/store.js';

/**
 * `GET /api/vng/scope` (feature 027, contracts/api-admin.md §1): the Spaces the VNG
 * monitor reports on, from its own settings store. It never calls Alkemio, so it answers
 * even when Alkemio is slow. Replaces `/api/hubs` for VNG. The path names `vng`, so the
 * app-level gate applies too.
 */
export const scopeRouter = Router();

scopeRouter.get('/', authMiddleware, requireAccess({ app: 'vng', required: 'read' }), (_req, res) => {
  try {
    res.json(getScope());
  } catch (err) {
    getLogger().error(`Monitor scope unavailable: ${(err as Error).message}`, { context: 'Settings' });
    res.status(503).json({ error: 'SCOPE_UNAVAILABLE', message: 'The monitor settings are unavailable' });
  }
});
