import { describe, expect, it } from 'vitest';
import { buildCityRows } from '@ea/shared/dashboard/utils/cities.js';
import type { GraphDataset, GraphEdge, GraphNode } from '@server/types/graph.js';

/**
 * Conformance test for the city ↔ initiative aggregation rule.
 *
 * The fixture and the expected counts below are NORMATIVE — they are copied from
 * specs/018-city-analysis/contracts/city-aggregation.md and mirrored verbatim by the
 * server-side test in server/src/services/vng-cities.test.ts. Both implementations
 * (buildCityRows here, countCityInitiatives there) must produce the same counts, which
 * is what makes FR-028 ("a city's initiative count is identical in every view") true.
 *
 * If the rule changes, BOTH implementations and BOTH tests change in the same commit.
 */

/** Minimal GraphNode factory — only the fields the rule reads are meaningful. */
function node(id: string, type: string, displayName: string, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: type as GraphNode['type'],
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

function edge(sourceId: string, targetId: string, type = 'MEMBER'): GraphEdge {
  return { sourceId, targetId, type: type as GraphEdge['type'], weight: 1, scopeGroup: null };
}

/** The contract fixture: 9 nodes, 6 edges, covering every branch of the rule. */
function fixture(): GraphDataset {
  const nodes: GraphNode[] = [
    node('org-groningen', 'ORGANIZATION', 'Groningen', {
      isGemeente: true,
      population: 238147,
      provinceName: 'Groningen',
    }),
    node('org-brugge', 'ORGANIZATION', 'Brugge', {
      isGemeente: true,
      population: null,
      provinceName: null,
    }),
    node('org-utrecht', 'ORGANIZATION', 'Utrecht', {
      isGemeente: true,
      population: 367984,
      provinceName: 'Utrecht',
    }),
    // Not a gemeente — must never produce a row.
    node('org-acme', 'ORGANIZATION', 'Acme BV', { isGemeente: false }),
    node('space-a', 'SPACE_L0', 'Signalen', { vng2030Categories: ['dienstverlening'], ndsCategories: ['cloud'] }),
    node('space-b', 'SPACE_L0', 'Common Ground', { vng2030Categories: ['dienstverlening'], vngThemes: ['Energie'] }),
    // Sub-space — must NOT count as an initiative.
    node('sub-a1', 'SPACE_L1', 'Signalen deelruimte'),
    node('gd-1', 'INITIATIVE', 'GD Voorbeeld', { vngThemes: ['Energie'] }),
    node('user-1', 'USER', 'Ada'),
  ];

  const edges: GraphEdge[] = [
    edge('space-a', 'org-groningen'),
    // Reverse direction — direction is irrelevant to the rule.
    edge('org-groningen', 'space-b'),
    // Second edge between the SAME pair, different type — must be de-duplicated.
    edge('space-a', 'org-groningen', 'LEAD'),
    // Sub-space edge — ignored.
    edge('sub-a1', 'org-groningen'),
    edge('gd-1', 'org-brugge', 'INITIATIVE_GEMEENTE'),
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

describe('buildCityRows', () => {
  it('returns [] for a null dataset', () => {
    expect(buildCityRows(null)).toEqual([]);
  });

  it('produces one row per gemeente organisation and no others', () => {
    const rows = buildCityRows(fixture());
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toEqual(['Brugge', 'Groningen', 'Utrecht']);
    expect(rows.some((r) => r.name === 'Acme BV')).toBe(false);
  });

  it('has no duplicate row ids', () => {
    const rows = buildCityRows(fixture());
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('counts distinct initiatives across both edge directions, de-duplicating repeated edges', () => {
    const rows = buildCityRows(fixture());
    const groningen = rows.find((r) => r.name === 'Groningen')!;
    // space-a (twice, de-duplicated) + space-b (reverse direction) = 2.
    // sub-a1 (SPACE_L1) and user-1 (USER) do not count.
    expect(groningen.initiativeCount).toBe(2);
    expect(groningen.initiatives.map((i) => i.name)).toEqual(['Common Ground', 'Signalen']);
  });

  it('counts GemeenteDelers initiatives', () => {
    const rows = buildCityRows(fixture());
    const brugge = rows.find((r) => r.name === 'Brugge')!;
    expect(brugge.initiativeCount).toBe(1);
    expect(brugge.initiatives[0]).toMatchObject({ id: 'gd-1', kind: 'gd' });
  });

  it('gives an unconnected city a count of zero', () => {
    const rows = buildCityRows(fixture());
    expect(rows.find((r) => r.name === 'Utrecht')!.initiativeCount).toBe(0);
  });

  it('preserves an unknown population as null, never zero (FR-005)', () => {
    const rows = buildCityRows(fixture());
    expect(rows.find((r) => r.name === 'Groningen')!.population).toBe(238147);
    expect(rows.find((r) => r.name === 'Brugge')!.population).toBeNull();
  });

  it('splits the count into Groei and GD, summing to the total', () => {
    for (const r of buildCityRows(fixture())) {
      expect(r.groeiCount + r.gdCount).toBe(r.initiativeCount);
    }
    const rows = buildCityRows(fixture());
    expect(rows.find((r) => r.name === 'Groningen')).toMatchObject({ groeiCount: 2, gdCount: 0 });
    expect(rows.find((r) => r.name === 'Brugge')).toMatchObject({ groeiCount: 0, gdCount: 1 });
  });

  it('unions the initiatives’ classifications, de-duplicated and sorted', () => {
    const groningen = buildCityRows(fixture()).find((r) => r.name === 'Groningen')!;
    // Both spaces carry `dienstverlening` — it must appear once.
    expect(groningen.vng2030).toEqual(['dienstverlening']);
    expect(groningen.nds).toEqual(['cloud']);
    expect(groningen.themes).toEqual(['Energie']);
  });
});
