/**
 * GemeenteDelers initiative fetching (feature 016, US10).
 *
 * Reads the gemeentedelers space's callouts (the Knowledge Base set — identifiable
 * as the one with 300+ callouts) and flattens each callout's tagset tags into the
 * shape consumed by `transform/initiatives.ts`. The gemeentedelers space nameID
 * comes from config (FR-045).
 */
import { createAlkemioSdk } from '../graphql/client.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import type { AuthContext } from '../auth/middleware.js';
import type { GdCalloutInput } from '../types/api.js';
import type { GraphNode } from '../types/graph.js';
import { buildOrgNode } from '../transform/transformer.js';
import { getLogger } from '../logging/logger.js';
import { loadConfig } from '../config.js';

const logger = getLogger();

/** Fetch the gemeentedelers Knowledge-Base callouts as GD initiative inputs. */
export async function fetchGemeentedelersCallouts(
  auth: AuthContext,
  sdk?: Sdk,
): Promise<GdCalloutInput[]> {
  const config = loadConfig();
  const client = sdk ?? (await createAlkemioSdk(auth));
  const res = await client.GemeentedelersCallouts({
    nameId: config.vng.gemeentedelersSpaceNameId,
  });
  const space = res.data.lookupByName.space;
  // A null space means the user lacks READ on the GD space (or it is absent):
  // signal non-readability so the caller can fall back to gdLayer.available=false (FR-044).
  if (!space) {
    throw new Error('GD_SPACE_UNREADABLE');
  }
  const callouts = space.collaboration.calloutsSet.callouts ?? [];
  return callouts.map((c) => ({
    id: c.id,
    nameId: c.nameID,
    displayName: c.framing.profile.displayName,
    tags: (c.framing.profile.tagsets ?? []).flatMap((ts) => ts.tags),
    sourceUrl: null,
  }));
}

/**
 * Resolve a gemeente org `nameID` (e.g. "gemeente-groningen") to a fully built
 * ORGANIZATION GraphNode (with `isGemeente=true`), looking up its UUID via
 * `OrganizationByNameId` then fetching its profile via `organizationByID`
 * (FR-043). Returns null (and logs) if the org can't be resolved — non-fatal.
 */
export async function resolveGemeenteOrgNode(
  sdk: Sdk,
  gemeenteNameId: string,
): Promise<GraphNode | null> {
  try {
    const idRes = await sdk.OrganizationByNameId({ nameId: gemeenteNameId });
    const orgId = idRes.data.lookupByName.organization;
    if (!orgId) return null;

    const profileRes = await sdk.organizationByID({ id: orgId });
    const org = profileRes.data.lookup.organization;
    if (!org) return null;

    const node = buildOrgNode(orgId, org, []);
    node.isGemeente = true;
    return node;
  } catch (err) {
    logger.warn(
      `Failed to resolve missing gemeente org '${gemeenteNameId}': ${(err as Error).message}`,
      { context: 'GD' },
    );
    return null;
  }
}
