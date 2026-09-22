/**
 * Feature 025 — the dashboard's single loaded-data store.
 *
 * One store per page holds the current selection, the load plan the header strip
 * renders, and the loaded data every tab derives from. It is a plain external store
 * (read through `useSyncExternalStore`) so the provider, the loader and the tests can
 * drive it without React, and so a tab switch — which unmounts and remounts tab
 * components — never touches it.
 *
 * Every mutation is keyed by `loadKey`. Anything arriving for a key that is no longer
 * current is dropped on the floor: a superseded plan is discarded whole, and a late
 * response for an abandoned selection can never leak into the new one (spec edge case
 * "selection changes mid-load", data-model §2).
 */
import type { GraphDataset } from '@server/types/graph.js';
import type {
  ActivityItem,
  DashboardCountsBundle,
  ExtendedOrganizationProfile,
  GemeenteLocationsResponse,
  LoadError,
  LoadEvent,
  LoadItemKey,
  LoadStage,
} from '@server/types/api.js';

/** Who asked for an item (FR-008 "which view or option requested it"). */
export type LoadRequester =
  | 'core'
  | 'option:gd'
  | 'tab:initiatives'
  | 'tab:usage'
  | 'tab:details'
  | 'tab:explorer';

export interface LoadItem {
  key: LoadItemKey;
  requester: LoadRequester;
  stage: LoadStage;
  done?: number;
  total?: number;
  /** nameId of the Space currently being fetched (loading stage only). */
  current?: string;
  error?: LoadError;
  startedAt: number;
  finishedAt?: number;
}

export interface LoadPlan {
  loadKey: string;
  items: LoadItem[];
  /** Any item not yet done/failed. */
  active: boolean;
  /** The core `spaces` item is done — tabs needing only core data may render. */
  coreReady: boolean;
}

/** The selection a load is for (data-model §1). */
export interface Selection {
  app: string;
  spaceIds: string[];
  widenedSpaceIds: string[];
  includeInitiatives: boolean;
}

export interface LoadedExtras {
  activity?: ActivityItem;
  organizations?: Record<string, ExtendedOrganizationProfile>;
  'gemeente-locations'?: GemeenteLocationsResponse;
}

export interface LoadedData {
  loadKey: string;
  dataset: GraphDataset;
  dashboard?: DashboardCountsBundle;
  extras: LoadedExtras;
}

export interface StoreState {
  selection: Selection | null;
  plan: LoadPlan;
  data: LoadedData | null;
}

const EMPTY_PLAN: LoadPlan = { loadKey: '', items: [], active: false, coreReady: false };

/** Stable identity of a selection (data-model §1). `refreshNonce` is deliberately absent. */
export function selectionLoadKey(sel: Selection): string {
  const ids = [...new Set([...sel.spaceIds, ...sel.widenedSpaceIds])].sort();
  return `${sel.app}|${ids.join(',')}|${sel.includeInitiatives ? 1 : 0}`;
}

function finalise(plan: LoadPlan): LoadPlan {
  const active = plan.items.some((i) => i.stage !== 'done' && i.stage !== 'failed');
  const core = plan.items.find((i) => i.key === 'spaces');
  return { ...plan, active, coreReady: core?.stage === 'done' };
}

export class DashboardStore {
  private state: StoreState = { selection: null, plan: EMPTY_PLAN, data: null };
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StoreState => this.state;

  private set(next: Partial<StoreState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  private isCurrent(loadKey: string): boolean {
    return this.state.plan.loadKey === loadKey;
  }

  setSelection(selection: Selection): void {
    this.set({ selection });
  }

  /**
   * Start a plan for `loadKey`. Previous data is KEPT (it stays on screen until the new
   * dataset lands — research R5); the previous plan is discarded whole.
   */
  beginLoad(loadKey: string, items: Array<{ key: LoadItemKey; requester: LoadRequester }>): void {
    const now = Date.now();
    this.set({
      plan: finalise({
        loadKey,
        items: items.map((i) => ({ ...i, stage: 'queued' as LoadStage, startedAt: now })),
        active: true,
        coreReady: false,
      }),
    });
  }

  /** Add an item to the current plan (an extra a tab declared). No-op if present. */
  addItem(loadKey: string, key: LoadItemKey, requester: LoadRequester): void {
    if (!this.isCurrent(loadKey)) return;
    if (this.state.plan.items.some((i) => i.key === key)) return;
    this.set({
      plan: finalise({
        ...this.state.plan,
        items: [...this.state.plan.items, { key, requester, stage: 'queued', startedAt: Date.now() }],
      }),
    });
  }

  private updateItem(loadKey: string, key: LoadItemKey, patch: Partial<LoadItem>): void {
    if (!this.isCurrent(loadKey)) return;
    const items = this.state.plan.items.map((i) => (i.key === key ? { ...i, ...patch } : i));
    this.set({ plan: finalise({ ...this.state.plan, items }) });
  }

  /** Apply one streamed event (contracts/api-graph-generate-stream.md). Stale keys ignored. */
  applyEvent(loadKey: string, event: LoadEvent): void {
    if (!this.isCurrent(loadKey)) return;
    switch (event.type) {
      case 'stage': {
        const exists = this.state.plan.items.some((i) => i.key === event.item);
        if (!exists) this.addItem(loadKey, event.item, event.item === 'gd-initiatives' ? 'option:gd' : 'core');
        this.updateItem(loadKey, event.item, {
          stage: event.stage,
          done: event.done,
          total: event.total,
          current: event.stage === 'loading' ? event.current : undefined,
        });
        return;
      }
      case 'item':
        this.updateItem(loadKey, event.item, {
          stage: event.stage,
          current: undefined,
          error: event.error,
          finishedAt: Date.now(),
        });
        return;
      case 'result':
        this.setData(loadKey, { dataset: event.dataset, dashboard: event.dashboard });
        return;
      case 'error':
        this.failItem(loadKey, 'spaces', event.error);
        return;
    }
  }

  /** The core result landed: replace the loaded data, mark core items done. */
  setData(loadKey: string, result: { dataset: GraphDataset; dashboard?: DashboardCountsBundle }): void {
    if (!this.isCurrent(loadKey)) return;
    const now = Date.now();
    const items = this.state.plan.items.map((i) =>
      (i.key === 'spaces' || i.key === 'gd-initiatives') && i.stage !== 'failed' && i.stage !== 'done'
        ? { ...i, stage: 'done' as LoadStage, current: undefined, finishedAt: now }
        : i,
    );
    this.set({
      data: { loadKey, dataset: result.dataset, dashboard: result.dashboard, extras: {} },
      plan: finalise({ ...this.state.plan, items }),
    });
  }

  /** An extra item landed. */
  setExtra<K extends keyof LoadedExtras>(loadKey: string, key: K, value: LoadedExtras[K]): void {
    if (!this.isCurrent(loadKey) || !this.state.data || this.state.data.loadKey !== loadKey) return;
    this.set({ data: { ...this.state.data, extras: { ...this.state.data.extras, [key]: value } } });
    this.updateItem(loadKey, key, { stage: 'done', finishedAt: Date.now(), error: undefined });
  }

  markItem(loadKey: string, key: LoadItemKey, stage: 'queued' | 'loading' | 'processing'): void {
    this.updateItem(loadKey, key, { stage, error: undefined });
  }

  failItem(loadKey: string, key: LoadItemKey, error: LoadError): void {
    if (!this.isCurrent(loadKey)) return;
    if (!this.state.plan.items.some((i) => i.key === key)) this.addItem(loadKey, key, 'core');
    this.updateItem(loadKey, key, { stage: 'failed', error, current: undefined, finishedAt: Date.now() });
  }

  /** Drop everything for a key that is no longer wanted (selection change / unmount). */
  supersede(loadKey: string): void {
    if (!this.isCurrent(loadKey)) return;
    this.set({ plan: EMPTY_PLAN });
  }

  /** Test seam. */
  reset(): void {
    this.set({ selection: null, plan: EMPTY_PLAN, data: null });
  }
}
