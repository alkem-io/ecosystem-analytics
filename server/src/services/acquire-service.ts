import { GraphQLClient } from 'graphql-request';
import { createGraphQLClient } from '../graphql/client.js';
import { fetchSpaceByName, type RawSpace } from './space-service.js';

/** Raw user profile from Alkemio */
export interface RawUser {
  id: string;
  nameID: string;
  profile: {
    displayName: string;
    avatar?: { uri: string };
    location?: {
      country?: string;
      city?: string;
      geoLocation?: { latitude: number; longitude: number };
    };
    url?: string;
  };
}

/** Raw organization profile from Alkemio */
export interface RawOrganization {
  id: string;
  nameID: string;
  profile: {
    displayName: string;
    avatar?: { uri: string };
    location?: {
      country?: string;
      city?: string;
      geoLocation?: { latitude: number; longitude: number };
    };
    url?: string;
  };
}

/** Complete acquired data for a set of spaces */
export interface AcquiredData {
  spacesL0: Array<{ space: RawSpace; nameId: string }>;
  users: Map<string, RawUser>;
  organizations: Map<string, RawOrganization>;
}

/**
 * Acquire data for the given space nameIDs from Alkemio GraphQL.
 * Collects all user/org IDs from community roles and batch-fetches profiles.
 */
export async function acquireSpaces(
  kratosCookies: string,
  spaceNameIds: string[],
): Promise<AcquiredData> {
  const client = createGraphQLClient(kratosCookies);

  // Fetch each space with full hierarchy
  const spacesL0: AcquiredData['spacesL0'] = [];
  const userIds = new Set<string>();
  const orgIds = new Set<string>();

  for (const nameId of spaceNameIds) {
    const result = await fetchSpaceByName(client, nameId);
    const space = result.lookupByName.space;
    spacesL0.push({ space, nameId });

    // Collect all contributor IDs from this space and its subspaces
    collectContributorIds(space, userIds, orgIds);
  }

  // Batch-fetch user profiles
  const users = await fetchUsers(client, Array.from(userIds));

  // Fetch organization profiles
  const organizations = await fetchOrganizations(client, Array.from(orgIds));

  return { spacesL0, users, organizations };
}

/** Recursively collect user and org IDs from a space's community roles */
function collectContributorIds(
  space: RawSpace,
  userIds: Set<string>,
  orgIds: Set<string>,
): void {
  const roleSet = space.community.roleSet;
  roleSet.memberUsers.forEach((u) => userIds.add(u.id));
  roleSet.leadUsers.forEach((u) => userIds.add(u.id));
  roleSet.memberOrganizations.forEach((o) => orgIds.add(o.id));
  roleSet.leadOrganizations.forEach((o) => orgIds.add(o.id));

  if (space.subspaces) {
    for (const sub of space.subspaces) {
      collectContributorIds(sub, userIds, orgIds);
    }
  }
}

/** Batch-fetch users by ID array */
async function fetchUsers(
  client: GraphQLClient,
  ids: string[],
): Promise<Map<string, RawUser>> {
  if (ids.length === 0) return new Map();

  const query = `
    query usersByIDs($ids: [UUID!]!) {
      users(IDs: $ids) {
        id
        nameID
        profile {
          displayName
          avatar: visual(type: AVATAR) { uri }
          location {
            country
            city
            geoLocation { latitude longitude }
          }
          url
        }
      }
    }
  `;

  const data = await client.request<{ users: RawUser[] }>(query, { ids });
  const map = new Map<string, RawUser>();
  for (const user of data.users) {
    map.set(user.id, user);
  }
  return map;
}

/** Fetch organizations one by one (no batch query available) */
async function fetchOrganizations(
  client: GraphQLClient,
  ids: string[],
): Promise<Map<string, RawOrganization>> {
  if (ids.length === 0) return new Map();

  const query = `
    query organizationByID($id: UUID!) {
      lookup {
        organization(ID: $id) {
          id
          nameID
          profile {
            displayName
            avatar: visual(type: AVATAR) { uri }
            location {
              country
              city
              geoLocation { latitude longitude }
            }
            url
          }
        }
      }
    }
  `;

  const map = new Map<string, RawOrganization>();
  for (const id of ids) {
    try {
      const data = await client.request<{
        lookup: { organization: RawOrganization };
      }>(query, { id });
      if (data.lookup.organization) {
        map.set(id, data.lookup.organization);
      }
    } catch {
      // Skip orgs that fail to load (NFR-005: graceful degradation)
      console.warn(`Failed to fetch organization ${id}, skipping`);
    }
  }
  return map;
}
