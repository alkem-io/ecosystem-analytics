import { describe, it, expect } from 'vitest';
import { countDashboard } from './vng-dashboard-service.js';
import type { Vocabulary } from '../transform/classifications.js';
import type { DashboardCountable } from '../types/api.js';

/**
 * Vocabularies as Alkemio reports them: opaque stable value ids plus authored labels.
 * Ids deliberately look nothing like their labels — a test that still passes when the
 * two are swapped is not testing id-based aggregation.
 */
const NDS: Vocabulary = [
  { key: 'v-data', label: 'Data' },
  { key: 'v-ai', label: 'Artificiële Intelligentie' },
  { key: 'v-vakmanschap', label: 'Digitaal vakmanschap' },
];
const VNG2030: Vocabulary = [
  { key: 'v-wonen', label: 'Wonen en Ruimte' },
  { key: 'v-klimaat', label: 'Klimaat en energie' },
];
const VOCAB = { nds: NDS, vng2030: VNG2030 };

/** A classified space: placed purely by its selections. */
function space(
  id: string,
  label: string,
  selections: Record<string, string[]>,
  over: Partial<DashboardCountable> = {},
): DashboardCountable {
  return { id, label, tags: [], selections, hasClassifications: true, source: 'spaces', ...over };
}

/** A GD initiative: its selections were resolved upstream from its callout tags. */
function gd(id: string, label: string, selections: Record<string, string[]>): DashboardCountable {
  return { id, label, tags: [], selections, hasClassifications: false, source: 'gd' };
}

const cat = (r: ReturnType<typeof countDashboard>, dim: string, key: string) =>
  r.dimensions.find((d) => d.key === dim)!.categories.find((c) => c.key === key)!;

describe('countDashboard — placement by classification (US1)', () => {
  it('counts each space under its selected values, carrying the Alkemio label', () => {
    const result = countDashboard(
      [
        space('1', 'A', { nds: ['v-ai'] }),
        space('2', 'B', { nds: ['v-data'], vng2030: ['v-wonen'] }),
        space('3', 'C', { nds: ['v-vakmanschap'] }),
      ],
      VOCAB,
    );

    expect(result.gdIncluded).toBe(false);
    expect(result.totalCounted).toBe(3);
    expect(cat(result, 'nds', 'v-ai')).toMatchObject({
      count: 1,
      label: 'Artificiële Intelligentie',
    });
    expect(cat(result, 'nds', 'v-data')).toMatchObject({ count: 1, label: 'Data' });
    expect(cat(result, 'vng2030', 'v-wonen')).toMatchObject({ count: 1, label: 'Wonen en Ruimte' });
  });

  it('NEVER consults a space tag — the classification wins outright (invariant I-1)', () => {
    // Tags say AI and Wonen; the classification says Data and nothing on VNG-2030.
    const result = countDashboard(
      [
        space('1', 'A', { nds: ['v-data'] }, { tags: ['Artificiële Intelligentie', 'Wonen en Ruimte'] }),
      ],
      VOCAB,
    );
    expect(cat(result, 'nds', 'v-data').count).toBe(1);
    expect(cat(result, 'nds', 'v-ai').count).toBe(0);
    expect(cat(result, 'vng2030', 'v-wonen').count).toBe(0);
    expect(cat(result, 'vng2030', 'uncategorised').count).toBe(1);
  });

  it('is unmoved by a label rename — only the id aggregates (invariant I-2)', () => {
    const entities = [space('1', 'A', { nds: ['v-data'] }), space('2', 'B', { nds: ['v-data'] })];
    const before = countDashboard(entities, VOCAB);
    const renamed = { ...VOCAB, nds: [{ key: 'v-data', label: 'Datagedreven werken' }, ...NDS.slice(1)] };
    const after = countDashboard(entities, renamed);

    expect(cat(before, 'nds', 'v-data').count).toBe(cat(after, 'nds', 'v-data').count);
    expect(cat(after, 'nds', 'v-data').label).toBe('Datagedreven werken');
    expect(cat(after, 'nds', 'v-data').items).toEqual(['A', 'B']);
  });

  it('counts a multi-value selection once in each of its categories (invariant I-3)', () => {
    const result = countDashboard([space('1', 'Multi', { nds: ['v-data', 'v-ai'] })], VOCAB);
    expect(cat(result, 'nds', 'v-data').count).toBe(1);
    expect(cat(result, 'nds', 'v-ai').count).toBe(1);
    // …and exactly once overall in the entity total.
    expect(result.totalCounted).toBe(1);
  });

  it('counts an entity at most once per category even if a value repeats', () => {
    const result = countDashboard([space('1', 'D', { nds: ['v-ai', 'v-ai'] })], VOCAB);
    expect(cat(result, 'nds', 'v-ai').count).toBe(1);
  });

  it('keeps the per-dimension counts summing to the entity total (invariant I-5)', () => {
    const entities = [
      space('1', 'A', { nds: ['v-ai'] }),
      space('2', 'B', { nds: ['v-data', 'v-ai'] }),
      space('3', 'C', {}),
      gd('g', 'GD', { vng2030: ['v-wonen'] }),
    ];
    const result = countDashboard(entities, VOCAB);
    for (const dim of result.dimensions) {
      // An entity in N categories is counted N times, so sum on DISTINCT entities.
      const placed = new Set<string>();
      for (const c of dim.categories) for (const n of c.items) placed.add(n);
      expect(placed.size).toBe(result.totalCounted);
    }
  });

  it('drops a selected id that is not in the vocabulary rather than inventing a bar', () => {
    const result = countDashboard([space('1', 'A', { nds: ['v-ghost'] })], VOCAB);
    expect(result.dimensions.find((d) => d.key === 'nds')!.categories.map((c) => c.key)).not.toContain(
      'v-ghost',
    );
    expect(cat(result, 'nds', 'uncategorised').count).toBe(1);
  });

  it('leads every dimension with the uncategorised bucket, whose label is null', () => {
    const result = countDashboard([space('1', 'A', { nds: ['v-ai'], vng2030: ['v-wonen'] })], VOCAB);
    for (const dim of result.dimensions) {
      expect(dim.categories[0].key).toBe('uncategorised');
      expect(dim.categories[0].label).toBeNull();
      expect(dim.categories[0].count).toBe(0);
    }
  });

  it('collects per-dimension uncategorised entities separately from the global count', () => {
    const result = countDashboard(
      [
        space('1', 'A', { nds: ['v-ai'] }), // NDS only → uncategorised for VNG-2030
        space('2', 'B', {}), // uncategorised in both
      ],
      VOCAB,
    );
    expect(cat(result, 'nds', 'uncategorised').count).toBe(1);
    expect(cat(result, 'vng2030', 'uncategorised').count).toBe(2);
    expect(result.uncategorisedCount).toBe(1); // only B matched nothing anywhere
  });

  it('splits each category into stacked spaces / gd segments', () => {
    const result = countDashboard(
      [space('s', 'Space', { nds: ['v-ai'] }), gd('g', 'GD', { nds: ['v-ai'] })],
      VOCAB,
    );
    expect(result.gdIncluded).toBe(true);
    const ai = cat(result, 'nds', 'v-ai');
    expect(ai).toMatchObject({ count: 2, spacesCount: 1, gdCount: 1 });
    expect(ai.spacesItems).toEqual(['Space']);
    expect(ai.gdItems).toEqual(['GD']);
  });
});

describe('countDashboard categoryMatrix (US1)', () => {
  it('places each entity at its PRIMARY value per axis, keyed by value id', () => {
    const result = countDashboard(
      [space('1', 'A', { nds: ['v-data'], vng2030: ['v-wonen'] })],
      VOCAB,
    );
    expect(result.categoryMatrix!.cells).toContainEqual(
      expect.objectContaining({
        nds: 'v-data',
        vng2030: 'v-wonen',
        count: 1,
        spacesItems: ['A'],
      }),
    );
  });

  it('routes an entity unclassified on one axis to that axis uncategorised slot', () => {
    const result = countDashboard([space('1', 'A', { nds: ['v-ai'] })], VOCAB);
    const m = result.categoryMatrix!;
    expect(m.cells).toContainEqual(
      expect.objectContaining({ nds: 'v-ai', vng2030: 'uncategorised', count: 1 }),
    );
    expect(m.ndsCategories[0]).toEqual({ key: 'uncategorised', label: null });
    expect(m.vng2030Categories[0]).toEqual({ key: 'uncategorised', label: null });
  });

  it('carries the label on every axis entry so the axes need no client lookup', () => {
    const result = countDashboard([space('1', 'A', { nds: ['v-ai'] })], VOCAB);
    expect(result.categoryMatrix!.ndsCategories).toContainEqual({
      key: 'v-vakmanschap',
      label: 'Digitaal vakmanschap',
    });
  });

  it('aggregates entities sharing a cell and splits spaces / gd', () => {
    const result = countDashboard(
      [space('s', 'Space', { nds: ['v-ai'] }), gd('g', 'GD', { nds: ['v-ai'] })],
      VOCAB,
    );
    const cell = result.categoryMatrix!.cells.find(
      (c) => c.nds === 'v-ai' && c.vng2030 === 'uncategorised',
    )!;
    expect(cell).toMatchObject({ count: 2 });
    expect(cell.spacesItems).toEqual(['Space']);
    expect(cell.gdItems).toEqual(['GD']);
  });

  it('records multi-value entities with their full value sets, plotted at the primary', () => {
    const result = countDashboard(
      [space('1', 'Multi', { nds: ['v-data', 'v-ai'], vng2030: ['v-wonen'] })],
      VOCAB,
    );
    const m = result.categoryMatrix!;
    expect(m.multiCategoryItems).toContainEqual(
      expect.objectContaining({ label: 'Multi', nds: ['v-data', 'v-ai'], vng2030: ['v-wonen'] }),
    );
    expect(m.cells).toContainEqual(expect.objectContaining({ nds: 'v-data', vng2030: 'v-wonen' }));
  });

  it('omits single-value entities from multiCategoryItems', () => {
    const result = countDashboard([space('1', 'A', { nds: ['v-ai'] })], VOCAB);
    expect(result.categoryMatrix!.multiCategoryItems).toEqual([]);
  });
});

describe('countDashboard — categories come from the vocabulary (US2)', () => {
  it('renders every vocabulary value, including those nobody selected (invariant I-6)', () => {
    const result = countDashboard([space('1', 'A', { nds: ['v-ai'] })], VOCAB);
    const keys = result.dimensions.find((d) => d.key === 'nds')!.categories.map((c) => c.key);
    expect(keys).toEqual(['uncategorised', 'v-data', 'v-ai', 'v-vakmanschap']);
    expect(cat(result, 'nds', 'v-vakmanschap')).toMatchObject({ count: 0, label: 'Digitaal vakmanschap' });
  });

  it('renders categories in the vocabulary’s authored order, never re-sorted', () => {
    const result = countDashboard([space('1', 'A', {})], VOCAB);
    expect(
      result.dimensions.find((d) => d.key === 'vng2030')!.categories.map((c) => c.label),
    ).toEqual([null, 'Wonen en Ruimte', 'Klimaat en energie']);
  });

  it('counts a unioned value only for the spaces whose snapshot holds it', () => {
    // The union carries a value only the second space's snapshot knows about.
    const union = { ...VOCAB, nds: [...NDS, { key: 'v-new', label: 'Nieuw' }] };
    const result = countDashboard(
      [space('1', 'Old', { nds: ['v-data'] }), space('2', 'New', { nds: ['v-new'] })],
      union,
    );
    expect(cat(result, 'nds', 'v-new')).toMatchObject({ count: 1, items: ['New'] });
    expect(cat(result, 'nds', 'v-data')).toMatchObject({ count: 1, items: ['Old'] });
  });

  it('renders an empty chart, not a missing one, when no classification is designated', () => {
    const result = countDashboard([space('1', 'A', { nds: ['v-ai'] })], { nds: [], vng2030: [] });
    const nds = result.dimensions.find((d) => d.key === 'nds')!;
    expect(nds.categories.map((c) => c.key)).toEqual(['uncategorised']);
    expect(nds.categories[0].count).toBe(1);
    expect(result.totalCounted).toBe(1);
  });
});

describe('countDashboard — the rollout gap (US4)', () => {
  it('counts only spaces with NO classification data as unclassified (invariant I-8)', () => {
    const result = countDashboard(
      [
        space('1', 'Classified', { nds: ['v-ai'] }),
        space('2', 'Classified but empty', {}), // has classifications, selected nothing
        space('3', 'Not yet reached', {}, { hasClassifications: false }),
        space('4', 'Also not reached', {}, { hasClassifications: false }),
      ],
      VOCAB,
    );
    expect(result.unclassifiedCount).toBe(2);
    // The classified-but-empty space is uncategorised, yet NOT unclassified.
    expect(cat(result, 'nds', 'uncategorised').items).toContain('Classified but empty');
    expect(result.uncategorisedCount).toBe(3);
  });

  it('never counts a GD initiative as unclassified — it is tag-derived by design', () => {
    const result = countDashboard([gd('g', 'GD', {})], VOCAB);
    expect(result.unclassifiedCount).toBe(0);
  });

  it('reports zero once every selected space is classified', () => {
    const result = countDashboard([space('1', 'A', { nds: ['v-ai'] })], VOCAB);
    expect(result.unclassifiedCount).toBe(0);
  });

  it('names the spaces in the uncategorised bucket so editors can act (FR-015)', () => {
    const result = countDashboard(
      [space('1', 'Zeewolde', {}, { hasClassifications: false }), space('2', 'Almere', {})],
      VOCAB,
    );
    expect(cat(result, 'nds', 'uncategorised').items).toEqual(['Almere', 'Zeewolde']);
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
