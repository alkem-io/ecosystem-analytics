/**
 * Feature 026 — the access gate over real HTTP: each listener built with the real
 * `createApp`, real session rows, only Alkemio and the graph build stubbed. Covers
 * every row of contracts/api-access.md §3, the recheck endpoint (§2) and the
 * route-level `requireAccess` (§4).
 */
process.env.DB_PATH = ':memory:';
process.env.EXPLORER_ACCESS_GATE = 'none';
process.env.VNG_ACCESS_GATE = 'programmagroei/landelijkinnovatiemonitor';
process.env.GOVTECH_ACCESS_GATE = 'none';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';

vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));
vi.mock('./determine.js', () => ({ determineLevel: vi.fn() }));
// No route may reach Alkemio from this spec: every SDK build fails fast (non-auth).
vi.mock('../graphql/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../graphql/client.js')>()),
  createAlkemioSdk: vi.fn(async () => {
    throw new Error('Alkemio is not reachable from tests');
  }),
}));
// The graph build is what a refused person must never reach (FR-011: no cache read).
vi.mock('../services/graph-service.js', () => ({
  generateGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
  generateGraphBundle: vi.fn(async () => ({ dataset: { nodes: [], edges: [] } })),
  getProgress: vi.fn(() => null),
}));

import { createApp } from '../app.js';
import { initDatabase } from '../cache/db.js';
import { insertSession } from '../cache/session-store.js';
import { determineLevel } from './determine.js';
import { generateGraph, generateGraphBundle } from '../services/graph-service.js';
import { requireAccess } from './middleware.js';
import { resetRecheckWindow } from './recheck-handler.js';
import { authMiddleware } from '../auth/middleware.js';
import type { AppId } from './policy.js';

const determine = vi.mocked(determineLevel);

let servers: Server[] = [];
const base: Record<string, string> = {};

async function listen(app: express.Express): Promise<string> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  initDatabase();
  for (const app of ['explorer', 'vng'] as AppId[])
    base[app] = await listen(createApp(app, '../nowhere'));

  // A throwaway "management" router guarded by requireAccess (FR-018b).
  const mgmt = express();
  mgmt.use((_req, res, next) => ((res.locals.appId = 'vng'), next()));
  mgmt.use(require_cookies());
  mgmt.get(
    '/api/manage',
    authMiddleware,
    requireAccess({ app: 'vng', required: 'manage' }),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  base.mgmt = await listen(mgmt);
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  servers = [];
});

function require_cookies() {
  // cookie-parser, imported lazily to keep the test's import list honest.
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const header = req.headers.cookie ?? '';
    (req as unknown as { cookies: Record<string, string> }).cookies = Object.fromEntries(
      header
        .split(';')
        .filter(Boolean)
        .map((p) => p.trim().split('=') as [string, string]),
    );
    next();
  };
}

let sessionCounter = 0;
/** A fresh valid session row; returns its cookie header. */
function newSession(): string {
  const now = Date.now();
  const sessionId = `sess-${++sessionCounter}-${now}`;
  insertSession({
    sessionId,
    userId: `user-${sessionCounter}`,
    displayName: 'Tester',
    avatarUrl: null,
    accessTokenEnc: Buffer.from('x'),
    refreshTokenEnc: Buffer.from('y'),
    accessExpiresAt: now + 3_600_000,
    refreshExpiresAt: now + 86_400_000,
    createdAt: now,
    lastSeenAt: now,
  });
  return `ea_session=${sessionId}`;
}

interface Call {
  method?: string;
  body?: unknown;
  cookie?: string | null;
  accept?: string;
}

async function call(
  listener: string,
  path: string,
  { method = 'GET', body, cookie, accept }: Call = {},
) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (accept) headers.accept = accept;
  const res = await fetch(`${base[listener]}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, contentType: res.headers.get('content-type') ?? '' };
}

beforeEach(() => {
  determine.mockReset();
  vi.mocked(generateGraph).mockClear();
  vi.mocked(generateGraphBundle).mockClear();
  resetRecheckWindow();
});

describe('a refused person (VNG gated, Explorer ungated) — contracts §3', () => {
  let cookie: string;
  beforeEach(() => {
    determine.mockResolvedValue('none');
    cookie = newSession();
  });

  const refused = {
    error: 'ACCESS_DENIED',
    reason: 'none',
    app: 'vng',
    message: 'No access to this application',
  };

  it('is refused /api/vng/dashboard on the VNG listener', async () => {
    const r = await call('vng', '/api/vng/dashboard', { method: 'POST', body: {}, cookie });
    expect(r.status).toBe(403);
    expect(r.json).toEqual(refused);
  });

  it('is refused /api/vng/dashboard through the EXPLORER listener (bypass closed)', async () => {
    const r = await call('explorer', '/api/vng/dashboard', { method: 'POST', body: {}, cookie });
    expect(r.status).toBe(403);
    expect(r.json).toEqual(refused);
  });

  it('is refused /api/hubs?app=vng through the Explorer listener', async () => {
    expect((await call('explorer', '/api/hubs?app=vng', { cookie })).status).toBe(403);
  });

  it('is refused a VNG bundle through the Explorer listener, without the build running', async () => {
    const r = await call('explorer', '/api/graph/generate', {
      method: 'POST',
      body: { app: 'vng', spaceIds: ['a'] },
      cookie,
    });
    expect(r.status).toBe(403);
    expect(generateGraphBundle).not.toHaveBeenCalled();
    expect(generateGraph).not.toHaveBeenCalled();
  });

  it('may use the Explorer’s own graph build (FR-012a)', async () => {
    const r = await call('explorer', '/api/graph/generate', {
      method: 'POST',
      body: { spaceIds: ['a'] },
      cookie,
    });
    expect(r.status).toBe(200);
    expect(generateGraph).toHaveBeenCalledTimes(1);
  });

  it('is refused shared routes on the VNG listener, but not on the Explorer listener', async () => {
    expect((await call('vng', '/api/spaces', { cookie })).status).toBe(403);
    expect((await call('explorer', '/api/spaces', { cookie })).status).not.toBe(403);
  });

  it('may reach the hub-scoped ecosystem routes through the Explorer listener', async () => {
    const r = await call('explorer', '/api/ecosystem/orchestrator/vih-test', { cookie });
    expect(r.status).not.toBe(403);
  });

  it('gets a JSON 403 — never an event stream — when asking for a streamed build', async () => {
    const r = await call('vng', '/api/graph/generate', {
      method: 'POST',
      body: { app: 'vng', spaceIds: ['a'] },
      cookie,
      accept: 'text/event-stream',
    });
    expect(r.status).toBe(403);
    expect(r.contentType).toMatch(/application\/json/);
    expect(r.contentType).not.toMatch(/event-stream/);
    expect(generateGraphBundle).not.toHaveBeenCalled();
  });

  it('can still reach the exempt routes (FR-010)', async () => {
    const me = await call('vng', '/api/auth/me', { cookie });
    expect(me.status).toBe(200);
    expect(me.json.access).toMatchObject({ app: 'vng', status: 'none', gated: true });
    expect((await call('vng', '/api/health', { cookie })).status).toBe(200);
    expect((await call('vng', '/api/features', { cookie })).status).toBe(200);
    expect((await call('vng', '/api/meta', { cookie })).status).toBe(200);
    expect((await call('vng', '/api/auth/logout', { method: 'POST', cookie })).status).not.toBe(
      403,
    );
  });

  it('asks Alkemio once for the whole session', async () => {
    await call('vng', '/api/spaces', { cookie });
    await call('vng', '/api/spaces', { cookie });
    await call('explorer', '/api/vng/dashboard', { method: 'POST', body: {}, cookie });
    expect(determine).toHaveBeenCalledTimes(1);
  });
});

describe('without a session', () => {
  it('answers 401, not 403 (FR-009)', async () => {
    const r = await call('vng', '/api/spaces', {});
    expect(r.status).toBe(401);
    expect(determine).not.toHaveBeenCalled();
  });

  it('answers 401 for an unknown session cookie', async () => {
    expect(
      (
        await call('vng', '/api/vng/dashboard', {
          method: 'POST',
          body: {},
          cookie: 'ea_session=nope',
        })
      ).status,
    ).toBe(401);
  });
});

describe('a member', () => {
  it('passes the gate on every listener', async () => {
    determine.mockResolvedValue('read');
    const cookie = newSession();
    expect((await call('vng', '/api/spaces', { cookie })).status).not.toBe(403);
    const r = await call('explorer', '/api/graph/generate', {
      method: 'POST',
      body: { app: 'vng', spaceIds: ['a'] },
      cookie,
    });
    expect(r.status).toBe(200);
  });
});

describe('could not verify', () => {
  it('refuses with reason "unverified" and asks again on the next request', async () => {
    determine.mockResolvedValueOnce('unverified').mockResolvedValueOnce('read');
    const cookie = newSession();
    const first = await call('vng', '/api/spaces', { cookie });
    expect(first.status).toBe(403);
    expect(first.json).toMatchObject({ error: 'ACCESS_DENIED', reason: 'unverified', app: 'vng' });
    expect((await call('vng', '/api/spaces', { cookie })).status).not.toBe(403);
    expect(determine).toHaveBeenCalledTimes(2);
  });
});

describe('an expired Alkemio session during the check', () => {
  it('is invalidated with a 401, not refused with a 403', async () => {
    determine.mockRejectedValue(Object.assign(new Error('401'), { response: { status: 401 } }));
    const cookie = newSession();
    const r = await call('vng', '/api/spaces', { cookie });
    expect(r.status).toBe(401);
    expect((await call('vng', '/api/spaces', { cookie })).status).toBe(401); // session gone
  });
});

describe('POST /api/auth/access/recheck — "check again" (US3, contracts §2)', () => {
  it('re-decides from Alkemio and admits a newly added member without a new sign-in', async () => {
    determine.mockResolvedValueOnce('none').mockResolvedValueOnce('read');
    const cookie = newSession();
    expect((await call('vng', '/api/spaces', { cookie })).status).toBe(403);
    const r = await call('vng', '/api/auth/access/recheck', { method: 'POST', cookie });
    expect(r.status).toBe(200);
    expect(r.json.access).toMatchObject({ app: 'vng', status: 'admitted', level: 'read' });
    expect((await call('vng', '/api/spaces', { cookie })).status).not.toBe(403);
  });

  it('answers with the held report within the 5 s window, without asking Alkemio again', async () => {
    determine.mockResolvedValue('none');
    const cookie = newSession();
    await call('vng', '/api/auth/access/recheck', { method: 'POST', cookie });
    await call('vng', '/api/auth/access/recheck', { method: 'POST', cookie });
    expect(determine).toHaveBeenCalledTimes(1);
  });

  it('answers 401 without a session', async () => {
    expect((await call('vng', '/api/auth/access/recheck', { method: 'POST' })).status).toBe(401);
  });

  it('keeps a decision for the rest of the session (removal takes effect at next sign-in)', async () => {
    determine.mockResolvedValueOnce('read').mockResolvedValueOnce('none');
    const cookie = newSession();
    expect((await call('vng', '/api/spaces', { cookie })).status).not.toBe(403);
    // Membership revoked on Alkemio — this session keeps its decision…
    expect((await call('vng', '/api/spaces', { cookie })).status).not.toBe(403);
    // …and a new session (next sign-in) is refused.
    expect((await call('vng', '/api/spaces', { cookie: newSession() })).status).toBe(403);
  });
});

describe('requireAccess — a Manage-level route (US4, FR-018b)', () => {
  it('refuses a Read-level person and admits a Manage-level one, reusing the held decision', async () => {
    determine.mockResolvedValueOnce('read').mockResolvedValueOnce('manage');
    const reader = newSession();
    const manager = newSession();
    const r1 = await call('mgmt', '/api/manage', { cookie: reader });
    expect(r1.status).toBe(403);
    expect(r1.json).toMatchObject({ error: 'ACCESS_DENIED', reason: 'none', app: 'vng' });
    expect((await call('mgmt', '/api/manage', { cookie: manager })).status).toBe(200);
    // The VNG app gate (Read) is answered from the same held decisions.
    expect((await call('vng', '/api/spaces', { cookie: reader })).status).not.toBe(403);
    expect(determine).toHaveBeenCalledTimes(2);
  });
});
