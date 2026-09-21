/**
 * The ecosystem model's contract, as executable invariants (feature 024).
 *
 * These mirror data-model.md §1 one-to-one. Everything here is about STRUCTURE —
 * which organisations attach to which listed Space, with what strength and
 * provenance — never about coordinates; positions belong to ecosystem-layout.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { EdgeType, NodeType, type GraphDataset, type GraphEdge, type GraphNode } from '@server/types/graph.js';
import {
  applyFilters,
  buildEcosystemModel,
  candidateSpaces,
  guessOrchestrator,
  resolveOrchestrator,
  type EcosystemInput,
} from '@ea/shared/dashboard/utils/ecosystem.js';

// ── fixture ────────────────────────────────────────────────────────────────────
// Listed: alpha, beta. Unlisted orchestrator: orch. Subspaces: alpha-l1, alpha-l1-l2.
// Orgs: kci (LEAD on orch + MEMBER on alpha, beta → connector),
//       solo (MEMBER on beta only), sub (MEMBER on alpha-l1-l2 only → via subspace),
//       both (MEMBER on alpha AND on alpha-l1 → direct wins),
//       gem (LEAD on alpha, gemeente).

function space(id: string, nameId: string, name: string, parent?: string, tagline?: string): GraphNode {
  return {
    id,
    type: parent ? (parent.includes('l1') ? NodeType.SPACE_L2 : NodeType.SPACE_L1) : NodeType.SPACE_L0,
    displayName: name,
    weight: 1,
    avatarUrl: null,
    bannerUrl: null,
    url: null,
    location: null,
    scopeGroups: [],
    nameId,
    tagline: tagline ?? null,
    parentSpaceId: parent ?? null,
    privacyMode: 'PUBLIC',
  };
}

function org(id: string, name: string, isGemeente = false): GraphNode {
  return {
    id,
    type: NodeType.ORGANIZATION,
    displayName: name,
    weight: 1,
    avatarUrl: `https://example.test/${id}.png`,
    bannerUrl: null,
    url: null,
    location: null,
    scopeGroups: [],
    nameId: id,
    tagline: null,
    parentSpaceId: null,
    privacyMode: null,
    isGemeente,
  };
}

function edge(sourceId: string, targetId: string, type: EdgeType): GraphEdge {
  return { sourceId, targetId, type, weight: 1, scopeGroup: null };
}

function dataset(): GraphDataset {
  return {
    version: '1',
    generatedAt: new Date(0).toISOString(),
    spaces: ['alpha', 'beta', 'orch'],
    nodes: [
      space('s-alpha', 'alpha', 'Alpha'),
      space('s-beta', 'beta', 'Beta'),
      space('s-orch', 'orch', 'Kenniscentrum Innovatie', undefined, 'Het programma achter het ecosysteem'),
      space('s-alpha-l1', 'alpha-l1', 'Alpha werkgroep', 's-alpha'),
      space('s-alpha-l2', 'alpha-l1-l2', 'Alpha pilot', 's-alpha-l1'),
      org('o-kci', 'VNG Kenniscentrum Innovatie'),
      org('o-solo', 'Solo BV'),
      org('o-sub', 'Subspace Only BV'),
      org('o-both', 'Both Levels BV'),
      org('o-gem', 'Gemeente Testdorp', true),
      { ...org('u-1', 'A User'), type: NodeType.USER },
    ],
    edges: [
      edge('o-kci', 's-orch', EdgeType.LEAD),
      edge('o-kci', 's-alpha', EdgeType.MEMBER),
      edge('o-kci', 's-beta', EdgeType.MEMBER),
      edge('o-solo', 's-beta', EdgeType.MEMBER),
      edge('o-sub', 's-alpha-l2', EdgeType.MEMBER),
      edge('o-both', 's-alpha', EdgeType.MEMBER),
      edge('o-both', 's-alpha-l1', EdgeType.LEAD),
      edge('o-gem', 's-alpha', EdgeType.LEAD),
      // ignored: people, admin roles, space hierarchy
      edge('u-1', 's-alpha', EdgeType.MEMBER),
      edge('u-1', 's-alpha', EdgeType.ADMIN),
      edge('s-alpha', 's-alpha-l1', EdgeType.CHILD),
    ],
    metrics: {} as GraphDataset['metrics'],
    cacheInfo: [],
  };
}

const INPUT: EcosystemInput = {
  hubNameId: 'test-hub',
  hubDisplayName: 'Test Hub',
  listedSpaceNameIds: ['alpha', 'beta'],
  selectedSpaceNameIds: ['alpha', 'beta'],
  orchestratorNameId: 'orch',
  orchestratorSource: 'builtIn',
};

const build = (input: Partial<EcosystemInput> = {}) =>
  buildEcosystemModel(dataset(), [{ ...INPUT, ...input }]);

const orgByName = (m: ReturnType<typeof build>, name: string) =>
  m.organisations.find((o) => o.name === name)!;

// ── (a) listed vs unlisted ─────────────────────────────────────────────────────
describe('buildEcosystemModel — spaces', () => {
  it('puts the resolved orchestrator at the centre and every other space among the initiatives', () => {
    const [eco] = build().ecosystems;
    expect(eco.orchestrator?.nameId).toBe('orch');
    expect(eco.orchestrator?.listed).toBe(false);
    expect(eco.initiatives.map((i) => i.nameId).sort()).toEqual(['alpha', 'beta']);
    expect(eco.initiatives.every((i) => i.listed)).toBe(true);
  });

  it('names the ecosystem after the hub', () => {
    const [eco] = build().ecosystems;
    expect(eco.id).toBe('test-hub');
    expect(eco.name).toBe('Test Hub');
    expect(eco.orchestratorSource).toBe('builtIn');
  });

  it('keeps a former orchestrator in the picture as an initiative once another is chosen', () => {
    // The candidate is in the dataset because it was fetched as a candidate; switching
    // the orchestrator must move it to the ring, not delete it (US2 scenario 3).
    const [eco] = build({
      orchestratorNameId: 'alpha',
      selectedSpaceNameIds: ['alpha', 'beta', 'orch'],
    }).ecosystems;
    expect(eco.orchestrator?.nameId).toBe('alpha');
    expect(eco.initiatives.map((i) => i.nameId).sort()).toEqual(['beta', 'orch']);
    expect(eco.initiatives.find((i) => i.nameId === 'orch')?.listed).toBe(false);
  });

  it('marks a selected space that the hub does not list as unlisted', () => {
    const [eco] = build({
      listedSpaceNameIds: ['alpha'],
      selectedSpaceNameIds: ['alpha', 'beta'],
    }).ecosystems;
    expect(eco.initiatives.find((i) => i.nameId === 'beta')?.listed).toBe(false);
    expect(eco.initiatives.find((i) => i.nameId === 'alpha')?.listed).toBe(true);
  });

  // (g) spaceLinks
  it('draws one part-of link per initiative, and none without an orchestrator', () => {
    const [eco] = build().ecosystems;
    expect(eco.spaceLinks).toHaveLength(eco.initiatives.length);
    expect(eco.spaceLinks.every((l) => l.kind === 'partOf' && l.fromId === eco.orchestrator!.id)).toBe(true);
    expect(new Set(eco.spaceLinks.map((l) => l.toId))).toEqual(new Set(eco.initiatives.map((i) => i.id)));

    const [none] = build({ orchestratorNameId: null, orchestratorSource: null }).ecosystems;
    expect(none.orchestrator).toBeNull();
    expect(none.spaceLinks).toHaveLength(0);
    expect(none.initiatives).toHaveLength(2);
  });

  it('never links a space to itself', () => {
    const [eco] = build().ecosystems;
    expect(eco.spaceLinks.some((l) => l.fromId === l.toId)).toBe(false);
  });
});

// ── (b)(c)(d) roll-up, provenance, strength ────────────────────────────────────
describe('buildEcosystemModel — connections', () => {
  it('rolls a role on a depth-2 subspace up to its top-level space, marked via subspace', () => {
    const m = build();
    const sub = orgByName(m, 'Subspace Only BV');
    expect(sub.connections).toHaveLength(1);
    expect(sub.connections[0].spaceId).toBe('s-alpha');
    expect(sub.connections[0].provenance).toBe('viaSubspace');
    expect(sub.connections[0].subspaceIds).toEqual(['s-alpha-l2']);
  });

  it('calls a connection direct when any role sits on the listed space itself, and takes the strongest role found', () => {
    const both = orgByName(build(), 'Both Levels BV');
    expect(both.connections).toHaveLength(1);
    expect(both.connections[0].provenance).toBe('direct');
    expect(both.connections[0].strength).toBe('lead'); // LEAD on the subspace beats MEMBER on the parent
    expect(both.connections[0].subspaceIds).toEqual(['s-alpha-l1']);
  });

  it('emits exactly one connection per organisation and listed space', () => {
    const m = build();
    for (const o of m.organisations) {
      const keys = o.connections.map((c) => `${c.ecosystemId}:${c.spaceId}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('keeps lead and member apart', () => {
    const m = build();
    expect(orgByName(m, 'Gemeente Testdorp').connections[0].strength).toBe('lead');
    expect(orgByName(m, 'Solo BV').connections[0].strength).toBe('member');
  });

  // (h) people are not part of this visual
  it('ignores users and admin edges entirely', () => {
    const m = build();
    expect(m.organisations.some((o) => o.name === 'A User')).toBe(false);
    expect(m.organisations).toHaveLength(5);
  });
});

// ── (e) orgCount ───────────────────────────────────────────────────────────────
describe('buildEcosystemModel — initiative counts', () => {
  it('counts every distinct organisation attached to a space, including via subspaces', () => {
    const [eco] = build().ecosystems;
    // alpha: kci, sub (via L2), both (L0+L1), gem
    expect(eco.initiatives.find((i) => i.nameId === 'alpha')!.orgCount).toBe(4);
    // beta: kci, solo
    expect(eco.initiatives.find((i) => i.nameId === 'beta')!.orgCount).toBe(2);
    // orch: kci
    expect(eco.orchestrator!.orgCount).toBe(1);
  });
});

// ── (f) flags ──────────────────────────────────────────────────────────────────
describe('buildEcosystemModel — organisation flags', () => {
  it('flags an organisation on the orchestrator and at least one initiative as a connector', () => {
    const m = build();
    const kci = orgByName(m, 'VNG Kenniscentrum Innovatie');
    expect(kci.isConnector).toBe(true);
    expect(kci.linkedToOrchestrator).toBe(true);
    expect(kci.multiMembership).toBe(true);
  });

  it('does not flag an organisation that only touches the orchestrator as a connector', () => {
    const m = buildEcosystemModel(dataset(), [
      { ...INPUT, listedSpaceNameIds: [], selectedSpaceNameIds: [] },
    ]);
    const kci = orgByName(m, 'VNG Kenniscentrum Innovatie');
    expect(kci.linkedToOrchestrator).toBe(true);
    expect(kci.isConnector).toBe(false);
  });

  it('does not flag a single-space member', () => {
    const solo = orgByName(build(), 'Solo BV');
    expect(solo.isConnector).toBe(false);
    expect(solo.linkedToOrchestrator).toBe(false);
    expect(solo.multiMembership).toBe(false);
  });

  it('carries the gemeente identity through for the city bridge', () => {
    const gem = orgByName(build(), 'Gemeente Testdorp');
    expect(gem.isGemeente).toBe(true);
    expect(gem.id).toBe('o-gem');
    expect(gem.logoUrl).toBe('https://example.test/o-gem.png');
  });
});

// ── (i) multi-ecosystem ────────────────────────────────────────────────────────
describe('buildEcosystemModel — several ecosystems', () => {
  it('draws a shared organisation once, connected into every ecosystem it has a role in', () => {
    const m = buildEcosystemModel(dataset(), [
      { ...INPUT, hubNameId: 'hub-a', hubDisplayName: 'A', listedSpaceNameIds: ['alpha'], selectedSpaceNameIds: ['alpha'] },
      { ...INPUT, hubNameId: 'hub-b', hubDisplayName: 'B', listedSpaceNameIds: ['beta'], selectedSpaceNameIds: ['beta'], orchestratorNameId: null, orchestratorSource: null },
    ]);
    expect(m.ecosystems).toHaveLength(2);
    const kci = m.organisations.filter((o) => o.name === 'VNG Kenniscentrum Innovatie');
    expect(kci).toHaveLength(1);
    expect(new Set(kci[0].ecosystemIds)).toEqual(new Set(['hub-a', 'hub-b']));
    expect(kci[0].connections.filter((c) => c.ecosystemId === 'hub-a')).toHaveLength(2); // orch + alpha
    expect(kci[0].connections.filter((c) => c.ecosystemId === 'hub-b')).toHaveLength(1); // beta
  });
});

// ── T008: resolution order + guess ─────────────────────────────────────────────
describe('resolveOrchestrator', () => {
  const present = new Set(['alpha', 'beta', 'orch']);
  const guess = () => 'beta';

  it('prefers the viewer\'s own choice above everything else', () => {
    expect(resolveOrchestrator({ candidatesInDataset: present, own: 'alpha', community: 'beta', builtIn: 'orch', guess }))
      .toMatchObject({ nameId: 'alpha', source: 'own' });
  });

  it('falls back through community, built-in, then the guess', () => {
    expect(resolveOrchestrator({ candidatesInDataset: present, own: null, community: 'beta', builtIn: 'orch', guess }))
      .toMatchObject({ nameId: 'beta', source: 'community' });
    expect(resolveOrchestrator({ candidatesInDataset: present, own: null, community: null, builtIn: 'orch', guess }))
      .toMatchObject({ nameId: 'orch', source: 'builtIn' });
    expect(resolveOrchestrator({ candidatesInDataset: present, own: null, community: null, builtIn: null, guess }))
      .toMatchObject({ nameId: 'beta', source: 'guess' });
  });

  it('skips a candidate the viewer cannot see and continues down the order', () => {
    const r = resolveOrchestrator({ candidatesInDataset: present, own: 'gone', community: null, builtIn: 'orch', guess });
    expect(r).toMatchObject({ nameId: 'orch', source: 'builtIn' });
  });

  it('flags a missing built-in default, and only then', () => {
    expect(resolveOrchestrator({ candidatesInDataset: present, own: null, community: null, builtIn: 'gone', guess }).builtInMissing).toBe(true);
    expect(resolveOrchestrator({ candidatesInDataset: present, own: null, community: null, builtIn: 'orch', guess }).builtInMissing).toBe(false);
    expect(resolveOrchestrator({ candidatesInDataset: present, own: null, community: null, builtIn: null, guess }).builtInMissing).toBe(false);
  });

  it('yields no orchestrator when nothing resolves', () => {
    const r = resolveOrchestrator({ candidatesInDataset: present, own: null, community: null, builtIn: null, guess: () => null });
    expect(r.nameId).toBeNull();
    expect(r.source).toBeNull();
  });
});

describe('guessOrchestrator', () => {
  it('prefers a space whose profile describes a programme or centre', () => {
    expect(guessOrchestrator(dataset(), ['alpha', 'beta', 'orch'])).toBe('orch');
  });

  it('falls back to the space whose organisations overlap most with the others', () => {
    // Without `orch` in the candidate set, alpha and beta both overlap only via kci (1),
    // which is below the threshold — so nothing qualifies.
    expect(guessOrchestrator(dataset(), ['alpha', 'beta'])).toBeNull();
  });

  it('returns null when no candidate qualifies', () => {
    expect(guessOrchestrator(dataset(), [])).toBeNull();
    expect(guessOrchestrator(dataset(), ['alpha'])).toBeNull();
  });
});

describe('candidateSpaces', () => {
  it('offers listed, selected and explicitly named spaces present in the dataset, deduplicated', () => {
    const m = build();
    const names = candidateSpaces(m, ['orch', 'not-in-dataset']).map((s) => s.nameId);
    expect(new Set(names)).toEqual(new Set(['alpha', 'beta', 'orch']));
    expect(names).toHaveLength(3);
  });

  it('includes the orchestrator even though the hub does not list it (the real VIH case)', () => {
    const m = build({ listedSpaceNameIds: ['alpha', 'beta'] });
    expect(candidateSpaces(m).map((s) => s.nameId)).toContain('orch');
    expect(m.ecosystems[0].orchestrator?.listed).toBe(false);
  });

  it('never offers a space the dataset does not hold — the map could not draw it', () => {
    const m = build();
    expect(candidateSpaces(m, ['ghost-space']).map((s) => s.nameId)).not.toContain('ghost-space');
  });

  it('is sorted by display name, so the dropdown is scannable', () => {
    const names = candidateSpaces(build()).map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

// ── T009: filters ──────────────────────────────────────────────────────────────
describe('applyFilters', () => {
  const names = (m: ReturnType<typeof build>) => m.organisations.map((o) => o.name).sort();

  it('returns everything when no filter is active', () => {
    const { model, hiddenCount } = applyFilters(build(), { linkedToOrchestrator: false, multiMembership: false });
    expect(model.organisations).toHaveLength(5);
    expect(hiddenCount).toBe(0);
  });

  it('keeps only organisations with a role on the orchestrator', () => {
    const { model, hiddenCount } = applyFilters(build(), { linkedToOrchestrator: true, multiMembership: false });
    expect(names(model)).toEqual(['VNG Kenniscentrum Innovatie']);
    expect(hiddenCount).toBe(4);
  });

  it('keeps only organisations with two or more memberships', () => {
    const { model } = applyFilters(build(), { linkedToOrchestrator: false, multiMembership: true });
    expect(names(model)).toEqual(['VNG Kenniscentrum Innovatie']);
  });

  it('intersects the two filters', () => {
    const { model } = applyFilters(build(), { linkedToOrchestrator: true, multiMembership: true });
    expect(names(model)).toEqual(['VNG Kenniscentrum Innovatie']);
  });

  it('leaves the spaces, their part-of links and their counts untouched', () => {
    const before = build().ecosystems[0];
    const { model } = applyFilters(build(), { linkedToOrchestrator: true, multiMembership: true });
    const after = model.ecosystems[0];
    expect(after.initiatives.map((i) => i.nameId)).toEqual(before.initiatives.map((i) => i.nameId));
    expect(after.spaceLinks).toHaveLength(before.spaceLinks.length);
    expect(after.orchestrator?.nameId).toBe(before.orchestrator?.nameId);
    expect(after.initiatives.map((i) => i.orgCount)).toEqual(before.initiatives.map((i) => i.orgCount));
  });

  it('can hide every organisation without emptying the ecosystem', () => {
    const m = buildEcosystemModel(dataset(), [{ ...INPUT, orchestratorNameId: null, orchestratorSource: null }]);
    const { model, hiddenCount } = applyFilters(m, { linkedToOrchestrator: true, multiMembership: false });
    expect(model.organisations).toHaveLength(0);
    expect(hiddenCount).toBe(5);
    expect(model.ecosystems[0].initiatives).toHaveLength(2);
  });
});
