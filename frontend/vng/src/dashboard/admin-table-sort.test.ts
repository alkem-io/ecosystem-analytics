import { describe, expect, it } from 'vitest';
import type { DesignatedValues, IncludedSpaceView } from '@server/types/admin.js';
import {
  classificationSortValue,
  nextSort,
  sortRows,
  visibilitySortValue,
  type SortDir,
  type SortValue,
} from '@ea/shared/admin/tableSort.js';

const rows = (pairs: Array<[string, SortValue]>) => pairs.map(([name, value]) => ({ name, value }));
const order = (pairs: Array<[string, SortValue]>, dir: SortDir) =>
  sortRows(rows(pairs), (r) => r.value, (r) => r.name, dir, 'nl').map((r) => r.name);

const value = (key: DesignatedValues['key'], values: string[], rank: number | null): DesignatedValues => ({
  key,
  present: true,
  values,
  rank,
});

describe('admin table sorting', () => {
  it('sorts text with numbers in order, both ways, without touching the input', () => {
    const input: Array<[string, SortValue]> = [['b', 'TRL 10'], ['a', 'TRL 2'], ['c', 'trl 1']];
    expect(order(input, 'asc')).toEqual(['c', 'a', 'b']);
    expect(order(input, 'desc')).toEqual(['b', 'a', 'c']);
    expect(input[0][0]).toBe('b');
  });

  it('keeps rows without a value last in both directions, and ties A→Z', () => {
    const input: Array<[string, SortValue]> = [['z', null], ['d', 1], ['c', 1], ['y', null], ['e', 2]];
    expect(order(input, 'asc')).toEqual(['c', 'd', 'e', 'y', 'z']);
    expect(order(input, 'desc')).toEqual(['e', 'c', 'd', 'y', 'z']);
  });

  it('sorts phase and TRL in their order on Alkemio, the others by name', () => {
    expect(classificationSortValue(value('phase', ['Pilot'], 0))).toBe(0);
    expect(classificationSortValue(value('trl', ['TRL 3'], 2))).toBe(2);
    expect(classificationSortValue(value('nds', ['Data', 'AI'], 1))).toBe('Data, AI');
    expect(classificationSortValue(value('nds', [], null))).toBeNull();
    expect(classificationSortValue(undefined)).toBeNull();
  });

  it('sorts visibility public before private, active before archived', () => {
    const v = (contentPublic: boolean | null, status: string) =>
      visibilitySortValue({ visibility: { contentPublic, status } } as IncludedSpaceView);
    expect([v(true, 'ACTIVE'), v(true, 'ARCHIVED'), v(false, 'ACTIVE'), v(false, 'DEMO')]).toEqual([0, 1, 2, 3]);
    expect(v(null, 'ACTIVE')).toBeNull();
  });

  it('starts a new column ascending and reverses the active one', () => {
    expect(nextSort({ key: 'a', dir: 'desc' }, 'b' as string)).toEqual({ key: 'b', dir: 'asc' });
    expect(nextSort({ key: 'a', dir: 'asc' }, 'a')).toEqual({ key: 'a', dir: 'desc' });
  });
});
