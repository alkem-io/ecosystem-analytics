import { describe, it, expect, vi } from 'vitest';
import { resolveGemeenteOrgNode } from './gd-initiatives-service.js';
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
