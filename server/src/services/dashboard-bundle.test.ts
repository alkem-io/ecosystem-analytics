/**
 * Feature 025 — the dashboard counts bundle is computed from the dataset alone
 * (spec FR-015): no SDK, no classification re-query, both GD variants only when the GD
 * layer is present.
 */
import { describe, it, expect, vi } from 'vitest';

// The bundle module must be PURE. If anything in it reached for the SDK, this mock would
// record it — and the assertion at the bottom would fail.
const createAlkemioSdk = vi.fn();
vi.mock('../graphql/client.js', () => ({
  createAlkemioSdk,
  getRequestStats: () => ({ requests: 0, bytes: 0 }),
  resetRequestStats: () => {},
  isAlkemioAuthError: () => false,
}));
vi.mock('../config.js', () => {
  const classifications = { nds: 'NDS-prioriteit', vng2030: 'VNG 2030 thema', phase: 'Fase', trl: 'TRL' };
  const vng = { classifications, defaultHubNameId: 'vih-test' };
  return { loadConfig: () => ({ vng, dashboards: { vng }, features: {} }) };
});

import { buildDashboardBundle, stripGdLayer } from './dashboard-bundle.js';
import { NodeType, EdgeType, type GraphDataset, type GraphNode, type GraphEdge } from '../types/graph.js';
import type { VngConfig } from '../config.js';

const PROFILE = {
  classifications: { nds: 'NDS-prioriteit', vng2030: 'VNG 2030 thema', phase: 'Fase', trl: 'TRL' },
} as unknown as VngConfig;

const NDS = {
  displayLabel: 'NDS-prioriteit',
  values: [
    { id: 'nds-1', label: 'Dienstverlening' },
    { id: 'nds-2', label: 'Data' },
  ],
  selectedValues: [{ id: 'nds-1', label: 'Dienstverlening' }],
};
const VNG = {
  displayLabel: 'VNG 2030 thema',
  values: [{ id: 'vng-1', label: 'Wonen' }],
  selectedValues: [{ id: 'vng-1', label: 'Wonen' }],
};

const node = (partial: Partial<GraphNode> & Pick<GraphNode, 'id' | 'type' | 'displayName'>): GraphNode =>
  ({
    weight: 1,
    avatarUrl: null,
    bannerUrl: null,
    url: null,
    location: null,
    scopeGroups: [],
    nameId: partial.id,
    tagline: null,
    parentSpaceId: null,
    privacyMode: null,
    ...partial,
  }) as GraphNode;

const edge = (sourceId: string, targetId: string, type: EdgeType): GraphEdge =>
  ({ id: `${sourceId}-${targetId}`, sourceId, targetId, type, weight: 1, scopeGroup: 'x' }) as unknown as GraphEdge;

function dataset(withGd: boolean): GraphDataset {
  const nodes: GraphNode[] = [
    node({ id: 'space-a', type: NodeType.SPACE_L0, displayName: 'Space A' }),
    node({ id: 'space-b', type: NodeType.SPACE_L0, displayName: 'Space B' }),
    node({
      id: 'gem-1',
      type: NodeType.ORGANIZATION,
      displayName: 'Gemeente Utrecht',
      nameId: 'gemeente-utrecht',
      isGemeente: true,
      cbsCode: 'GM0344',
    }),
  ];
  const edges: GraphEdge[] = [edge('space-a', 'gem-1', EdgeType.LEAD)];
  if (withGd) {
    nodes.push(node({ id: 'init-1', type: NodeType.INITIATIVE, displayName: 'GD initiative' }));
    edges.push(edge('init-1', 'gem-1', EdgeType.INITIATIVE_GEMEENTE));
  }
  return {
    version: '1.0.0',
    generatedAt: '2026-09-21T00:00:00Z',
    spaces: ['space-a', 'space-b'],
    nodes,
    edges,
    metrics: {} as GraphDataset['metrics'],
    cacheInfo: [],
    insights: [],
    hasActivityData: false,
  } as unknown as GraphDataset;
}

const snapshots = [
  { id: 'space-a', label: 'Space A', tags: [], entries: [NDS, VNG] },
  { id: 'space-b', label: 'Space B', tags: [], entries: undefined },
];

const municipalities = [
  {
    nameId: 'gemeente-utrecht',
    title: 'Utrecht',
    info: { cbsCode: 'GM0344', country: 'NL' as const, provinceCode: 'PV26', provinceName: 'Utrecht', population: 360000 },
  },
];

describe('buildDashboardBundle (feature 025, FR-015)', () => {
  it('yields only the base variant when the GD layer is absent, and never touches the SDK', () => {
    const bundle = buildDashboardBundle({
      dataset: dataset(false),
      snapshots,
      unresolvedCount: 0,
      gdCallouts: null,
      municipalities,
      profile: PROFILE,
    });
    expect(bundle.categories.withGd).toBeUndefined();
    expect(bundle.distribution.withGd).toBeUndefined();
    expect(bundle.categories.base.totalCounted).toBe(2);
    expect(bundle.categories.base.unclassifiedCount).toBe(1); // space-b has no entries
    expect(bundle.categories.base.dimensions.some((d) => d.categories.some((c) => c.count > 0))).toBe(true);
    expect(createAlkemioSdk).not.toHaveBeenCalled();
  });

  it('yields both variants when the GD layer is present, with the GD segment only in withGd', () => {
    const bundle = buildDashboardBundle({
      dataset: dataset(true),
      snapshots,
      unresolvedCount: 0,
      gdCallouts: [{ id: 'init-1', displayName: 'GD initiative', tags: ['Wonen'], gemeenteCount: 1 }],
      municipalities,
      profile: PROFILE,
    });
    expect(bundle.categories.base.gdIncluded).toBe(false);
    expect(bundle.categories.base.totalCounted).toBe(2);
    expect(bundle.categories.withGd?.gdIncluded).toBe(true);
    expect(bundle.categories.withGd?.totalCounted).toBe(3);
    // The base distribution sees Utrecht in 1 initiative (the Space); withGd sees 2.
    const utrechtBase = bundle.distribution.base.cityPopulation?.participating.find((p) => p.name === 'Utrecht');
    const utrechtGd = bundle.distribution.withGd?.cityPopulation?.participating.find((p) => p.name === 'Utrecht');
    expect(utrechtBase?.initiativeCount).toBe(1);
    expect(utrechtGd?.initiativeCount).toBe(2);
    expect(createAlkemioSdk).not.toHaveBeenCalled();
  });

  it('stripGdLayer removes INITIATIVE/THEME nodes and their edges, and is identity otherwise', () => {
    const plain = dataset(false);
    expect(stripGdLayer(plain)).toBe(plain);
    const stripped = stripGdLayer(dataset(true));
    expect(stripped.nodes.some((n) => n.type === NodeType.INITIATIVE)).toBe(false);
    expect(stripped.edges.some((e) => e.sourceId === 'init-1')).toBe(false);
  });
});
