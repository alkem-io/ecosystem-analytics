/**
 * SC-005 — the monitor settings share the application's one SQLite file with the cache,
 * yet survive everything the cache does: its run-once maintenance, clears, force-refresh
 * invalidation and the expiry sweep. (Losing the whole file is what the daily settings
 * backup is for — backup.test.ts.)
 */
process.env.DB_PATH = ':memory:';
import { describe, it, expect, vi } from 'vitest';
import { getDatabase, initDatabase } from '../cache/db.js';
import * as cache from '../cache/cache-service.js';
import { initSettingsStore } from './db.js';
import { seedIfEmpty } from './seed.js';
import { getIncludedSpaces, getScope, history, saveIncludedSpaces } from './store.js';

vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));

describe('the settings tables vs. the cache', () => {
  it('are unchanged by every cache operation, including every maintenance step', () => {
    initDatabase();
    seedIfEmpty(initSettingsStore(), { version: 1, ecosystemKey: 'vih-test', includedSpaces: ['a', 'b'] });
    saveIncludedSpaces({ baseRevision: 1, nameIds: ['b', 'c'], actor: { userId: 'u', displayName: 'U' } });
    const before = { scope: getScope(), rows: getIncludedSpaces(), history: history() };

    cache.setCacheEntry('u', 'a', JSON.stringify({ nodes: [], edges: [] }));
    getDatabase().pragma('user_version = 0'); // force every maintenance step to run
    cache.runDeploymentCacheMaintenance();
    cache.clearUserCache('u');
    cache.invalidateCache('u', ['a', 'b', 'c']);
    cache.invalidateItemRows('u');
    cache.invalidateGdCacheForAllUsers();
    cache.purgeExpired();

    // A restart re-runs the migration, which must be a no-op on existing tables.
    initSettingsStore();
    expect(seedIfEmpty(getDatabase(), { version: 1, ecosystemKey: 'x', includedSpaces: ['q'] })).toBe(false);
    expect({ scope: getScope(), rows: getIncludedSpaces(), history: history() }).toEqual(before);
    expect(before.scope.revision).toBe(2);
  });

  it('use their own schema marker, never the cache’s user_version', () => {
    initDatabase();
    initSettingsStore();
    expect(Number(getDatabase().pragma('user_version', { simple: true }))).toBe(0);
    expect(getDatabase().prepare('SELECT schema_version FROM settings_meta').get()).toEqual({
      schema_version: 1,
    });
  });
});
