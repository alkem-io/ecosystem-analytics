process.env.DB_PATH = ':memory:';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The identity lookup and the access decision both talk to Alkemio; stub them.
vi.mock('../graphql/client.js', () => ({
  createAlkemioSdk: vi.fn(async () => ({
    me: async () => ({
      data: { me: { user: { profile: { displayName: 'Jane', avatar: null } } } },
    }),
  })),
  isAlkemioAuthError: (err: unknown) => (err as { auth?: boolean })?.auth === true,
}));
vi.mock('../access/determine.js', () => ({ determineLevel: vi.fn() }));
vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));

import { initDatabase } from '../cache/db.js';
import { determineLevel } from '../access/determine.js';
import { meHandler } from './me.js';
import { resetGateInfo } from '../access/probe.js';

const determine = vi.mocked(determineLevel);
const LIM_GATE = {
  displayName: 'Kenniscentrum Innovatie',
  url: 'https://alkem.io/programmagroei',
};

beforeEach(() => {
  initDatabase();
  resetGateInfo();
  determine.mockReset();
});

async function me(appId: string, sessionId = 's1') {
  const out: { status: number; body: any; cleared: boolean } = {
    status: 200,
    body: undefined,
    cleared: false,
  };
  const res: any = {
    locals: { appId },
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
    clearCookie() {
      out.cleared = true;
    },
  };
  const req: any = { auth: { userId: 'u1', session: { sessionId, avatarUrl: null } } };
  await meHandler(req, res);
  return out;
}

describe('GET /api/auth/me — access report (feature 026)', () => {
  it('reports an ungated application as admitted, with no gate and no Alkemio check', async () => {
    const out = await me('explorer');
    expect(out.body.access).toEqual({
      app: 'explorer',
      status: 'admitted',
      level: 'read',
      gated: false,
      gate: null,
    });
    expect(determine).not.toHaveBeenCalled();
  });

  it('reports a member of the gated application as admitted at Read', async () => {
    determine.mockResolvedValue('read');
    const out = await me('vng');
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ userId: 'u1', displayName: 'Jane' });
    expect(out.body.access).toEqual({
      app: 'vng',
      status: 'admitted',
      level: 'read',
      gated: true,
      gate: LIM_GATE,
    });
  });

  it('reports the Member + Admin roles as the Manage level (US4)', async () => {
    determine.mockResolvedValue('manage');
    expect((await me('vng')).body.access).toMatchObject({ status: 'admitted', level: 'manage' });
  });

  it('reports the Admin role without Member as no access (US4)', async () => {
    determine.mockResolvedValue('none'); // levelFromRoles(['ADMIN']) === 'none'
    expect((await me('vng')).body.access).toMatchObject({ status: 'none', level: 'none' });
  });

  it('answers 200 with status "unverified" when the check fails — never an HTTP error', async () => {
    determine.mockResolvedValue('unverified');
    const out = await me('vng');
    expect(out.status).toBe(200);
    expect(out.body.access).toEqual({
      app: 'vng',
      status: 'unverified',
      level: null,
      gated: true,
      gate: LIM_GATE,
    });
  });

  it('invalidates the session on an Alkemio auth error during the check', async () => {
    determine.mockRejectedValue({ auth: true });
    const out = await me('vng');
    expect(out.status).toBe(401);
    expect(out.cleared).toBe(true);
  });

  it('answers 401 without a session', async () => {
    const out: any = {};
    const res: any = {
      status: (c: number) => ((out.status = c), res),
      json: () => res,
      locals: { appId: 'vng' },
    };
    await meHandler({} as any, res);
    expect(out.status).toBe(401);
  });
});
