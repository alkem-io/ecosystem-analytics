/**
 * The ecosystem layout's contract (feature 024), as executable invariants.
 *
 * Unlike the funnel — whose dot positions are relaxed and deliberately untested — this
 * layout MUST be deterministic: the Playwright spec asserts structure against a rendered
 * map, and a picture that moves between runs cannot be regression-tested. Determinism is
 * therefore invariant #1, not a nicety.
 */
import { describe, expect, it } from 'vitest';
import { EdgeType, NodeType, type GraphDataset, type GraphEdge, type GraphNode } from '@server/types/graph.js';
import { buildEcosystemModel, type EcosystemInput } from '@ea/shared/dashboard/utils/ecosystem.js';
import { layoutEcosystems, RING_RADIUS_RATIO } from '@ea/shared/dashboard/utils/ecosystem-layout.js';

const SIZE = { width: 1200, height: 800 };

function space(id: string, nameId: string, name: string): GraphNode {
  return {
    id, type: NodeType.SPACE_L0, displayName: name, weight: 1, avatarUrl: null, bannerUrl: null,
    url: null, location: null, scopeGroups: [], nameId, tagline: null, parentSpaceId: null,
    privacyMode: 'PUBLIC',
  };
}
function org(id: string, name: string): GraphNode {
  return {
    id, type: NodeType.ORGANIZATION, displayName: name, weight: 1, avatarUrl: null, bannerUrl: null,
    url: null, location: null, scopeGroups: [], nameId: id, tagline: null, parentSpaceId: null,
    privacyMode: null,
  };
}
const edge = (s: string, t: string, type = EdgeType.MEMBER): GraphEdge => ({
  sourceId: s, targetId: t, type, weight: 1, scopeGroup: null,
});

function dataset(spaceCount: number, orgSpecs: [string, string[]][]): GraphDataset {
  const spaces = Array.from({ length: spaceCount }, (_, i) => space(`s${i}`, `s${i}`, `Space ${i}`));
  const orgs = orgSpecs.map(([id]) => org(id, id));
  return {
    version: '1', generatedAt: new Date(0).toISOString(),
    spaces: spaces.map((s) => s.nameId!),
    nodes: [...spaces, ...orgs, space('orch', 'orch', 'Orchestrator')],
    edges: orgSpecs.flatMap(([id, targets]) => targets.map((t) => edge(id, t))),
    metrics: {} as GraphDataset['metrics'], cacheInfo: [],
  };
}

const input = (over: Partial<EcosystemInput> = {}): EcosystemInput => ({
  hubNameId: 'hub', hubDisplayName: 'Hub',
  listedSpaceNameIds: ['s0', 's1', 's2'], selectedSpaceNameIds: ['s0', 's1', 's2'],
  orchestratorNameId: 'orch', orchestratorSource: 'builtIn',
  ...over,
});

const simple = () =>
  buildEcosystemModel(dataset(3, [['o1', ['s0', 'orch']], ['o2', ['s1']], ['o3', ['s2']]]), [input()]);

describe('determinism', () => {
  it('produces byte-identical output on repeated runs', () => {
    const a = layoutEcosystems(simple(), SIZE);
    const b = layoutEcosystems(simple(), SIZE);
    expect(JSON.stringify([...a.spaces])).toBe(JSON.stringify([...b.spaces]));
    expect(JSON.stringify([...a.orgs])).toBe(JSON.stringify([...b.orgs]));
    expect(a.regions.map((r) => r.cloudPath)).toEqual(b.regions.map((r) => r.cloudPath));
  });

  it('never emits a NaN coordinate', () => {
    const finite = (p: { x: number; y: number }) => Number.isFinite(p.x) && Number.isFinite(p.y);
    const l = layoutEcosystems(simple(), SIZE);
    expect([...l.spaces.values()].every(finite)).toBe(true);
    expect([...l.orgs.values()].every(finite)).toBe(true);
  });
});

describe('region geometry', () => {
  it('puts the orchestrator at the centre of its region', () => {
    const model = simple();
    const l = layoutEcosystems(model, SIZE);
    const region = l.regions[0];
    const orch = l.spaces.get(model.ecosystems[0].orchestrator!.id)!;
    expect(Math.hypot(orch.x - region.cx, orch.y - region.cy)).toBeLessThan(0.5);
  });

  it('puts every initiative on the ring, at a distinct angle', () => {
    const model = simple();
    const l = layoutEcosystems(model, SIZE);
    const r = l.regions[0];
    const radius = r.radius * RING_RADIUS_RATIO;
    const angles = new Set<number>();
    for (const i of model.ecosystems[0].initiatives) {
      const p = l.spaces.get(i.id)!;
      expect(Math.abs(Math.hypot(p.x - r.cx, p.y - r.cy) - radius)).toBeLessThan(0.5);
      angles.add(Math.round(Math.atan2(p.y - r.cy, p.x - r.cx) * 1000));
    }
    expect(angles.size).toBe(model.ecosystems[0].initiatives.length);
  });

  it('keeps every organisation outside the initiative ring', () => {
    const model = simple();
    const l = layoutEcosystems(model, SIZE);
    const r = l.regions[0];
    for (const o of model.organisations) {
      const p = l.orgs.get(o.id)!;
      expect(Math.hypot(p.x - r.cx, p.y - r.cy)).toBeGreaterThan(r.radius * RING_RADIUS_RATIO);
    }
  });

  it('draws a closed cloud path enclosing the region', () => {
    const l = layoutEcosystems(simple(), SIZE);
    const path = l.regions[0].cloudPath;
    expect(path.startsWith('M')).toBe(true);
    expect(path.trimEnd().endsWith('Z')).toBe(true);
  });

  it('reports bounds that enclose every drawn position', () => {
    const model = simple();
    const l = layoutEcosystems(model, SIZE);
    for (const p of [...l.spaces.values(), ...l.orgs.values()]) {
      expect(p.x).toBeGreaterThanOrEqual(l.bounds.minX);
      expect(p.x).toBeLessThanOrEqual(l.bounds.maxX);
      expect(p.y).toBeGreaterThanOrEqual(l.bounds.minY);
      expect(p.y).toBeLessThanOrEqual(l.bounds.maxY);
    }
  });
});

describe('several ecosystems', () => {
  it('places an organisation shared by two regions between their centres', () => {
    const ds = dataset(3, [['shared', ['s0', 's1']], ['a', ['s0']], ['b', ['s1']]]);
    const model = buildEcosystemModel(ds, [
      input({ hubNameId: 'A', hubDisplayName: 'A', listedSpaceNameIds: ['s0'], selectedSpaceNameIds: ['s0'], orchestratorNameId: null, orchestratorSource: null }),
      input({ hubNameId: 'B', hubDisplayName: 'B', listedSpaceNameIds: ['s1'], selectedSpaceNameIds: ['s1'], orchestratorNameId: null, orchestratorSource: null }),
    ]);
    const l = layoutEcosystems(model, SIZE);
    const [ra, rb] = l.regions;
    expect(ra.cx).toBeLessThan(rb.cx);
    const shared = l.orgs.get(model.organisations.find((o) => o.name === 'shared')!.id)!;
    expect(shared.x).toBeGreaterThan(ra.cx);
    expect(shared.x).toBeLessThan(rb.cx);
  });

  it('gives every ecosystem its own region, in input order', () => {
    const ds = dataset(3, [['a', ['s0']], ['b', ['s1']]]);
    const model = buildEcosystemModel(ds, [
      input({ hubNameId: 'A', hubDisplayName: 'Alpha Hub', listedSpaceNameIds: ['s0'], selectedSpaceNameIds: ['s0'], orchestratorNameId: null, orchestratorSource: null }),
      input({ hubNameId: 'B', hubDisplayName: 'Beta Hub', listedSpaceNameIds: ['s1'], selectedSpaceNameIds: ['s1'], orchestratorNameId: null, orchestratorSource: null }),
    ]);
    const l = layoutEcosystems(model, SIZE);
    expect(l.regions.map((r) => r.id)).toEqual(['A', 'B']);
    expect(l.regions.map((r) => r.label)).toEqual(['Alpha Hub', 'Beta Hub']);
  });
});

describe('scale', () => {
  it('lays out a 50-space, 500-organisation model well inside the redraw budget', () => {
    // SC-003/004 are about the TAB being interactive and the redraw being under a
    // second; the layout is the only part that grows with the data, so it gets the
    // strict budget and the rest of the frame gets the slack.
    const SPACES = 50;
    const ORGS = 500;
    const orgSpecs: [string, string[]][] = Array.from({ length: ORGS }, (_, i) => [
      `o${i}`,
      [`s${i % SPACES}`, `s${(i * 7 + 3) % SPACES}`],
    ]);
    const ds = dataset(SPACES, orgSpecs);
    const model = buildEcosystemModel(ds, [
      input({
        listedSpaceNameIds: Array.from({ length: SPACES }, (_, i) => `s${i}`),
        selectedSpaceNameIds: Array.from({ length: SPACES }, (_, i) => `s${i}`),
      }),
    ]);

    const started = performance.now();
    const l = layoutEcosystems(model, SIZE);
    const elapsed = performance.now() - started;

    expect(l.orgs.size).toBe(ORGS);
    expect(l.spaces.size).toBe(SPACES + 1); // + the orchestrator
    expect(elapsed).toBeLessThan(300);
  });
});

describe('degenerate shapes', () => {
  it('handles an ecosystem with no initiatives', () => {
    const model = buildEcosystemModel(dataset(3, [['o1', ['orch']]]), [
      input({ listedSpaceNameIds: [], selectedSpaceNameIds: [] }),
    ]);
    const l = layoutEcosystems(model, SIZE);
    expect(l.regions).toHaveLength(1);
    expect(l.regions[0].cloudPath.startsWith('M')).toBe(true);
    expect(Number.isFinite(l.regions[0].radius)).toBe(true);
  });

  it('handles a single initiative', () => {
    const model = buildEcosystemModel(dataset(3, [['o1', ['s0']]]), [
      input({ listedSpaceNameIds: ['s0'], selectedSpaceNameIds: ['s0'] }),
    ]);
    const l = layoutEcosystems(model, SIZE);
    expect([...l.spaces.values()].every((p) => Number.isFinite(p.x))).toBe(true);
  });

  it('handles an ecosystem with no orchestrator', () => {
    const model = buildEcosystemModel(dataset(3, [['o1', ['s0']]]), [
      input({ orchestratorNameId: null, orchestratorSource: null }),
    ]);
    const l = layoutEcosystems(model, SIZE);
    expect(l.regions).toHaveLength(1);
    expect([...l.spaces.values()].every((p) => Number.isFinite(p.y))).toBe(true);
  });

  it('handles an ecosystem with no organisations at all', () => {
    const model = buildEcosystemModel(dataset(3, []), [input()]);
    const l = layoutEcosystems(model, SIZE);
    expect(l.orgs.size).toBe(0);
    expect(l.regions[0].cloudPath.startsWith('M')).toBe(true);
  });
});
