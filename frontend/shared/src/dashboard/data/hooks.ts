/**
 * Feature 025 — how tabs and derivations READ the dashboard's loaded data.
 *
 * `useLoadedData()` → the processed dataset (+ counts bundle + extras) or `null`;
 * `useLoadPlan()`   → what is loading, for the header strip and per-tab placeholders;
 * `useExtraItem()`  → a tab declares an extra it needs and gets that item's state back.
 *
 * None of these fetch. The only way a tab can cause a request is `useExtraItem`, and
 * that request is announced in the strip under the tab's name (FR-008).
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { LoadItemKey } from '@server/types/api.js';
import { useDashboardData } from './DashboardDataProvider.js';
import type { LoadItem, LoadPlan, LoadRequester, LoadedData, StoreState } from './store.js';

function useStoreState(): StoreState {
  const { store } = useDashboardData();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** The loaded data for the current selection, or `null` while nothing has landed yet. */
export function useLoadedData(): LoadedData | null {
  return useStoreState().data;
}

/** The shared load plan (FR-007): identical on every tab because it lives in the store. */
export function useLoadPlan(): LoadPlan {
  return useStoreState().plan;
}

export interface ExtraItemState<T> {
  /** The item once loaded for the current data, else `undefined`. */
  value: T | undefined;
  /** The plan entry, if the item has been requested for the current plan. */
  item: LoadItem | undefined;
  loading: boolean;
  failed: boolean;
}

/**
 * Declare that this tab needs an extra item (activity, organisations, gemeente
 * locations). Declaring is idempotent; the provider loads it once per selection and
 * keeps it for the page. `ids` narrows `organizations` to the profiles a view opened.
 */
export function useExtraItem<K extends keyof LoadedData['extras']>(
  key: K,
  requester: LoadRequester,
  ids?: string[],
): ExtraItemState<NonNullable<LoadedData['extras'][K]>> {
  const { declare } = useDashboardData();
  const state = useStoreState();
  const idsKey = ids ? ids.join(',') : '';
  const dataKey = state.data?.loadKey ?? '';
  useEffect(() => {
    declare(key as LoadItemKey, requester, ids);
    // Re-declare when the loaded data changes key (new selection) or more ids are wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declare, key, requester, idsKey, dataKey]);
  const item = state.plan.items.find((i) => i.key === key);
  const value = state.data?.extras[key] as NonNullable<LoadedData['extras'][K]> | undefined;
  return {
    value,
    item,
    loading: value === undefined && item?.stage !== 'failed',
    failed: item?.stage === 'failed',
  };
}
