/**
 * Feature 025 — the loading orchestration (US1/US2 contract):
 *  - one load per selection key, however many consumers ask;
 *  - a key change aborts the old load and keeps the previous data until the new lands;
 *  - refresh forces exactly one cache-bypassing reload;
 *  - extras declared by tabs load once per key, announced under the tab's name;
 *  - a failed extra isolates: other data stays, the item shows failed with retry.
 */
import { describe, it, expect, vi } from 'vitest';
import type { GraphDataset } from '@server/types/graph.js';
import type { LoadEvent } from '@server/types/api.js';
import { DashboardStore, selectionLoadKey, type Selection } from '@ea/shared/dashboard/data/store.js';
import { DashboardLoader, type ExtraTransport } from '@ea/shared/dashboard/data/loader.js';
import type { LoadGraphFn, LoadGraphRequest } from '@ea/shared/services/graph-loader.js';

const dataset = (tag: string): GraphDataset =>
  ({ nodes: [], edges: [], spaces: [tag], metadata: {}, cacheInfo: [] }) as unknown as GraphDataset;

const selection = (spaceIds: string[], includeInitiatives = false): Selection => ({
  app: 'vng',
  spaceIds,
  widenedSpaceIds: [],
  includeInitiatives,
});

/** A controllable transport: every call is recorded and resolved by the test. */
function fakeGraph() {
  const calls: Array<{ request: LoadGraphRequest; resolve: (d: GraphDataset) => void; reject: (e: Error) => void; onEvent: (e: LoadEvent) => void; signal: AbortSignal }> = [];
  const loadGraph: LoadGraphFn = (request, onEvent, signal) =>
    new Promise((resolve, reject) => {
      calls.push({ request, resolve: (d) => resolve({ dataset: d }), reject, onEvent, signal });
    });
  return { calls, loadGraph };
}

function extras() {
  const t = {
    activityCalls: 0,
    activity: vi.fn<ExtraTransport['activity']>(async () => {
      t.activityCalls += 1;
      return { bySpace: {}, fetchedAt: 'now', unavailable: [] };
    }),
    organizations: vi.fn<ExtraTransport['organizations']>(async (ids) => ({
      organizations: Object.fromEntries(
        ids.map((id) => [id, { id, description: null, tagline: null, website: null, contactEmail: null }]),
      ),
      missing: [],
    })),
    gemeenteLocations: vi.fn<ExtraTransport['gemeenteLocations']>(
      async () => ({ locations: [], partial: false }) as never,
    ),
  };
  return t;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('DashboardLoader (feature 025)', () => {
  it('loads a key once, however many times the same selection is set', async () => {
    const g = fakeGraph();
    const loader = new DashboardLoader(new DashboardStore(), g.loadGraph, extras());
    const sel = selection(['a', 'b']);
    loader.setSelection(sel, selectionLoadKey(sel));
    loader.setSelection({ ...sel }, selectionLoadKey(sel)); // a re-render, same key
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0].request).toMatchObject({ spaceIds: ['a', 'b'], forceRefresh: false });
    g.calls[0].resolve(dataset('ab'));
    await tick();
    expect(loader.store.getSnapshot().data?.dataset.spaces).toEqual(['ab']);
    expect(loader.store.getSnapshot().plan.active).toBe(false);
  });

  it('a key change aborts the in-flight load and keeps the previous data until the new one lands', async () => {
    const g = fakeGraph();
    const loader = new DashboardLoader(new DashboardStore(), g.loadGraph, extras());
    const a = selection(['a']);
    loader.setSelection(a, selectionLoadKey(a));
    g.calls[0].resolve(dataset('a'));
    await tick();

    const ab = selection(['a', 'b']);
    loader.setSelection(ab, selectionLoadKey(ab));
    expect(g.calls).toHaveLength(2);
    expect(loader.store.getSnapshot().data?.dataset.spaces).toEqual(['a']); // still on screen
    expect(loader.store.getSnapshot().plan.loadKey).toBe(selectionLoadKey(ab));

    const abc = selection(['a', 'b', 'c']);
    loader.setSelection(abc, selectionLoadKey(abc));
    expect(g.calls[1].signal.aborted).toBe(true);
    g.calls[1].resolve(dataset('ab')); // late answer for an abandoned key
    await tick();
    expect(loader.store.getSnapshot().data?.dataset.spaces).toEqual(['a']); // ignored
    g.calls[2].resolve(dataset('abc'));
    await tick();
    expect(loader.store.getSnapshot().data?.dataset.spaces).toEqual(['abc']);
  });

  it('refresh() sends forceRefresh exactly once and re-requests declared extras', async () => {
    const g = fakeGraph();
    const x = extras();
    const loader = new DashboardLoader(new DashboardStore(), g.loadGraph, x);
    const sel = selection(['a']);
    loader.setSelection(sel, selectionLoadKey(sel));
    loader.declare('activity', 'tab:initiatives'); // declared before the core landed
    g.calls[0].resolve(dataset('a'));
    await tick();
    expect(x.activityCalls).toBe(1);
    loader.declare('activity', 'tab:initiatives'); // tab remount → no new request
    await tick();
    expect(x.activityCalls).toBe(1);

    loader.refresh();
    expect(g.calls).toHaveLength(2);
    expect(g.calls[1].request.forceRefresh).toBe(true);
    g.calls[1].resolve(dataset('a2'));
    await tick();
    expect(x.activityCalls).toBe(2);
    expect(x.activity).toHaveBeenLastCalledWith(['a'], true);
  });

  it('a failed extra is isolated: data stays, the item is failed, retry re-requests it', async () => {
    const g = fakeGraph();
    const x = extras();
    x.activity.mockRejectedValueOnce(new Error('feed down'));
    const loader = new DashboardLoader(new DashboardStore(), g.loadGraph, x);
    const sel = selection(['a']);
    loader.setSelection(sel, selectionLoadKey(sel));
    g.calls[0].resolve(dataset('a'));
    await tick();
    loader.declare('activity', 'tab:initiatives');
    await tick();
    const snap = loader.store.getSnapshot();
    expect(snap.data?.dataset.spaces).toEqual(['a']);
    const item = snap.plan.items.find((i) => i.key === 'activity');
    expect(item?.stage).toBe('failed');
    expect(item?.requester).toBe('tab:initiatives');
    expect(item?.error?.key).toBe('load.failed.activity');

    loader.retry('activity');
    await tick();
    expect(loader.store.getSnapshot().plan.items.find((i) => i.key === 'activity')?.stage).toBe('done');
    expect(loader.store.getSnapshot().data?.extras.activity).toBeDefined();
  });

  it('streams server stages into the plan and marks the core done on result', async () => {
    const g = fakeGraph();
    const loader = new DashboardLoader(new DashboardStore(), g.loadGraph, extras());
    const sel = selection(['a', 'b'], true);
    loader.setSelection(sel, selectionLoadKey(sel));
    const { onEvent } = g.calls[0];
    onEvent({ type: 'stage', item: 'spaces', stage: 'loading', done: 1, total: 2, current: 'b' });
    let spaces = loader.store.getSnapshot().plan.items.find((i) => i.key === 'spaces');
    expect(spaces).toMatchObject({ stage: 'loading', done: 1, total: 2, current: 'b' });
    onEvent({ type: 'stage', item: 'spaces', stage: 'processing' });
    onEvent({ type: 'item', item: 'gd-initiatives', stage: 'failed', error: { key: 'gd.unreadable' } });
    g.calls[0].resolve(dataset('ab'));
    await tick();
    const plan = loader.store.getSnapshot().plan;
    spaces = plan.items.find((i) => i.key === 'spaces');
    expect(spaces?.stage).toBe('done');
    expect(plan.items.find((i) => i.key === 'gd-initiatives')?.stage).toBe('failed');
    expect(plan.coreReady).toBe(true);
    expect(plan.active).toBe(false);
  });

  it('organisations are fetched once per id on a page, merged across declarations', async () => {
    const g = fakeGraph();
    const x = extras();
    const loader = new DashboardLoader(new DashboardStore(), g.loadGraph, x);
    const sel = selection(['a']);
    loader.setSelection(sel, selectionLoadKey(sel));
    g.calls[0].resolve(dataset('a'));
    await tick();
    loader.declare('organizations', 'tab:details', ['o1']);
    await tick();
    loader.declare('organizations', 'tab:details', ['o1', 'o2']);
    await tick();
    expect(x.organizations).toHaveBeenCalledTimes(2);
    expect(x.organizations).toHaveBeenNthCalledWith(2, ['o2']);
    expect(Object.keys(loader.store.getSnapshot().data?.extras.organizations ?? {})).toEqual(['o1', 'o2']);
  });
});

describe('DashboardLoader — StrictMode rehearsal', () => {
  it('resumes a load that a dispose() aborted when the same key is set again', async () => {
    const g = fakeGraph();
    const loader = new DashboardLoader(new DashboardStore(), g.loadGraph, extras());
    const sel = selection(['a']);
    loader.setSelection(sel, selectionLoadKey(sel));
    loader.dispose(); // React 19 dev: effects run, clean up, run again
    loader.setSelection(sel, selectionLoadKey(sel));
    expect(g.calls).toHaveLength(2);
    expect(g.calls[0].signal.aborted).toBe(true);
    g.calls[1].resolve(dataset('a'));
    await tick();
    expect(loader.store.getSnapshot().data?.dataset.spaces).toEqual(['a']);
    // …and once the data is there, the same key is a no-op again.
    loader.setSelection({ ...sel }, selectionLoadKey(sel));
    expect(g.calls).toHaveLength(2);
  });
});
