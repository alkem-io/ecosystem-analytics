/**
 * Conformance test for the initiative-row rule (feature 022).
 *
 * `buildInitiativeRows` was extracted verbatim from InitiativesTab, so these tests pin
 * the behaviour the table had BEFORE the extraction as much as they pin the funnel's
 * input. The gemeente count in particular is the EDGE RULE — the same rule
 * `countCityInitiatives` uses server-side — and NOT the description-text rule that
 * `assembleGemeenteDistribution`'s GD side uses. Sizing funnel dots on this count is
 * what makes the funnel's dot set identical to the table's row set (FR-017/SC-002).
 */
import { describe, expect, it } from 'vitest';
import { buildInitiativeRows } from '@ea/shared/dashboard/utils/initiatives.js';
import { EdgeType, NodeType } from '@server/types/graph.js';
import type { GraphDataset, GraphEdge, GraphNode } from '@server/types/graph.js';

const node = (n: Partial<GraphNode> & Pick<GraphNode, 'id' | 'type'>): GraphNode =>
  ({ nameId: n.id, displayName: n.id, ...n }) as GraphNode;

const edge = (sourceId: string, targetId: string, type: EdgeType = EdgeType.CHILD): GraphEdge =>
  ({ id: `${sourceId}->${targetId}`, sourceId, targetId, type }) as unknown as GraphEdge;

function dataset(nodes: GraphNode[], edges: GraphEdge[]): GraphDataset {
  return { nodes, edges } as GraphDataset;
}

const PHASE = { key: 'v3', label: 'Initiatief', nr: 2 };

describe('buildInitiativeRows', () => {
  it('emits one row per SPACE_L0 and per INITIATIVE, and nothing else', () => {
    const rows = buildInitiativeRows(
      dataset(
        [
          node({ id: 'space', type: NodeType.SPACE_L0 }),
          node({ id: 'gd', type: NodeType.INITIATIVE }),
          node({ id: 'sub', type: NodeType.SPACE_L1 }),
          node({ id: 'org', type: NodeType.ORGANIZATION }),
          node({ id: 'user', type: NodeType.USER }),
        ],
        [],
      ),
    );
    expect(rows.map((r) => r.id).sort()).toEqual(['gd', 'space']);
    expect(rows.find((r) => r.id === 'space')!.kind).toBe('groei');
    expect(rows.find((r) => r.id === 'gd')!.kind).toBe('gd');
  });

  it('counts DISTINCT gemeente neighbours by the edge rule, in either direction', () => {
    const rows = buildInitiativeRows(
      dataset(
        [
          node({ id: 'space', type: NodeType.SPACE_L0 }),
          node({ id: 'g1', type: NodeType.ORGANIZATION, isGemeente: true, displayName: 'Almere' }),
          node({ id: 'g2', type: NodeType.ORGANIZATION, isGemeente: true, displayName: 'Breda' }),
          node({ id: 'notG', type: NodeType.ORGANIZATION, isGemeente: false, displayName: 'Acme BV' }),
        ],
        [
          edge('space', 'g1'),
          edge('g2', 'space'), // reverse direction still counts
          edge('space', 'g1'), // repeated edge counts once
          edge('space', 'notG'), // non-gemeente organisation does not count
        ],
      ),
    );
    expect(rows[0].gemeentes).toEqual(['Almere', 'Breda']);
  });

  it('carries the phase through for a Groei initiative', () => {
    const rows = buildInitiativeRows(
      dataset([node({ id: 'space', type: NodeType.SPACE_L0, phase: PHASE })], []),
    );
    expect(rows[0].phase).toEqual(PHASE);
  });

  it('is unphased when the space selected no phase', () => {
    const rows = buildInitiativeRows(dataset([node({ id: 'space', type: NodeType.SPACE_L0 })], []));
    expect(rows[0].phase).toBeNull();
  });

  it('NEVER reports a phase for a GemeenteDelers initiative', () => {
    // Even if a phase somehow reached the node, GD is a completed programme with no
    // phase (spec A-005) — the funnel must keep every GD dot in the mouth stage.
    const rows = buildInitiativeRows(
      dataset([node({ id: 'gd', type: NodeType.INITIATIVE, phase: PHASE })], []),
    );
    expect(rows[0].phase).toBeNull();
  });

  it('reads classification fields straight off the node', () => {
    const classifications = [{ id: 'c1', label: 'Fase', values: [{ id: 'v3', label: 'Initiatief' }] }];
    const rows = buildInitiativeRows(
      dataset(
        [
          node({
            id: 'space',
            type: NodeType.SPACE_L0,
            ndsCategories: ['Cloud'],
            vng2030Categories: ['Dienstverlening'],
            vngThemes: ['Zorg'],
            globalGoals: ['sdg-11'],
            commonGround: true,
            classifications,
          }),
        ],
        [],
      ),
    );
    expect(rows[0]).toMatchObject({
      nds: ['Cloud'],
      vng2030: ['Dienstverlening'],
      themes: ['Zorg'],
      sdg: ['sdg-11'],
      commonGround: true,
      classifications,
    });
  });

  it('counts distinct members and leads for a space, and neither for a GD initiative', () => {
    const rows = buildInitiativeRows(
      dataset(
        [
          node({ id: 'space', type: NodeType.SPACE_L0 }),
          node({ id: 'gd', type: NodeType.INITIATIVE }),
          node({ id: 'u1', type: NodeType.USER }),
          node({ id: 'u2', type: NodeType.USER }),
        ],
        [
          edge('u1', 'space', EdgeType.MEMBER),
          edge('u1', 'space', EdgeType.MEMBER), // same user twice counts once
          edge('u2', 'space', EdgeType.LEAD),
        ],
      ),
    );
    const space = rows.find((r) => r.id === 'space')!;
    expect(space.members).toBe(1);
    expect(space.leads).toBe(1);
    const gd = rows.find((r) => r.id === 'gd')!;
    expect(gd.members).toBeNull();
    expect(gd.leads).toBeNull();
  });

  it('returns nothing for a missing dataset instead of throwing', () => {
    expect(buildInitiativeRows(null)).toEqual([]);
    expect(buildInitiativeRows(undefined)).toEqual([]);
  });
});
