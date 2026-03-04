import { Request, Response } from 'express';
import { resolveKratosPublicUrl } from './kratos-url.js';
import { getLogger } from '../logging/logger.js';

/**
 * GET /api/auth/sso/config
 *
 * Returns the Kratos whoami URL so the frontend can call it directly.
 * The browser will attach the `ory_kratos_session` cookie only when the
 * request targets the same domain that set the cookie (e.g. alkem.io).
 * A BFF-proxied approach cannot work because the cookie is host-scoped
 * to alkem.io and won't be sent to ecosystem-analytics.alkem.io.
 *
 * This is a public endpoint — no Bearer token required.
 */
export async function ssoConfigHandler(_req: Request, res: Response) {
  try {
    const kratosUrl = await resolveKratosPublicUrl();
    const whoamiUrl = `${kratosUrl.replace(/\/$/, '')}/sessions/whoami`;
    res.json({ whoamiUrl });
  } catch (err) {
    getLogger().error(`SSO config failed: ${(err as Error).message}`, { context: 'SSO' });
    res.status(503).json({ error: 'SSO_UNAVAILABLE', message: 'Cannot resolve Kratos URL' });
  }
}
