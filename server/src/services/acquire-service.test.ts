/**
 * About-only degradation in `acquireSpaces`.
 *
 * A private Space the caller is not a member of grants READ_ABOUT but not READ.
 * `spaceByName` selects `community` and `account`, both READ-guarded and non-nullable,
 * so Alkemio nulls the whole `space` and graphql-request throws a ClientError carrying
 * that null. Before this fallback the Space was silently dropped — which is how the
 * VNG funnel lost every INACTIVE (private) initiative for non-admin users.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = {
  spaceByName: vi.fn(),
  SpaceAboutOnlyByName: vi.fn(),
  usersByIDs: vi.fn().mockResolvedValue({ data: { users: [] } }),
  organizationByID: vi.fn(),
  ActivityFeedGrouped: vi.fn().mockResolvedValue({ data: { activityFeedGrouped: [] } }),
};
vi.mock('../graphql/client.js', () => ({ createAlkemioSdk: vi.fn().mockResolvedValue(sdk) }));
vi.mock('../config.js', () => ({
  loadConfig: () => ({ features: {}, activity: { windowMonths: 12 } }),
}));

const { acquireSpaces } = await import('./acquire-service.js');
const auth = { userId: 'u1' } as never;

const about = {
  id: 'about-1',
  isContentPublic: false,
  membership: { myPrivileges: [] },
  classifications: [
    {
      id: 'c1',
      displayLabel: 'Fase',
      cardinality: 'SINGLE',
      display: true,
      sortOrder: 0,
      values: [{ id: 'v1', label: 'Pre-intake' }],
      selectedValues: [{ id: 'v1', label: 'Pre-intake' }],
    },
  ],
  profile: { id: 'p1', displayName: 'GBI', url: 'https://x/gbi', tagsets: [] },
};

function forbiddenOnSpace(): Error {
  return Object.assign(new Error('GraphQL Error (Code: 200)'), {
    response: {
      status: 200,
      data: { lookupByName: { space: null } },
      errors: [
        {
          message: "Authorization: unable to grant 'read' privilege: Space.account",
          path: ['lookupByName', 'space', 'account'],
          extensions: { code: 'FORBIDDEN_POLICY' },
        },
      ],
    },
  });
}

describe('acquireSpaces — read-about-only spaces', () => {
  beforeEach(() => {
    sdk.spaceByName.mockReset();
    sdk.SpaceAboutOnlyByName.mockReset();
  });

  it('falls back to the about-only fetch and keeps the space, restricted', async () => {
    sdk.spaceByName.mockRejectedValue(forbiddenOnSpace());
    sdk.SpaceAboutOnlyByName.mockResolvedValue({
      data: {
        lookupByName: {
          space: {
            id: 's-gbi',
            nameID: 'gbi',
            createdDate: new Date(0),
            visibility: 'INACTIVE',
            about,
          },
        },
      },
    });

    const acquired = await acquireSpaces(auth, ['gbi']);

    expect(sdk.SpaceAboutOnlyByName).toHaveBeenCalledWith({ nameId: 'gbi' });
    expect(acquired.spacesL0).toHaveLength(1);
    const { space } = acquired.spacesL0[0];
    expect(space.id).toBe('s-gbi');
    expect(space.about.classifications[0].selectedValues[0].label).toBe('Pre-intake');
    expect(space.community).toBeNull();
    expect(space.subspaces).toEqual([]);
    expect(acquired.errors).toEqual([]);
  });

  it('does not attempt the fallback for a space that simply does not exist', async () => {
    sdk.spaceByName.mockRejectedValue(
      Object.assign(new Error('GraphQL Error (Code: 200)'), {
        response: {
          status: 200,
          data: { lookupByName: { space: null } },
          errors: [
            {
              message: 'Unable to find Space',
              path: ['lookupByName', 'space'],
              extensions: { code: 'ENTITY_NOT_FOUND' },
            },
          ],
        },
      }),
    );

    const acquired = await acquireSpaces(auth, ['nope']);

    expect(sdk.SpaceAboutOnlyByName).not.toHaveBeenCalled();
    expect(acquired.spacesL0).toEqual([]);
    expect(acquired.errors[0]).toMatch(/nope/);
  });

  it('reports the space as restricted when even the About is refused', async () => {
    sdk.spaceByName.mockRejectedValue(forbiddenOnSpace());
    sdk.SpaceAboutOnlyByName.mockRejectedValue(
      Object.assign(new Error('GraphQL Error (Code: 200)'), {
        response: {
          status: 200,
          data: { lookupByName: { space: null } },
          errors: [
            {
              message: 'forbidden',
              path: ['lookupByName', 'space', 'about'],
              extensions: { code: 'FORBIDDEN_POLICY' },
            },
          ],
        },
      }),
    );

    const acquired = await acquireSpaces(auth, ['secret']);
    expect(acquired.spacesL0).toEqual([]);
    expect(acquired.errors[0]).toMatch(/secret/);
  });
});
