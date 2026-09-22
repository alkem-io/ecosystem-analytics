import { describe, it, expect, vi } from 'vitest';
import type { GraphDataset } from '@server/types/graph.js';
import { memoiseByDataset } from '@ea/shared/dashboard/data/derive/memo.js';

const dataset = (): GraphDataset =>
  ({ nodes: [], edges: [], metadata: {}, cacheInfo: [] }) as unknown as GraphDataset;

describe('memoiseByDataset (feature 025, FR-006)', () => {
  it('returns the same object for the same dataset identity and equal inputs', () => {
    const fn = vi.fn((d: GraphDataset, i: { ids: string[] }) => ({ n: d.nodes.length, ids: i.ids }));
    const memo = memoiseByDataset(fn);
    const d = dataset();
    const a = memo(d, { ids: ['x', 'y'] });
    const b = memo(d, { ids: ['x', 'y'] });
    expect(b).toBe(a);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recomputes when a non-dataset input changes, and when the dataset identity changes', () => {
    const fn = vi.fn((d: GraphDataset, i: { ids: string[] }) => ({ n: d.nodes.length, ids: i.ids }));
    const memo = memoiseByDataset(fn);
    const d = dataset();
    memo(d, { ids: ['x'] });
    memo(d, { ids: ['y'] });
    expect(fn).toHaveBeenCalledTimes(2);
    memo(dataset(), { ids: ['x'] });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('treats input objects with the same keys in a different order as equal', () => {
    const fn = vi.fn((_d: GraphDataset, i: { a: number; b: number }) => i.a + i.b);
    const memo = memoiseByDataset(fn);
    const d = dataset();
    memo(d, { a: 1, b: 2 });
    memo(d, { b: 2, a: 1 } as { a: number; b: number });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
