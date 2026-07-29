import { describe, expect, it } from 'vitest';
import { EdgeType, NodeType, type GraphDataset, type GraphEdge, type GraphNode } from '../types/graph.js';
import { buildCityPopulationSeries, countCityInitiatives } from './vng-dashboard-service.js';
import type { MunicipalityInfo } from './vng-registry.js';

/**
 * Conformance test for the city ↔ initiative aggregation rule (feature 018).
 *
 * The fixture and expected counts below are NORMATIVE — copied from
 * specs/018-city-analysis/contracts/city-aggregation.md and mirrored verbatim by the
 * frontend test in frontend/vng/src/dashboard/cities.test.ts. `countCityInitiatives`
 * here and `buildCityRows` there must agree, which is what makes FR-028 ("a city's
 * initiative count is identical in every view") true.
 *
 * If the rule changes, BOTH implementations and BOTH tests change in the same commit.
 */

function node(
  id: string,
  type: NodeType,
  displayName: string,
  extra: Partial<GraphNode> = {},
): GraphNode {
  return {
    id,
    type,
    displayName,
    weight: 1,
    avatarUrl: null,
    bannerUrl: null,
    url: null,
    location: null,
    scopeGroups: [],
    nameId: id,
    tagline: null,
    parentSpaceId: null,
    privacyMode: null,
    ...extra,
  };
}

function edge(sourceId: string, targetId: string, type: EdgeType = EdgeType.MEMBER): GraphEdge {
  return { sourceId, targetId, type, weight: 1, scopeGroup: null };
}

/** The contract fixture: 9 nodes, 6 edges, covering every branch of the rule. */
function fixture(): GraphDataset {
  const nodes: GraphNode[] = [
    node('org-groningen', NodeType.ORGANIZATION, 'Groningen', {
      nameId: 'gemeente-groningen',
      isGemeente: true,
      population: 238147,
      provinceName: 'Groningen',
    }),
    node('org-brugge', NodeType.ORGANIZATION, 'Brugge', {
      nameId: 'gemeente-brugge',
      isGemeente: true,
      population: null,
      provinceName: null,
    }),
    node('org-utrecht', NodeType.ORGANIZATION, 'Utrecht', {
      nameId: 'gemeente-utrecht',
      isGemeente: true,
      population: 367984,
      provinceName: 'Utrecht',
    }),
    // Not a gemeente — must never produce a row.
    node('org-acme', NodeType.ORGANIZATION, 'Acme BV', { isGemeente: false }),
    node('space-a', NodeType.SPACE_L0, 'Signalen'),
    node('space-b', NodeType.SPACE_L0, 'Common Ground'),
    // Sub-space — must NOT count as an initiative.
    node('sub-a1', NodeType.SPACE_L1, 'Signalen deelruimte'),
    node('gd-1', NodeType.INITIATIVE, 'GD Voorbeeld'),
    node('user-1', NodeType.USER, 'Ada'),
  ];

  const edges: GraphEdge[] = [
    edge('space-a', 'org-groningen'),
    // Reverse direction — direction is irrelevant to the rule.
    edge('org-groningen', 'space-b'),
    // Second edge between the SAME pair, different type — must be de-duplicated.
    edge('space-a', 'org-groningen', EdgeType.LEAD),
    // Sub-space edge — ignored.
    edge('sub-a1', 'org-groningen'),
    edge('gd-1', 'org-brugge', EdgeType.INITIATIVE_GEMEENTE),
    // Non-initiative edge — ignored.
    edge('user-1', 'org-groningen'),
  ];

  return {
    version: '1.0.0',
    generatedAt: '2026-07-29T00:00:00.000Z',
    spaces: [],
    nodes,
    edges,
    metrics: { totalNodes: nodes.length, totalEdges: edges.length, averageDegree: 0, density: 0 },
    cacheInfo: [],
  };
}

const info = (population: number | null, provinceName: string | null): MunicipalityInfo => ({
  cbsCode: population == null ? null : 'GM0000',
  country: population == null ? 'BE' : 'NL',
  provinceCode: null,
  provinceName,
  population,
});

/** Registry stand-in: the three fixture gemeentes plus one that is NOT in the graph. */
function municipalities() {
  return [
    { nameId: 'gemeente-groningen', title: 'Groningen', info: info(238147, 'Groningen') },
    { nameId: 'gemeente-brugge', title: 'Brugge', info: info(null, null) },
    { nameId: 'gemeente-utrecht', title: 'Utrecht', info: info(367984, 'Utrecht') },
    // In the registry, absent from the graph → non-participating.
    { nameId: 'gemeente-vlissingen', title: 'Vlissingen', info: info(44648, 'Zeeland') },
  ];
}

describe('countCityInitiatives', () => {
  it('produces one entry per gemeente organisation and no others', () => {
    const counts = countCityInitiatives(fixture());
    expect(counts).toHaveLength(3);
    expect(counts.map((c) => c.name).sort()).toEqual(['Brugge', 'Groningen', 'Utrecht']);
  });

  it('counts distinct initiatives across both edge directions, de-duplicating repeated edges', () => {
    const counts = countCityInitiatives(fixture());
    // space-a (twice, de-duplicated) + space-b (reverse direction) = 2.
    // sub-a1 (SPACE_L1) and user-1 (USER) do not count.
    expect(counts.find((c) => c.name === 'Groningen')!.initiativeCount).toBe(2);
  });

  it('counts GemeenteDelers initiatives and leaves unconnected cities at zero', () => {
    const counts = countCityInitiatives(fixture());
    expect(counts.find((c) => c.name === 'Brugge')!.initiativeCount).toBe(1);
    expect(counts.find((c) => c.name === 'Utrecht')!.initiativeCount).toBe(0);
  });

  it('preserves an unknown population as null, never zero', () => {
    const counts = countCityInitiatives(fixture());
    expect(counts.find((c) => c.name === 'Groningen')!.population).toBe(238147);
    expect(counts.find((c) => c.name === 'Brugge')!.population).toBeNull();
  });
});

describe('buildCityPopulationSeries', () => {
  it('splits municipalities into participating and non-participating', () => {
    const series = buildCityPopulationSeries(fixture(), municipalities(), true);
    expect(series.participating.map((p) => p.name)).toEqual(['Groningen']);
    expect(series.nonParticipating.map((p) => p.name)).toEqual(['Utrecht', 'Vlissingen']);
    expect(series.nonParticipating.every((p) => p.initiativeCount === 0)).toBe(true);
  });

  it('excludes municipalities with unknown population and reports how many (FR-023)', () => {
    const series = buildCityPopulationSeries(fixture(), municipalities(), true);
    // Brugge participates but has no population — it must be counted, not plotted.
    expect(series.excludedUnknownPopulation).toBe(1);
    const names = [...series.participating, ...series.nonParticipating].map((p) => p.name);
    expect(names).not.toContain('Brugge');
    expect(series.participating.every((p) => p.population > 0)).toBe(true);
    expect(series.nonParticipating.every((p) => p.population > 0)).toBe(true);
  });

  it('keeps a graph gemeente that is absent from the registry', () => {
    const registry = municipalities().filter((m) => m.nameId !== 'gemeente-groningen');
    const series = buildCityPopulationSeries(fixture(), registry, true);
    expect(series.participating.map((p) => p.name)).toContain('Groningen');
  });

  it('keeps the two arrays disjoint and sorted by population descending', () => {
    const series = buildCityPopulationSeries(fixture(), municipalities(), true);
    const ids = new Set(series.participating.map((p) => p.nameId));
    expect(series.nonParticipating.some((p) => ids.has(p.nameId))).toBe(false);
    const pops = series.nonParticipating.map((p) => p.population);
    expect([...pops].sort((a, b) => b - a)).toEqual(pops);
  });

  it('reports gdIncluded verbatim', () => {
    expect(buildCityPopulationSeries(fixture(), municipalities(), false).gdIncluded).toBe(false);
    expect(buildCityPopulationSeries(fixture(), municipalities(), true).gdIncluded).toBe(true);
  });

  it('counts no GD initiative when the GD layer is absent from the dataset', () => {
    // With the GD toggle off the graph carries no INITIATIVE nodes at all.
    const base = fixture();
    const dataset: GraphDataset = {
      ...base,
      nodes: base.nodes.filter((n) => n.type !== NodeType.INITIATIVE),
      edges: base.edges.filter((e) => e.type !== EdgeType.INITIATIVE_GEMEENTE),
    };
    const counts = countCityInitiatives(dataset);
    expect(counts.find((c) => c.name === 'Brugge')!.initiativeCount).toBe(0);
  });
});
