process.env.DB_PATH = ':memory:';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase, initDatabase } from '../cache/db.js';
import { initSettingsStore } from './db.js';
import { seedIfEmpty } from './seed.js';
import { getScope, history, saveIncludedSpaces } from './store.js';
import {
  backupFileName,
  lastBackup,
  listBackups,
  restoreSettingsFrom,
  runBackupIfDue,
} from './backup.js';
import { insertSession } from '../cache/session-store.js';
import { getLogger } from '../logging/logger.js';

vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));

let tmp: string;
let dir: string;
const actor = { userId: 'u1', displayName: 'Mia' };
const at = (d: string) => new Date(`${d}T12:00:00Z`);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-backup-'));
  dir = path.join(tmp, 'backups');
  initDatabase();
  seedIfEmpty(initSettingsStore(), { version: 1, ecosystemKey: 'vih-test', includedSpaces: ['a', 'b'] });
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('runBackupIfDue', () => {
  it('names the file settings.<slug>.<YYYY-MM-DD>.sqlite', () => {
    expect(backupFileName('identity-alkem-io', at('2026-11-14'))).toBe(
      'settings.identity-alkem-io.2026-11-14.sqlite',
    );
  });

  it('writes a backup when today’s is missing and skips when it exists', async () => {
    const first = await runBackupIfDue({ dir, slug: 'test', keep: 14, now: at('2026-11-14') });
    expect(first).toBe(path.join(dir, 'settings.test.2026-11-14.sqlite'));
    expect(await runBackupIfDue({ dir, slug: 'test', keep: 14, now: at('2026-11-14') })).toBe(
      'skipped',
    );
    expect(fs.readdirSync(dir)).toEqual(['settings.test.2026-11-14.sqlite']); // no temp files
  });

  it('holds the settings tables only — never sessions, tokens or the cache', async () => {
    const now = Date.now();
    insertSession({
      sessionId: 's1',
      userId: 'u1',
      displayName: 'Mia',
      avatarUrl: null,
      accessTokenEnc: Buffer.from('secret'),
      refreshTokenEnc: Buffer.from('secret'),
      accessExpiresAt: now + 1000,
      refreshExpiresAt: now + 1000,
      createdAt: now,
      lastSeenAt: now,
    });
    const file = (await runBackupIfDue({ dir, slug: 'test', keep: 2, now: at('2026-11-14') })) as string;
    const backup = new Database(file, { readonly: true });
    const tables = (
      backup.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
    )
      .map((t) => t.name)
      .filter((n) => n !== 'sqlite_sequence')
      .sort();
    backup.close();
    expect(tables).toEqual([
      'classification_changes',
      'included_spaces',
      'settings_changes',
      'settings_meta',
      'settings_state',
    ]);
  });

  it('keeps only the newest `keep` backups', async () => {
    for (const d of ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) {
      await runBackupIfDue({ dir, slug: 'test', keep: 2, now: at(d) });
    }
    expect(listBackups(dir, 'test')).toEqual([
      'settings.test.2026-11-13.sqlite',
      'settings.test.2026-11-12.sqlite',
    ]);
    expect(lastBackup({ dir, slug: 'test' })).toBe(path.join(dir, 'settings.test.2026-11-13.sqlite'));
  });

  it('logs a failure and never throws', async () => {
    const error = vi.spyOn(getLogger(), 'error').mockImplementation(() => getLogger());
    fs.writeFileSync(path.join(tmp, 'not-a-dir'), 'x');
    const result = await runBackupIfDue({ dir: path.join(tmp, 'not-a-dir', 'sub'), slug: 'test', keep: 2 });
    expect(result).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/backup FAILED/), expect.anything());
    error.mockRestore();
  });
});

describe('restoreSettingsFrom', () => {
  it('brings back the backed-up revision, Spaces and history, leaving the cache alone', async () => {
    saveIncludedSpaces({ baseRevision: 1, nameIds: ['b', 'c'], actor });
    const file = (await runBackupIfDue({ dir, slug: 'test', keep: 2, now: at('2026-11-14') })) as string;
    saveIncludedSpaces({ baseRevision: 2, nameIds: ['z'], actor }); // made after the backup
    getDatabase()
      .prepare('INSERT INTO cache_entries VALUES (?, ?, ?, ?, ?)')
      .run('u1', 'a', '{}', 1, Date.now() + 1e6);

    expect(restoreSettingsFrom(file)).toBe(2);
    expect(getScope()).toEqual({ revision: 2, ecosystemKey: 'vih-test', spaceNameIds: ['b', 'c'] });
    expect(history().changes.map((c) => c.revision)).toEqual([2, 1]);
    expect(getDatabase().prepare('SELECT COUNT(*) AS n FROM cache_entries').get()).toEqual({ n: 1 });
    // The restored store is never re-seeded.
    expect(seedIfEmpty(getDatabase(), { version: 1, ecosystemKey: 'x', includedSpaces: ['q'] })).toBe(
      false,
    );
  });

  it('refuses a file that is not a settings backup', () => {
    const bogus = path.join(tmp, 'bogus.sqlite');
    new Database(bogus).close();
    expect(() => restoreSettingsFrom(bogus)).toThrow(/schema version 0/);
    expect(() => restoreSettingsFrom(path.join(tmp, 'missing.sqlite'))).toThrow(/does not exist/);
  });
});
