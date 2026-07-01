import { getDatabase } from './db.js';
import { loadConfig } from '../config.js';

export interface CachedDataset {
  datasetJson: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Reserved cache space_id for the per-user, long-TTL GemeenteDelers initiative
 * subgraph (FR-046). Not a real space nameID, so it never collides with one.
 * Gemeente ORGANIZATION nodes and their avatar URLs live in this row.
 */
export const GD_CACHE_SPACE_ID = '__gd_initiatives__';

/**
 * Get a cached dataset for a specific user + space combination.
 * Returns null if no cache exists or if the entry has expired.
 */
export function getCacheEntry(userId: string, spaceId: string): CachedDataset | null {
  const db = getDatabase();
  const now = Date.now();

  const row = db
    .prepare('SELECT dataset_json, created_at, expires_at FROM cache_entries WHERE user_id = ? AND space_id = ? AND expires_at > ?')
    .get(userId, spaceId, now) as { dataset_json: string; created_at: number; expires_at: number } | undefined;

  if (!row) return null;

  return {
    datasetJson: row.dataset_json,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Store a dataset in the cache for a specific user + space.
 * Replaces any existing entry (upsert). Uses the standard `cacheTtlHours` TTL
 * unless `ttlHours` is provided (e.g. the long-lived archival GD layer, FR-046).
 */
export function setCacheEntry(
  userId: string,
  spaceId: string,
  datasetJson: string,
  ttlHours?: number,
): void {
  const db = getDatabase();
  const config = loadConfig();
  const now = Date.now();
  const expiresAt = now + (ttlHours ?? config.cacheTtlHours) * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO cache_entries (user_id, space_id, dataset_json, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, space_id) DO UPDATE SET
      dataset_json = excluded.dataset_json,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at
  `).run(userId, spaceId, datasetJson, now, expiresAt);
}

/**
 * Invalidate cache entries for a user's specific spaces.
 * Used when forceRefresh is requested.
 */
export function invalidateCache(userId: string, spaceIds: string[]): void {
  const db = getDatabase();
  const placeholders = spaceIds.map(() => '?').join(',');
  db.prepare(
    `DELETE FROM cache_entries WHERE user_id = ? AND space_id IN (${placeholders})`,
  ).run(userId, ...spaceIds);
}

/**
 * Clear all cache entries for a specific user.
 */
export function clearUserCache(userId: string): number {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM cache_entries WHERE user_id = ?').run(userId);
  return result.changes;
}

/**
 * Delete every user's GD initiative subgraph row so gemeente ORGANIZATION nodes
 * (and their avatar URLs) are rebuilt from Alkemio on the next request. Returns
 * the number of rows cleared.
 */
export function invalidateGdCacheForAllUsers(): number {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM cache_entries WHERE space_id = ?').run(GD_CACHE_SPACE_ID);
  return result.changes;
}

/**
 * Bump this and add a numbered step below whenever a deployment needs a one-time,
 * cache-wide action to run exactly once per environment DB.
 */
const CACHE_MAINTENANCE_VERSION = 1;

/**
 * Deployment-scoped, run-once cache maintenance. SQLite's `user_version` is used
 * as a lightweight per-DB-file marker: steps run at most once per environment,
 * even across process restarts. Returns a summary of what ran (empty when the DB
 * is already at the current version). Call once at startup, after initDatabase().
 */
export function runDeploymentCacheMaintenance(): { gdRowsCleared: number } {
  const db = getDatabase();
  const current = Number(db.pragma('user_version', { simple: true })) || 0;
  let gdRowsCleared = 0;

  if (current < CACHE_MAINTENANCE_VERSION) {
    // v1: force every user's stale GD initiative subgraph to rebuild so gemeente
    // images that were cached null/broken reload after this deployment without a
    // manual Refresh (the GD row's 168h TTL would otherwise keep them stale).
    if (current < 1) {
      gdRowsCleared = invalidateGdCacheForAllUsers();
    }
    db.pragma(`user_version = ${CACHE_MAINTENANCE_VERSION}`);
  }

  return { gdRowsCleared };
}

/**
 * Remove all expired rows (housekeeping): cached datasets, spent pre-auth
 * records, and dead/idle OIDC sessions. Runs on the existing cache sweep.
 */
export function purgeExpired(): void {
  const db = getDatabase();
  const now = Date.now();
  const idleCutoff = now - loadConfig().session.idleTimeoutHours * 60 * 60 * 1000;

  db.prepare('DELETE FROM cache_entries WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM oidc_auth_tx WHERE expires_at < ?').run(now);
  db.prepare(
    'DELETE FROM oidc_sessions WHERE refresh_expires_at < ? OR last_seen_at < ?',
  ).run(now, idleCutoff);
}
