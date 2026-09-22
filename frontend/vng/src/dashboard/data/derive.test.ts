/**
 * Feature 025, US4 — derivations are computed once per (dataset identity, inputs) and
 * shared: two consumers get the same object; a tab switch recomputes nothing.
 */
import { describe, it, expect } from 'vitest';
import type { GraphDataset, GraphNode } from '@server/types/graph.js';
import { scopeDataset } from '@ea/shared/dashboard/data/derive/index.js';

const node = (id: string, type: string, extra: Partial<GraphNode> = {}): GraphNode =>
  ({ id, type, displayName: id, nameId: id, scopeGroups: [], parentSpaceId: null, ...extra }) as GraphNode;

function dataset(): GraphDataset {
  return {
    version: '1.0.0',
    generatedAt: '',
    spaces: ['a', 'b'],
    nodes: [
      node('a', 'SPACE_L0'),
      node('b', 'SPACE_L0'),
      node('b-sub', 'SPACE_L1', { parentSpaceId: 'b' }),
      node('org-shared', 'ORGANIZATION'),
      node('org-b-only', 'ORGANIZATION'),
    ],
    edges: [
      { id: '1', sourceId: 'org-shared', targetId: 'a', type: 'MEMBER', weight: 1, scopeGroup: 'a' },
      { id: '2', sourceId: 'org-shared', targetId: 'b', type: 'MEMBER', weight: 1, scopeGroup: 'b' },
      { id: '3', sourceId: 'org-b-only', targetId: 'b-sub', type: 'MEMBER', weight: 1, scopeGroup: 'b' },
    ],
    metrics: { totalNodes: 5, totalEdges: 3, averageDegree: 1.2, density: 0.3 },
    cacheInfo: [],
    insights: [],
    hasActivityData: false,
  } as unknown as GraphDataset;
}

describe('scopeDataset (feature 025)', () => {
  it('is the identity when nothing is widened, and memoised per dataset + inputs', () => {
    const d = dataset();
    const all = { effectiveSpaceIds: ['a', 'b'] };
    expect(scopeDataset(d, all)).toBe(d);
    const some = { effectiveSpaceIds: ['a'] };
    expect(scopeDataset(d, some)).toBe(scopeDataset(d, { effectiveSpaceIds: ['a'] }));
  });

  it('drops widened Spaces, their subspaces, their edges and orphaned contributors; recomputes metrics', () => {
    const scoped = scopeDataset(dataset(), { effectiveSpaceIds: ['a'] });
    expect(scoped.nodes.map((n) => n.id).sort()).toEqual(['a', 'org-shared']);
    expect(scoped.edges.map((e) => e.sourceId)).toEqual(['org-shared']);
    expect(scoped.spaces).toEqual(['a']);
    expect(scoped.metrics).toEqual({ totalNodes: 2, totalEdges: 1, averageDegree: 1, density: 1 });
  });
});
