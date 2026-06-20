import { describe, it, expect } from 'vitest';
import { countDashboard } from './vng-dashboard-service.js';
import type { VngConfig } from '../config.js';

const mapping: VngConfig['tagCategoryMapping'] = {
  nds: { '2.data': 'data', '3.ai': 'ai', '6.vakmanschap': 'vakmanschap' },
  vng2030: { 'wonen en ruimte': 'wonen-ruimte', 'klimaat en energie': 'klimaat-energie' },
};

describe('countDashboard', () => {
  it('counts entities into NDS and VNG-2030 categories, case-insensitively', () => {
    const result = countDashboard(
      [
        { id: '1', label: 'A', tags: ['3.AI'] },
        { id: '2', label: 'B', tags: ['2.data', 'Wonen en Ruimte'] },
        { id: '3', label: 'C', tags: ['6.vakmanschap'] },
      ],
      mapping,
      'spaces',
    );

    expect(result.source).toBe('spaces');
    expect(result.totalCounted).toBe(3);

    const nds = result.dimensions.find((d) => d.key === 'nds')!;
    expect(nds.categories).toContainEqual(expect.objectContaining({ key: 'ai', count: 1 }));
    expect(nds.categories).toContainEqual(expect.objectContaining({ key: 'data', count: 1 }));
    expect(nds.categories).toContainEqual(expect.objectContaining({ key: 'vakmanschap', count: 1 }));

    const vng = result.dimensions.find((d) => d.key === 'vng2030')!;
    expect(vng.categories).toContainEqual(expect.objectContaining({ key: 'wonen-ruimte', count: 1 }));
    // Zero-count categories are still present (US3 scenario 3).
    expect(vng.categories).toContainEqual(expect.objectContaining({ key: 'klimaat-energie', count: 0 }));
  });

  it('counts entities with no mapped tag as uncategorised (FR-024)', () => {
    const result = countDashboard([{ id: 'x', label: 'X', tags: ['something-unmapped'] }], mapping, 'gd-initiatives');
    expect(result.uncategorisedCount).toBe(1);
    expect(result.source).toBe('gd-initiatives');
  });

  it('counts an entity at most once per category', () => {
    const result = countDashboard([{ id: 'dup', label: 'D', tags: ['3.ai', '3.AI'] }], mapping, 'spaces');
    const ai = result.dimensions.find((d) => d.key === 'nds')!.categories.find((c) => c.key === 'ai')!;
    expect(ai.count).toBe(1);
  });
});
