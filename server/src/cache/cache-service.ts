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
 * Reserved cache space_id for the per-user, long-TTL gemeente geo-location set
 * (feature 019, FR-005b). Same pattern as {@link GD_CACHE_SPACE_ID}: not a real
 * space nameID, so it never collides with one.
 *
 * The data is selection-independent and identical for every user, but the row stays
 * keyed by `user_id` so constitution §IV's read-time ownership check applies here
 * exactly as it does everywhere else — see specs/019-usage-explorer/research.md R2.
 */
export const GEO_CACHE_SPACE_ID = '__gemeente_geo__';

// --- Feature 025 — split cache rows ---------------------------------------
// The per-Space rows hold RELATIONAL data only. Activity and extended organisation
// profiles are separate items with their own rows, so the dashboards' core load never
// carries (or triggers) them while the Explorer can still compose everything.

/** Prefix of every synthetic (non-Space) row id. */
const SYNTHETIC_PREFIX = '__';

/** Cache row id for the activity item of one Space (24 h, per viewer). */
export function activityCacheId(nameId: string): string {
  return `__activity__:${nameId}`;
}

/** Cache row id for one organisation's extended profile (24 h, per viewer). */
export function orgCacheId(orgId: string): string {
  return `__org__:${orgId}`;
}

/**
 * True for a plain per-Space relational row (a real nameId), false for every synthetic
 * row (`__gd_initiatives__`, `__gemeente_geo__`, `__activity__:…`, `__org__:…`).
 */
export function isRelationalSpaceRow(spaceId: string): boolean {
  return !spaceId.startsWith(SYNTHETIC_PREFIX);
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
 * Read a cache entry **even if it has expired**, reporting whether it is stale.
 *
 * Only for datasets whose staleness is preferable to absence — the gemeente geo set
 * (feature 019, FR-030a): a failure to refresh locations must not blank the map. The
 * ownership check is identical to {@link getCacheEntry}; only the expiry filter differs,
 * so this never widens access across users.
 *
 * Normal caches must keep using {@link getCacheEntry} — silently serving expired graph
 * data would defeat the TTL.
 */
export function getCacheEntryAllowStale(
  userId: string,
  spaceId: string,
): (CachedDataset & { stale: boolean }) | null {
  const db = getDatabase();

  const row = db
    .prepare('SELECT dataset_json, created_at, expires_at FROM cache_entries WHERE user_id = ? AND space_id = ?')
    .get(userId, spaceId) as { dataset_json: string; created_at: number; expires_at: number } | undefined;

  if (!row) return null;

  return {
    datasetJson: row.dataset_json,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    stale: row.expires_at <= Date.now(),
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
 * Drop a user's on-demand item rows (feature 025) — every `__activity__:*` and
 * `__org__:*` row — so a force refresh re-fetches those too (FR-014).
 */
export function invalidateItemRows(userId: string): void {
  getDatabase()
    .prepare(
      `DELETE FROM cache_entries WHERE user_id = ? AND (space_id LIKE '__activity__:%' OR space_id LIKE '__org__:%')`,
    )
    .run(userId);
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
const CACHE_MAINTENANCE_VERSION = 4;

/**
 * Deployment-scoped, run-once cache maintenance. SQLite's `user_version` is used
 * as a lightweight per-DB-file marker: steps run at most once per environment,
 * even across process restarts. Returns a summary of what ran (empty when the DB
 * is already at the current version). Call once at startup, after initDatabase().
 */
export function runDeploymentCacheMaintenance(): {
  gdRowsCleared: number;
  classificationRowsCleared: number;
} {
  const db = getDatabase();
  const current = Number(db.pragma('user_version', { simple: true })) || 0;
  let gdRowsCleared = 0;
  let classificationRowsCleared = 0;

  if (current < CACHE_MAINTENANCE_VERSION) {
    // v1: force every user's stale GD initiative subgraph to rebuild so gemeente
    // images that were cached null/broken reload after this deployment without a
    // manual Refresh (the GD row's 168h TTL would otherwise keep them stale).
    if (current < 1) {
      gdRowsCleared = invalidateGdCacheForAllUsers();
    }
    // v2 (feature 020): cached datasets carry TAG-derived category fields on their nodes
    // (`ndsCategories` / `vng2030Categories`) and no `classifications` at all. Serving
    // them after this deployment would show tag-derived chips beside classification-
    // derived charts for up to the cache TTL, so they are dropped once per environment
    // and recomputed on next use (FR-019).
    //
    // The GD subgraph row goes too: its INITIATIVE nodes only started carrying their
    // callout tags in this change, and without them the categories cannot be resolved.
    // The gemeente GEO row (feature 019) is deliberately KEPT — it holds no
    // classification data, and rebuilding it costs a ~342-gemeente Alkemio sweep per
    // user that this deployment has no reason to trigger.
    // v3: the classification set on the Groei spaces changed in Alkemio (entries removed,
    // TRL added) and cached datasets served from BEFORE that change failed the dashboard
    // until a manual refresh. Same sweep as v2: every dataset row goes, the GEO row stays.
    // v4 (feature 025): the per-Space rows became RELATIONAL only — activity-derived
    // fields moved to their own `__activity__:<nameId>` rows and the GD row gained the
    // callouts the counts bundle needs. A pre-split row served as relational-only would
    // still carry activity and lack nothing visible, but the reverse — an old GD row
    // without callouts — would drop the GD segment from the counts. Same sweep: every
    // dataset row goes, the GEO row stays.
    if (current < 4) {
      classificationRowsCleared = db
        .prepare('DELETE FROM cache_entries WHERE space_id != ?')
        .run(GEO_CACHE_SPACE_ID).changes;
    }
    db.pragma(`user_version = ${CACHE_MAINTENANCE_VERSION}`);
  }

  return { gdRowsCleared, classificationRowsCleared };
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
