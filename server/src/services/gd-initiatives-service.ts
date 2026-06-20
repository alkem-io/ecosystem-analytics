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
import { loadConfig } from '../config.js';

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
  const callouts = res.data.lookupByName.space?.collaboration.calloutsSet.callouts ?? [];
  return callouts.map((c) => ({
    id: c.id,
    nameId: c.nameID,
    displayName: c.framing.profile.displayName,
    tags: (c.framing.profile.tagsets ?? []).flatMap((ts) => ts.tags),
    sourceUrl: null,
  }));
}
