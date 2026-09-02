process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase, getDatabase } from './db.js';
import {
  setCacheEntry,
  getCacheEntry,
  invalidateGdCacheForAllUsers,
  runDeploymentCacheMaintenance,
  GD_CACHE_SPACE_ID,
} from './cache-service.js';

beforeEach(() => initDatabase());

describe('invalidateGdCacheForAllUsers', () => {
  it('clears every user’s GD row but leaves normal space rows intact', () => {
    setCacheEntry('user-a', GD_CACHE_SPACE_ID, '{"nodes":[]}', 168);
    setCacheEntry('user-b', GD_CACHE_SPACE_ID, '{"nodes":[]}', 168);
    setCacheEntry('user-a', 'some-space', '{"nodes":[]}');

    const cleared = invalidateGdCacheForAllUsers();

    expect(cleared).toBe(2);
    expect(getCacheEntry('user-a', GD_CACHE_SPACE_ID)).toBeNull();
    expect(getCacheEntry('user-b', GD_CACHE_SPACE_ID)).toBeNull();
    expect(getCacheEntry('user-a', 'some-space')).not.toBeNull();
  });
});

describe('runDeploymentCacheMaintenance', () => {
  it('clears GD rows once, then is a no-op on subsequent runs (run-once)', () => {
    setCacheEntry('user-a', GD_CACHE_SPACE_ID, '{"nodes":[]}', 168);

    const first = runDeploymentCacheMaintenance();
    expect(first.gdRowsCleared).toBe(1);
    expect(getDatabase().pragma('user_version', { simple: true })).toBe(2);

    // A GD row written after maintenance must survive a second run — the marker
    // guarantees the one-time purge does not fire again on the next restart.
    setCacheEntry('user-a', GD_CACHE_SPACE_ID, '{"nodes":[]}', 168);
    const second = runDeploymentCacheMaintenance();
    expect(second.gdRowsCleared).toBe(0);
    expect(getCacheEntry('user-a', GD_CACHE_SPACE_ID)).not.toBeNull();
  });

  // Feature 020: pre-change datasets carry tag-derived category fields and no
  // classifications, so every dataset is dropped exactly once (FR-019).
  it('clears every cached dataset once on the v2 step, then never again', () => {
    setCacheEntry('user-a', 'space-1', '{"nodes":[]}', 24);
    setCacheEntry('user-b', 'space-2', '{"nodes":[]}', 24);

    const first = runDeploymentCacheMaintenance();
    expect(first.classificationRowsCleared).toBe(2);
    expect(getCacheEntry('user-a', 'space-1')).toBeNull();
    expect(getCacheEntry('user-b', 'space-2')).toBeNull();

    setCacheEntry('user-a', 'space-1', '{"nodes":[]}', 24);
    const second = runDeploymentCacheMaintenance();
    expect(second.classificationRowsCleared).toBe(0);
    expect(getCacheEntry('user-a', 'space-1')).not.toBeNull();
  });
});
