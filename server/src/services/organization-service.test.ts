/** Feature 025 — extended organisation profiles: fetched once per id, then cached. */
process.env.DB_PATH = ':memory:';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sdk } = vi.hoisted(() => ({ sdk: { organizationByID: vi.fn() } }));
vi.mock('../graphql/client.js', () => ({
  createAlkemioSdk: vi.fn().mockResolvedValue(sdk),
  getRequestStats: () => ({ requests: 0, bytes: 0 }),
  resetRequestStats: () => {},
}));
vi.mock('../config.js', () => ({ loadConfig: () => ({ features: {}, cacheTtlHours: 24 }) }));

import { initDatabase } from '../cache/db.js';
import { loadExtendedProfiles } from './organization-service.js';

const auth = { userId: 'u1' } as never;
const org = (id: string) => ({
  id,
  nameID: `n-${id}`,
  website: `https://${id}.example`,
  contactEmail: null,
  profile: { displayName: id, description: `about ${id}`, tagline: null, references: [{ name: 'site', uri: 'https://x' }] },
  roleSet: { owners: [{ id: 'o', profile: { displayName: 'Owner' } }], associates: [{ id: 'a1' }, { id: 'a2' }] },
});

beforeEach(() => {
  initDatabase();
  sdk.organizationByID.mockReset().mockImplementation(async ({ id }: { id: string }) => ({
    data: { lookup: { organization: id === 'gone' ? null : org(id) } },
  }));
});

describe('loadExtendedProfiles', () => {
  it('fetches uncached ids once, maps the extended fields, and answers from cache afterwards', async () => {
    const first = await loadExtendedProfiles('u1', auth, ['o1', 'o2', 'gone']);
    expect(sdk.organizationByID).toHaveBeenCalledTimes(3);
    expect(first.organizations.o1).toMatchObject({
      description: 'about o1',
      website: 'https://o1.example',
      references: [{ name: 'site', uri: 'https://x' }],
      associateCount: 2,
      owner: 'Owner',
    });
    expect(first.missing).toEqual(['gone']);

    const second = await loadExtendedProfiles('u1', auth, ['o1', 'o2']);
    expect(sdk.organizationByID).toHaveBeenCalledTimes(3); // no new lookups
    expect(Object.keys(second.organizations).sort()).toEqual(['o1', 'o2']);
  });

  it('is scoped per viewer', async () => {
    await loadExtendedProfiles('u1', auth, ['o1']);
    await loadExtendedProfiles('u2', auth, ['o1']);
    expect(sdk.organizationByID).toHaveBeenCalledTimes(2);
  });
});
