import { createAlkemioSdk } from '../graphql/client.js';
import { fetchSpaceByName, type RawSpace } from './space-service.js';
import type { UsersByIDsQuery, OrganizationByIdQuery } from '../graphql/generated/alkemio-schema.js';

/** Raw user profile — derived from codegen types */
export type RawUser = UsersByIDsQuery['users'][number];

/** Raw organization profile — derived from codegen types */
export type RawOrganization = NonNullable<OrganizationByIdQuery['lookup']['organization']>;

/** Complete acquired data for a set of spaces */
export interface AcquiredData {
  spacesL0: Array<{ space: RawSpace; nameId: string }>;
  users: Map<string, RawUser>;
  organizations: Map<string, RawOrganization>;
}

/**
 * Acquire data for the given space nameIDs from Alkemio GraphQL.
 * Collects all user/org IDs from community roles and batch-fetches profiles.
 * All queries use the codegen-generated SDK (TR-016).
 */
export async function acquireSpaces(
  bearerToken: string,
  spaceNameIds: string[],
): Promise<AcquiredData> {
  const sdk = createAlkemioSdk(bearerToken);

  const spacesL0: AcquiredData['spacesL0'] = [];
  const userIds = new Set<string>();
  const orgIds = new Set<string>();

  for (const nameId of spaceNameIds) {
    const result = await fetchSpaceByName(sdk, nameId);
    const space = result.lookupByName.space;
    if (!space) continue;

    spacesL0.push({ space, nameId });
    collectContributorIds(space, userIds, orgIds);
  }

  // Batch-fetch user profiles
  const users = new Map<string, RawUser>();
  if (userIds.size > 0) {
    const { data } = await sdk.usersByIDs({ ids: Array.from(userIds) });
    for (const user of data.users) {
      users.set(user.id, user);
    }
  }

  // Fetch organization profiles one by one
  const organizations = new Map<string, RawOrganization>();
  for (const id of orgIds) {
    try {
      const { data } = await sdk.organizationByID({ id });
      if (data.lookup.organization) {
        organizations.set(id, data.lookup.organization);
      }
    } catch {
      console.warn(`Failed to fetch organization ${id}, skipping`);
    }
  }

  return { spacesL0, users, organizations };
}

/** Common shape for collecting contributor IDs across space levels */
interface SpaceWithCommunity {
  community: {
    roleSet: {
      memberUsers: Array<{ id: string }>;
      memberOrganizations: Array<{ id: string }>;
      leadOrganizations: Array<{ id: string }>;
      leadUsers: Array<{ id: string }>;
    };
  };
  subspaces?: SpaceWithCommunity[];
}

/** Recursively collect user and org IDs from a space's community roles */
function collectContributorIds(
  space: SpaceWithCommunity,
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
