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
    expect(hubs[0]).toMatchObject({ id: 'h1', nameId: 'vng-kenniscentrum', displayName: 'VNG Kenniscentrum' });
    expect(hubs[0].spaces).toEqual([
      { nameId: 'stad-utrecht', displayName: 'Stad Utrecht', visibility: 'ACTIVE' },
    ]);
  });

  it('treats a hub with no spaceListFilter as having no spaces', () => {
    const hubs = mapInnovationHubs(query);
    expect(hubs[1].spaces).toEqual([]);
  });
});
