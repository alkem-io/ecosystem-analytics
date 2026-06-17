process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('openid-client', () => ({
  discovery: vi.fn(async () => ({})),
  refreshTokenGrant: vi.fn(async () => ({
    access_token: 'new-access',
    refresh_token: 'new-refresh',
    expires_in: 600,
  })),
  None: () => ({}),
  ClientSecretBasic: () => ({}),
  ClientSecretPost: () => ({}),
  allowInsecureRequests: () => {},
}));
import * as oidc from 'openid-client';

import { initDatabase } from '../../cache/db.js';
import { createSession, type NewSessionInput } from '../session.js';
import { ensureFreshAccessToken } from './refresh.js';
import { getSessionRecord } from '../../cache/session-store.js';
import { decrypt } from './crypto.js';
import { loadConfig } from '../../config.js';
import { resetOidcConfiguration } from './client.js';

beforeEach(() => {
  initDatabase();
  resetOidcConfiguration();
  vi.clearAllMocks();
});

function input(overrides: Partial<NewSessionInput> = {}): NewSessionInput {
  return {
    userId: 'actor-1',
    displayName: null,
    avatarUrl: null,
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    accessExpiresAt: Date.now() + 600_000,
    ...overrides,
  };
}

describe('transparent token refresh (FR-008)', () => {
  it('refreshes + persists rotated tokens when access is expired and refresh is valid', async () => {
    const now = Date.now();
    const session = createSession(
      input({ accessExpiresAt: now - 1_000, refreshExpiresAt: now + 1_000_000 }),
      now,
    );

    const updated = await ensureFreshAccessToken(session, now);
    const key = loadConfig().session.encKey;

    expect(oidc.refreshTokenGrant).toHaveBeenCalledTimes(1);
    expect(decrypt(updated.accessTokenEnc, key)).toBe('new-access');

    // Rotation persisted to the store (newest refresh token overwrites the old).
    const row = getSessionRecord(session.sessionId)!;
    expect(decrypt(row.refreshTokenEnc, key)).toBe('new-refresh');
    expect(row.accessExpiresAt).toBeGreaterThan(now);
  });

  it('does not refresh while the access token is still fresh', async () => {
    const now = Date.now();
    const session = createSession(
      input({ accessExpiresAt: now + 600_000, refreshExpiresAt: now + 1_000_000 }),
      now,
    );
    const result = await ensureFreshAccessToken(session, now);
    expect(oidc.refreshTokenGrant).not.toHaveBeenCalled();
    expect(result).toBe(session);
  });

  it('returns the session unchanged when the refresh grant has expired', async () => {
    const now = Date.now();
    const session = createSession(
      input({ accessExpiresAt: now - 1_000, refreshExpiresAt: now - 1 }),
      now,
    );
    const result = await ensureFreshAccessToken(session, now);
    expect(oidc.refreshTokenGrant).not.toHaveBeenCalled();
    expect(result).toBe(session);
  });
});
