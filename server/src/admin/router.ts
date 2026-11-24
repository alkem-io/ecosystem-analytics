import { Router, type Request, type RequestHandler, type Response } from 'express';
import { authMiddleware, invalidateAndReject } from '../auth/middleware.js';
import { resolveUser } from '../auth/resolve-user.js';
import { requireAccess } from '../access/middleware.js';
import { decide } from '../access/access-service.js';
import { createAlkemioSdk, isAlkemioAuthError } from '../graphql/client.js';
import { updateSessionDisplayName } from '../cache/session-store.js';
import { getLogger } from '../logging/logger.js';
import {
  getScope,
  auditLog,
  getState,
  lastChange,
  repairActorName,
  saveIncludedSpaces,
  type Actor,
} from '../settings/store.js';
import type { AdminAccessView, AuditLogView, IncludedSpacesView } from '../types/admin.js';
import { includedSpacesView, resolveIncludedSpaceViews, vngDesignations } from './included-spaces-service.js';
import {
  AdminRequestError,
  resolveSpaceRef,
  searchSpaces,
  validateIncludedSpaces,
} from './space-search-service.js';
import {
  applyClassificationChanges,
  initiativeName,
  listInitiatives,
  readInitiativeClassifications,
  type ClassificationChangeInput,
} from './classifications-service.js';
import { buildGdSourceSummary } from './gd-source-service.js';
import { accessView, saveAccessSettings } from './access-settings-service.js';

/**
 * `/api/vng/admin/*` — the monitor's administration API (feature 027,
 * contracts/api-admin.md). Monitor Managers only: every route needs a session and the
 * Manage level of the VNG app; every WRITE re-determines that level from Alkemio first
 * (`fresh`, research R4), so a manager whose ADMIN role was removed is refused at once.
 * The path names `vng`, so the 026 application gate applies before any of this.
 */
export const adminRouter = Router();
adminRouter.use(authMiddleware, resolveUser, requireAccess({ app: 'vng', required: 'manage' }));

/** For PUT routes: Manage, re-determined from Alkemio before the handler (FR-009). */
export const freshManage: RequestHandler = requireAccess({
  app: 'vng',
  required: 'manage',
  fresh: true,
});

/**
 * Run a handler; answer a refusal with its status, an Alkemio auth error with 401 (the
 * session is invalidated, as elsewhere), anything else with 502 for THIS route only —
 * each admin section loads and fails on its own (FR-033).
 */
const handle =
  (name: string, fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res) => {
    fn(req, res).catch((err: unknown) => {
      if (res.headersSent) return;
      if (err instanceof AdminRequestError) {
        res.status(err.status).json({ error: err.code, ...err.extra });
        return;
      }
      if (isAlkemioAuthError(err)) return invalidateAndReject(req, res);
      getLogger().error(`admin ${name} failed: ${(err as Error).message}`, { context: 'Admin' });
      res.status(502).json({ error: `${name.toUpperCase()}_FAILED`, message: `Could not load ${name}` });
    });
  };

/**
 * Who is making this request, by NAME: the session holds the Alkemio display name once
 * `/api/auth/me` has run (Hydra's ID token carries none); otherwise it is read from
 * Alkemio here and kept on the session. Only if that fails too is the id used — and such
 * rows are repaired to the name on the person's next visit (`repairActorName`).
 */
async function actorOf(req: Request): Promise<Actor> {
  const auth = req.auth!;
  let displayName = auth.displayName || auth.session.displayName || null;
  if (!displayName) {
    try {
      const sdk = await createAlkemioSdk(auth);
      displayName = (await sdk.me()).data.me.user?.profile?.displayName || null;
    } catch (err) {
      if (isAlkemioAuthError(err)) throw err;
    }
    if (displayName) {
      updateSessionDisplayName(auth.session.sessionId, displayName);
      auth.displayName = displayName;
    }
  }
  if (displayName) repairActorName(auth.userId, displayName);
  return { userId: auth.userId, displayName: displayName ?? auth.userId };
}

// §2 — who may view, who may manage, and where the manager stands.
const meOf = async (req: Request): Promise<AdminAccessView['me']> => {
  const level = await decide(req.auth!, 'vng');
  return {
    displayName: (await actorOf(req)).displayName,
    viewer: level === 'read' || level === 'manage',
    manager: level === 'manage',
  };
};

adminRouter.get(
  '/access',
  handle('access', async (req, res) => {
    res.json(accessView(await meOf(req)));
  }),
);

// The "Toegang" tab: replace who may view and who may manage (lockout-guarded).
adminRouter.put(
  '/access',
  freshManage,
  handle('access-save', async (req, res) => {
    await saveAccessSettings(req.auth!, await actorOf(req), req.body);
    res.json(accessView(await meOf(req)));
  }),
);

// §3 — the Included Spaces, resolved with the manager's token.
adminRouter.get(
  '/included-spaces',
  handle('included-spaces', async (req, res) => {
    res.json(await includedSpacesView(req.auth!));
  }),
);

// The audit log: every edit to the monitor, in one list.
adminRouter.get(
  '/history',
  handle('history', async (req, res) => {
    await actorOf(req); // repairs this manager's own older rows that carry their id
    const limit = Number(req.query.limit) || 50;
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const page = auditLog(limit, before);
    // Name the Spaces with what this manager was recently shown (their own token's view)
    // or their own GD data; anything else stays its nameID.
    const names: Record<string, string> = {};
    for (const e of page.entries) {
      // Access entries carry their own names (recorded at the time of the change).
      const ids =
        e.type === 'spaces' ? [...e.added, ...e.removed] : e.type === 'classification' ? [e.spaceNameId] : [];
      for (const nameId of ids) {
        const name = initiativeName(req.auth!.userId, nameId);
        if (name) names[nameId] = name;
      }
    }
    const body: AuditLogView = { ...page, names };
    res.json(body);
  }),
);

adminRouter.put(
  '/included-spaces',
  freshManage,
  handle('included-spaces', async (req, res) => {
    const { baseRevision, spaceNameIds, confirmEmpty } = (req.body ?? {}) as {
      baseRevision?: unknown;
      spaceNameIds?: unknown;
      confirmEmpty?: unknown;
    };
    if (
      typeof baseRevision !== 'number' ||
      !Array.isArray(spaceNameIds) ||
      !spaceNameIds.every((n) => typeof n === 'string' && n.trim() !== '')
    ) {
      throw new AdminRequestError(422, 'INVALID_REQUEST');
    }
    const next = (spaceNameIds as string[]).map((n) => n.trim());
    if (next.length === 0 && confirmEmpty !== true) {
      throw new AdminRequestError(422, 'EMPTY_NOT_CONFIRMED');
    }

    const conflict = async (): Promise<void> => {
      const current: IncludedSpacesView = await includedSpacesView(req.auth!);
      res.status(409).json({ error: 'REVISION_CONFLICT', current });
    };
    // Cheap first check: a stale editor is told before any Alkemio lookup.
    if (getState().revision !== baseRevision) return conflict();

    const problems = await validateIncludedSpaces(req.auth!, getScope().spaceNameIds, next);
    if (problems.length) throw new AdminRequestError(422, 'INVALID_SPACES', { problems });

    const result = saveIncludedSpaces({ baseRevision, nameIds: next, actor: await actorOf(req) });
    if (!result.ok) return conflict();
    const body: IncludedSpacesView = {
      revision: result.revision,
      designations: vngDesignations(),
      spaces: await resolveIncludedSpaceViews(req.auth!),
      lastChange: lastChange(),
    };
    res.json(body);
  }),
);

// §4 — finding a Space to add.
adminRouter.get(
  '/space-search',
  handle('space-search', async (req, res) => {
    res.json({ results: await searchSpaces(req.auth!, String(req.query.q ?? '')) });
  }),
);

adminRouter.get(
  '/space-resolve',
  handle('space-resolve', async (req, res) => {
    res.json({ space: await resolveSpaceRef(req.auth!, String(req.query.ref ?? '')) });
  }),
);

// §5–6 — initiatives and their classifications.
adminRouter.get(
  '/initiatives',
  handle('initiatives', async (req, res) => {
    res.json({ initiatives: listInitiatives(req.auth!, String(req.query.q ?? '')) });
  }),
);

adminRouter.get(
  '/initiatives/:nameId/classifications',
  handle('classifications', async (req, res) => {
    res.json(await readInitiativeClassifications(req.auth!, String(req.params.nameId)));
  }),
);

adminRouter.put(
  '/initiatives/:nameId/classifications',
  freshManage,
  handle('classifications', async (req, res) => {
    const changes = (req.body ?? {}).changes as ClassificationChangeInput[];
    res.json(
      await applyClassificationChanges(req.auth!, await actorOf(req), String(req.params.nameId), changes),
    );
  }),
);

// §7 — the GemeenteDelers source.
adminRouter.get(
  '/gd-source',
  handle('gd-source', async (req, res) => {
    res.json(await buildGdSourceSummary(req.auth!));
  }),
);
