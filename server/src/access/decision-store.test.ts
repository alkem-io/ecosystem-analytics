process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase, getDatabase } from '../cache/db.js';
import { clearDecision, clearForSession, getDecision, putDecision } from './decision-store.js';
import { insertSession, deleteSession, type SessionRecord } from '../cache/session-store.js';
import { purgeExpired } from '../cache/cache-service.js';

beforeEach(() => initDatabase());

const KEY = 'programmagroei/landelijkinnovatiemonitor';

function session(sessionId: string, over: Partial<SessionRecord> = {}): SessionRecord {
  const now = Date.now();
  return {
    sessionId,
    userId: `user-${sessionId}`,
    displayName: null,
    avatarUrl: null,
    accessTokenEnc: Buffer.from('a'),
    refreshTokenEnc: Buffer.from('r'),
    accessExpiresAt: now + 60_000,
    refreshExpiresAt: now + 3_600_000,
    createdAt: now,
    lastSeenAt: now,
    ...over,
  } as SessionRecord;
}

describe('access decision store', () => {
  it('round-trips a decision for one session and app', () => {
    putDecision('s1', 'vng', KEY, 'read', 1000);
    expect(getDecision('s1', 'vng', KEY)).toEqual({ level: 'read', decidedAt: 1000 });
  });

  it('is absent before anything is stored', () => {
    expect(getDecision('s1', 'vng', KEY)).toBeNull();
  });

  it('keeps one row per session and app — a second put replaces it', () => {
    putDecision('s1', 'vng', KEY, 'none', 1000);
    putDecision('s1', 'vng', KEY, 'manage', 2000);
    expect(getDecision('s1', 'vng', KEY)).toEqual({ level: 'manage', decidedAt: 2000 });
    const { n } = getDatabase().prepare('SELECT COUNT(*) AS n FROM access_decisions').get() as {
      n: number;
    };
    expect(n).toBe(1);
  });

  it('keeps applications independent within one session (FR-003a)', () => {
    putDecision('s1', 'vng', KEY, 'none', 1000);
    putDecision('s1', 'govtech', 'other/gate', 'read', 1000);
    expect(getDecision('s1', 'vng', KEY)?.level).toBe('none');
    expect(getDecision('s1', 'govtech', 'other/gate')?.level).toBe('read');
  });

  it('never applies one session’s decision to another', () => {
    putDecision('s1', 'vng', KEY, 'read', 1000);
    expect(getDecision('s2', 'vng', KEY)).toBeNull();
  });

  it('ignores a decision taken against a different gate', () => {
    putDecision('s1', 'vng', 'old/gate', 'read', 1000);
    expect(getDecision('s1', 'vng', KEY)).toBeNull();
  });

  it('refuses to store "unverified"', () => {
    expect(() => putDecision('s1', 'vng', KEY, 'unverified' as never, 1000)).toThrow();
    expect(getDecision('s1', 'vng', KEY)).toBeNull();
  });

  it('clears one app, or every app of a session', () => {
    putDecision('s1', 'vng', KEY, 'read', 1000);
    putDecision('s1', 'govtech', KEY, 'read', 1000);
    putDecision('s2', 'vng', KEY, 'read', 1000);
    clearDecision('s1', 'vng');
    expect(getDecision('s1', 'vng', KEY)).toBeNull();
    expect(getDecision('s1', 'govtech', KEY)).not.toBeNull();
    clearForSession('s1');
    expect(getDecision('s1', 'govtech', KEY)).toBeNull();
    expect(getDecision('s2', 'vng', KEY)).not.toBeNull();
  });

  it('is deleted with its session', () => {
    insertSession(session('s1'));
    putDecision('s1', 'vng', KEY, 'read', 1000);
    deleteSession('s1');
    expect(getDecision('s1', 'vng', KEY)).toBeNull();
  });

  it('is swept by purgeExpired when its session is gone', () => {
    insertSession(session('live'));
    putDecision('live', 'vng', KEY, 'read', 1000);
    putDecision('orphan', 'vng', KEY, 'read', 1000);
    purgeExpired();
    expect(getDecision('live', 'vng', KEY)).not.toBeNull();
    expect(getDecision('orphan', 'vng', KEY)).toBeNull();
  });
});
