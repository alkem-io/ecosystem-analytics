process.env.DB_PATH = ':memory:';
import { initDatabase } from '../cache/db.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SETTINGS_TABLES, getSettingsDatabase, initSettingsStore } from './db.js';
import { seedIfEmpty } from './seed.js';
import {
  getIncludedSpaces,
  getScope,
  history,
  lastChange,
  recordClassificationChange,
  recordRename,
  saveIncludedSpaces,
  setSpaceId,
} from './store.js';

vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));

const actor = { userId: 'user-1', displayName: 'Mia Manager' };

beforeEach(() => {
  const db = (initDatabase(), initSettingsStore());
  seedIfEmpty(db, { version: 1, ecosystemKey: 'vih-test', includedSpaces: ['a', 'b', 'c'] });
});

describe('saveIncludedSpaces', () => {
  it('replaces the rows in order, bumps the revision by 1 and records the diff', () => {
    const result = saveIncludedSpaces({ baseRevision: 1, nameIds: ['c', 'a', 'd'], actor });
    expect(result).toMatchObject({ ok: true, revision: 2 });
    expect(getScope()).toEqual({ revision: 2, ecosystemKey: 'vih-test', spaceNameIds: ['c', 'a', 'd'] });
    expect(lastChange()).toMatchObject({
      revision: 2,
      kind: 'update',
      actorName: 'Mia Manager',
      added: ['d'],
      removed: ['b'],
    });
  });

  it('returns a conflict carrying the current state for a stale base revision', () => {
    saveIncludedSpaces({ baseRevision: 1, nameIds: ['a'], actor });
    const stale = saveIncludedSpaces({ baseRevision: 1, nameIds: ['b'], actor });
    expect(stale).toEqual({
      ok: false,
      conflict: { revision: 2, spaces: [{ position: 0, nameId: 'a', spaceId: null }] },
    });
    expect(getScope().spaceNameIds).toEqual(['a']);
  });

  it('keeps known UUIDs for Spaces that stay', () => {
    setSpaceId('a', 'uuid-a');
    saveIncludedSpaces({ baseRevision: 1, nameIds: ['b', 'a'], actor });
    expect(getIncludedSpaces()).toEqual([
      { position: 0, nameId: 'b', spaceId: null },
      { position: 1, nameId: 'a', spaceId: 'uuid-a' },
    ]);
  });

  it('allows an empty set (the route asks for confirmation first)', () => {
    expect(saveIncludedSpaces({ baseRevision: 1, nameIds: [], actor }).ok).toBe(true);
    expect(getScope().spaceNameIds).toEqual([]);
  });

  it('refuses a duplicate as a last line of defence', () => {
    expect(() => saveIncludedSpaces({ baseRevision: 1, nameIds: ['a', 'a'], actor })).toThrow(/duplicate/);
  });
});

describe('history', () => {
  it('pages newest first', () => {
    for (let r = 1; r <= 4; r++) saveIncludedSpaces({ baseRevision: r, nameIds: [`x${r}`], actor });
    const first = history(2);
    expect(first.changes.map((c) => c.revision)).toEqual([5, 4]);
    expect(first.next).toBe(4);
    const second = history(2, first.next!);
    expect(second.changes.map((c) => c.revision)).toEqual([3, 2]);
    const last = history(2, second.next!);
    expect(last.changes.map((c) => c.kind)).toEqual(['seed']);
    expect(last.next).toBeNull();
  });
});

describe('setSpaceId', () => {
  it('fills a missing UUID once and never overwrites it', () => {
    setSpaceId('a', 'uuid-a');
    setSpaceId('a', 'uuid-other');
    expect(getIncludedSpaces()[0].spaceId).toBe('uuid-a');
    expect(getScope().revision).toBe(1);
  });

  it('ignores a UUID another row already holds', () => {
    setSpaceId('a', 'uuid-a');
    setSpaceId('b', 'uuid-a');
    expect(getIncludedSpaces()[1].spaceId).toBeNull();
  });
});

describe('recordRename', () => {
  it('updates the row in place and records a rename change', () => {
    setSpaceId('b', 'uuid-b');
    expect(recordRename('b', 'b-new', 'uuid-b')).toBe(2);
    expect(getScope().spaceNameIds).toEqual(['a', 'b-new', 'c']);
    expect(lastChange()).toMatchObject({
      kind: 'rename',
      actorName: null,
      added: ['b-new'],
      removed: ['b'],
      note: 'renamed b→b-new',
    });
  });

  it('does nothing when the UUID does not match or the new name is already listed', () => {
    setSpaceId('b', 'uuid-b');
    expect(recordRename('b', 'b-new', 'uuid-x')).toBeNull();
    expect(recordRename('b', 'c', 'uuid-b')).toBeNull();
    expect(getScope().revision).toBe(1);
  });
});

describe('recordClassificationChange', () => {
  it('appends one row', () => {
    recordClassificationChange({
      actor,
      spaceNameId: 'a',
      entryId: 'e1',
      entryLabel: 'Fase',
      from: [{ id: 'v1', label: 'Idee' }],
      to: [{ id: 'v2', label: 'Pilot' }],
    });
    const rows = getSettingsDatabase().prepare('SELECT * FROM classification_changes').all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: 'user-1',
      actor_name: 'Mia Manager',
      space_name_id: 'a',
      entry_label: 'Fase',
      to_json: JSON.stringify([{ id: 'v2', label: 'Pilot' }]),
    });
  });
});

describe('what the store holds', () => {
  it('has no column that could hold a token, session or cookie', () => {
    const db = getSettingsDatabase();
    const tables = [...SETTINGS_TABLES, 'settings_meta'];
    const columns = tables.flatMap((t) =>
      (db.pragma(`table_info(${t})`) as Array<{ name: string }>).map((c) => c.name),
    );
    expect(columns.length).toBeGreaterThan(20);
    for (const c of columns) expect(c).not.toMatch(/token|session|cookie|secret|password/i);
  });
});
