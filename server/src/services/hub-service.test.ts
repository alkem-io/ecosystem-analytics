import { describe, it, expect } from 'vitest';
import { mapInnovationHubs } from './hub-service.js';
import { SpaceVisibility } from '../graphql/generated/alkemio-schema.js';
import type { InnovationHubsQuery } from '../graphql/generated/alkemio-schema.js';

const query: InnovationHubsQuery = {
  platform: {
    library: {
      innovationHubs: [
        {
          id: 'h1',
          nameID: 'vng-kenniscentrum',
          profile: { displayName: 'VNG Kenniscentrum' },
          spaceListFilter: [
            {
              id: 's1',
              nameID: 'stad-utrecht',
              visibility: SpaceVisibility.Active,
              about: { profile: { displayName: 'Stad Utrecht' } },
            },
          ],
        },
        {
          id: 'h2',
          nameID: 'empty-hub',
          profile: { displayName: 'Empty' },
          spaceListFilter: undefined,
        },
      ],
    },
  },
};

describe('mapInnovationHubs', () => {
  it('maps hubs and their listed spaces to the VNG shape', () => {
    const hubs = mapInnovationHubs(query);
    expect(hubs).toHaveLength(2);
    expect(hubs[0]).toMatchObject({
      id: 'h1',
      nameId: 'vng-kenniscentrum',
      displayName: 'VNG Kenniscentrum',
    });
    expect(hubs[0].spaces).toEqual([
      { nameId: 'stad-utrecht', displayName: 'Stad Utrecht', visibility: 'ACTIVE' },
    ]);
  });

  it('treats a hub with no spaceListFilter as having no spaces', () => {
    const hubs = mapInnovationHubs(query);
    expect(hubs[1].spaces).toEqual([]);
  });
});

// ── Partial-result tolerance ─────────────────────────────────────────────────
// A single space the caller may not READ_ABOUT (e.g. an ARCHIVED space listed in
// any store-listed hub) nulls that hub's `spaceListFilter` and makes graphql-request
// throw a ClientError that still carries every OTHER hub in `response.data`.

vi.mock('../graphql/client.js', () => ({
  createAlkemioSdk: vi.fn(),
}));

import { vi } from 'vitest';
import { createAlkemioSdk } from '../graphql/client.js';
import { fetchInnovationHubs } from './hub-service.js';
import type { AuthContext } from '../auth/middleware.js';

const auth = {} as AuthContext;

function partialClientError(data: unknown, path: Array<string | number>) {
  return Object.assign(new Error('GraphQL Error (Code: 200)'), {
    response: {
      status: 200,
      data,
      errors: [
        {
          message: "Authorization: unable to grant 'read-about' privilege",
          path,
          extensions: { code: 'FORBIDDEN_POLICY' },
        },
      ],
    },
  });
}

describe('fetchInnovationHubs', () => {
  it('keeps the hubs that came back when one hub’s space list was refused', async () => {
    const partial: InnovationHubsQuery = {
      platform: {
        library: {
          innovationHubs: [
            query.platform.library.innovationHubs[0],
            {
              id: 'h3',
              nameID: 'has-archived',
              profile: { displayName: 'Archived inside' },
              spaceListFilter: undefined,
            },
          ],
        },
      },
    };
    vi.mocked(createAlkemioSdk).mockResolvedValue({
      InnovationHubs: vi
        .fn()
        .mockRejectedValue(
          partialClientError(partial, [
            'platform',
            'library',
            'innovationHubs',
            1,
            'spaceListFilter',
            0,
            'about',
          ]),
        ),
    } as never);

    const hubs = await fetchInnovationHubs(auth);
    expect(hubs.map((h) => h.nameId)).toEqual(['vng-kenniscentrum', 'has-archived']);
    expect(hubs[1].spaces).toEqual([]);
  });

  it('still throws when no hub data came back at all', async () => {
    vi.mocked(createAlkemioSdk).mockResolvedValue({
      InnovationHubs: vi.fn().mockRejectedValue(new Error('network down')),
    } as never);
    await expect(fetchInnovationHubs(auth)).rejects.toThrow('network down');
  });
});
