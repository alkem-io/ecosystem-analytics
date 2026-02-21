import { GraphQLClient } from 'graphql-request';
import { createGraphQLClient } from '../graphql/client.js';
import type { SpaceSelectionItem } from '../types/api.js';

/**
 * Fetches the user's L0 Space memberships from Alkemio.
 * Uses the mySpacesHierarchical query to get spaces the user is a member of.
 *
 * Note: Until codegen is run, this uses raw GraphQL queries.
 * After codegen: replace with sdk.mySpacesHierarchical()
 */
export async function listUserSpaces(kratosCookies: string): Promise<SpaceSelectionItem[]> {
  const client = createGraphQLClient(kratosCookies);

  const query = `
    query mySpacesHierarchical {
      me {
        spaceMembershipsHierarchical {
          space {
            id
            nameID
            about {
              profile {
                displayName
                url
              }
            }
            community {
              roleSet {
                leadUsers: usersInRole(role: LEAD) { id }
              }
            }
          }
        }
      }
    }
  `;

  const data = await client.request<{
    me: {
      spaceMembershipsHierarchical: Array<{
        space: {
          id: string;
          nameID: string;
          about: { profile: { displayName: string; url: string } };
          community: { roleSet: { leadUsers: Array<{ id: string }> } };
        };
      }>;
    };
  }>(query);

  // We need the current user ID to check if they're a lead
  const meQuery = `query me { me { user { id } } }`;
  const meData = await client.request<{ me: { user: { id: string } } }>(meQuery);
  const currentUserId = meData.me.user.id;

  return data.me.spaceMembershipsHierarchical.map((membership) => {
    const space = membership.space;
    const isLead = space.community.roleSet.leadUsers.some((u) => u.id === currentUserId);

    return {
      id: space.id,
      nameId: space.nameID,
      displayName: space.about.profile.displayName,
      role: isLead ? 'LEAD' : 'MEMBER',
      visibility: 'PUBLIC', // Default; Alkemio API doesn't expose this directly in this query
    } satisfies SpaceSelectionItem;
  });
}

/**
 * Fetches a specific space by nameID with full hierarchy and community data.
 * Returns raw data for the transformer.
 */
export async function fetchSpaceByName(client: GraphQLClient, nameId: string) {
  const query = `
    query spaceByName($nameId: NameID!) {
      lookupByName {
        space(NAMEID: $nameId) {
          id
          nameID
          about {
            profile {
              displayName
              tagline
              location {
                country
                city
                geoLocation { latitude longitude }
              }
              url
            }
          }
          community {
            roleSet {
              memberUsers: usersInRole(role: MEMBER) { id }
              memberOrganizations: organizationsInRole(role: MEMBER) { id }
              leadOrganizations: organizationsInRole(role: LEAD) { id }
              leadUsers: usersInRole(role: LEAD) { id }
            }
          }
          subspaces {
            id
            nameID
            about {
              profile {
                displayName
                tagline
                location {
                  country
                  city
                  geoLocation { latitude longitude }
                }
                url
              }
            }
            community {
              roleSet {
                memberUsers: usersInRole(role: MEMBER) { id }
                memberOrganizations: organizationsInRole(role: MEMBER) { id }
                leadOrganizations: organizationsInRole(role: LEAD) { id }
                leadUsers: usersInRole(role: LEAD) { id }
              }
            }
            subspaces {
              id
              nameID
              about {
                profile {
                  displayName
                  tagline
                  location {
                    country
                    city
                    geoLocation { latitude longitude }
                  }
                  url
                }
              }
              community {
                roleSet {
                  memberUsers: usersInRole(role: MEMBER) { id }
                  memberOrganizations: organizationsInRole(role: MEMBER) { id }
                  leadOrganizations: organizationsInRole(role: LEAD) { id }
                  leadUsers: usersInRole(role: LEAD) { id }
                }
              }
            }
          }
        }
      }
    }
  `;

  return client.request<{ lookupByName: { space: RawSpace } }>(query, { nameId });
}

/**
 * Find Spaces related to a given entity (user or org) that are not in the current dataset.
 * Used for graph expansion (US3).
 */
export async function findRelatedSpaces(
  kratosCookies: string,
  entityId: string,
  currentSpaceIds: string[],
): Promise<SpaceSelectionItem[]> {
  // Get all user's spaces
  const allSpaces = await listUserSpaces(kratosCookies);
  // Filter out spaces already in the graph
  // In a full implementation, we'd query which spaces this entity belongs to.
  // For now, return spaces not already in the current dataset.
  return allSpaces.filter((s) => !currentSpaceIds.includes(s.id));
}

/** Raw space shape from GraphQL */
export interface RawSpace {
  id: string;
  nameID: string;
  about: {
    profile: {
      displayName: string;
      tagline?: string;
      location?: {
        country?: string;
        city?: string;
        geoLocation?: { latitude: number; longitude: number };
      };
      url?: string;
    };
  };
  community: {
    roleSet: {
      memberUsers: Array<{ id: string }>;
      memberOrganizations: Array<{ id: string }>;
      leadOrganizations: Array<{ id: string }>;
      leadUsers: Array<{ id: string }>;
    };
  };
  subspaces?: RawSpace[];
}
