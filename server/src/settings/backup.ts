import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { envSlug } from '../cache/db.js';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';
import {
  SETTINGS_TABLES,
  getSettingsDatabase,
  migrateSettings,
  settingsSchemaVersion,
  SETTINGS_SCHEMA_VERSION,
} from './db.js';

/**
 * The daily backup of the monitor settings (feature 027, research R6). The settings live
 * in the application's one SQLite file, which also holds the cache and the (encrypted)
 * sessions — so the backup copies ONLY the settings tables into a small file of their
 * own. No session, token or cached Alkemio data is ever written to a backup. At most a day
 * of settings changes can be lost (FR-012). A failure is logged and retried on the next
 * tick — it never stops the app.
 */

export interface BackupOptions {
  dir?: string;
  keep?: number;
  slug?: string;
  now?: Date;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** `data/backups/` unless `settings.backup_dir` says otherwise. */
export function backupDir(): string {
  return path.resolve(loadConfig().settings.backupDir || path.join('data', 'backups'));
}

/** The environment slug, as in `cache.<slug>.sqlite`. */
export function defaultSlug(): string {
  return envSlug(loadConfig().oidc.issuer) || 'default';
}

export const backupFileName = (slug: string, date: Date) => `settings.${slug}.${day(date)}.sqlite`;

/** Backups of this slug, newest first. */
export function listBackups(dir: string, slug: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const pattern = new RegExp(
    `^settings\\.${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d{4}-\\d{2}-\\d{2}\\.sqlite$`,
  );
  return fs
    .readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort()
    .reverse();
}

/** The newest backup file (full path), or `null`. */
export function lastBackup(opts: Pick<BackupOptions, 'dir' | 'slug'> = {}): string | null {
  const dir = opts.dir ?? backupDir();
  const [newest] = listBackups(dir, opts.slug ?? defaultSlug());
  return newest ? path.join(dir, newest) : null;
}

/** Copy every settings table from schema `from` to schema `to` on one connection. */
function copyTables(conn: Database.Database, from: string, to: string): void {
  for (const table of SETTINGS_TABLES) {
    conn.exec(`DELETE FROM ${to}.${table}`);
    conn.exec(`INSERT INTO ${to}.${table} SELECT * FROM ${from}.${table}`);
  }
}

/** Write the settings tables, and only those, to a new SQLite file at `file`. */
export function writeSettingsSnapshot(file: string): void {
  const out = new Database(file);
  try {
    migrateSettings(out);
  } finally {
    out.close();
  }
  const db = getSettingsDatabase();
  db.prepare('ATTACH DATABASE ? AS backup').run(file);
  try {
    db.transaction(() => copyTables(db, 'main', 'backup'))();
  } finally {
    db.exec('DETACH DATABASE backup');
  }
}

/**
 * Restore the settings tables from a backup file, replacing what the application DB holds
 * (the cache and sessions are untouched). Run with the app stopped
 * (`scripts/restore-settings.ts`). Returns the restored revision.
 */
export function restoreSettingsFrom(file: string): number {
  if (!fs.existsSync(file)) throw new Error(`settings: backup ${file} does not exist`);
  const probe = new Database(file, { readonly: true, fileMustExist: true });
  let version: number;
  try {
    version = settingsSchemaVersion(probe);
  } finally {
    probe.close();
  }
  if (version !== SETTINGS_SCHEMA_VERSION) {
    throw new Error(
      `settings: backup ${file} is at schema version ${version}; this build expects ${SETTINGS_SCHEMA_VERSION}`,
    );
  }
  const db = getSettingsDatabase();
  db.prepare('ATTACH DATABASE ? AS backup').run(file);
  try {
    db.transaction(() => copyTables(db, 'backup', 'main')).immediate();
  } finally {
    db.exec('DETACH DATABASE backup');
  }
  const row = db.prepare('SELECT revision FROM settings_state WHERE id = 1').get() as
    | { revision: number }
    | undefined;
  if (!row) throw new Error(`settings: backup ${file} holds no settings state`);
  getLogger().warn(`settings: RESTORED revision ${row.revision} from ${file}`, {
    context: 'Settings',
  });
  return row.revision;
}

/**
 * Back up the settings if today's file is missing (so several replicas never collide),
 * then keep only the newest `keep`. Resolves to the backup file written, `'skipped'` when
 * today's exists, or `null` after a logged failure. Never rejects.
 */
export async function runBackupIfDue(opts: BackupOptions = {}): Promise<string | 'skipped' | null> {
  const log = getLogger();
  try {
    const dir = opts.dir ?? backupDir();
    const keep = opts.keep ?? loadConfig().settings.backupKeep;
    const slug = opts.slug ?? defaultSlug();
    const target = path.join(dir, backupFileName(slug, opts.now ?? new Date()));
    if (fs.existsSync(target)) return 'skipped';

    fs.mkdirSync(dir, { recursive: true });
    const temp = `${target}.tmp-${process.pid}`;
    fs.rmSync(temp, { force: true });
    try {
      writeSettingsSnapshot(temp);
      fs.renameSync(temp, target);
    } finally {
      fs.rmSync(temp, { force: true });
    }

    for (const old of listBackups(dir, slug).slice(Math.max(1, keep))) {
      fs.rmSync(path.join(dir, old), { force: true });
    }
    log.info(`settings: backup written to ${target}`, { context: 'Settings' });
    return target;
  } catch (err) {
    log.error(`settings: backup FAILED — ${(err as Error).message}. Will retry.`, {
      context: 'Settings',
    });
    return null;
  }
}

const TICK_MS = 60 * 60 * 1000;

/**
 * Check hourly and back up once per calendar day (UTC). Hourly ticks make a failed backup
 * retry within the hour instead of a day later. The timer never keeps the process alive.
 */
export function scheduleDailyBackup(opts: Omit<BackupOptions, 'now'> = {}): NodeJS.Timeout {
  const timer = setInterval(() => void runBackupIfDue(opts), TICK_MS);
  timer.unref();
  return timer;
}
