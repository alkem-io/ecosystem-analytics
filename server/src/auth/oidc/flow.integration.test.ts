process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

// Mock the OIDC RP library so the flow runs without a real Hydra (discovery,
// token exchange, and PKCE/JWKS are all stubbed). We assert OUR orchestration:
// tx lifecycle, state check, session creation + encryption, and redirects.
vi.mock('openid-client', () => {
  let counter = 0;
  return {
    discovery: vi.fn(async () => ({
      serverMetadata: () => ({ supportsPKCE: () => true }),
    })),
    None: () => ({ method: 'none' }),
    ClientSecretBasic: () => ({ method: 'basic' }),
    ClientSecretPost: () => ({ method: 'post' }),
    allowInsecureRequests: () => {},
    randomState: () => `state-${++counter}-${'x'.repeat(20)}`,
    randomNonce: () => `nonce-${counter}`,
    randomPKCECodeVerifier: () => 'verifier-abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    calculatePKCECodeChallenge: async () => 'challenge-value',
    buildAuthorizationUrl: () => new URL('https://identity.example.test/oauth2/auth?response_type=code'),
    authorizationCodeGrant: vi.fn(async () => ({
      access_token: 'access-jwt',
      refresh_token: 'refresh-tok',
      expires_in: 600,
      claims: () => ({
        sub: 'sub-1',
        alkemio_actor_id: 'actor-123',
        name: 'Jane Doe',
        picture: 'https://alkem.io/storage/avatar.png',
      }),
    })),
    refreshTokenGrant: vi.fn(),
    tokenRevocation: vi.fn(),
  };
});

import * as oidc from 'openid-client';
import { initDatabase } from '../../cache/db.js';
import { getAuthTx, getSessionRecord } from '../../cache/session-store.js';
import { loadConfig } from '../../config.js';
import { decrypt } from './crypto.js';
import { resetOidcConfiguration } from './client.js';
import { loginHandler } from './login.js';
import { callbackHandler } from './callback.js';
import { SESSION_COOKIE, PREAUTH_COOKIE } from '../session.js';
import { getLogger } from '../../logging/logger.js';

interface CapturingRes {
  statusCode: number;
  redirectUrl?: string;
  cookies: Record<string, string>;
  cleared: string[];
  status: (c: number) => CapturingRes;
  json: () => CapturingRes;
  redirect: (u: string) => CapturingRes;
  cookie: (n: string, v: string) => CapturingRes;
  clearCookie: (n: string) => CapturingRes;
  end: () => CapturingRes;
}

function res(): CapturingRes {
  const r = { statusCode: 200, cookies: {}, cleared: [] } as unknown as CapturingRes;
  r.status = (c) => ((r.statusCode = c), r);
  r.json = () => r;
  r.redirect = (u) => ((r.redirectUrl = u), r);
  r.cookie = (n, v) => ((r.cookies[n] = v), r);
  r.clearCookie = (n) => (r.cleared.push(n), r);
  r.end = () => r;
  return r;
}

beforeEach(() => {
  initDatabase();
  resetOidcConfiguration();
  vi.clearAllMocks();
});

describe('full redirect → callback → session loop', () => {
  it('logs in: stashes pre-auth, sets cookie, redirects to the authorization endpoint', async () => {
    const r = res();
    await loginHandler(
      { query: { returnTo: '/explorer' } } as unknown as Request,
      r as unknown as Response,
    );

    expect(r.redirectUrl).toContain('https://identity.example.test/oauth2/auth');
    const txId = r.cookies[PREAUTH_COOKIE];
    expect(txId).toBeTruthy();
    const tx = getAuthTx(txId)!;
    expect(tx.returnTo).toBe('/explorer');
    expect(tx.state).toMatch(/^state-/);
  });

  it('completes the callback: exchanges code, creates an encrypted session, lands on returnTo', async () => {
    // 1. login to obtain a real tx + state
    const loginRes = res();
    await loginHandler(
      { query: { returnTo: '/explorer' } } as unknown as Request,
      loginRes as unknown as Response,
    );
    const txId = loginRes.cookies[PREAUTH_COOKIE];
    const tx = getAuthTx(txId)!;

    // 2. callback with matching state
    const cbRes = res();
    await callbackHandler(
      {
        query: { code: 'auth-code', state: tx.state },
        cookies: { [PREAUTH_COOKIE]: txId },
        originalUrl: `/api/auth/oidc/callback?code=auth-code&state=${tx.state}`,
      } as unknown as Request,
      cbRes as unknown as Response,
    );

    expect(cbRes.redirectUrl).toBe('/explorer');
    expect(cbRes.cleared).toContain(PREAUTH_COOKIE);

    const sessionId = cbRes.cookies[SESSION_COOKIE];
    expect(sessionId).toBeTruthy();

    const row = getSessionRecord(sessionId)!;
    expect(row.userId).toBe('actor-123');
    expect(row.displayName).toBe('Jane Doe');
    const key = loadConfig().session.encKey;
    expect(decrypt(row.accessTokenEnc, key)).toBe('access-jwt');
    expect(decrypt(row.refreshTokenEnc, key)).toBe('refresh-tok');

    // tx is single-use
    expect(getAuthTx(txId)).toBeNull();
  });

  it('routes to /not-authorized when the identity lacks alkemio_actor_id (FR-015)', async () => {
    vi.mocked(oidc.authorizationCodeGrant).mockResolvedValueOnce({
      access_token: 'access-jwt',
      refresh_token: 'refresh-tok',
      expires_in: 600,
      claims: () => ({ sub: 'sub-1', name: 'No Actor' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const loginRes = res();
    await loginHandler({ query: {} } as unknown as Request, loginRes as unknown as Response);
    const txId = loginRes.cookies[PREAUTH_COOKIE];
    const tx = getAuthTx(txId)!;

    const cbRes = res();
    await callbackHandler(
      {
        query: { code: 'auth-code', state: tx.state },
        cookies: { [PREAUTH_COOKIE]: txId },
        originalUrl: `/api/auth/oidc/callback?code=auth-code&state=${tx.state}`,
      } as unknown as Request,
      cbRes as unknown as Response,
    );

    expect(cbRes.redirectUrl).toBe('/not-authorized');
    expect(cbRes.cookies[SESSION_COOKIE]).toBeUndefined();
  });

  it('redirects to /login?error=failed when the code exchange throws (no raw 400, no session)', async () => {
    vi.mocked(oidc.authorizationCodeGrant).mockRejectedValueOnce(
      Object.assign(new Error('exchange failed'), {
        error: 'invalid_grant',
        error_description: 'code expired',
      }),
    );

    const loginRes = res();
    await loginHandler({ query: {} } as unknown as Request, loginRes as unknown as Response);
    const txId = loginRes.cookies[PREAUTH_COOKIE];
    const tx = getAuthTx(txId)!;

    const cbRes = res();
    await callbackHandler(
      {
        query: { code: 'auth-code', state: tx.state },
        cookies: { [PREAUTH_COOKIE]: txId },
        originalUrl: `/api/auth/oidc/callback?code=auth-code&state=${tx.state}`,
      } as unknown as Request,
      cbRes as unknown as Response,
    );

    expect(cbRes.redirectUrl).toBe('/login?error=failed');
    expect(cbRes.statusCode).toBe(200); // not a 400 JSON body
    expect(cbRes.cookies[SESSION_COOKIE]).toBeUndefined();
  });

  it('never logs tokens, state, or the PKCE verifier across the flow (FR-014)', async () => {
    const captured: string[] = [];
    const logger = getLogger();
    const sink = (msg: unknown) => {
      captured.push(String(msg));
      return logger;
    };
    const spies = (['info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(logger, level).mockImplementation(sink as never),
    );

    try {
      const loginRes = res();
      await loginHandler({ query: {} } as unknown as Request, loginRes as unknown as Response);
      const txId = loginRes.cookies[PREAUTH_COOKIE];
      const tx = getAuthTx(txId)!;

      const cbRes = res();
      await callbackHandler(
        {
          query: { code: 'auth-code', state: tx.state },
          cookies: { [PREAUTH_COOKIE]: txId },
          originalUrl: `/api/auth/oidc/callback?code=auth-code&state=${tx.state}`,
        } as unknown as Request,
        cbRes as unknown as Response,
      );

      const blob = captured.join('\n');
      expect(blob).not.toContain('access-jwt');
      expect(blob).not.toContain('refresh-tok');
      expect(blob).not.toContain(tx.state);
      expect(blob).not.toContain(tx.codeVerifier);
      expect(blob).not.toContain(txId);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
