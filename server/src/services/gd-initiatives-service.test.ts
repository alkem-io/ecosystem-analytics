import { describe, it, expect, vi } from 'vitest';

vi.mock('../config.js', () => ({
  loadConfig: () => ({ vng: { gemeentedelersSpaceNameId: 'gemeentedelers' } }),
}));

import { fetchGemeentedelersInitiatives, resolveGemeenteOrgNode } from './gd-initiatives-service.js';
import type { AuthContext } from '../auth/middleware.js';
import { NodeType } from '../types/graph.js';
import type { Sdk } from '../graphql/generated/graphql.js';

/** Minimal SDK stub: only the two methods resolveGemeenteOrgNode calls. */
function makeSdk(overrides: Partial<Record<keyof Sdk, unknown>>): Sdk {
  return overrides as unknown as Sdk;
}

describe('resolveGemeenteOrgNode', () => {
  it('looks up the org id by nameID, fetches its profile, and builds a gemeente ORGANIZATION node', async () => {
    const sdk = makeSdk({
      OrganizationByNameId: vi
        .fn()
        .mockResolvedValue({ data: { lookupByName: { organization: 'org-uuid-1' } } }),
      organizationByID: vi.fn().mockResolvedValue({
        data: {
          lookup: {
            organization: {
              id: 'org-uuid-1',
              nameID: 'gemeente-groningen',
              profile: { displayName: 'Gemeente Groningen', url: 'https://x' },
              roleSet: { owners: [], associates: [] },
            },
          },
        },
      }),
    });

    const node = await resolveGemeenteOrgNode(sdk, 'gemeente-groningen');
    expect(node).toMatchObject({
      id: 'org-uuid-1',
      type: NodeType.ORGANIZATION,
      nameId: 'gemeente-groningen',
      displayName: 'Gemeente Groningen',
      isGemeente: true,
    });
  });

  it('returns null when the org nameID does not resolve to an id (non-fatal)', async () => {
    const organizationByID = vi.fn();
    const sdk = makeSdk({
      OrganizationByNameId: vi
        .fn()
        .mockResolvedValue({ data: { lookupByName: { organization: undefined } } }),
      organizationByID,
    });

    const node = await resolveGemeenteOrgNode(sdk, 'gemeente-unknown');
    expect(node).toBeNull();
    expect(organizationByID).not.toHaveBeenCalled();
  });

  it('returns null (does not throw) when the lookup errors', async () => {
    const sdk = makeSdk({
      OrganizationByNameId: vi.fn().mockRejectedValue(new Error('boom')),
    });
    await expect(resolveGemeenteOrgNode(sdk, 'gemeente-groningen')).resolves.toBeNull();
  });
});

describe('fetchGemeentedelersInitiatives', () => {
  const tagsets = (...tags: string[]) => [{ name: 'default', tags }];
  const callout = (nameID: string, displayName: string, tags: string[]) => ({
    id: `post-${nameID}`,
    nameID,
    framing: { profile: { displayName, description: '', tagsets: tagsets(...tags) } },
  });
  const subspace = (nameID: string, displayName: string, tags: string[], classifications: unknown[] = []) => ({
    id: `sub-${nameID}`,
    nameID,
    about: {
      profile: {
        displayName,
        description: '**Deelnemende gemeente:** Eindhoven',
        url: `https://alkem.io/gemeentedelers/challenges/${nameID}`,
        tagsets: tagsets(...tags),
      },
      classifications,
    },
  });
  const auth = {} as AuthContext;

  it('reports each initiative once — from its subspace — and skips non-initiatives', async () => {
    const nds = {
      id: 'e1',
      displayLabel: 'NDS-prioriteit',
      cardinality: 'SINGLE_SELECT',
      display: true,
      sortOrder: 0,
      values: [{ id: '2-data', label: 'Data' }],
      selectedValues: [{ id: '2-data', label: 'Data' }],
    };
    const GemeentedelersInitiatives = vi.fn().mockResolvedValue({
      data: {
        lookupByName: {
          space: {
            id: 'gd',
            nameID: 'gemeentedelers',
            collaboration: {
              calloutsSet: {
                callouts: [
                  callout('welkom', 'Welkom', []),
                  callout('buurt-in-bloei', 'Buurt in bloei', ['2021']),
                  callout('maex-amsterdam', 'MAEX Amsterdam', ['2022', 'Data']),
                ],
              },
            },
            subspaces: [
              subspace('buurt-in-bloei', 'Buurt in bloei', ['2021', 'Sociaal domein breed'], [nds]),
              subspace('template', 'Template', []),
            ],
          },
        },
      },
    });

    const result = await fetchGemeentedelersInitiatives(auth, makeSdk({ GemeentedelersInitiatives }));

    expect(GemeentedelersInitiatives).toHaveBeenCalledWith({ nameId: 'gemeentedelers' });
    expect(result.map((i) => [i.source, i.nameId])).toEqual([
      ['subspace', 'buurt-in-bloei'],
      ['post', 'maex-amsterdam'],
    ]);
    expect(result[0]).toMatchObject({
      id: 'sub-buurt-in-bloei',
      url: 'https://alkem.io/gemeentedelers/challenges/buurt-in-bloei',
      description: '**Deelnemende gemeente:** Eindhoven',
      tags: ['2021', 'Sociaal domein breed'],
      classificationEntries: [nds],
    });
    expect(result[1].classificationEntries).toBeUndefined();
  });

  it('throws GD_SPACE_UNREADABLE when the space resolves to null', async () => {
    const sdk = makeSdk({
      GemeentedelersInitiatives: vi.fn().mockResolvedValue({ data: { lookupByName: { space: undefined } } }),
    });
    await expect(fetchGemeentedelersInitiatives(auth, sdk)).rejects.toThrow('GD_SPACE_UNREADABLE');
  });
});
