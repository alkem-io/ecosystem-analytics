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
    );

    expect(result.gdIncluded).toBe(false);
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
    const result = countDashboard([{ id: 'x', label: 'X', tags: ['something-unmapped'] }], mapping);
    expect(result.uncategorisedCount).toBe(1);
    expect(result.gdIncluded).toBe(false);
  });

  it('exposes a non-empty uncategorised bucket per dimension', () => {
    const result = countDashboard(
      [
        { id: '1', label: 'A', tags: ['3.ai'] }, // NDS only — uncategorised for VNG-2030
        { id: '2', label: 'B', tags: ['no-match'] }, // uncategorised in both
      ],
      mapping,
    );
    const nds = result.dimensions.find((d) => d.key === 'nds')!;
    const vng = result.dimensions.find((d) => d.key === 'vng2030')!;
    // 'A' is classified in NDS, so only 'B' is uncategorised there.
    expect(nds.categories.find((c) => c.key === 'uncategorised')).toMatchObject({ count: 1 });
    // Neither 'A' nor 'B' map to a VNG-2030 category.
    expect(vng.categories.find((c) => c.key === 'uncategorised')).toMatchObject({ count: 2 });
  });

  it('always exposes the uncategorised bucket first, even when empty', () => {
    const result = countDashboard(
      [{ id: '1', label: 'A', tags: ['3.ai', 'wonen en ruimte'] }],
      mapping,
    );
    for (const dim of result.dimensions) {
      expect(dim.categories[0].key).toBe('uncategorised');
      expect(dim.categories[0].count).toBe(0);
    }
  });

  it('splits category counts into stacked spaces / gd segments', () => {
    const result = countDashboard(
      [
        { id: 's', label: 'Space', tags: ['3.ai'], source: 'spaces' },
        { id: 'g', label: 'GD', tags: ['3.ai'], source: 'gd' },
      ],
      mapping,
    );
    expect(result.gdIncluded).toBe(true);
    const ai = result.dimensions
      .find((d) => d.key === 'nds')!
      .categories.find((c) => c.key === 'ai')!;
    expect(ai).toMatchObject({ count: 2, spacesCount: 1, gdCount: 1 });
    expect(ai.spacesItems).toEqual(['Space']);
    expect(ai.gdItems).toEqual(['GD']);
  });

  it('counts an entity at most once per category', () => {
    const result = countDashboard([{ id: 'dup', label: 'D', tags: ['3.ai', '3.AI'] }], mapping);
    const ai = result.dimensions.find((d) => d.key === 'nds')!.categories.find((c) => c.key === 'ai')!;
    expect(ai.count).toBe(1);
  });
});

import { countSpaceGemeentes, bucketGemeenteDistribution } from './vng-dashboard-service.js';
import { NodeType, EdgeType, type GraphDataset, type GraphNode, type GraphEdge } from '../types/graph.js';

function ds(nodes: Partial<GraphNode>[], edges: { s: string; t: string }[]): GraphDataset {
  return {
    version: '1', generatedAt: '', spaces: [],
    nodes: nodes.map((n) => ({ id: n.id!, type: n.type!, displayName: n.id!, nameId: n.id!, isGemeente: n.isGemeente } as GraphNode)),
    edges: edges.map((e) => ({ sourceId: e.s, targetId: e.t, type: EdgeType.INITIATIVE_GEMEENTE } as GraphEdge)),
    metrics: { totalNodes: nodes.length, totalEdges: edges.length, averageDegree: 0, density: 0 },
    cacheInfo: [],
  };
}

describe('countSpaceGemeentes', () => {
  it('counts DISTINCT gemeente orgs per SPACE_L0 (ignoring non-gemeente orgs)', () => {
    const nodes: Partial<GraphNode>[] = [
      { id: 's1', type: NodeType.SPACE_L0 },
      { id: 's2', type: NodeType.SPACE_L0 },
      { id: 'g1', type: NodeType.ORGANIZATION, isGemeente: true },
      { id: 'g2', type: NodeType.ORGANIZATION, isGemeente: true },
      { id: 'o1', type: NodeType.ORGANIZATION, isGemeente: false },
    ];
    const edges = [
      { s: 's1', t: 'g1' }, { s: 's1', t: 'g2' }, { s: 's1', t: 'o1' }, // s1 → 2 gemeentes
      { s: 's2', t: 'g1' }, // s2 → 1 gemeente
    ];
    expect(countSpaceGemeentes(ds(nodes, edges)).map((c) => c.count).sort()).toEqual([1, 2]);
  });
});

describe('bucketGemeenteDistribution', () => {
  it('buckets Groei + GD counts (with names); 0-gemeente initiatives lead in "none"', () => {
    const dist = bucketGemeenteDistribution(
      [{ label: 'A', count: 2 }, { label: 'B', count: 4 }, { label: 'Z', count: 0 }],
      [{ label: 'GD-big', count: 55 }, { label: 'GD-mid', count: 7 }],
      true,
    );
    expect(dist.buckets[0].key).toBe('none'); // leading "No classification" bar
    const byKey = Object.fromEntries(dist.buckets.map((b) => [b.key, b]));
    expect(byKey['none'].groeiItems).toEqual(['Z']);
    expect(byKey['1-3'].groei).toBe(1);
    expect(byKey['1-3'].groeiItems).toEqual(['A']);
    expect(byKey['3-6'].groeiItems).toEqual(['B']);
    expect(byKey['6-10'].gdItems).toEqual(['GD-mid']);
    expect(byKey['50+'].gdItems).toEqual(['GD-big']);
    // The 0-count Z now lands in "none" instead of being dropped: 5 placed in total.
    expect(dist.buckets.reduce((a, b) => a + b.groei + b.gd, 0)).toBe(5);
  });

  it('boundary values go to the lower bucket (3→1-3, 6→3-6)', () => {
    const dist = bucketGemeenteDistribution(
      [{ label: 'three', count: 3 }, { label: 'six', count: 6 }],
      [],
      false,
    );
    const byKey = Object.fromEntries(dist.buckets.map((b) => [b.key, b]));
    expect(byKey['1-3'].groeiItems).toEqual(['three']);
    expect(byKey['3-6'].groeiItems).toEqual(['six']);
    expect(dist.gdIncluded).toBe(false);
  });
});
