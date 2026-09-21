import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { builtInOrchestrator } from '../data/ecosystem/orchestrators.js';
import {
  clearChoice,
  getCommunityCandidates,
  getOwnChoice,
  setChoice,
} from '../cache/orchestrator-choice-store.js';
import { canReadSpace } from '../services/space-readability.js';
import { getLogger } from '../logging/logger.js';

const logger = getLogger();

/**
 * Orchestrator choice (feature 024) — `/api/ecosystem/orchestrator/:hubNameId`.
 *
 * App-agnostic: hub nameIDs are platform-global, so this sits outside the per-dashboard
 * `/api/<app>/` namespace.
 *
 * `GET` answers everything the client's resolution order needs in one round trip. The
 * `community` value is the part that needs care: see {@link resolveCommunity}.
 */
export const ecosystemRouter = Router();
ecosystemRouter.use(authMiddleware);
ecosystemRouter.use(resolveUser);

/** Alkemio nameIDs are lowercase slugs; anything else is a client bug, not a lookup. */
const NAME_ID = /^[a-z0-9-]{1,64}$/;

export function isValidNameId(value: unknown): value is string {
  return typeof value === 'string' && NAME_ID.test(value);
}

export interface OrchestratorChoiceResponse {
  hubNameId: string;
  own: string | null;
  community: { spaceNameId: string; count: number } | null;
  builtIn: string | null;
}

/**
 * The community preset, filtered for readability (Constitution IV).
 *
 * Choices come from every signed-in viewer, and some of them can read Spaces this caller
 * cannot. Handing back the raw winner would put a private Space's nameID into the
 * response of everyone who opens the tab. So: walk the top candidates in rank order and
 * return the first one THIS caller can actually read; if none of them, no preset at all
 * and the client falls through to the built-in default.
 *
 * Three candidates rather than one so that a single privately-chosen Space does not wipe
 * the preset for everybody else.
 */
async function resolveCommunity(
  req: Request,
  hubNameId: string,
): Promise<OrchestratorChoiceResponse['community']> {
  for (const candidate of getCommunityCandidates(hubNameId)) {
    if (await canReadSpace(req.auth!, candidate.spaceNameId)) return candidate;
  }
  return null;
}

async function respond(req: Request, res: Response, hubNameId: string): Promise<void> {
  const body: OrchestratorChoiceResponse = {
    hubNameId,
    own: getOwnChoice(req.auth!.userId, hubNameId),
    community: await resolveCommunity(req, hubNameId),
    builtIn: builtInOrchestrator(hubNameId),
  };
  // Hub and space nameIDs only — never the session, the user id or a token.
  logger.debug(
    `Orchestrator for hub '${hubNameId}': own=${body.own ?? 'none'} ` +
      `community=${body.community?.spaceNameId ?? 'none'} builtIn=${body.builtIn ?? 'none'}`,
    { context: 'Ecosystem' },
  );
  res.json(body);
}

/** Pull `:hubNameId` off the request, or answer 400 and return null. */
function hubParam(req: Request, res: Response): string | null {
  const { hubNameId } = req.params;
  if (!isValidNameId(hubNameId)) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'hubNameId must be an Alkemio nameID' });
    return null;
  }
  return hubNameId;
}

// GET — the resolution inputs for one hub.
ecosystemRouter.get('/orchestrator/:hubNameId', async (req: Request, res: Response) => {
  const hubNameId = hubParam(req, res);
  if (hubNameId) await respond(req, res, hubNameId);
});

// PUT — remember this viewer's choice (FR-011). Answers with the post-write GET shape,
// so the client needs no second call.
ecosystemRouter.put('/orchestrator/:hubNameId', async (req: Request, res: Response) => {
  const hubNameId = hubParam(req, res);
  if (!hubNameId) return;

  const spaceNameId = (req.body as { spaceNameId?: unknown } | undefined)?.spaceNameId;
  if (!isValidNameId(spaceNameId)) {
    res
      .status(400)
      .json({ error: 'INVALID_REQUEST', message: 'spaceNameId must be an Alkemio nameID' });
    return;
  }

  setChoice(req.auth!.userId, hubNameId, spaceNameId);
  await respond(req, res, hubNameId);
});

// DELETE — withdraw this viewer's choice (FR-012), from their own view and from the
// community count. Idempotent.
ecosystemRouter.delete('/orchestrator/:hubNameId', async (req: Request, res: Response) => {
  const hubNameId = hubParam(req, res);
  if (!hubNameId) return;
  clearChoice(req.auth!.userId, hubNameId);
  await respond(req, res, hubNameId);
});
