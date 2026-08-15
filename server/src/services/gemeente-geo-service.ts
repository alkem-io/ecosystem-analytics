/**
 * Gemeente geo-location set (feature 019, Usage Explorer).
 *
 * The Usage Explorer draws EVERY Dutch gemeente — including the ones that take part in
 * no initiative at all, which is what makes coverage gaps visible. Those gemeentes are
 * in no selected space's role set, so `acquire-service` never fetches them and they have
 * no position. This service closes that gap: it sweeps Alkemio's organisations once,
 * joins them to the committed gemeente registry, and caches the result for a week.
 *
 * Two properties matter and are load-bearing:
 *
 *  • SELECTION-INDEPENDENT. The result varies with neither the space selection nor the
 *    GD toggle. That is what lets the client recompute rankings locally on every zoom
 *    without a round trip (FR-005b, FR-016).
 *
 *  • REGISTRY-AUTHORITATIVE. The registry decides which organisations are gemeentes;
 *    Alkemio only supplies coordinates. The `nameID` filter below is an optimisation, so
 *    the result is correct whether the API matches by prefix, substring, or exact value.
 *
 * See specs/019-usage-explorer/contracts/api-gemeente-locations.md and research.md R1/R2.
 */
import { createAlkemioSdk } from '../graphql/client.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import type { AuthContext } from '../auth/middleware.js';
import type { GemeenteLocation } from '../types/api.js';
import { getCacheEntryAllowStale, setCacheEntry, GEO_CACHE_SPACE_ID } from '../cache/cache-service.js';
import { getLogger } from '../logging/logger.js';
import { loadConfig } from '../config.js';
import { loadVngRegistry } from './vng-registry.js';

const logger = getLogger();

/** Organisations per page. Bounded so one slow page can't stall the whole sweep. */
const PAGE_SIZE = 100;

/**
 * Hard stop on pages fetched. 342 gemeentes among the platform's organisations needs
 * far fewer than this; the cap exists so an API that never reports `hasNextPage: false`
 * degrades to a partial result instead of looping forever.
 */
const MAX_PAGES = 100;

/** Every Dutch gemeente nameID starts with this, so the API filter can narrow the sweep. */
const GEMEENTE_NAMEID_PREFIX = 'gemeente-';

/** TTL for a partial sweep — short, so a degraded Alkemio is retried soon (contract §caching). */
const PARTIAL_TTL_HOURS = 1;

/** The cached payload. Mirrors GemeenteLocationsResponse minus the per-request fields. */
export interface GemeenteLocationSet {
  locations: GemeenteLocation[];
  expected: number;
  withLocation: number;
  partial: boolean;
  fetchedAt: string;
}

/** One organisation as the sweep sees it, before the registry join. */
interface SweptOrganization {
  nameId: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Page through Alkemio's organisations, collecting nameID → coordinates.
 *
 * `filtered` controls whether the `nameID` filter is applied. It is attempted first as
 * an optimisation; the caller falls back to an unfiltered sweep when it yields fewer
 * gemeentes than the registry expects, because a filter that matches exactly (rather
 * than by prefix) would silently return nothing.
 */
async function sweepOrganizations(
  client: Sdk,
  filtered: boolean,
): Promise<{ orgs: Map<string, SweptOrganization>; complete: boolean }> {
  const orgs = new Map<string, SweptOrganization>();
  let after: string | undefined;
  let complete = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.GemeenteLocations({
      first: PAGE_SIZE,
      after,
      filter: filtered ? { nameID: GEMEENTE_NAMEID_PREFIX } : undefined,
    });

    const pageResult = res.data.organizationsPaginated;
    for (const org of pageResult.organization) {
      const geo = org.profile?.location?.geoLocation;
      // Alkemio returns 0/0 for "no location set" as readily as null. Treat a null,
      // undefined, or non-finite coordinate as absent — the gemeente is then unplaced
      // rather than pinned off the coast of Africa (FR-030).
      const lat = typeof geo?.latitude === 'number' && Number.isFinite(geo.latitude) ? geo.latitude : null;
      const lon = typeof geo?.longitude === 'number' && Number.isFinite(geo.longitude) ? geo.longitude : null;
      orgs.set(org.nameID, {
        nameId: org.nameID,
        latitude: lat === 0 && lon === 0 ? null : lat,
        longitude: lat === 0 && lon === 0 ? null : lon,
      });
    }

    if (!pageResult.pageInfo.hasNextPage || !pageResult.pageInfo.endCursor) {
      complete = true;
      break;
    }
    after = pageResult.pageInfo.endCursor;
  }

  return { orgs, complete };
}

/**
 * Join the swept organisations onto the gemeente registry.
 *
 * The registry is the authority on WHICH municipalities exist (FR-005c: only entries
 * carrying both an Alkemio nameID and a CBS code — the two Belgian entries have
 * neither and are excluded). Alkemio only supplies coordinates. A gemeente the sweep
 * missed is still emitted, with null coordinates, so it is counted as unplaced rather
 * than silently vanishing.
 */
function joinToRegistry(orgs: Map<string, SweptOrganization>): GemeenteLocation[] {
  const registry = loadVngRegistry();

  return registry
    .municipalities()
    .filter((m) => m.nameId && m.info.cbsCode && m.info.country === 'NL')
    .map((m) => {
      const swept = orgs.get(m.nameId);
      return {
        nameId: m.nameId,
        // The registry title, NOT the Alkemio display name, so labels stay stable
        // across the Cities table, the city profile, and this map.
        title: m.title,
        cbsCode: m.info.cbsCode as string,
        latitude: swept?.latitude ?? null,
        longitude: swept?.longitude ?? null,
        provinceCode: m.info.provinceCode ?? '',
        provinceName: m.info.provinceName ?? '',
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Run the Alkemio sweep and build the location set.
 *
 * Tries the filtered sweep first. If it produces fewer located gemeentes than the
 * unfiltered sweep could — detected by the filtered result covering less than half the
 * registry — it retries unfiltered. Correctness never depends on the filter: the join
 * in {@link joinToRegistry} is what decides the output.
 */
export async function fetchGemeenteLocations(
  auth: AuthContext,
  sdk?: Sdk,
): Promise<GemeenteLocationSet> {
  const client = sdk ?? (await createAlkemioSdk(auth));
  const registry = loadVngRegistry();
  const expected = registry
    .municipalities()
    .filter((m) => m.nameId && m.info.cbsCode && m.info.country === 'NL').length;

  let { orgs, complete } = await sweepOrganizations(client, true);
  let hits = countRegistryHits(orgs);

  if (hits < expected / 2) {
    logger.info(
      `nameID filter matched ${hits}/${expected} gemeentes — retrying unfiltered`,
      { context: 'GemeenteGeo' },
    );
    ({ orgs, complete } = await sweepOrganizations(client, false));
    hits = countRegistryHits(orgs);
  }

  const locations = joinToRegistry(orgs);
  const withLocation = locations.filter((l) => l.latitude != null && l.longitude != null).length;

  // Partial when the sweep was cut short, or when it finished but reached fewer
  // gemeentes than the registry knows about — both mean "usable but incomplete".
  const partial = !complete || withLocation < expected;

  logger.info(
    `Gemeente locations: ${withLocation}/${expected} located${partial ? ' (partial)' : ''}`,
    { context: 'GemeenteGeo' },
  );

  return {
    locations,
    expected,
    withLocation,
    partial,
    fetchedAt: new Date().toISOString(),
  };
}

/** How many swept organisations are actually known gemeentes. */
function countRegistryHits(orgs: Map<string, SweptOrganization>): number {
  const registry = loadVngRegistry();
  let n = 0;
  for (const nameId of registry.gemeenteNameIds()) {
    if (orgs.has(nameId)) n++;
  }
  return n;
}

/** What {@link getGemeenteLocations} resolved, and how. */
export interface GemeenteLocationsResult {
  set: GemeenteLocationSet;
  cached: boolean;
  stale: boolean;
}

/**
 * The cached read path used by the route.
 *
 * Order of preference: fresh cache → new sweep → stale cache. That last fallback is
 * FR-030a: a failure to refresh must not blank the map. The expired row is therefore
 * never deleted before a replacement is in hand — which is why this reads through
 * {@link getCacheEntryAllowStale} rather than the ordinary `getCacheEntry`.
 *
 * @param appId Dashboard profile supplying the TTL (`vng` / `govtech`).
 */
export async function getGemeenteLocations(
  auth: AuthContext,
  userId: string,
  appId: 'vng' | 'govtech',
  sdk?: Sdk,
): Promise<GemeenteLocationsResult> {
  const config = loadConfig();
  const ttlHours = config.dashboards[appId].geoCacheTtlHours;

  const cached = getCacheEntryAllowStale(userId, GEO_CACHE_SPACE_ID);
  if (cached && !cached.stale) {
    return { set: JSON.parse(cached.datasetJson) as GemeenteLocationSet, cached: true, stale: false };
  }

  try {
    const set = await fetchGemeenteLocations(auth, sdk);
    // A partial result is still cached — otherwise a degraded Alkemio would trigger a
    // full sweep on every single request — but with a short TTL so recovery is picked up.
    setCacheEntry(userId, GEO_CACHE_SPACE_ID, JSON.stringify(set), set.partial ? PARTIAL_TTL_HOURS : ttlHours);
    return { set, cached: false, stale: false };
  } catch (err) {
    if (cached) {
      logger.warn(
        `Gemeente location refresh failed, serving stale set: ${(err as Error).message}`,
        { context: 'GemeenteGeo' },
      );
      return { set: JSON.parse(cached.datasetJson) as GemeenteLocationSet, cached: true, stale: true };
    }
    throw err;
  }
}
