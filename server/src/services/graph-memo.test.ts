/**
 * The assembled-dataset memo in graph-service.
 *
 * WHY THIS EXISTS. One Funnel tab asked the server to build the SAME graph three times:
 * the browser's own `/api/graph/generate`, plus the two `generateGraph()` calls inside
 * `/api/vng/dashboard`. The per-space SQLite rows stopped the Alkemio re-fetch but not
 * the re-assembly, and on a cold cache the three ran concurrently — so all three DID
 * re-fetch. These tests pin the coalescing that fixes it.
 *
 * `acquireSpaces` is mocked because it is the expensive boundary the memo exists to
 * protect; counting its calls is the whole assertion.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const acquireSpaces = vi.fn();

vi.mock('./acquire-service.js', () => ({
  acquireSpaces: (...args: unknown[]) => acquireSpaces(...args),
}));
// The per-space cache is bypassed entirely: a cache hit would short-circuit the
// acquisition and hide exactly what these tests measure.
vi.mock('../cache/cache-service.js', () => ({
  getCacheEntry: () => null,
  setCacheEntry: () => {},
  invalidateCache: () => {},
  GD_CACHE_SPACE_ID: '__gd_initiatives__',
  GEO_CACHE_SPACE_ID: '__gemeente_geo__',
}));

const { generateGraph, resetDatasetMemo } = await import('./graph-service.js');

const auth = { userId: 'u1', accessToken: 't' } as never;

/** The shape `transformToGraph` needs, with nothing in it — the memo does not care. */
function emptyAcquisition() {
  return {
    spacesL0: [],
    spacesL1: [],
    spacesL2: [],
    users: [],
    organizations: [],
    roles: [],
    errors: [],
    activityEntries: undefined,
  };
}

beforeEach(() => {
  resetDatasetMemo();
  acquireSpaces.mockReset();
  acquireSpaces.mockImplementation(async () => emptyAcquisition());
});

describe('generateGraph memoisation', () => {
  it('builds once for concurrent identical requests', async () => {
    const request = { spaceIds: ['a', 'b'], app: 'vng' };
    const [x, y, z] = await Promise.all([
      generateGraph('u1', auth, request),
      generateGraph('u1', auth, request),
      generateGraph('u1', auth, request),
    ]);
    // One acquisition, and every caller got the same assembled object back.
    expect(acquireSpaces).toHaveBeenCalledTimes(1);
    expect(y).toBe(x);
    expect(z).toBe(x);
  });

  it('serves a sequential repeat from the memo', async () => {
    const request = { spaceIds: ['a'], app: 'vng' };
    await generateGraph('u1', auth, request);
    await generateGraph('u1', auth, request);
    expect(acquireSpaces).toHaveBeenCalledTimes(1);
  });

  it('treats the same space set in a different order as one request', async () => {
    await generateGraph('u1', auth, { spaceIds: ['a', 'b'], app: 'vng' });
    await generateGraph('u1', auth, { spaceIds: ['b', 'a'], app: 'vng' });
    expect(acquireSpaces).toHaveBeenCalledTimes(1);
  });

  it('does not share across users — the cache is scoped per user (§IV)', async () => {
    const request = { spaceIds: ['a'], app: 'vng' };
    await generateGraph('u1', auth, request);
    await generateGraph('u2', auth, request);
    expect(acquireSpaces).toHaveBeenCalledTimes(2);
  });

  it('does not share across the GD toggle or the asking app', async () => {
    await generateGraph('u1', auth, { spaceIds: ['a'], app: 'vng' });
    await generateGraph('u1', auth, { spaceIds: ['a'], app: 'vng', includeInitiatives: true });
    await generateGraph('u1', auth, { spaceIds: ['a'], app: 'govtech' });
    expect(acquireSpaces).toHaveBeenCalledTimes(3);
  });

  it('forceRefresh bypasses the memo and clears it', async () => {
    const request = { spaceIds: ['a'], app: 'vng' };
    await generateGraph('u1', auth, request);
    await generateGraph('u1', auth, { ...request, forceRefresh: true });
    expect(acquireSpaces).toHaveBeenCalledTimes(2);
    // …and the memo it left behind must be the refreshed build, not the stale one.
    await generateGraph('u1', auth, request);
    expect(acquireSpaces).toHaveBeenCalledTimes(3);
  });

  it('does not memoise a failed build', async () => {
    acquireSpaces.mockRejectedValueOnce(new Error('Alkemio down'));
    const request = { spaceIds: ['a'], app: 'vng' };
    await expect(generateGraph('u1', auth, request)).rejects.toThrow('Alkemio down');
    // A retry must actually retry rather than replay the rejection for 30s.
    await expect(generateGraph('u1', auth, request)).resolves.toBeDefined();
    expect(acquireSpaces).toHaveBeenCalledTimes(2);
  });
});
