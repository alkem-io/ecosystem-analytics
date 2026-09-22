/**
 * Feature 025 — the split: per-Space cache rows are RELATIONAL only; activity and the
 * extended organisation profiles are composed from their own items only when asked.
 * The Explorer's JSON defaults (`includeActivity`/`includeExtendedProfiles` omitted) get
 * both; the dashboards' stream (`false`/`false`) gets neither.
 */
process.env.DB_PATH = ':memory:';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityTier, NodeType, type GraphEdge, type GraphNode } from '../types/graph.js';

const { acquireSpaces, loadActivityEntries, loadExtendedProfiles } = vi.hoisted(() => ({
  acquireSpaces: vi.fn(),
  loadActivityEntries: vi.fn(),
  loadExtendedProfiles: vi.fn(),
}));
vi.mock('./acquire-service.js', () => ({ acquireSpaces }));
vi.mock('./activity-service.js', () => ({ loadActivityEntries }));
vi.mock('./organization-service.js', () => ({ loadExtendedProfiles }));
vi.mock('../graphql/client.js', () => ({
  createAlkemioSdk: vi.fn(),
  getRequestStats: () => ({ requests: 0, bytes: 0 }),
  resetRequestStats: () => {},
}));

import { initDatabase } from '../cache/db.js';
import { getCacheEntry } from '../cache/cache-service.js';
import { generateGraph, resetDatasetMemo } from './graph-service.js';

const auth = { userId: 'u1' } as never;

/** One readable Space with one member and one organisation. */
function acquisition() {
  const space = {
    id: 's-a',
    nameID: 'a',
    createdDate: new Date(0),
    visibility: 'ACTIVE',
    about: { isContentPublic: true, membership: { myPrivileges: [] }, classifications: [], profile: { displayName: 'A', url: '', tagsets: [] } },
    community: {
      id: 'c',
      roleSet: {
        memberUsers: [{ id: 'u-1' }],
        leadUsers: [],
        adminUsers: [],
        memberOrganizations: [{ id: 'o-1', nameID: 'org-1', profile: { displayName: 'Org 1', url: '', tagsets: [] } }],
        leadOrganizations: [],
      },
    },
    subspaces: [],
  };
  return {
    spacesL0: [{ space, nameId: 'a' }],
    users: new Map([['u-1', { id: 'u-1', nameID: 'user-1', profile: { displayName: 'User 1', tagsets: [] } }]]),
    organizations: new Map([['o-1', space.community.roleSet.memberOrganizations[0]]]),
    activityEntries: undefined,
    errors: [],
  };
}

const activityEntry = {
  id: 'e1',
  type: 'CALLOUT_POST_CREATED',
  createdDate: new Date(),
  triggeredBy: { id: 'u-1' },
  space: { id: 's-a' },
};

beforeEach(() => {
  initDatabase();
  resetDatasetMemo();
  acquireSpaces.mockReset().mockImplementation(async () => acquisition());
  loadActivityEntries.mockReset().mockResolvedValue({ entries: [activityEntry], unavailable: [] });
  loadExtendedProfiles.mockReset().mockResolvedValue({
    organizations: { 'o-1': { id: 'o-1', description: 'About org 1', tagline: null, website: 'https://org1', contactEmail: null } },
    missing: [],
  });
});

const memberEdge = (edges: GraphEdge[]) => edges.find((e) => e.sourceId === 'u-1' && e.targetId === 's-a')!;
const orgNode = (nodes: GraphNode[]) => nodes.find((n) => n.type === NodeType.ORGANIZATION)!;

describe('graph-service split (feature 025)', () => {
  it('the dashboards\' relational request never touches activity or extended profiles', async () => {
    const dataset = await generateGraph('u1', auth, {
      spaceIds: ['a'],
      app: 'vng',
      includeActivity: false,
      includeExtendedProfiles: false,
    });
    expect(acquireSpaces.mock.calls[0][4]).toEqual({ includeActivity: false });
    expect(loadActivityEntries).not.toHaveBeenCalled();
    expect(loadExtendedProfiles).not.toHaveBeenCalled();
    expect(dataset.hasActivityData).toBe(false);
    expect(memberEdge(dataset.edges).activityTier).toBeUndefined();
    expect(orgNode(dataset.nodes).description).toBeNull();
    expect(orgNode(dataset.nodes).displayName).toBe('Org 1'); // core profile came inline
  });

  it('the Explorer\'s JSON defaults compose both items, so its output keeps its activity and profile fields', async () => {
    const dataset = await generateGraph('u1', auth, { spaceIds: ['a'] });
    expect(loadActivityEntries).toHaveBeenCalledTimes(1);
    expect(loadExtendedProfiles).toHaveBeenCalledWith('u1', auth, ['o-1']);
    expect(dataset.hasActivityData).toBe(true);
    expect(memberEdge(dataset.edges).activityTier).not.toBe(undefined);
    expect(memberEdge(dataset.edges).activityTier).not.toBe(ActivityTier.INACTIVE);
    expect(orgNode(dataset.nodes)).toMatchObject({ description: 'About org 1', website: 'https://org1' });
  });

  it('writes the per-Space cache row WITHOUT activity-derived or extended fields', async () => {
    await generateGraph('u1', auth, { spaceIds: ['a'] }); // full variant
    const row = getCacheEntry('u1', 'a')!;
    const { nodes, edges } = JSON.parse(row.datasetJson) as { nodes: GraphNode[]; edges: GraphEdge[] };
    expect(memberEdge(edges).activityTier).toBeUndefined();
    expect(nodes.find((n) => n.type === NodeType.SPACE_L0)?.activityByPeriod).toBeUndefined();
    expect(orgNode(nodes).description).toBeNull();
  });
});
