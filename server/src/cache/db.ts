import Database, { type Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getLogger } from '../logging/logger.js';

let db: DatabaseType;

/**
 * Turn an environment discriminator (an OIDC issuer or Alkemio server URL) into a
 * filesystem-safe slug, e.g. `https://identity.acc-alkem.io/` -> `identity-acc-alkem-io`.
 */
function envSlug(discriminator?: string): string {
  if (!discriminator) return '';
  let host = discriminator;
  try {
    host = new URL(discriminator).host || discriminator;
  } catch {
    // Not a URL (e.g. already a bare host) — slugify as-is.
  }
  return host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve the SQLite file path. An explicit `DB_PATH` always wins verbatim (respects
 * ops/test intent, including `:memory:`). Otherwise the default file is namespaced by
 * environment — `data/cache.<env-slug>.sqlite` — so switching `OIDC_ISSUER` /
 * `ALKEMIO_SERVER_URL` between e.g. production and acceptance can never reuse another
 * environment's cache or session rows. Those rows are keyed only by `user_id`
 * (Alkemio actor UUID), which collides across environments when acceptance is a
 * restore/clone of production; a per-environment file is the isolation boundary.
 */
function resolveDbPath(envDiscriminator?: string): { rawPath: string; inMemory: boolean } {
  const explicit = process.env.DB_PATH;
  if (explicit) {
    return { rawPath: explicit, inMemory: explicit === ':memory:' };
  }
  const slug = envSlug(envDiscriminator);
  const fileName = slug ? `cache.${slug}.sqlite` : 'cache.sqlite';
  return { rawPath: path.join('data', fileName), inMemory: false };
}

/**
 * @param envDiscriminator OIDC issuer or Alkemio server URL used to namespace the
 *   default DB file per environment. Ignored when `DB_PATH` is set explicitly.
 */
export function initDatabase(envDiscriminator?: string): void {
  const { rawPath, inMemory } = resolveDbPath(envDiscriminator);
  const dbPath = inMemory ? ':memory:' : path.resolve(rawPath);

  if (!inMemory) {
    // Ensure directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  getLogger().info(`SQLite store: ${dbPath}`, { context: 'Cache' });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS cache_entries (
      user_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      dataset_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, space_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS query_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      query_text TEXT NOT NULL,
      answer_json TEXT NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_query_feedback_user_id ON query_feedback (user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_query_feedback_created_at ON query_feedback (created_at)`);

  // --- OIDC auth (feature 015) -------------------------------------------
  // Pre-auth (CSRF/replay defense) records — created at /login, consumed once
  // at callback, then deleted. Isolated from session state on purpose.
  db.exec(`
    CREATE TABLE IF NOT EXISTS oidc_auth_tx (
      tx_id          TEXT PRIMARY KEY,
      state          TEXT NOT NULL,
      nonce          TEXT NOT NULL,
      code_verifier  TEXT NOT NULL,
      return_to      TEXT NOT NULL,
      created_at     INTEGER NOT NULL,
      expires_at     INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_oidc_auth_tx_expires ON oidc_auth_tx (expires_at)`);

  // EA's own server-side sessions. Tokens are encrypted at rest (AES-256-GCM);
  // the browser only ever holds the opaque session_id cookie (FR-018a).
  db.exec(`
    CREATE TABLE IF NOT EXISTS oidc_sessions (
      session_id          TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL,
      display_name        TEXT,
      avatar_url          TEXT,
      access_token_enc    BLOB NOT NULL,
      refresh_token_enc   BLOB NOT NULL,
      access_expires_at   INTEGER NOT NULL,
      refresh_expires_at  INTEGER NOT NULL,
      created_at          INTEGER NOT NULL,
      last_seen_at        INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_oidc_sessions_user ON oidc_sessions (user_id)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_oidc_sessions_refresh_exp ON oidc_sessions (refresh_expires_at)`,
  );
}

export function getDatabase(): DatabaseType {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}
