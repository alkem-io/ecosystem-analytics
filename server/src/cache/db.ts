import Database, { type Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: DatabaseType;

export function initDatabase(): void {
  const rawPath = process.env.DB_PATH || 'data/cache.sqlite';
  const inMemory = rawPath === ':memory:';
  const dbPath = inMemory ? ':memory:' : path.resolve(rawPath);

  if (!inMemory) {
    // Ensure directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

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
