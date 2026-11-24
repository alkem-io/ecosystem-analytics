import { describe, it, expect } from 'vitest';
import type { InitiativeRow } from '@ea/shared/dashboard/utils/initiatives.js';
import {
  NONE_KEY,
  OTHER_KEY,
  categoryLegend,
  categoryScale,
  rowKeys,
} from '@ea/shared/dashboard/utils/funnel-colors.js';

const row = (id: string, nds: string[], vng2030: string[] = []): InitiativeRow =>
  ({ id, name: id, kind: 'groei', nds, vng2030 }) as unknown as InitiativeRow;

const VOCAB = ['Cloud', 'Data', 'AI', 'Dienstverlening', 'Weerbaarheid', 'Vakmanschap', 'G', 'H', 'I', 'J'];

describe('funnel colour by classification', () => {
  it('colours a value by its vocabulary position, whatever else is in the funnel', () => {
    const scale = categoryScale(VOCAB);
    expect(scale.colorOf('Data')).toBe('var(--cat-2)');
    // A filter that removes Cloud must not repaint Data.
    const legend = categoryLegend([row('a', ['Data'])], 'nds', VOCAB);
    expect(legend).toEqual([{ key: 'Data', label: 'Data', color: 'var(--cat-2)', count: 1 }]);
  });

  it('folds values past the eighth slot, and unknown labels, into one "other"', () => {
    const scale = categoryScale(VOCAB);
    expect(scale.colorOf('I')).toBe('var(--cat-other)');
    expect(scale.colorOf('Removed in Alkemio')).toBe('var(--cat-other)');
    expect(rowKeys(row('a', ['J', 'I']), 'nds', scale, VOCAB)).toEqual([OTHER_KEY]);
  });

  it('gives a multi-valued initiative every value, in vocabulary order; none → "no classification"', () => {
    const scale = categoryScale(VOCAB);
    expect(rowKeys(row('a', ['AI', 'Cloud']), 'nds', scale, VOCAB)).toEqual(['Cloud', 'AI']);
    expect(rowKeys(row('b', []), 'nds', scale, VOCAB)).toEqual([NONE_KEY]);
  });

  it('lists the legend in vocabulary order, then other, then none, with counts', () => {
    const rows = [row('a', ['AI', 'Cloud']), row('b', ['Cloud']), row('c', []), row('d', ['J'])];
    expect(categoryLegend(rows, 'nds', VOCAB).map((e) => [e.key, e.count])).toEqual([
      ['Cloud', 2],
      ['AI', 1],
      [OTHER_KEY, 1],
      [NONE_KEY, 1],
    ]);
  });

  it('reads the chosen classification', () => {
    const legend = categoryLegend([row('a', ['Cloud'], ['Wonen'])], 'vng2030', ['Wonen']);
    expect(legend.map((e) => e.label)).toEqual(['Wonen']);
  });
});
