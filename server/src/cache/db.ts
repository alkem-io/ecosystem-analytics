import Database, { type Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: DatabaseType;

export function initDatabase(): void {
  const dbPath = path.resolve(process.env.DB_PATH || 'data/cache.sqlite');

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

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
}

export function getDatabase(): DatabaseType {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}
