import { createAlkemioSdk } from '../graphql/client.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import type { SpaceByNameQuery } from '../graphql/generated/alkemio-schema.js';
import type { SpaceSelectionItem } from '../types/api.js';

/**
 * Fetches the user's L0 Space memberships from Alkemio.
 * Uses the codegen-generated mySpacesHierarchical query (TR-016).
 */
export async function listUserSpaces(bearerToken: string): Promise<SpaceSelectionItem[]> {
  const sdk = createAlkemioSdk(bearerToken);

  const { data } = await sdk.mySpacesHierarchical();
  const currentUserId = data.me.user?.id;

  return data.me.spaceMembershipsHierarchical.map((membership) => {
    const space = membership.space;
    const isLead = currentUserId
      ? space.community.roleSet.leadUsers.some((u) => u.id === currentUserId)
      : false;

    return {
      id: space.id,
      nameId: space.nameID,
      displayName: space.about.profile.displayName,
      role: isLead ? 'LEAD' : 'MEMBER',
      visibility: 'PUBLIC',
    } satisfies SpaceSelectionItem;
  });
}

/**
 * Fetches a specific space by nameID with full hierarchy and community data.
 * Returns the typed query result for the transformer.
 */
export async function fetchSpaceByName(sdk: Sdk, nameId: string) {
  const { data } = await sdk.spaceByName({ nameId });
  return data;
}

/**
 * Find Spaces related to a given entity that are not in the current dataset.
 * Used for graph expansion (US3).
 */
export async function findRelatedSpaces(
  bearerToken: string,
  entityId: string,
  currentSpaceIds: string[],
): Promise<SpaceSelectionItem[]> {
  const allSpaces = await listUserSpaces(bearerToken);
  return allSpaces.filter((s) => !currentSpaceIds.includes(s.id));
}

/** Extract the space type from the codegen-generated SpaceByNameQuery */
type SpaceByNameResult = NonNullable<SpaceByNameQuery['lookupByName']['space']>;

/** Raw space shape — derived from the codegen types */
export type RawSpace = SpaceByNameResult;
