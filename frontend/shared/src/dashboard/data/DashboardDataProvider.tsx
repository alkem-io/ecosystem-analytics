/**
 * Feature 025 — layer 1 of the dashboard: LOADING.
 *
 * Mounted once in the shell above the tab row, this provider is the only code in the
 * dashboards that asks the BFF for data. It turns the shared selection into a
 * `loadKey` and hands it to a {@link DashboardLoader}, which runs one load per key,
 * keeps the previous dataset on screen until the new one lands, and loads the extra
 * items tabs declare (activity, extended organisation profiles, gemeente locations)
 * once per key. Tabs read the result through `useLoadedData()` / `useLoadPlan()` and
 * never fetch (contracts/dashboard-data-provider.md).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  ActivityItem,
  GemeenteLocationsResponse,
  LoadItemKey,
  OrganizationsResponse,
} from '@server/types/api.js';
import { api } from '../../services/api.js';
import { loadGraph as defaultLoadGraph, type LoadGraphFn } from '../../services/graph-loader.js';
import { useAppConfig } from '../../app/AppConfig.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { fetchOrchestratorChoice } from './orchestrator-candidates.js';
import { DashboardLoader, type ExtraTransport } from './loader.js';
import { DashboardStore, selectionLoadKey, type LoadRequester, type Selection } from './store.js';

export interface DashboardData {
  store: DashboardStore;
  /** Force-refresh the current selection and every declared extra (FR-014). */
  refresh: () => void;
  /** Re-run one failed item (FR-011). */
  retry: (item: LoadItemKey) => void;
  /**
   * A tab declares that it needs an extra item. Idempotent; a declared item stays
   * loaded for the page and is re-requested for each new loadKey (FR-012). `ids` is
   * only meaningful for `organizations`.
   */
  declare: (item: LoadItemKey, requester: LoadRequester, ids?: string[]) => void;
}

const DashboardDataContext = createContext<DashboardData | null>(null);

/** The real BFF transport for extra items. */
function bffExtras(apiNamespace: string): ExtraTransport {
  return {
    activity: (spaceIds, forceRefresh) =>
      api.post<ActivityItem>('/api/graph/activity', { spaceIds, forceRefresh }),
    organizations: (ids) => api.post<OrganizationsResponse>('/api/graph/organizations', { ids }),
    gemeenteLocations: () =>
      api.get<GemeenteLocationsResponse>(`/api/${apiNamespace}/gemeente-locations`),
  };
}

export interface DashboardDataProviderProps {
  children: ReactNode;
  /** Test seam — swap the transport. */
  loader?: LoadGraphFn;
  /** Test seam — share a store with the test. */
  store?: DashboardStore;
}

export function DashboardDataProvider({
  children,
  loader: loadGraph,
  store: externalStore,
}: DashboardDataProviderProps) {
  const { appId, apiNamespace, ecosystem } = useAppConfig();
  const { effectiveSpaceIds, state, refreshNonce, resolvingHub } = useSelectionContext();

  const loaderRef = useRef<DashboardLoader | null>(null);
  if (!loaderRef.current) {
    loaderRef.current = new DashboardLoader(
      externalStore ?? new DashboardStore(),
      loadGraph ?? defaultLoadGraph,
      bffExtras(apiNamespace),
    );
  }
  const loader = loaderRef.current;

  // The Ecosystem tab needs every orchestrator candidate in the dataset (research R7);
  // resolving them here means choosing an orchestrator never triggers a second load.
  const candidates = useOrchestratorCandidates(ecosystem ? state.activeHubNameId : null);

  const selection = useMemo<Selection>(
    () => ({
      app: appId,
      spaceIds: [...effectiveSpaceIds],
      widenedSpaceIds: candidates.ids.filter((id) => !effectiveSpaceIds.includes(id)),
      includeInitiatives: state.includeInitiatives,
    }),
    [appId, effectiveSpaceIds, candidates.ids, state.includeInitiatives],
  );
  // No key (no load) until the viewer has a selection AND the candidates are known —
  // widened Spaces alone are never a reason to load, and a load that started before the
  // candidates arrived would only be superseded a moment later.
  const loadKey =
    candidates.ready && selection.spaceIds.length > 0 && !resolvingHub ? selectionLoadKey(selection) : '';

  useEffect(() => {
    loader.setSelection(selection, loadKey);
  }, [loader, selection, loadKey]);

  // The shell's Refresh control bumps `refreshNonce`; each bump is exactly one
  // cache-bypassing reload of the current key.
  const seenNonce = useRef(refreshNonce);
  useEffect(() => {
    if (refreshNonce === seenNonce.current) return;
    seenNonce.current = refreshNonce;
    loader.refresh();
  }, [loader, refreshNonce]);

  useEffect(() => () => loader.dispose(), [loader]);

  const value = useMemo<DashboardData>(
    () => ({
      store: loader.store,
      refresh: () => loader.refresh(),
      retry: (item) => loader.retry(item),
      declare: (item, requester, ids) => loader.declare(item, requester, ids),
    }),
    [loader],
  );
  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

/** Access the provider. Must be used within <DashboardDataProvider>. */
export function useDashboardData(): DashboardData {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) throw new Error('useDashboardData must be used within a DashboardDataProvider');
  return ctx;
}

/**
 * Orchestrator candidates for the active hub, resolved once per hub through the shared
 * promise cache (the Ecosystem tab's own hook re-uses the same round trip). A failure
 * yields no candidates — the map still draws (Constitution V).
 */
function useOrchestratorCandidates(hubNameId: string | null): { ids: string[]; ready: boolean } {
  const ref = useRef<{ hub: string | null; ids: string[] }>({ hub: null, ids: [] });
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!hubNameId || ref.current.hub === hubNameId) return;
    let cancelled = false;
    fetchOrchestratorChoice(hubNameId)
      .then((res) => [res.own, res.community?.spaceNameId ?? null, res.builtIn].filter((x): x is string => !!x))
      .catch(() => [] as string[])
      .then((ids) => {
        if (cancelled) return;
        ref.current = { hub: hubNameId, ids: [...new Set(ids)] };
        tick();
      });
    return () => {
      cancelled = true;
    };
  }, [hubNameId]);
  // Without a hub there is nothing to resolve; with one, ready once its answer is in.
  const ready = !hubNameId || ref.current.hub === hubNameId;
  return { ids: ready ? ref.current.ids : [], ready };
}
