/**
 * The GemeenteDelers load summary in the browser console: which initiatives came via
 * subspaces and which via posts (LEGACY-GD-POSTS — remove with the posts path).
 */
import { describe, it, expect, vi } from 'vitest';
import { NodeType, type GraphDataset, type GraphNode } from '@server/types/graph.js';
import { logGdSources, summariseGdSources } from '@ea/shared/dashboard/data/gd-source-log.js';

const initiative = (nameId: string, initiativeSource?: 'subspace' | 'post'): GraphNode =>
  ({ id: `id-${nameId}`, type: NodeType.INITIATIVE, displayName: nameId, nameId, initiativeSource }) as GraphNode;

const dataset = (nodes: GraphNode[], gdLayer?: GraphDataset['gdLayer']): GraphDataset =>
  ({ nodes, edges: [], gdLayer }) as unknown as GraphDataset;

const GD_LAYER = {
  available: true,
  initiativeCount: 3,
  source: { programme: 'GemeenteDelers', years: '2021–2025', url: 'https://vng.nl' },
  sources: {
    superseded: [{ postNameId: 'masterclass-klooien', subspaceNameId: 'masterclassklooienenpruts', rule: 'title' as const }],
    skippedSubspaceNameIds: ['template'],
  },
};

describe('summariseGdSources', () => {
  it('splits the initiatives by source, by nameID, ignoring every other node', () => {
    const summary = summariseGdSources(
      dataset(
        [
          initiative('masterclassklooienenpruts', 'subspace'),
          initiative('maex-amsterdam', 'post'),
          initiative('old-row'),
          { id: 's', type: NodeType.SPACE_L0, displayName: 'S', nameId: 's' } as GraphNode,
        ],
        GD_LAYER,
      ),
    );
    expect(summary).toEqual({
      total: 3,
      viaSubspaces: ['masterclassklooienenpruts'],
      viaPosts: ['maex-amsterdam'],
      unknown: 1,
      reconciliation: GD_LAYER.sources,
    });
  });

  it('is null when the GD layer was not loaded', () => {
    expect(summariseGdSources(dataset([initiative('a', 'post')]))).toBeNull();
    expect(summariseGdSources(dataset([], { ...GD_LAYER, available: false }))).toBeNull();
  });
});

describe('logGdSources', () => {
  const out = () => ({ group: vi.fn(), groupEnd: vi.fn(), info: vi.fn() });

  it('writes one console group: the totals, both lists and the reconciliation', () => {
    const c = out();
    logGdSources(
      dataset([initiative('masterclassklooienenpruts', 'subspace'), initiative('maex-amsterdam', 'post')], GD_LAYER),
      c,
    );
    expect(c.group).toHaveBeenCalledWith(
      '[GemeenteDelers] 2 initiatives loaded — 1 via subspaces, 1 via posts',
    );
    expect(c.info).toHaveBeenCalledWith('via subspaces (1):', ['masterclassklooienenpruts']);
    expect(c.info).toHaveBeenCalledWith('via posts (1):', ['maex-amsterdam']);
    expect(c.info).toHaveBeenCalledWith('posts superseded by a subspace (1):', [
      'masterclass-klooien → masterclassklooienenpruts [title]',
    ]);
    expect(c.info).toHaveBeenCalledWith('subspaces skipped as not an initiative (1):', ['template']);
    expect(c.groupEnd).toHaveBeenCalledTimes(1);
  });

  it('logs nothing without GD initiatives', () => {
    const c = out();
    logGdSources(dataset([]), c);
    expect(c.group).not.toHaveBeenCalled();
    expect(c.info).not.toHaveBeenCalled();
  });
});
