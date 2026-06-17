process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('openid-client', () => ({
  discovery: vi.fn(async () => ({})),
  tokenRevocation: vi.fn(async () => {}),
  None: () => ({}),
  ClientSecretBasic: () => ({}),
  ClientSecretPost: () => ({}),
  allowInsecureRequests: () => {},
}));
import * as oidc from 'openid-client';

import { initDatabase } from '../../cache/db.js';
import { createSession, SESSION_COOKIE } from '../session.js';
import { getSessionRecord } from '../../cache/session-store.js';
import { logoutHandler } from './logout.js';
import { resetOidcConfiguration } from './client.js';

interface MockRes {
  statusCode: number;
  cleared: string[];
  status: (c: number) => MockRes;
  json: () => MockRes;
  clearCookie: (n: string) => MockRes;
  end: () => MockRes;
}
function mockRes(): MockRes {
  const res = { statusCode: 200, cleared: [] } as unknown as MockRes;
  res.status = (c) => ((res.statusCode = c), res);
  res.json = () => res;
  res.clearCookie = (n) => (res.cleared.push(n), res);
  res.end = () => res;
  return res;
}

beforeEach(() => {
  initDatabase();
  resetOidcConfiguration();
  vi.clearAllMocks();
});

function sessionInput() {
  return {
    userId: 'actor-1',
    displayName: null,
    avatarUrl: null,
    accessToken: 'access',
    refreshToken: 'refresh',
    accessExpiresAt: Date.now() + 600_000,
  };
}

describe('POST /api/auth/logout (FR-012/FR-012a)', () => {
  it('deletes the session, clears the cookie, revokes tokens, returns 204', async () => {
    const session = createSession(sessionInput());
    const res = mockRes();
    await logoutHandler(
      { cookies: { [SESSION_COOKIE]: session.sessionId } } as unknown as Request,
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(204);
    expect(res.cleared).toContain(SESSION_COOKIE);
    expect(getSessionRecord(session.sessionId)).toBeNull();
    // best-effort revoke of access + refresh
    expect(oidc.tokenRevocation).toHaveBeenCalledTimes(2);
  });

  it('is idempotent with no session cookie → 204, no revoke', async () => {
    const res = mockRes();
    await logoutHandler({ cookies: {} } as unknown as Request, res as unknown as Response);
    expect(res.statusCode).toBe(204);
    expect(oidc.tokenRevocation).not.toHaveBeenCalled();
  });

  it('is idempotent with an unknown session id → 204, no revoke', async () => {
    const res = mockRes();
    await logoutHandler(
      { cookies: { [SESSION_COOKIE]: 'does-not-exist' } } as unknown as Request,
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(204);
    expect(oidc.tokenRevocation).not.toHaveBeenCalled();
  });
});
