/**
 * Feature 025 — the EXTENDED organisation profile item (description, tagline, website,
 * contact email, references, associate count), fetched ON DEMAND and cached per
 * organisation (`__org__:<id>`, `cache.ttl_hours`) — so an organisation is looked up at
 * most once per viewer per day however many Spaces reference it (FR-013a), and never on
 * the dashboards' core load. Ids the viewer cannot read come back in `missing`.
 */
import type { AuthContext } from '../auth/middleware.js';
import { createAlkemioSdk } from '../graphql/client.js';
import { getLogger } from '../logging/logger.js';
import { getCacheEntry, orgCacheId, setCacheEntry } from '../cache/cache-service.js';
import type { ExtendedOrganizationProfile, OrganizationsResponse } from '../types/api.js';

export const MAX_ORGANIZATIONS_PER_REQUEST = 50;

export async function loadExtendedProfiles(
  userId: string,
  auth: AuthContext,
  ids: string[],
): Promise<OrganizationsResponse> {
  const organizations: Record<string, ExtendedOrganizationProfile> = {};
  const missing: string[] = [];
  const toFetch: string[] = [];
  for (const id of new Set(ids)) {
    const row = getCacheEntry(userId, orgCacheId(id));
    if (row) organizations[id] = JSON.parse(row.datasetJson) as ExtendedOrganizationProfile;
    else toFetch.push(id);
  }
  if (toFetch.length === 0) return { organizations, missing };

  const sdk = await createAlkemioSdk(auth);
  for (const id of toFetch) {
    try {
      const { data } = await sdk.organizationByID({ id });
      const org = data.lookup.organization;
      if (!org) {
        missing.push(id);
        continue;
      }
      const refs = (org.profile?.references ?? []).filter((r) => r.uri).map((r) => ({ name: r.name, uri: r.uri }));
      const profile: ExtendedOrganizationProfile = {
        id,
        description: org.profile?.description ?? null,
        tagline: org.profile?.tagline ?? null,
        website: org.website ?? null,
        contactEmail: org.contactEmail ?? null,
        references: refs.length ? refs : undefined,
        associateCount: org.roleSet?.associates?.length,
        owner: org.roleSet?.owners?.[0]?.profile?.displayName ?? null,
      };
      setCacheEntry(userId, orgCacheId(id), JSON.stringify(profile));
      organizations[id] = profile;
    } catch (err) {
      getLogger().warn(`Failed to fetch organization ${id}: ${(err as Error).message}`, { context: 'Organizations' });
      missing.push(id);
    }
  }
  return { organizations, missing };
}
