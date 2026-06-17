process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { initDatabase } from '../../cache/db.js';
import { insertAuthTx, getAuthTx } from '../../cache/session-store.js';
import { callbackHandler } from './callback.js';
import { PREAUTH_COOKIE } from '../session.js';

interface MockRes {
  statusCode: number;
  body: unknown;
  redirectUrl: string | undefined;
  cleared: string[];
  status: (c: number) => MockRes;
  json: (b: unknown) => MockRes;
  redirect: (u: string) => MockRes;
  clearCookie: (n: string) => MockRes;
  cookie: (n: string, v: string) => MockRes;
  end: () => MockRes;
}

function mockRes(): MockRes {
  const res = {
    statusCode: 200,
    body: undefined,
    redirectUrl: undefined,
    cleared: [],
  } as unknown as MockRes;
  res.status = vi.fn((c: number) => ((res.statusCode = c), res));
  res.json = vi.fn((b: unknown) => ((res.body = b), res));
  res.redirect = vi.fn((u: string) => ((res.redirectUrl = u), res));
  res.clearCookie = vi.fn((n: string) => (res.cleared.push(n), res));
  res.cookie = vi.fn(() => res);
  res.end = vi.fn(() => res);
  return res;
}

function req(opts: { query?: Record<string, string>; cookies?: Record<string, string> }): Request {
  const query = opts.query ?? {};
  const search = new URLSearchParams(query).toString();
  return {
    query,
    cookies: opts.cookies ?? {},
    originalUrl: `/api/auth/oidc/callback${search ? `?${search}` : ''}`,
  } as unknown as Request;
}

beforeEach(() => initDatabase());

describe('GET /api/auth/oidc/callback — rejection & cancel paths (no Hydra)', () => {
  it('provider error → 302 to a clean sign-in state, no loop', async () => {
    const res = mockRes();
    await callbackHandler(req({ query: { error: 'access_denied' } }), res as unknown as Response);
    expect(res.redirectUrl).toBe('/login?error=cancelled');
    expect(res.cleared).toContain(PREAUTH_COOKIE);
  });

  it('missing pre-auth cookie → 400, no session', async () => {
    const res = mockRes();
    await callbackHandler(req({ query: { code: 'c', state: 's' } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('unknown / already-used tx → 400', async () => {
    const res = mockRes();
    await callbackHandler(
      req({ query: { code: 'c', state: 's' }, cookies: { [PREAUTH_COOKIE]: 'nope' } }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
  });

  it('state mismatch → 400 and the tx is single-use (consumed)', async () => {
    const now = Date.now();
    insertAuthTx({
      txId: 'tx1',
      state: 'REAL_STATE',
      nonce: 'n',
      codeVerifier: 'v',
      returnTo: '/spaces',
      createdAt: now,
      expiresAt: now + 600_000,
    });
    const res = mockRes();
    await callbackHandler(
      req({ query: { code: 'c', state: 'WRONG_STATE' }, cookies: { [PREAUTH_COOKIE]: 'tx1' } }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    // consumed even on failure → replay of the same tx is impossible
    expect(getAuthTx('tx1')).toBeNull();
  });

  it('expired tx → 400', async () => {
    const now = Date.now();
    insertAuthTx({
      txId: 'tx2',
      state: 'S',
      nonce: 'n',
      codeVerifier: 'v',
      returnTo: '/spaces',
      createdAt: now - 1_000_000,
      expiresAt: now - 1,
    });
    const res = mockRes();
    await callbackHandler(
      req({ query: { code: 'c', state: 'S' }, cookies: { [PREAUTH_COOKIE]: 'tx2' } }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
  });
});
