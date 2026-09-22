/**
 * Feature 025 — layer 2 of the dashboard: DERIVATIONS.
 *
 * Every hook here reads the loaded data through `useLoadedData()` and returns a pure,
 * memoised view of it. Two tabs asking the same question get the same object; a tab
 * switch recomputes nothing (FR-005/FR-006). Nothing in this directory fetches.
 *
 * The existing pure utilities (`utils/initiatives.ts`, `utils/cities.ts`, `utils/funnel.ts`,
 * `utils/ecosystem.ts`) are wrapped, not rewritten.
 */
import { useMemo } from 'react';
import type { GraphDataset, GraphNode } from '@server/types/graph.js';
import type { ActivityItem, GraphProgress, VngDashboardResponse } from '@server/types/api.js';
import { useSelectionContext } from '../../hooks/SelectionContext.js';
import { buildInitiativeRows, type InitiativeRow } from '../../utils/initiatives.js';
import { buildCityRows, type CityRow } from '../../utils/cities.js';
import { useLoadedData, useLoadPlan } from '../hooks.js';
import type { LoadItem } from '../store.js';
import { memoiseByDataset } from './memo.js';

// ── The scoped dataset ───────────────────────────────────────────────────────────────
//
// The provider may load MORE Spaces than the viewer selected (the VNG orchestrator
// candidates, research R7). Every tab except Ecosystem must see only the selection, so
// they read the dataset through `scopeDataset`, which drops the widened L0 Spaces, their
// subspaces, their edges, and any organisation/user left without an edge — and
// recomputes the four network metrics the graph tab's bar shows. With nothing to drop it
// returns the dataset itself (same identity → downstream memos keep hitting).

function recomputeMetrics(nodes: GraphNode[], edgeCount: number): GraphDataset['metrics'] {
  const totalNodes = nodes.length;
  const averageDegree = totalNodes > 0 ? (2 * edgeCount) / totalNodes : 0;
  const maxEdges = totalNodes > 1 ? (totalNodes * (totalNodes - 1)) / 2 : 0;
  const density = maxEdges > 0 ? edgeCount / maxEdges : 0;
  return {
    totalNodes,
    totalEdges: edgeCount,
    averageDegree: Math.round(averageDegree * 100) / 100,
    density: Math.round(density * 10000) / 10000,
  };
}

export const scopeDataset = memoiseByDataset(
  (dataset: GraphDataset, inputs: { effectiveSpaceIds: string[] }): GraphDataset => {
    const keep = new Set(inputs.effectiveSpaceIds);
    const l0 = dataset.nodes.filter((n) => n.type === 'SPACE_L0');
    const dropL0 = l0.filter((n) => !n.nameId || !keep.has(n.nameId));
    if (dropL0.length === 0) return dataset;

    const dropped = new Set(dropL0.map((n) => n.id));
    // Subspaces hang off their parent via parentSpaceId; walk until stable (L1 → L2).
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of dataset.nodes) {
        if (!dropped.has(n.id) && n.parentSpaceId && dropped.has(n.parentSpaceId)) {
          dropped.add(n.id);
          grew = true;
        }
      }
    }
    const edges = dataset.edges.filter((e) => !dropped.has(e.sourceId) && !dropped.has(e.targetId));
    const connected = new Set<string>();
    for (const e of edges) {
      connected.add(e.sourceId);
      connected.add(e.targetId);
    }
    const nodes = dataset.nodes.filter((n) => {
      if (dropped.has(n.id)) return false;
      // Contributors that only ever touched a dropped Space go too; Spaces, GD
      // initiatives and themes stay regardless of degree.
      if (n.type === 'ORGANIZATION' || n.type === 'USER') return connected.has(n.id);
      return true;
    });
    return {
      ...dataset,
      spaces: dataset.spaces.filter((s) => keep.has(s)),
      nodes,
      edges,
      metrics: recomputeMetrics(nodes, edges.length),
    };
  },
);

/** The loaded dataset restricted to the viewer's selection (every tab but Ecosystem). */
export function useGraphDataset(): GraphDataset | null {
  const data = useLoadedData();
  const { effectiveSpaceIds } = useSelectionContext();
  return useMemo(
    () => (data ? scopeDataset(data.dataset, { effectiveSpaceIds }) : null),
    [data, effectiveSpaceIds],
  );
}

/** The full loaded dataset, widened Spaces included (the Ecosystem tab). */
export function useWidenedDataset(): GraphDataset | null {
  return useLoadedData()?.dataset ?? null;
}

// ── Load state, in the shape the tabs' existing loading cards understand ─────────────

export interface CoreLoadState {
  /** No dataset yet and the core load has not failed. */
  loading: boolean;
  /** The core item's failure, as a message (i18n key with detail), else null. */
  error: string | null;
  /** Legacy progress shape for the per-tab loading card. */
  progress: GraphProgress | null;
  item: LoadItem | undefined;
}

function toGraphProgress(item: LoadItem | undefined): GraphProgress | null {
  if (!item) return null;
  const step: GraphProgress['step'] =
    item.stage === 'loading' ? 'acquiring' : item.stage === 'processing' ? 'transforming' : 'ready';
  return {
    step,
    spacesTotal: item.total ?? 0,
    spacesCompleted: item.done ?? 0,
    currentSpace: item.current,
  };
}

export function useCoreLoadState(): CoreLoadState {
  const data = useLoadedData();
  const plan = useLoadPlan();
  const item = plan.items.find((i) => i.key === 'spaces');
  const failed = item?.stage === 'failed';
  return {
    loading: !data && !failed,
    error: failed ? (item?.error?.detail ?? item?.error?.key ?? 'load.failed.spaces') : null,
    progress: item && item.stage !== 'done' ? toGraphProgress(item) : null,
    item,
  };
}

// ── Counts (FR-015) ──────────────────────────────────────────────────────────────────

/**
 * The dashboard counts for the current toggles, assembled from the bundle the BFF sent
 * with the dataset. The GD checkbox picks a variant; it never triggers a request.
 */
export function useCounts(): { data: VngDashboardResponse | null } {
  const loaded = useLoadedData();
  const { state } = useSelectionContext();
  const includeGd = state.includeInitiatives;
  return useMemo(() => {
    const bundle = loaded?.dashboard;
    if (!bundle) return { data: null };
    const pick = <T,>(v: { base: T; withGd?: T }) => (includeGd && v.withGd ? v.withGd : v.base);
    const distribution = pick(bundle.distribution);
    return { data: { ...pick(bundle.categories), ...distribution } };
  }, [loaded, includeGd]);
}

// ── Rows ─────────────────────────────────────────────────────────────────────────────

const initiativeRowsOf = memoiseByDataset(
  (dataset: GraphDataset, _inputs: Record<string, never>): InitiativeRow[] => buildInitiativeRows(dataset),
);
const cityRowsOf = memoiseByDataset(
  (dataset: GraphDataset, _inputs: Record<string, never>): CityRow[] => buildCityRows(dataset),
);
const NO_INPUTS = {} as Record<string, never>;

/** Initiative rows (Initiatives table, Funnel), with activity counts merged in once loaded. */
export function useInitiativeRows(): InitiativeRow[] {
  const dataset = useGraphDataset();
  const activity = useLoadedData()?.extras.activity;
  return useMemo(() => {
    if (!dataset) return [];
    return mergeActivity(initiativeRowsOf(dataset, NO_INPUTS), activity);
  }, [dataset, activity]);
}

/**
 * The relational load carries no activity (FR-012a), so Groei rows start with
 * `activity: null` / `tier: null` — the table's "not loaded" state — and fill in once
 * the on-demand item lands. A Space the feed could not be read for stays null.
 */
const mergeActivity = memoiseRows(
  (rows: InitiativeRow[], activity: ActivityItem | undefined): InitiativeRow[] =>
    rows.map((r) => {
      if (r.kind !== 'groei') return r;
      const a = activity?.bySpace[r.id];
      if (a) return { ...r, activity: { day: a.day, week: a.week, month: a.month, total: a.total }, tier: a.tier };
      return { ...r, activity: null, tier: null };
    }),
);

/** Same result object for the same rows array + activity item (both are stable references). */
function memoiseRows<A extends object | undefined, R>(fn: (rows: InitiativeRow[], a: A) => R) {
  const cache = new WeakMap<InitiativeRow[], { a: A; r: R }>();
  return (rows: InitiativeRow[], a: A): R => {
    const hit = cache.get(rows);
    if (hit && hit.a === a) return hit.r;
    const r = fn(rows, a);
    cache.set(rows, { a, r });
    return r;
  };
}

/** City rows (Cities table, City details, Usage Explorer, Dashboard export). */
export function useCityRows(): CityRow[] {
  const dataset = useGraphDataset();
  return useMemo(() => (dataset ? cityRowsOf(dataset, NO_INPUTS) : []), [dataset]);
}
