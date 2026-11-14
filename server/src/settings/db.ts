import type { Database as DatabaseType } from 'better-sqlite3';
import { getDatabase } from '../cache/db.js';
import { getLogger } from '../logging/logger.js';

/**
 * The monitor settings tables (feature 027). They live in the application's ONE SQLite
 * file, beside the cache and sessions, but nothing in the cache path touches them: cache
 * operations only ever delete from `cache_entries`, and the cache's run-once maintenance
 * uses `PRAGMA user_version` while these tables are versioned in their own
 * `settings_meta` row. See README.md.
 */

/** The tables this module owns, in a safe copy order. */
export const SETTINGS_TABLES = [
  'settings_state',
  'included_spaces',
  'settings_changes',
  'classification_changes',
] as const;

/** The latest schema version; each step below brings the tables one version further. */
export const SETTINGS_SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE settings_state (
      id                 INTEGER PRIMARY KEY CHECK (id = 1),
      revision           INTEGER NOT NULL,
      ecosystem_key      TEXT    NOT NULL,
      updated_at         TEXT,
      updated_by_user_id TEXT    NULL,
      updated_by_name    TEXT    NULL
    );
    CREATE TABLE included_spaces (
      position INTEGER PRIMARY KEY,
      name_id  TEXT NOT NULL UNIQUE,
      space_id TEXT NULL UNIQUE
    );
    CREATE TABLE settings_changes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      revision      INTEGER NOT NULL,
      kind          TEXT    NOT NULL CHECK (kind IN ('seed', 'update', 'rename')),
      at            TEXT    NOT NULL,
      actor_user_id TEXT    NULL,
      actor_name    TEXT    NULL,
      added_json    TEXT    NOT NULL,
      removed_json  TEXT    NOT NULL,
      note          TEXT    NULL
    );
    CREATE INDEX idx_settings_changes_revision ON settings_changes (revision);
    CREATE TABLE classification_changes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      at            TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_name    TEXT NOT NULL,
      space_name_id TEXT NOT NULL,
      entry_id      TEXT NOT NULL,
      entry_label   TEXT NOT NULL,
      from_json     TEXT NOT NULL,
      to_json       TEXT NOT NULL
    );
  `,
};

/** The stored schema version of a connection's settings tables (0 = none yet). */
export function settingsSchemaVersion(conn: DatabaseType): number {
  const exists = conn
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings_meta'")
    .get();
  if (!exists) return 0;
  const row = conn.prepare('SELECT schema_version FROM settings_meta').get() as
    | { schema_version: number }
    | undefined;
  return row?.schema_version ?? 0;
}

/**
 * Create or upgrade the settings tables on `conn` to {@link SETTINGS_SCHEMA_VERSION}.
 * Used for the application DB and for backup files alike. Returns the version found.
 */
export function migrateSettings(conn: DatabaseType): number {
  conn.exec('CREATE TABLE IF NOT EXISTS settings_meta (schema_version INTEGER NOT NULL)');
  if (!conn.prepare('SELECT 1 FROM settings_meta').get()) {
    conn.prepare('INSERT INTO settings_meta (schema_version) VALUES (0)').run();
  }
  const found = settingsSchemaVersion(conn);
  if (found > SETTINGS_SCHEMA_VERSION) {
    throw new Error(
      `settings: the tables are at schema version ${found}, newer than this build ` +
        `(${SETTINGS_SCHEMA_VERSION}). Deploy the newer build or restore a backup.`,
    );
  }
  for (let next = found + 1; next <= SETTINGS_SCHEMA_VERSION; next++) {
    conn.transaction(() => {
      conn.exec(MIGRATIONS[next]);
      conn.prepare('UPDATE settings_meta SET schema_version = ?').run(next);
    })();
  }
  return found;
}

let createdNow = false;

/**
 * Create/upgrade the settings tables in the application DB. Call after `initDatabase()`.
 * Records whether the tables were created by this call, so seeding can warn that a
 * restore may be needed.
 */
export function initSettingsStore(): DatabaseType {
  const db = getDatabase();
  createdNow = migrateSettings(db) === 0;
  if (createdNow) getLogger().info('Settings tables created', { context: 'Settings' });
  return db;
}

/** The connection holding the settings tables (the application DB). */
export function getSettingsDatabase(): DatabaseType {
  return getDatabase();
}

/** Whether {@link initSettingsStore} created the tables in this process. */
export function settingsCreatedNow(): boolean {
  return createdNow;
}
