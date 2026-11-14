import { getLogger } from '../logging/logger.js';
import type { MonitorScope, SettingsChangeKind, SettingsChangeView } from '../types/admin.js';
import { getSettingsDatabase } from './db.js';

/**
 * Reads and writes of the monitor settings (feature 027, data-model.md). Every write runs
 * in `BEGIN IMMEDIATE`, so a revision check and its write can never interleave with
 * another writer's (contracts/settings-store.md §5). No column holds a token, a session
 * id or Alkemio content beyond nameIDs/UUIDs and the actor's id and display name.
 */

export interface IncludedSpaceRow {
  position: number;
  nameId: string;
  spaceId: string | null;
}

export interface SettingsState {
  revision: number;
  ecosystemKey: string;
  updatedAt: string | null;
  updatedByName: string | null;
}

/** Who made a change, from the session (never a token). */
export interface Actor {
  userId: string;
  displayName: string;
}

interface ChangeRow {
  revision: number;
  kind: SettingsChangeKind;
  at: string;
  actor_name: string | null;
  added_json: string;
  removed_json: string;
  note: string | null;
}

const toView = (r: ChangeRow): SettingsChangeView => ({
  revision: r.revision,
  kind: r.kind,
  at: r.at,
  actorName: r.actor_name,
  added: JSON.parse(r.added_json) as string[],
  removed: JSON.parse(r.removed_json) as string[],
  note: r.note,
});

function readState(): SettingsState {
  const row = getSettingsDatabase()
    .prepare(
      'SELECT revision, ecosystem_key, updated_at, updated_by_name FROM settings_state WHERE id = 1',
    )
    .get() as
    | { revision: number; ecosystem_key: string; updated_at: string | null; updated_by_name: string | null }
    | undefined;
  if (!row) throw new Error('settings: the store has not been seeded');
  return {
    revision: row.revision,
    ecosystemKey: row.ecosystem_key,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
}

export function getState(): SettingsState {
  return readState();
}

/** The Included Spaces in order. */
export function getIncludedSpaces(): IncludedSpaceRow[] {
  return (
    getSettingsDatabase()
      .prepare('SELECT position, name_id, space_id FROM included_spaces ORDER BY position')
      .all() as Array<{ position: number; name_id: string; space_id: string | null }>
  ).map((r) => ({ position: r.position, nameId: r.name_id, spaceId: r.space_id }));
}

/** What every viewer's dashboard reports on (`GET /api/vng/scope`). SQLite only. */
export function getScope(): MonitorScope {
  const { revision, ecosystemKey } = readState();
  return { revision, ecosystemKey, spaceNameIds: getIncludedSpaces().map((r) => r.nameId) };
}

/** The newest change, or `null` (never, for a seeded store). */
export function lastChange(): SettingsChangeView | null {
  const row = getSettingsDatabase()
    .prepare(
      `SELECT revision, kind, at, actor_name, added_json, removed_json, note
       FROM settings_changes ORDER BY id DESC LIMIT 1`,
    )
    .get() as ChangeRow | undefined;
  return row ? toView(row) : null;
}

/**
 * The Included Spaces history, newest first. `before` pages by revision: pass the
 * previous page's `next`.
 */
export function history(
  limit = 50,
  before?: number,
): { changes: SettingsChangeView[]; next: number | null } {
  const size = Math.min(Math.max(1, Math.floor(limit) || 50), 200);
  const rows = getSettingsDatabase()
    .prepare(
      `SELECT revision, kind, at, actor_name, added_json, removed_json, note
       FROM settings_changes
       WHERE (? IS NULL OR revision < ?)
       ORDER BY revision DESC, id DESC
       LIMIT ?`,
    )
    .all(before ?? null, before ?? null, size + 1) as ChangeRow[];
  const page = rows.slice(0, size);
  return {
    changes: page.map(toView),
    next: rows.length > size ? page[page.length - 1].revision : null,
  };
}

export type SaveResult =
  | { ok: true; revision: number; change: SettingsChangeView }
  | { ok: false; conflict: { revision: number; spaces: IncludedSpaceRow[] } };

/**
 * Replace the Included Spaces as a whole, if nobody saved since `baseRevision` (research
 * R9). Validation of the names (readable, top-level, unique, limit) is the caller's job;
 * this only refuses a duplicate as a last line of defence. Known UUIDs are kept for
 * Spaces that stay.
 */
export function saveIncludedSpaces(input: {
  baseRevision: number;
  nameIds: string[];
  actor: Actor;
  now?: Date;
}): SaveResult {
  const db = getSettingsDatabase();
  if (new Set(input.nameIds).size !== input.nameIds.length) {
    throw new Error('settings: duplicate nameID in the Included Spaces');
  }
  const at = (input.now ?? new Date()).toISOString();
  const result = db
    .transaction((): SaveResult => {
      const state = readState();
      const current = getIncludedSpaces();
      if (state.revision !== input.baseRevision) {
        return { ok: false, conflict: { revision: state.revision, spaces: current } };
      }
      const before = new Set(current.map((r) => r.nameId));
      const after = new Set(input.nameIds);
      const added = input.nameIds.filter((n) => !before.has(n));
      const removed = current.map((r) => r.nameId).filter((n) => !after.has(n));
      const knownIds = new Map(current.map((r) => [r.nameId, r.spaceId]));
      const revision = state.revision + 1;

      db.prepare('DELETE FROM included_spaces').run();
      const insert = db.prepare(
        'INSERT INTO included_spaces (position, name_id, space_id) VALUES (?, ?, ?)',
      );
      input.nameIds.forEach((nameId, i) => insert.run(i, nameId, knownIds.get(nameId) ?? null));
      db.prepare(
        `UPDATE settings_state SET revision = ?, updated_at = ?, updated_by_user_id = ?, updated_by_name = ?
         WHERE id = 1`,
      ).run(revision, at, input.actor.userId, input.actor.displayName);
      db.prepare(
        `INSERT INTO settings_changes (revision, kind, at, actor_user_id, actor_name, added_json, removed_json, note)
         VALUES (?, 'update', ?, ?, ?, ?, ?, NULL)`,
      ).run(
        revision,
        at,
        input.actor.userId,
        input.actor.displayName,
        JSON.stringify(added),
        JSON.stringify(removed),
      );
      return {
        ok: true,
        revision,
        change: {
          revision,
          kind: 'update',
          at,
          actorName: input.actor.displayName,
          added,
          removed,
          note: null,
        },
      };
    })
    .immediate();

  if (result.ok) {
    // FR-035 / R15: who and what — never the display name or anything secret in the log.
    getLogger().info(
      `Included Spaces revision ${result.revision} by user ${input.actor.userId}: ` +
        `+[${result.change.added.join(', ')}] -[${result.change.removed.join(', ')}]`,
      { context: 'Settings' },
    );
  }
  return result;
}

/** Remember a Space's UUID once it is known (research R8). No revision change. */
export function setSpaceId(nameId: string, spaceId: string): void {
  getSettingsDatabase()
    .prepare(
      `UPDATE included_spaces SET space_id = ?
       WHERE name_id = ? AND space_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM included_spaces WHERE space_id = ?)`,
    )
    .run(spaceId, nameId, spaceId);
}

/**
 * A Space was renamed on Alkemio: found by its UUID under a new nameID. Update the row in
 * place and record a `rename` change (revision + 1), so the dashboard keeps loading it.
 * Returns the new revision, or `null` when nothing changed.
 */
export function recordRename(
  oldNameId: string,
  newNameId: string,
  spaceId: string,
  now = new Date(),
): number | null {
  const db = getSettingsDatabase();
  const at = now.toISOString();
  const revision = db
    .transaction((): number | null => {
      const row = db
        .prepare('SELECT position FROM included_spaces WHERE name_id = ? AND space_id = ?')
        .get(oldNameId, spaceId) as { position: number } | undefined;
      if (!row || oldNameId === newNameId) return null;
      if (db.prepare('SELECT 1 FROM included_spaces WHERE name_id = ?').get(newNameId)) return null;
      const next = readState().revision + 1;
      db.prepare('UPDATE included_spaces SET name_id = ? WHERE position = ?').run(
        newNameId,
        row.position,
      );
      db.prepare(
        `UPDATE settings_state SET revision = ?, updated_at = ?, updated_by_user_id = NULL, updated_by_name = NULL
         WHERE id = 1`,
      ).run(next, at);
      db.prepare(
        `INSERT INTO settings_changes (revision, kind, at, actor_user_id, actor_name, added_json, removed_json, note)
         VALUES (?, 'rename', ?, NULL, NULL, ?, ?, ?)`,
      ).run(
        next,
        at,
        JSON.stringify([newNameId]),
        JSON.stringify([oldNameId]),
        `renamed ${oldNameId}→${newNameId}`,
      );
      return next;
    })
    .immediate();
  if (revision !== null) {
    getLogger().info(`Included Space renamed on Alkemio: ${oldNameId} → ${newNameId}`, {
      context: 'Settings',
    });
  }
  return revision;
}

export interface ClassificationChange {
  actor: Actor;
  spaceNameId: string;
  entryId: string;
  entryLabel: string;
  from: Array<{ id: string; label: string }>;
  to: Array<{ id: string; label: string }>;
  now?: Date;
}

/** Append one saved classification change (research R15). */
export function recordClassificationChange(change: ClassificationChange): void {
  getSettingsDatabase()
    .prepare(
      `INSERT INTO classification_changes
         (at, actor_user_id, actor_name, space_name_id, entry_id, entry_label, from_json, to_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      (change.now ?? new Date()).toISOString(),
      change.actor.userId,
      change.actor.displayName,
      change.spaceNameId,
      change.entryId,
      change.entryLabel,
      JSON.stringify(change.from),
      JSON.stringify(change.to),
    );
  getLogger().info(
    `Classification '${change.entryLabel}' of ${change.spaceNameId} changed by user ${change.actor.userId}: ` +
      `[${change.from.map((v) => v.id).join(', ')}] → [${change.to.map((v) => v.id).join(', ')}]`,
    { context: 'Settings' },
  );
}
