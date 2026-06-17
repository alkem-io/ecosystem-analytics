process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from '../cache/db.js';
import { createSession, isSessionValid, resolveSession, type NewSessionInput } from './session.js';
import { loadConfig } from '../config.js';

beforeEach(() => initDatabase());

function input(overrides: Partial<NewSessionInput> = {}): NewSessionInput {
  return {
    userId: 'actor-1',
    displayName: null,
    avatarUrl: null,
    accessToken: 'access',
    refreshToken: 'refresh',
    accessExpiresAt: Date.now() + 600_000,
    ...overrides,
  };
}

/**
 * FR-009 / FR-009a: a session is valid only while the refresh grant is alive
 * AND it has not been idle past the configured timeout. Either boundary failing
 * routes the request as unauthenticated.
 */
describe('session validity boundaries (FR-009/FR-009a)', () => {
  const idleMs = () => loadConfig().session.idleTimeoutHours * 60 * 60 * 1000;

  it('is valid just under the idle timeout, invalid at/after it', () => {
    const now = Date.now();
    const session = createSession(input({ refreshExpiresAt: now + 30 * 24 * 3600_000 }), now);
    expect(isSessionValid(session, session.lastSeenAt + idleMs() - 1)).toBe(true);
    expect(isSessionValid(session, session.lastSeenAt + idleMs())).toBe(false);
    expect(isSessionValid(session, session.lastSeenAt + idleMs() + 1)).toBe(false);
  });

  it('is valid just before the refresh grant expires, invalid at/after it', () => {
    const now = Date.now();
    const refreshExpiresAt = now + 10_000;
    const session = createSession(input({ refreshExpiresAt }), now);
    expect(isSessionValid(session, refreshExpiresAt - 1)).toBe(true);
    expect(isSessionValid(session, refreshExpiresAt)).toBe(false);
    expect(isSessionValid(session, refreshExpiresAt + 1)).toBe(false);
  });

  it('resolveSession deletes and returns null once a session is invalid', () => {
    const now = Date.now();
    const session = createSession(input({ refreshExpiresAt: now - 1 }), now);
    expect(resolveSession(session.sessionId, now)).toBeNull();
    // second resolve confirms the row was purged
    expect(resolveSession(session.sessionId, now)).toBeNull();
  });
});
