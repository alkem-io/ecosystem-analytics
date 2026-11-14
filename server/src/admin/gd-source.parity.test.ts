/**
 * Feature 027, SC-006 — the admin area's GemeenteDelers counts equal the browser's
 * `[GemeenteDelers]` console summary on the same data.
 *
 * `*.parity.test.ts` is excluded from the server's `tsc` (tsconfig.json): it imports a
 * frontend module, which the server's Docker build stage does not have. Vitest runs it.
 */
import { describe, it, expect, vi } from 'vitest';
import { summariseGdSources } from '../../../frontend/shared/src/dashboard/data/gd-source-log.js';
import { NodeType, type GraphDataset, type GraphNode } from '../types/graph.js';
import type { GdSubgraph } from '../services/graph-service.js';

vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));
const { summariseGdSubgraph } = await import('./gd-source-service.js');

const initiative = (nameId: string, source?: 'subspace' | 'post'): GraphNode =>
  ({
    id: `id-${nameId}`,
    type: NodeType.INITIATIVE,
    displayName: nameId.toUpperCase(),
    nameId,
    ...(source ? { initiativeSource: source } : {}),
  }) as GraphNode;

const subgraph = (nodes: GraphNode[], sources?: GdSubgraph['sources']): GdSubgraph => ({
  nodes: [...nodes, { id: 'org', type: NodeType.ORGANIZATION, displayName: 'Gemeente' } as GraphNode],
  edges: [],
  initiativeCount: nodes.length,
  ...(sources ? { sources } : {}),
});

const datasetOf = (sg: GdSubgraph): GraphDataset =>
  ({ nodes: sg.nodes, edges: [], gdLayer: { available: true, initiativeCount: sg.initiativeCount, sources: sg.sources } }) as unknown as GraphDataset;

const space = { displayName: 'gemeentedelers', url: 'https://alkem.io/gemeentedelers' };

describe('summariseGdSubgraph', () => {
  it('counts exactly what the browser console summary counts', () => {
    const sg = subgraph(
      [initiative('a', 'subspace'), initiative('b', 'subspace'), initiative('c', 'post'), initiative('d')],
      {
        superseded: [{ postNameId: 'old-a', subspaceNameId: 'a', rule: 'title', subspaceDisplayName: 'A', subspaceUrl: 'https://alkem.io/gemeentedelers/challenges/a' }],
        skippedSubspaceNameIds: ['template'],
        ambiguous: [{ subspaceNameId: 'b', candidatePostNameIds: ['x', 'y'] }],
      },
    );
    const server = summariseGdSubgraph(sg, { readAt: Date.UTC(2026, 10, 14), expiresAt: Date.UTC(2026, 10, 21) }, space);
    const browser = summariseGdSources(datasetOf(sg))!;
    expect(server.total).toBe(browser.total);
    expect(server.viaSubspaces).toBe(browser.viaSubspaces.length);
    expect(server.viaPosts).toBe(browser.viaPosts.length);
    expect(server.initiatives.filter((i) => i.source === 'subspace').map((i) => i.nameId).sort()).toEqual(
      [...browser.viaSubspaces].sort(),
    );
    expect(server.initiatives.filter((i) => i.source === 'post').map((i) => i.nameId)).toEqual(browser.viaPosts);
    expect(server.superseded).toEqual([
      { postNameId: 'old-a', subspaceNameId: 'a', subspaceDisplayName: 'A', subspaceUrl: 'https://alkem.io/gemeentedelers/challenges/a', rule: 'title' },
    ]);
    expect(server.ambiguous).toEqual(['b']);
    expect(server.readAt).toBe('2026-11-14T00:00:00.000Z');
    expect(server.nextRefreshAt).toBe('2026-11-21T00:00:00.000Z');
    expect(server.migrationComplete).toBe(false);
  });

  it('says the migration is complete only when every initiative is a subspace', () => {
    const sg = subgraph([initiative('a', 'subspace')], { superseded: [], skippedSubspaceNameIds: [] });
    expect(summariseGdSubgraph(sg, { readAt: 1, expiresAt: 2 }, space).migrationComplete).toBe(true);
  });

  it('reads a row cached before feature 027 as "unknown" (null), not as zero', () => {
    const sg = subgraph([initiative('a', 'subspace')], {
      superseded: [{ postNameId: 'p', subspaceNameId: 'a', rule: 'nameId' }],
      skippedSubspaceNameIds: [],
    });
    const out = summariseGdSubgraph(sg, { readAt: null, expiresAt: null }, space);
    expect(out.readAt).toBeNull();
    expect(out.nextRefreshAt).toBeNull();
    expect(out.ambiguous).toBeNull();
    expect(out.superseded[0]).toMatchObject({ subspaceDisplayName: null, subspaceUrl: null });
  });
});
