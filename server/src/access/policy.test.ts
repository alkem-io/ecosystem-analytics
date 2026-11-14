import { describe, it, expect } from 'vitest';
import {
  APP_IDS,
  admits,
  gateUrlPath,
  levelFromSets,
  parseGateList,
  parseGateRef,
  setKey,
  type AccessPolicy,
  type GateRef,
} from './policy.js';

const LIM: GateRef = {
  path: ['programmagroei', 'landelijkinnovatiemonitor'],
  key: 'programmagroei/landelijkinnovatiemonitor',
};

describe('parseGateRef', () => {
  it('treats the literal `none` as explicitly ungated', () => {
    expect(parseGateRef('none')).toBeNull();
    expect(parseGateRef('  NONE ')).toBeNull();
  });

  it('parses a path of one to three nameIDs', () => {
    expect(parseGateRef('programmagroei')).toEqual({
      path: ['programmagroei'],
      key: 'programmagroei',
    });
    expect(parseGateRef('programmagroei/landelijkinnovatiemonitor')).toEqual(LIM);
    expect(parseGateRef('a1/b2/c3')).toEqual({ path: ['a1', 'b2', 'c3'], key: 'a1/b2/c3' });
  });

  it('tolerates surrounding whitespace and a leading/trailing slash, and lowercases', () => {
    expect(parseGateRef(' /Programmagroei/LandelijkInnovatieMonitor/ ')).toEqual(LIM);
  });

  it('accepts a full Alkemio Space URL, ignoring host and the challenges/opportunities segments', () => {
    expect(
      parseGateRef('https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor'),
    ).toEqual(LIM);
    expect(parseGateRef('https://acc-alkem.io/a1/challenges/b2/opportunities/c3')).toEqual({
      path: ['a1', 'b2', 'c3'],
      key: 'a1/b2/c3',
    });
    expect(parseGateRef('https://alkem.io/programmagroei/')).toEqual({
      path: ['programmagroei'],
      key: 'programmagroei',
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['four levels', 'a1/b2/c3/d4'],
    ['empty segments', 'nope///'],
    ['invalid characters', 'pro gramma'],
    ['invalid characters in a segment', 'programmagroei/lim!'],
    ['a URL with no path', 'https://alkem.io/'],
    ['a URL with an unexpected marker', 'https://alkem.io/space/foo/bar'],
  ])('rejects %s', (_label, value) => {
    expect(() => parseGateRef(value)).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() => parseGateRef(undefined as unknown as string)).toThrow();
    expect(() => parseGateRef(42 as unknown as string)).toThrow();
  });
});

describe('gateUrlPath', () => {
  it('builds the Alkemio URL path for each depth', () => {
    expect(gateUrlPath({ path: ['a1'], key: 'a1' })).toBe('/a1');
    expect(gateUrlPath(LIM)).toBe('/programmagroei/challenges/landelijkinnovatiemonitor');
    expect(gateUrlPath({ path: ['a1', 'b2', 'c3'], key: 'a1/b2/c3' })).toBe(
      '/a1/challenges/b2/opportunities/c3',
    );
  });
});

describe('parseGateList', () => {
  it('parses a comma-separated list, trimming whitespace', () => {
    expect(parseGateList('a, b/c')).toEqual([
      { path: ['a'], key: 'a' },
      { path: ['b', 'c'], key: 'b/c' },
    ]);
    expect(parseGateList('https://alkem.io/programmagroei')).toEqual([
      { path: ['programmagroei'], key: 'programmagroei' },
    ]);
  });

  it('gives an empty list for an empty value (no admin Spaces)', () => {
    expect(parseGateList('')).toEqual([]);
    expect(parseGateList('  ')).toEqual([]);
  });

  it('rejects an empty item, a duplicate, `none` inside a list and garbage', () => {
    expect(() => parseGateList('a,,b')).toThrow(/empty item/);
    expect(() => parseGateList('a, ')).toThrow(/empty item/);
    expect(() => parseGateList('a, A')).toThrow(/listed twice/);
    expect(() => parseGateList('a, none')).toThrow(/none/);
    expect(() => parseGateList('a, not a space!')).toThrow();
  });
});

describe('setKey', () => {
  const a = { path: ['a'], key: 'a' };
  const b = { path: ['b', 'c'], key: 'b/c' };
  it('is v:<sorted viewers>|a:<sorted admins>, independent of order', () => {
    expect(setKey([a, b], [a])).toBe('v:a,b/c|a:a');
    expect(setKey([b, a], [a])).toBe(setKey([a, b], [a]));
    expect(setKey([a], [])).toBe('v:a|a:');
  });

  it('differs when either set changes', () => {
    expect(setKey([a], [a])).not.toBe(setKey([a], [b]));
    expect(setKey([a], [a])).not.toBe(setKey([a, b], [a]));
  });
});

describe('levelFromSets', () => {
  const viewer = { path: ['viewers'], key: 'viewers' };
  const admin = { path: ['admins'], key: 'admins' };
  const sets = { viewers: [viewer], admins: [admin] };
  const roles = (entries: Record<string, string[] | null>) => new Map(Object.entries(entries));

  it('is manage with ADMIN on an admin Space, even without MEMBER (FR-007)', () => {
    expect(levelFromSets(sets, roles({ admins: ['ADMIN'] }))).toBe('manage');
    expect(levelFromSets(sets, roles({ viewers: ['MEMBER'], admins: ['ADMIN'] }))).toBe('manage');
  });

  it('is read with MEMBER on a viewer Space', () => {
    expect(levelFromSets(sets, roles({ viewers: ['MEMBER'] }))).toBe('read');
    expect(levelFromSets(sets, roles({ viewers: ['MEMBER', 'LEAD'], admins: ['MEMBER'] }))).toBe(
      'read',
    );
  });

  it('is none with ADMIN on a viewer-only Space', () => {
    expect(levelFromSets(sets, roles({ viewers: ['ADMIN'] }))).toBe('none');
  });

  it('is none with LEAD alone, with nothing, and ignores privileges', () => {
    expect(levelFromSets(sets, roles({ viewers: ['LEAD'], admins: ['LEAD'] }))).toBe('none');
    expect(levelFromSets(sets, roles({}))).toBe('none');
    expect(levelFromSets(sets, roles({ viewers: null, admins: null }))).toBe('none');
    expect(levelFromSets(sets, roles({ viewers: ['READ', 'UPDATE'] }))).toBe('none');
  });

  it('uses one Space in both sets for both roles', () => {
    const both = { viewers: [viewer], admins: [viewer] };
    expect(levelFromSets(both, roles({ viewers: ['ADMIN'] }))).toBe('manage');
    expect(levelFromSets(both, roles({ viewers: ['MEMBER'] }))).toBe('read');
  });

  it('is none for every role when the admin set is empty and no MEMBER is held', () => {
    expect(levelFromSets({ viewers: [viewer], admins: [] }, roles({ viewers: ['ADMIN'] }))).toBe(
      'none',
    );
  });
});

describe('admits', () => {
  const sets = { viewers: [LIM], admins: [LIM], setKey: setKey([LIM], [LIM]) };
  const ungated: AccessPolicy = { app: 'explorer', gate: null };
  const read: AccessPolicy = { app: 'vng', gate: sets, required: 'read' };
  const manage: AccessPolicy = { app: 'vng', gate: sets, required: 'manage' };

  it('admits every level on an ungated policy', () => {
    expect(admits(ungated, 'none')).toBe(true);
    expect(admits(ungated, 'read')).toBe(true);
    expect(admits(ungated, 'manage')).toBe(true);
  });

  it('requires at least read on a read policy', () => {
    expect(admits(read, 'none')).toBe(false);
    expect(admits(read, 'read')).toBe(true);
    expect(admits(read, 'manage')).toBe(true);
  });

  it('requires manage on a manage policy', () => {
    expect(admits(manage, 'none')).toBe(false);
    expect(admits(manage, 'read')).toBe(false);
    expect(admits(manage, 'manage')).toBe(true);
  });
});

describe('APP_IDS', () => {
  it('lists every application', () => {
    expect([...APP_IDS].sort()).toEqual(['explorer', 'govtech', 'vng']);
  });
});
