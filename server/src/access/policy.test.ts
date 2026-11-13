import { describe, it, expect } from 'vitest';
import {
  APP_IDS,
  admits,
  gateUrlPath,
  levelFromRoles,
  parseGateRef,
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

describe('levelFromRoles', () => {
  it('is none without the MEMBER role — whatever other roles are held', () => {
    expect(levelFromRoles([])).toBe('none');
    expect(levelFromRoles(undefined)).toBe('none');
    expect(levelFromRoles(['ADMIN'])).toBe('none'); // Manage requires Read
    expect(levelFromRoles(['LEAD'])).toBe('none');
    expect(levelFromRoles(['GUEST', 'ANONYMOUS'])).toBe('none');
  });

  it('ignores privileges entirely — READ on a public Space is not a role', () => {
    expect(levelFromRoles(['READ', 'UPDATE'])).toBe('none');
  });

  it('is read with MEMBER (with or without LEAD)', () => {
    expect(levelFromRoles(['MEMBER'])).toBe('read');
    expect(levelFromRoles(['MEMBER', 'LEAD'])).toBe('read');
  });

  it('is manage with MEMBER and ADMIN', () => {
    expect(levelFromRoles(['MEMBER', 'ADMIN'])).toBe('manage');
    expect(levelFromRoles(['ADMIN', 'LEAD', 'MEMBER'])).toBe('manage');
  });
});

describe('admits', () => {
  const ungated: AccessPolicy = { app: 'explorer', gate: null };
  const read: AccessPolicy = { app: 'vng', gate: LIM, required: 'read' };
  const manage: AccessPolicy = { app: 'vng', gate: LIM, required: 'manage' };

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
