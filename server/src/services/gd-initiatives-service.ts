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
import { loadVngRegistry } from './vng-registry.js';

const logger = getLogger();

/**
 * Fetch the gemeentedelers Knowledge-Base callouts as GD initiative inputs.
 *
 * The space's calloutsSet contains the GemeenteDelers initiatives PLUS a few
 * non-initiative callouts (intro/home). We keep only the actual initiatives: those
 * carrying at least one tag. Every GD initiative is tagged (gemeente, theme,
 * gd-<year>, sdg-NN, classification…); the intro/home callouts carry no tags. This
 * yields the intended ~305 set without depending on callout grouping metadata
 * (which would require an SDK regen).
 */
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
  const rawCallouts = space.collaboration.calloutsSet.callouts ?? [];

  const all = rawCallouts.map((c) => ({
    id: c.id,
    nameId: c.nameID,
    displayName: c.framing.profile.displayName,
    description: c.framing.profile.description ?? '',
    tags: (c.framing.profile.tagsets ?? []).flatMap((ts) => ts.tags).filter((t) => t.trim()),
    sourceUrl: null,
  }));

  const initiatives = all.filter((c) => c.tags.length > 0);

  if (initiatives.length !== all.length) {
    logger.info(
      `GD callouts: ${all.length} in set → ${initiatives.length} initiatives (dropped ${all.length - initiatives.length} tag-less callouts)`,
      { context: 'GD' },
    );
  }
  return initiatives;
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
    const info = loadVngRegistry().municipalityInfoByNameId(gemeenteNameId);
    node.provinceCode = info?.provinceCode ?? null;
    node.provinceName = info?.provinceName ?? null;
    node.population = info?.population ?? null;
    return node;
  } catch (err) {
    logger.warn(
      `Failed to resolve missing gemeente org '${gemeenteNameId}': ${conciseGraphqlError(err)}`,
      { context: 'GD' },
    );
    return null;
  }
}

/**
 * A one-line description of a GraphQL failure.
 *
 * `graphql-request` puts the ENTIRE HTTP response into `Error.message` — every error in
 * the payload, each carrying the Alkemio server's own Node stack trace. Logging that
 * verbatim turned a single "organisation not found" into ~40 lines of unrelated frames
 * and made the surrounding log unreadable. Prefer the GraphQL error's own message, name
 * its `code` (ENTITY_NOT_FOUND is the common and benign one here), and cap the length so
 * an unrecognised shape can never flood the log either.
 */
function conciseGraphqlError(err: unknown): string {
  const response = (
    err as { response?: { errors?: { message?: string; extensions?: { code?: string } }[] } }
  )?.response;
  const first = response?.errors?.[0];
  const raw = first?.message ?? (err instanceof Error ? err.message : String(err));
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  const capped = oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
  const code = first?.extensions?.code;
  return code ? `${code}: ${capped}` : capped;
}
