import { getLogger } from '../logging/logger.js';
import { serializeIndex, estimateTokens } from '../transform/serializer.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import type {
  EcosystemIndex,
  IndexedSpace,
  IndexedPerson,
  IndexedOrg,
  IndexedRole,
} from '../types/query.js';

const logger = getLogger();

/** Extract all tags from tagsets (typically the first tagset named 'Keywords') */
function extractTags(tagsets?: Array<{ name: string; tags: string[] }> | undefined): string[] {
  if (!tagsets) return [];
  return tagsets.flatMap((ts) => ts.tags);
}

/**
 * Build a per-user EcosystemIndex from all spaces the user has access to.
 * Uses the existing codegen SDK — same auth flow as graph generation.
 */
export async function buildEcosystemIndex(userId: string, sdk: Sdk): Promise<EcosystemIndex> {
  logger.info('Building ecosystem index', { context: 'IndexService', userId });

  const { data } = await sdk.mySpacesHierarchical();
  const memberships = data.me.spaceMembershipsHierarchical;

  // Collect all spaces (L0, L1, L2) and unique contributor/org IDs
  const indexedSpaces: IndexedSpace[] = [];
  const userIds = new Set<string>();
  const orgIds = new Set<string>();

  // Role tracking: personId/orgId → { spaceName, roleType }[]
  const userRolesMap = new Map<string, IndexedRole[]>();
  const orgRolesMap = new Map<string, IndexedRole[]>();

  function processSpace(
    space: typeof memberships[number]['space'],
    childMemberships?: typeof memberships[number]['childMemberships'],
  ) {
    const profile = space.about.profile;
    const community = space.community;
    const spaceName = profile.displayName;
    const spaceNameId = space.nameID;

    // Count subspaces
    const subspaceCount = childMemberships?.length ?? 0;

    // Count all unique member/lead/admin user IDs
    const roleSet = community.roleSet;
    const allUserIds = [
      ...roleSet.memberUsers.map((u) => u.id),
      ...roleSet.leadUsers.map((u) => u.id),
      ...roleSet.adminUsers.map((u) => u.id),
    ];
    const allOrgIds = [
      ...roleSet.memberOrganizations.map((o) => o.id),
      ...roleSet.leadOrganizations.map((o) => o.id),
    ];

    const uniqueUserIds = new Set(allUserIds);

    indexedSpaces.push({
      id: space.id,
      nameId: spaceNameId,
      name: spaceName,
      tagline: profile.tagline ?? null,
      tags: extractTags(profile.tagsets),
      city: profile.location?.city ?? null,
      country: profile.location?.country ?? null,
      memberCount: uniqueUserIds.size,
      subspaceCount,
      visibility: space.visibility ?? null,
      avatarUrl: profile.avatar?.uri ?? null,
    });

    // Track role assignments
    for (const u of roleSet.memberUsers) {
      userIds.add(u.id);
      addRole(userRolesMap, u.id, spaceName, spaceNameId, 'MEMBER');
    }
    for (const u of roleSet.leadUsers) {
      userIds.add(u.id);
      addRole(userRolesMap, u.id, spaceName, spaceNameId, 'LEAD');
    }
    for (const u of roleSet.adminUsers) {
      userIds.add(u.id);
      addRole(userRolesMap, u.id, spaceName, spaceNameId, 'ADMIN');
    }
    for (const o of roleSet.memberOrganizations) {
      orgIds.add(o.id);
      addRole(orgRolesMap, o.id, spaceName, spaceNameId, 'MEMBER');
    }
    for (const o of roleSet.leadOrganizations) {
      orgIds.add(o.id);
      addRole(orgRolesMap, o.id, spaceName, spaceNameId, 'LEAD');
    }

    // Recurse into child memberships
    if (childMemberships) {
      for (const child of childMemberships) {
        processSpace(
          child.space,
          'childMemberships' in child ? (child as typeof memberships[number]).childMemberships : undefined,
        );
      }
    }
  }

  for (const membership of memberships) {
    processSpace(membership.space, membership.childMemberships);
  }

  logger.info(
    `Index scan: ${indexedSpaces.length} spaces, ${userIds.size} users, ${orgIds.size} orgs`,
    { context: 'IndexService' },
  );

  // Batch-fetch user profiles
  const userIdArray = [...userIds];
  const indexedPeople: IndexedPerson[] = [];

  if (userIdArray.length > 0) {
    // Fetch in batches of 50 to avoid query size limits
    const batchSize = 50;
    for (let i = 0; i < userIdArray.length; i += batchSize) {
      const batch = userIdArray.slice(i, i + batchSize);
      try {
        const { data: userData } = await sdk.usersByIDs({ ids: batch });
        for (const user of userData.users) {
          indexedPeople.push({
            id: user.id,
            name: user.profile.displayName,
            skills: extractTags(user.profile.tagsets),
            city: user.profile.location?.city ?? null,
            country: user.profile.location?.country ?? null,
            roles: userRolesMap.get(user.id) ?? [],
            avatarUrl: user.profile.avatar?.uri ?? null,
          });
        }
      } catch (err) {
        logger.warn(`Failed to fetch user batch starting at index ${i}`, {
          context: 'IndexService',
          error: String(err),
        });
      }
    }
  }

  // Fetch org profiles one by one (no batch query available)
  const indexedOrgs: IndexedOrg[] = [];
  for (const orgId of orgIds) {
    try {
      const { data: orgData } = await sdk.organizationByID({ id: orgId });
      const org = orgData.lookup.organization;
      if (org) {
        indexedOrgs.push({
          id: org.id,
          name: org.profile.displayName,
          tags: extractTags(org.profile.tagsets),
          city: org.profile.location?.city ?? null,
          country: org.profile.location?.country ?? null,
          roles: orgRolesMap.get(org.id) ?? [],
          avatarUrl: org.profile.avatar?.uri ?? null,
        });
      }
    } catch (err) {
      logger.warn(`Failed to fetch org ${orgId}`, {
        context: 'IndexService',
        error: String(err),
      });
    }
  }

  const index: EcosystemIndex = {
    userId,
    spaces: indexedSpaces,
    people: indexedPeople,
    organizations: indexedOrgs,
    generatedAt: new Date().toISOString(),
    tokenEstimate: 0,
  };

  // Compute token estimate
  const serialized = serializeIndex(index);
  index.tokenEstimate = estimateTokens(serialized);

  logger.info(`Ecosystem index built: ${index.tokenEstimate} estimated tokens`, {
    context: 'IndexService',
  });

  return index;
}

function addRole(
  map: Map<string, IndexedRole[]>,
  entityId: string,
  spaceName: string,
  spaceNameId: string,
  roleType: IndexedRole['roleType'],
): void {
  const roles = map.get(entityId) ?? [];
  roles.push({ spaceName, spaceNameId, roleType });
  map.set(entityId, roles);
}
