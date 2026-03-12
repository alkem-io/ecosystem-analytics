import { getDatabase } from './db.js';
import { loadConfig } from '../config.js';

export interface CachedDataset {
  datasetJson: string;
  createdAt: number;
  expiresAt: number;
}

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
 * Replaces any existing entry (upsert).
 */
export function setCacheEntry(userId: string, spaceId: string, datasetJson: string): void {
  const db = getDatabase();
  const config = loadConfig();
  const now = Date.now();
  const expiresAt = now + config.cacheTtlHours * 60 * 60 * 1000;

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
 * Remove all expired cache entries (housekeeping).
 */
export function purgeExpired(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM cache_entries WHERE expires_at < ?').run(Date.now());
}
