import { readFileSync } from 'fs';
import { join } from 'path';
import type { Database as DatabaseType } from 'better-sqlite3';
import { loadConfig } from '../config.js';
import { getLogger } from '../logging/logger.js';

/**
 * The starting set shipped with the build (feature 027, research R7): what an EMPTY store
 * is filled with, once. It is never re-applied to a store that has state.
 */
export interface StartingSet {
  version: 1;
  ecosystemKey: string;
  includedSpaces: string[];
}

/** Where the build puts it (`pnpm run build` copies `src/data/` to `dist/data/`). */
export const DEFAULT_STARTING_SET_PATH = join(
  import.meta.dirname,
  '../data/vng/monitor-settings.seed.json',
);

const NAME_ID = /^[a-z0-9][a-z0-9-]{0,62}$/i;

/** Validate a parsed starting set; throws `settings: starting set …` on the first problem. */
export function validateStartingSet(raw: unknown, maxSpaces: number): StartingSet {
  const fail = (why: string): never => {
    throw new Error(`settings: starting set ${why}`);
  };
  if (!raw || typeof raw !== 'object') fail('is not a JSON object');
  const set = raw as Record<string, unknown>;
  if (set.version !== 1) fail(`has version ${JSON.stringify(set.version)}; expected 1`);
  if (typeof set.ecosystemKey !== 'string' || !NAME_ID.test(set.ecosystemKey.trim())) {
    fail('needs a non-empty ecosystemKey nameID');
  }
  if (!Array.isArray(set.includedSpaces)) fail('needs an includedSpaces array');
  const names = (set.includedSpaces as unknown[]).map((n, i) => {
    if (typeof n !== 'string' || !NAME_ID.test(n.trim())) {
      return fail(`includedSpaces[${i}] is not a valid nameID`);
    }
    return n.trim();
  });
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) fail(`lists '${n}' twice`);
    seen.add(n);
  }
  if (names.length > maxSpaces) {
    fail(`lists ${names.length} Spaces; the limit is ${maxSpaces} (limits.max_spaces_per_request)`);
  }
  if (names.length === 0) {
    getLogger().warn(
      'settings: the starting set lists no Spaces — the monitor would start with no initiatives',
      { context: 'Settings' },
    );
  }
  return { version: 1, ecosystemKey: (set.ecosystemKey as string).trim(), includedSpaces: names };
}

/** Load and validate the starting set file. */
export function loadStartingSet(
  path = DEFAULT_STARTING_SET_PATH,
  maxSpaces = loadConfig().maxSpacesPerRequest,
): StartingSet {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`settings: starting set ${path} could not be read — ${(err as Error).message}`);
  }
  return validateStartingSet(raw, maxSpaces);
}

/**
 * Fill an EMPTY store from the starting set, in one transaction: revision 1, the Spaces in
 * order, and one `kind='seed'` change. A store that has `settings_state` is never touched.
 * Returns whether it seeded.
 */
export function seedIfEmpty(
  db: DatabaseType,
  set: StartingSet,
  opts: { createdNow?: boolean; now?: Date } = {},
): boolean {
  const at = (opts.now ?? new Date()).toISOString();
  const seeded = db.transaction(() => {
    if (db.prepare('SELECT 1 FROM settings_state WHERE id = 1').get()) return false;
    db.prepare(
      `INSERT INTO settings_state (id, revision, ecosystem_key, updated_at, updated_by_user_id, updated_by_name)
       VALUES (1, 1, ?, ?, NULL, NULL)`,
    ).run(set.ecosystemKey, at);
    const insert = db.prepare('INSERT INTO included_spaces (position, name_id) VALUES (?, ?)');
    set.includedSpaces.forEach((nameId, i) => insert.run(i, nameId));
    db.prepare(
      `INSERT INTO settings_changes (revision, kind, at, actor_user_id, actor_name, added_json, removed_json, note)
       VALUES (1, 'seed', ?, NULL, NULL, ?, '[]', ?)`,
    ).run(at, JSON.stringify(set.includedSpaces), `from starting set v${set.version}`);
    return true;
  }).immediate();

  if (seeded) {
    const log = getLogger();
    log.info(
      `settings: seeded from the starting set — ${set.includedSpaces.length} Spaces, ecosystem '${set.ecosystemKey}'`,
      { context: 'Settings' },
    );
    if (opts.createdNow) {
      log.warn(
        'settings: the settings tables were newly created and filled from the starting set. If ' +
          'this deployment had monitor settings before, they are gone: restore the latest ' +
          'backup (server/src/settings/README.md, "Restore").',
        { context: 'Settings' },
      );
    }
  }
  return seeded;
}
