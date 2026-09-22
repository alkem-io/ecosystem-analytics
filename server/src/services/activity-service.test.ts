/**
 * Feature 025 — the activity item: its own per-Space rows, sweeps only for the Spaces
 * that miss, unreadable feeds reported as unavailable, counts + tier per Space.
 */
process.env.DB_PATH = ':memory:';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sdk } = vi.hoisted(() => ({ sdk: { ActivityFeedGrouped: vi.fn() } }));
vi.mock('../graphql/client.js', () => ({
  createAlkemioSdk: vi.fn().mockResolvedValue(sdk),
  getRequestStats: () => ({ requests: 0, bytes: 0 }),
  resetRequestStats: () => {},
}));
vi.mock('../config.js', () => ({
  loadConfig: () => ({ features: {}, activitySpacesPerQuery: 10, cacheTtlHours: 24 }),
}));

import { initDatabase } from '../cache/db.js';
import { activityCacheId, getCacheEntry } from '../cache/cache-service.js';
import { loadActivityEntries, toActivityItem } from './activity-service.js';

const auth = { userId: 'u1' } as never;
const entry = (spaceId: string, daysAgo: number, type = 'CALLOUT_POST_CREATED') => ({
  id: `${spaceId}-${daysAgo}-${type}`,
  type,
  createdDate: new Date(Date.now() - daysAgo * 86_400_000),
  triggeredBy: { id: 'user-1' },
  space: { id: spaceId },
});

beforeEach(() => {
  initDatabase();
  sdk.ActivityFeedGrouped.mockReset();
});

describe('loadActivityEntries', () => {
  it('sweeps only the Spaces without a row, writes one row per Space, and serves the rest from cache', async () => {
    sdk.ActivityFeedGrouped.mockImplementation(async ({ args }: { args: { spaceIds: string[]; types: string[] } }) => ({
      data: {
        activityFeedGrouped: args.types.includes('MEMBER_JOINED')
          ? []
          : args.spaceIds.flatMap((id) => [entry(id, 1), entry(`${id}-sub`, 2)]),
      },
    }));
    const spaces = [
      { nameId: 'a', id: 's-a' },
      { nameId: 'b', id: 's-b' },
    ];
    const l0 = new Map([
      ['s-a', 's-a'],
      ['s-a-sub', 's-a'],
      ['s-b', 's-b'],
      ['s-b-sub', 's-b'],
    ]);
    const first = await loadActivityEntries('u1', auth, spaces, l0);
    expect(first.entries).toHaveLength(4);
    expect(first.unavailable).toEqual([]);
    expect(sdk.ActivityFeedGrouped).toHaveBeenCalledTimes(2); // contributions + MEMBER_JOINED, one chunk each
    expect(getCacheEntry('u1', activityCacheId('a'))).not.toBeNull();

    // Second call: nothing to fetch.
    const second = await loadActivityEntries('u1', auth, spaces, l0);
    expect(second.entries).toHaveLength(4);
    expect(sdk.ActivityFeedGrouped).toHaveBeenCalledTimes(2);

    // A third Space: only that one is swept.
    await loadActivityEntries('u1', auth, [...spaces, { nameId: 'c', id: 's-c' }], l0);
    expect(sdk.ActivityFeedGrouped).toHaveBeenCalledTimes(4);
    expect(sdk.ActivityFeedGrouped.mock.calls[2][0].args.spaceIds).toEqual(['s-c']);
  });

  it('reports an unreadable feed as unavailable instead of failing the item', async () => {
    sdk.ActivityFeedGrouped.mockRejectedValue(new Error('403'));
    const out = await loadActivityEntries('u1', auth, [{ nameId: 'a', id: 's-a' }], new Map([['s-a', 's-a']]));
    expect(out.entries).toEqual([]);
    expect(out.unavailable).toEqual(['a']);
  });
});

describe('toActivityItem', () => {
  it('yields per-Space period counts, totals and a tier', () => {
    const item = toActivityItem([entry('s-a', 0), entry('s-a', 3), entry('s-a', 20), entry('s-b', 100)], ['c']);
    expect(item.bySpace['s-a']).toMatchObject({ day: 1, week: 2, month: 3, total: 3 });
    expect(item.bySpace['s-a'].tier).toBeDefined();
    expect(item.bySpace['s-b']).toMatchObject({ day: 0, week: 0, month: 0, total: 1 });
    expect(item.unavailable).toEqual(['c']);
  });
});
