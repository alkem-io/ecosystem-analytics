import { getLogger } from '../logging/logger.js';
import { getSettingsDatabase } from './db.js';
import type { Actor } from './store.js';

/**
 * Access Spaces set by Monitor Managers (the admin area's "Toegang" tab). An app with no
 * row here uses its deployment configuration (`access.<app>` / `access.<app>_admin`);
 * once a manager saves, the stored sets apply instead — see `access/effective-sets.ts`.
 *
 * A Space is stored by its gate key (`space`, `space/subspace`, …, see
 * `access/policy.ts`) plus the name it had when saved, for the screens.
 */

export interface StoredSpace {
  key: string;
  displayName: string;
}

export interface StoredAccess {
  viewers: StoredSpace[];
  admins: StoredSpace[];
  revision: number;
  updatedAt: string;
  updatedByName: string;
}

export class AccessConflictError extends Error {
  constructor(readonly current: number) {
    super('ACCESS_REVISION_CONFLICT');
  }
}

/**
 * The stored sets for `app`, or `null` when none are stored (the configuration applies).
 * Also `null` when the settings tables do not exist in this connection (a bare test
 * database) — any other database error propagates.
 */
export function getStoredAccess(app: string): StoredAccess | null {
  const db = getSettingsDatabase();
  let state: { revision: number; updated_at: string; updated_by_name: string } | undefined;
  try {
    state = db
      .prepare('SELECT revision, updated_at, updated_by_name FROM access_state WHERE app = ?')
      .get(app) as typeof state;
  } catch (err) {
    if (/no such table/i.test((err as Error).message)) return null;
    throw err;
  }
  if (!state) return null;
  const rows = db
    .prepare(
      'SELECT role, space_key, display_name FROM access_sets WHERE app = ? ORDER BY role, position',
    )
    .all(app) as Array<{ role: 'viewer' | 'admin'; space_key: string; display_name: string }>;
  const of = (role: 'viewer' | 'admin') =>
    rows.filter((r) => r.role === role).map((r) => ({ key: r.space_key, displayName: r.display_name }));
  return {
    viewers: of('viewer'),
    admins: of('admin'),
    revision: state.revision,
    updatedAt: state.updated_at,
    updatedByName: state.updated_by_name,
  };
}

/**
 * Replace `app`'s access sets, if `baseRevision` is still current (0 = the configuration
 * was in force), and record the change. Returns the new revision. The caller validates
 * the Spaces and guards against a manager locking themselves out.
 */
export function saveAccess(input: {
  app: string;
  baseRevision: number;
  from: { viewers: StoredSpace[]; admins: StoredSpace[] };
  viewers: StoredSpace[];
  admins: StoredSpace[];
  actor: Actor;
  now?: Date;
}): number {
  const db = getSettingsDatabase();
  const at = (input.now ?? new Date()).toISOString();
  const revision = db.transaction(() => {
    const current =
      (db.prepare('SELECT revision FROM access_state WHERE app = ?').get(input.app) as
        | { revision: number }
        | undefined)?.revision ?? 0;
    if (current !== input.baseRevision) throw new AccessConflictError(current);
    const next = current + 1;
    db.prepare(
      `INSERT INTO access_state (app, revision, updated_at, updated_by_user_id, updated_by_name)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (app) DO UPDATE SET revision = excluded.revision, updated_at = excluded.updated_at,
         updated_by_user_id = excluded.updated_by_user_id, updated_by_name = excluded.updated_by_name`,
    ).run(input.app, next, at, input.actor.userId, input.actor.displayName);
    db.prepare('DELETE FROM access_sets WHERE app = ?').run(input.app);
    const insert = db.prepare(
      'INSERT INTO access_sets (app, role, position, space_key, display_name) VALUES (?, ?, ?, ?, ?)',
    );
    input.viewers.forEach((s, i) => insert.run(input.app, 'viewer', i, s.key, s.displayName));
    input.admins.forEach((s, i) => insert.run(input.app, 'admin', i, s.key, s.displayName));
    db.prepare(
      `INSERT INTO access_changes (at, actor_user_id, actor_name, app, from_json, to_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      at,
      input.actor.userId,
      input.actor.displayName,
      input.app,
      JSON.stringify(input.from),
      JSON.stringify({ viewers: input.viewers, admins: input.admins }),
    );
    return next;
  }).immediate(); // the write lock BEFORE the revision read, as in saveIncludedSpaces
  getLogger().info(
    `Access Spaces of ${input.app} changed by user ${input.actor.userId} (revision ${revision}): ` +
      `viewers [${input.viewers.map((s) => s.key).join(', ')}], admins [${input.admins.map((s) => s.key).join(', ')}]`,
    { context: 'Settings' },
  );
  return revision;
}
