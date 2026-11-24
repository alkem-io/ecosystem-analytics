import type { Request, Response } from 'express';
import type { AppId } from './policy.js';
import { policyFor, viewerLinks } from './access-service.js';

/** Body of `GET /api/auth/access/spaces` (contracts/api-access-sets.md §1). */
export interface PublicAccessSpaces {
  app: AppId;
  gated: boolean;
  spaces: Array<{ key: string; displayName: string; url: string }>;
}

/**
 * `GET /api/auth/access/spaces` — PUBLIC (feature 027, FR-001/FR-002): who can use this
 * listener's application, shown on the sign-in screen before anyone signs in. Only the
 * VIEWER Spaces, never the admin Spaces. Names come from the anonymous start-up probe (what
 * Alkemio shows anonymous visitors), else the configured name, else the nameID; nothing
 * per person. Never calls Alkemio, so it answers even when Alkemio is down. Exempt from the
 * gate (it sits under `/api/auth/*`) and needs no session.
 */
export function publicSpacesHandler(_req: Request, res: Response): void {
  const app = res.locals.appId as AppId;
  const gated = policyFor(app).gate !== null;
  const body: PublicAccessSpaces = {
    app,
    gated,
    spaces: gated
      ? viewerLinks(app).map(({ key, displayName, url }) => ({ key, displayName, url }))
      : [],
  };
  res.json(body);
}
