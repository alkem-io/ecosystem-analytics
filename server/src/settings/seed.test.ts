process.env.DB_PATH = ':memory:';
import { initDatabase } from '../cache/db.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initSettingsStore } from './db.js';
import {
  DEFAULT_STARTING_SET_PATH,
  loadStartingSet,
  seedIfEmpty,
  validateStartingSet,
} from './seed.js';
import { getScope, history } from './store.js';
import { getLogger } from '../logging/logger.js';

vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));

const valid = { version: 1 as const, ecosystemKey: 'vih-test', includedSpaces: ['a', 'b'] };

beforeEach(() => {
  initDatabase();
  initSettingsStore();
});

describe('the committed starting set', () => {
  it('is valid and names the vih-test ecosystem', () => {
    const set = loadStartingSet(DEFAULT_STARTING_SET_PATH, 100);
    expect(set.version).toBe(1);
    expect(set.ecosystemKey).toBe('vih-test');
    expect(set.includedSpaces.length).toBeGreaterThan(0);
  });
});

describe('validateStartingSet', () => {
  it('accepts a valid set', () => {
    expect(validateStartingSet(valid, 100)).toEqual(valid);
  });

  it.each([
    ['a version other than 1', { ...valid, version: 2 }, /version/],
    ['an empty ecosystemKey', { ...valid, ecosystemKey: '' }, /ecosystemKey/],
    ['an empty nameID', { ...valid, includedSpaces: ['a', ''] }, /includedSpaces\[1\]/],
    ['a duplicate nameID', { ...valid, includedSpaces: ['a', 'a'] }, /twice/],
    ['too many Spaces', { ...valid, includedSpaces: ['a', 'b', 'c'] }, /limit is 2/],
    ['a non-object', 'nope', /JSON object/],
  ])('stops loading on %s', (_label, raw, why) => {
    expect(() => validateStartingSet(raw, 2)).toThrow(/^settings: starting set /);
    expect(() => validateStartingSet(raw, 2)).toThrow(why);
  });

  it('accepts an empty includedSpaces, with a warning', () => {
    const warn = vi.spyOn(getLogger(), 'warn').mockImplementation(() => getLogger());
    expect(validateStartingSet({ ...valid, includedSpaces: [] }, 100).includedSpaces).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no initiatives/), expect.anything());
    warn.mockRestore();
  });
});

describe('seedIfEmpty', () => {
  it('writes revision 1 and one seed change', () => {
    const db = initSettingsStore();
    expect(seedIfEmpty(db, valid)).toBe(true);
    expect(getScope()).toEqual({ revision: 1, ecosystemKey: 'vih-test', spaceNameIds: ['a', 'b'] });
    const { changes } = history();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      revision: 1,
      kind: 'seed',
      actorName: null,
      added: ['a', 'b'],
      removed: [],
      note: 'from starting set v1',
    });
  });

  it('never re-seeds a store that has state, even with another starting set', () => {
    const db = initSettingsStore();
    seedIfEmpty(db, valid);
    expect(seedIfEmpty(db, { ...valid, ecosystemKey: 'other', includedSpaces: ['z'] })).toBe(false);
    expect(getScope().spaceNameIds).toEqual(['a', 'b']);
    expect(history().changes).toHaveLength(1);
  });

  it('warns that a restore may be needed when it seeds a newly created file', () => {
    const warn = vi.spyOn(getLogger(), 'warn').mockImplementation(() => getLogger());
    seedIfEmpty(initSettingsStore(), valid, { createdNow: true });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/restore the latest backup/), expect.anything());
    warn.mockRestore();
  });
});
