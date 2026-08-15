process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDatabase, getDatabase } from '../cache/db.js';
import { setCacheEntry, GEO_CACHE_SPACE_ID } from '../cache/cache-service.js';
import { fetchGemeenteLocations, getGemeenteLocations } from './gemeente-geo-service.js';
import { loadVngRegistry } from './vng-registry.js';
import type { Sdk } from '../graphql/generated/graphql.js';
import type { AuthContext } from '../auth/middleware.js';

/**
 * Feature 019 — the gemeente geo-location set.
 *
 * These tests pin the two properties the Usage Explorer depends on: that the REGISTRY
 * decides which municipalities exist (Alkemio only supplies coordinates), and that a
 * failure to refresh serves the stale set rather than blanking the map (FR-030a).
 */

const auth = { userId: 'user-a' } as unknown as AuthContext;

/** The 342 NL gemeentes the registry knows about — the expected universe (FR-005). */
const registryNameIds = loadVngRegistry().gemeenteNameIds();

/** Build a paginated-organisations response from a list of nameIDs. */
function page(nameIds: string[], hasNextPage = false, endCursor?: string) {
  return {
    data: {
      organizationsPaginated: {
        total: nameIds.length,
        pageInfo: { hasNextPage, endCursor },
        organization: nameIds.map((nameID, i) => ({
          id: `org-${i}`,
          nameID,
          profile: {
            displayName: nameID,
            location: { country: 'NL', city: '', geoLocation: { latitude: 52 + i / 1000, longitude: 5 } },
          },
        })),
      },
    },
  };
}

function makeSdk(impl: (vars: { after?: string }) => unknown): Sdk {
  return { GemeenteLocations: vi.fn(impl) } as unknown as Sdk;
}

beforeEach(() => initDatabase());

describe('fetchGemeenteLocations', () => {
  it('emits exactly the 342 registry gemeentes, sorted by title', async () => {
    const sdk = makeSdk(() => page(registryNameIds));

    const set = await fetchGemeenteLocations(auth, sdk);

    expect(set.locations).toHaveLength(342);
    expect(set.expected).toBe(342);
    expect(set.withLocation).toBe(342);
    expect(set.partial).toBe(false);

    const titles = set.locations.map((l) => l.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });

  it('excludes the non-Dutch registry entries (Brugge, Gent) — FR-005c', async () => {
    const sdk = makeSdk(() => page([...registryNameIds, 'brugge', 'gent']));

    const set = await fetchGemeenteLocations(auth, sdk);

    expect(set.locations).toHaveLength(342);
    expect(set.locations.some((l) => /brugge|gent/i.test(l.title))).toBe(false);
    // Every emitted entry carries a CBS code — that is what "eligible" means.
    expect(set.locations.every((l) => /^GM\d{4}$/.test(l.cbsCode))).toBe(true);
  });

  it('still emits a gemeente Alkemio never returned, with null coordinates — FR-030', async () => {
    const missing = registryNameIds[0];
    const sdk = makeSdk(() => page(registryNameIds.slice(1)));

    const set = await fetchGemeenteLocations(auth, sdk);

    expect(set.locations).toHaveLength(342);
    const unplaced = set.locations.find((l) => l.nameId === missing);
    expect(unplaced).toBeDefined();
    expect(unplaced!.latitude).toBeNull();
    expect(set.withLocation).toBe(341);
    expect(set.expected - set.withLocation).toBe(1);
    expect(set.partial).toBe(true);
  });

  it('treats a 0/0 geo-location as absent rather than pinning it off West Africa', async () => {
    const sdk = makeSdk(() => ({
      data: {
        organizationsPaginated: {
          total: 1,
          pageInfo: { hasNextPage: false, endCursor: undefined },
          organization: registryNameIds.map((nameID, i) => ({
            id: `org-${i}`,
            nameID,
            profile: {
              displayName: nameID,
              location: { country: 'NL', city: '', geoLocation: { latitude: 0, longitude: 0 } },
            },
          })),
        },
      },
    }));

    const set = await fetchGemeenteLocations(auth, sdk);

    expect(set.withLocation).toBe(0);
    expect(set.locations.every((l) => l.latitude === null && l.longitude === null)).toBe(true);
  });

  it('pages until hasNextPage is false, accumulating across pages', async () => {
    const half = Math.floor(registryNameIds.length / 2);
    const sdk = makeSdk((vars) =>
      vars.after
        ? page(registryNameIds.slice(half))
        : page(registryNameIds.slice(0, half), true, 'cursor-1'),
    );

    const set = await fetchGemeenteLocations(auth, sdk);

    expect(set.withLocation).toBe(342);
    expect(sdk.GemeenteLocations).toHaveBeenCalledTimes(2);
  });

  it('retries unfiltered when the nameID filter matches too few gemeentes', async () => {
    // First (filtered) sweep returns almost nothing — an API that matches nameID
    // exactly rather than by prefix. The unfiltered retry is what saves correctness.
    let call = 0;
    const sdk = makeSdk(() => {
      call += 1;
      return call === 1 ? page([]) : page(registryNameIds);
    });

    const set = await fetchGemeenteLocations(auth, sdk);

    expect(set.withLocation).toBe(342);
    expect(sdk.GemeenteLocations).toHaveBeenCalledTimes(2);
    // The retry must drop the filter.
    const secondCallVars = (sdk.GemeenteLocations as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondCallVars.filter).toBeUndefined();
  });
});

describe('getGemeenteLocations (cache path)', () => {
  it('serves a fresh cache entry without contacting Alkemio — FR-005b', async () => {
    const cachedSet = {
      locations: [],
      expected: 342,
      withLocation: 342,
      partial: false,
      fetchedAt: '2026-08-01T00:00:00.000Z',
    };
    setCacheEntry('user-a', GEO_CACHE_SPACE_ID, JSON.stringify(cachedSet), 168);
    const sdk = makeSdk(() => page(registryNameIds));

    const result = await getGemeenteLocations(auth, 'user-a', 'vng', sdk);

    expect(result.cached).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.set.fetchedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(sdk.GemeenteLocations).not.toHaveBeenCalled();
  });

  it('sweeps and caches on a cold start', async () => {
    const sdk = makeSdk(() => page(registryNameIds));

    const first = await getGemeenteLocations(auth, 'user-a', 'vng', sdk);
    expect(first.cached).toBe(false);

    const second = await getGemeenteLocations(auth, 'user-a', 'vng', sdk);
    expect(second.cached).toBe(true);
    expect(sdk.GemeenteLocations).toHaveBeenCalledTimes(1);
  });

  it('serves the STALE set when the refresh fails — FR-030a', async () => {
    const staleSet = {
      locations: [],
      expected: 342,
      withLocation: 300,
      partial: false,
      fetchedAt: '2026-01-01T00:00:00.000Z',
    };
    setCacheEntry('user-a', GEO_CACHE_SPACE_ID, JSON.stringify(staleSet), 168);
    // Force expiry without deleting the row — exactly the situation FR-030a describes.
    getDatabase()
      .prepare('UPDATE cache_entries SET expires_at = ? WHERE user_id = ? AND space_id = ?')
      .run(Date.now() - 1000, 'user-a', GEO_CACHE_SPACE_ID);

    const sdk = makeSdk(() => {
      throw new Error('Alkemio unreachable');
    });

    const result = await getGemeenteLocations(auth, 'user-a', 'vng', sdk);

    expect(result.stale).toBe(true);
    expect(result.cached).toBe(true);
    expect(result.set.fetchedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('throws when the refresh fails and there is no cached set at all', async () => {
    const sdk = makeSdk(() => {
      throw new Error('Alkemio unreachable');
    });

    await expect(getGemeenteLocations(auth, 'user-a', 'vng', sdk)).rejects.toThrow('Alkemio unreachable');
  });

  it('keeps one user’s set out of another user’s reach — constitution §IV', async () => {
    const setA = {
      locations: [],
      expected: 342,
      withLocation: 342,
      partial: false,
      fetchedAt: '2026-08-01T00:00:00.000Z',
    };
    setCacheEntry('user-a', GEO_CACHE_SPACE_ID, JSON.stringify(setA), 168);
    const sdk = makeSdk(() => page(registryNameIds));

    // user-b has no row of their own, so this must sweep rather than read user-a's.
    const result = await getGemeenteLocations(auth, 'user-b', 'vng', sdk);

    expect(result.cached).toBe(false);
    expect(sdk.GemeenteLocations).toHaveBeenCalled();
  });

  it('caches a partial sweep with a SHORT ttl so recovery is picked up', async () => {
    const sdk = makeSdk(() => page(registryNameIds.slice(0, 10)));

    const result = await getGemeenteLocations(auth, 'user-a', 'vng', sdk);
    expect(result.set.partial).toBe(true);

    const row = getDatabase()
      .prepare('SELECT created_at, expires_at FROM cache_entries WHERE user_id = ? AND space_id = ?')
      .get('user-a', GEO_CACHE_SPACE_ID) as { created_at: number; expires_at: number };

    const ttlHours = (row.expires_at - row.created_at) / 3_600_000;
    expect(ttlHours).toBeCloseTo(1, 1);
  });
});
