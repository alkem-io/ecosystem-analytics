process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from '../cache/db.js';
import {
  createSession,
  resolveSession,
  isSessionValid,
  touchSession,
  destroySession,
  sessionCookieOptions,
  preauthCookieOptions,
  type NewSessionInput,
} from './session.js';
import { getSessionRecord } from '../cache/session-store.js';
import { decrypt } from './oidc/crypto.js';
import { loadConfig } from '../config.js';

beforeEach(() => initDatabase());

function newInput(overrides: Partial<NewSessionInput> = {}): NewSessionInput {
  return {
    userId: 'actor-1',
    displayName: 'Jane Doe',
    avatarUrl: null,
    accessToken: 'access-jwt-value',
    refreshToken: 'refresh-token-value',
    accessExpiresAt: Date.now() + 600_000,
    ...overrides,
  };
}

describe('session lifecycle', () => {
  it('persists tokens encrypted at rest and resolves the session', () => {
    const session = createSession(newInput());
    const row = getSessionRecord(session.sessionId)!;
    const key = loadConfig().session.encKey;

    expect(row.userId).toBe('actor-1');
    // Stored bytes are not the plaintext token …
    expect(row.accessTokenEnc.equals(Buffer.from('access-jwt-value'))).toBe(false);
    // … but decrypt round-trips.
    expect(decrypt(row.accessTokenEnc, key)).toBe('access-jwt-value');
    expect(decrypt(row.refreshTokenEnc, key)).toBe('refresh-token-value');

    expect(resolveSession(session.sessionId)?.sessionId).toBe(session.sessionId);
  });

  it('treats an idle-timed-out session as invalid and deletes it', () => {
    const session = createSession(newInput());
    const idleMs = loadConfig().session.idleTimeoutHours * 60 * 60 * 1000;
    const wayPastIdle = session.lastSeenAt + idleMs + 1;

    expect(isSessionValid(session, wayPastIdle)).toBe(false);
    expect(resolveSession(session.sessionId, wayPastIdle)).toBeNull();
    // invalid session is purged on resolve
    expect(getSessionRecord(session.sessionId)).toBeNull();
  });

  it('treats an expired refresh grant as invalid', () => {
    const session = createSession(newInput({ refreshExpiresAt: Date.now() - 1 }));
    expect(isSessionValid(session)).toBe(false);
    expect(resolveSession(session.sessionId)).toBeNull();
  });

  it('touch() updates last_seen_at', () => {
    const session = createSession(newInput());
    const later = session.lastSeenAt + 5_000;
    touchSession(session.sessionId, later);
    expect(getSessionRecord(session.sessionId)!.lastSeenAt).toBe(later);
  });

  it('destroySession removes the row', () => {
    const session = createSession(newInput());
    destroySession(session.sessionId);
    expect(getSessionRecord(session.sessionId)).toBeNull();
  });
});

describe('cookie attributes are config-driven (host-only / local case)', () => {
  it('session cookie is httpOnly + SameSite=None;Secure & host-only on localhost (cross-site IdP)', () => {
    // No SESSION_COOKIE_DOMAIN => local-against-production: EA is on localhost
    // while the IdP is on another site, so the OIDC callback is a CROSS-site
    // redirect. A `Lax` cookie set on that hop is dropped by the browser;
    // `None`+`Secure` is required (http://localhost is a secure context, so
    // `Secure` is honored). The hosted case (cookieDomain set) stays `Lax`.
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('none');
    expect(opts.secure).toBe(true);
    expect(opts.domain).toBeUndefined();
    expect(opts.maxAge).toBe(loadConfig().session.idleTimeoutHours * 60 * 60 * 1000);
  });

  it('pre-auth cookie carries the configured short TTL', () => {
    const opts = preauthCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.maxAge).toBe(loadConfig().oidc.preauthTtlMinutes * 60 * 1000);
  });
});
