/**
 * Feature 025 — the loading orchestration behind `DashboardDataProvider`, kept free of
 * React so it can be unit-tested with a fake transport.
 *
 * Responsibilities (contracts/dashboard-data-provider.md):
 *  - one core load per `loadKey`; a new key aborts the old load and keeps the previous
 *    data on screen until the new dataset lands (research R5);
 *  - extra items declared by tabs are loaded once per key and re-requested on refresh;
 *  - `refresh()` forces a cache-bypassing reload of the SAME key, exactly once;
 *  - every mutation goes through the {@link DashboardStore}, which drops stale keys.
 */
import type {
  ActivityItem,
  GemeenteLocationsResponse,
  LoadItemKey,
  OrganizationsResponse,
} from '@server/types/api.js';
import type { LoadGraphFn } from '../../services/graph-loader.js';
import { DashboardStore, type LoadRequester, type LoadedExtras, type Selection } from './store.js';

/** The BFF calls the loader makes for extra items — injectable for tests. */
export interface ExtraTransport {
  activity(spaceIds: string[], forceRefresh: boolean): Promise<ActivityItem>;
  organizations(ids: string[]): Promise<OrganizationsResponse>;
  gemeenteLocations(): Promise<GemeenteLocationsResponse>;
}

interface Declared {
  requester: LoadRequester;
  ids: Set<string>;
  /** loadKey the item was last requested for. */
  requestedFor: string | null;
  inFlight: boolean;
}

const failureOf = (err: unknown, key: string) => ({
  key,
  detail: err instanceof Error ? err.message : String(err),
});

export class DashboardLoader {
  private selection: Selection | null = null;
  private loadKey = '';
  private abort: AbortController | null = null;
  private declared = new Map<LoadItemKey, Declared>();
  private orgLoaded = new Set<string>();

  constructor(
    readonly store: DashboardStore,
    private readonly loadGraph: LoadGraphFn,
    private readonly extras: ExtraTransport,
  ) {}

  private get allSpaceIds(): string[] {
    const sel = this.selection;
    return sel ? [...new Set([...sel.spaceIds, ...sel.widenedSpaceIds])] : [];
  }

  /**
   * The selection changed (or was first seen). A changed key starts a new load; the
   * same key is a no-op while its load is live or its data is here — but NOT after a
   * `dispose()` (React StrictMode's rehearsal unmount), which must be able to resume.
   */
  setSelection(selection: Selection, loadKey: string): void {
    this.selection = selection;
    this.store.setSelection(selection);
    const live = this.abort !== null && !this.abort.signal.aborted;
    const have = this.store.getSnapshot().data?.loadKey === loadKey;
    if (loadKey === this.loadKey && (live || have || !loadKey)) return;
    this.loadKey = loadKey;
    this.runCore(false);
  }

  /** Force-refresh the current key (FR-014). */
  refresh(): void {
    this.orgLoaded.clear();
    this.runCore(true);
  }

  /** Re-run one failed item (FR-011). */
  retry(item: LoadItemKey): void {
    if (item === 'spaces' || item === 'gd-initiatives') {
      this.runCore(false);
      return;
    }
    const decl = this.declared.get(item);
    if (decl) decl.requestedFor = null;
    this.runExtra(item, false);
  }

  /** A tab declares an extra item (idempotent). */
  declare(item: LoadItemKey, requester: LoadRequester, ids?: string[]): void {
    let decl = this.declared.get(item);
    if (!decl) {
      decl = { requester, ids: new Set(), requestedFor: null, inFlight: false };
      this.declared.set(item, decl);
    }
    let newIds = false;
    for (const id of ids ?? []) {
      if (!decl.ids.has(id)) {
        decl.ids.add(id);
        newIds = true;
      }
    }
    if (newIds) decl.requestedFor = null;
    // No-op unless the core data for the current key is here; otherwise runCore's
    // completion runs every declared extra.
    this.runExtra(item, false);
  }

  /** Stop everything (unmount). */
  dispose(): void {
    this.abort?.abort();
    this.abort = null;
  }

  private runCore(force: boolean): void {
    this.abort?.abort();
    const loadKey = this.loadKey;
    const sel = this.selection;
    if (!loadKey || !sel) {
      this.store.supersede(this.store.getSnapshot().plan.loadKey);
      return;
    }
    const controller = new AbortController();
    this.abort = controller;
    const items: Array<{ key: LoadItemKey; requester: LoadRequester }> = [
      { key: 'spaces', requester: 'core' },
    ];
    if (sel.includeInitiatives) items.push({ key: 'gd-initiatives', requester: 'option:gd' });
    this.store.beginLoad(loadKey, items);
    for (const decl of this.declared.values()) decl.inFlight = false;

    this.loadGraph(
      {
        app: sel.app,
        spaceIds: this.allSpaceIds,
        includeInitiatives: sel.includeInitiatives,
        forceRefresh: force,
      },
      (event) => this.store.applyEvent(loadKey, event),
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        this.store.setData(loadKey, result);
        for (const key of this.declared.keys()) this.runExtra(key, force);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        this.store.failItem(loadKey, 'spaces', failureOf(err, 'load.failed.spaces'));
      });
  }

  private runExtra(key: LoadItemKey, force: boolean): void {
    const snap = this.store.getSnapshot();
    const loadKey = snap.plan.loadKey;
    if (!loadKey || snap.data?.loadKey !== loadKey) return; // core not here yet
    const decl = this.declared.get(key);
    if (!decl || decl.inFlight) return;
    const loaded = snap.data.extras[key as keyof LoadedExtras] !== undefined;
    if (!force && decl.requestedFor === loadKey && loaded) return;

    const fetch = this.extraFetchers[key];
    if (!fetch) return;
    decl.inFlight = true;
    decl.requestedFor = loadKey;
    this.store.addItem(loadKey, key, decl.requester);
    this.store.markItem(loadKey, key, 'loading');
    fetch(decl, force)
      .then((value) => this.store.setExtra(loadKey, key as keyof LoadedExtras, value))
      .catch((err) => this.store.failItem(loadKey, key, failureOf(err, `load.failed.${key}`)))
      .finally(() => {
        decl.inFlight = false;
      });
  }

  /** How each extra item is fetched; the result is stored under the same key. */
  private readonly extraFetchers: Partial<
    Record<LoadItemKey, (decl: Declared, force: boolean) => Promise<LoadedExtras[keyof LoadedExtras]>>
  > = {
    activity: (_decl, force) => this.extras.activity(this.allSpaceIds, force),
    'gemeente-locations': () => this.extras.gemeenteLocations(),
    // Only the profiles not fetched before on this page; merged into what is known.
    organizations: async (decl, force) => {
      const known = this.store.getSnapshot().data?.extras.organizations ?? {};
      const wanted = [...decl.ids].filter((id) => force || !this.orgLoaded.has(id)).slice(0, 50);
      if (wanted.length === 0) return known;
      const res = await this.extras.organizations(wanted);
      for (const id of wanted) this.orgLoaded.add(id);
      return { ...known, ...res.organizations };
    },
  };
}
