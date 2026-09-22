# Contract: the three layers in the dashboard shell (FR-005)

**Owner**: `frontend/shared/src/dashboard/data/`

## Layer 1 — loading (`DashboardDataProvider`)

Mounted once in `App.tsx`, above the tab row and the `LoadStrip`. It is the **only** code in the dashboards that calls `/api/graph/*`, `/api/<app>/gemeente-locations` or `/api/ecosystem/orchestrator/*`.

```ts
// provided value
interface DashboardData {
  selection: Selection;
  plan: LoadPlan;                       // see data-model §2
  data: LoadedData | null;              // see data-model §4; previous data stays until replaced
  refresh(): void;                      // forceRefresh of the current loadKey + all declared extras
  retry(item: LoadItemKey): void;
  declare(item: LoadItemKey, requester: LoadItem['requester']): () => void; // used by useExtraItem
}
```

Behaviour:
- Recomputes `loadKey` from `SelectionContext` (+ VNG orchestrator candidates, R7). On change: abort the in-flight stream, keep `data` from the previous key on screen, start the new load, reset `plan`.
- Declared extras are loaded once per `loadKey` and kept; re-declaring (tab remount) is a no-op if loaded or in flight.
- On `session.expired` from any request: `redirectToLogin()` once (already guarded).

## Layer 2 — derivations (`dashboard/data/derive/*`)

Pure functions `(data: LoadedData, inputs) => Result`, memoised per dataset identity + inputs (data-model §7). Exposed as hooks — `useInitiativeRows(opts)`, `useCityRows()`, `useFunnelModel()`, `useEcosystemModel()`, `useUsageView()`, `useCounts(toggles)`, `useGraphView(filters)` — each of which just reads `useLoadedData()` and calls the memoised function. **A derivation never fetches and never reads the plan.**

## Layer 3 — display (tabs)

- A tab reads derivation hooks and `useLoadPlan()` only.
- A tab declares extra data with `useExtraItem('activity', 'tab:initiatives')` — that is the *only* way a tab can cause a request, and the request is announced in the strip with that requester.
- A tab shows its own placeholder only while the data **it** needs is absent: `!data` (core), or `data.extras[key] === undefined && plan item not failed` (extra). It never blocks on items it does not use (FR-010).
- Tabs never hold dataset state; `useState` of graph data in a tab is a review-blocking violation.

## `LoadStrip` (header)

Reads `useLoadPlan()`; renders nothing when `!plan.active && no failed items`; otherwise one strip listing items in plan order with localised names (`load.item.<key>`), requester (`load.by.<requester>`), stage, `done/total`, current Space, and a Retry button per failed item. Non-blocking (FR-007a); identical on every tab because it lives outside the tab switch.

## Removed

`hooks/useVngGraph.ts`, `hooks/useDashboard.ts`, `hooks/useGraphProgress.ts` are deleted; `useHubs`, `useSelectedSpaces`, `useOrchestratorChoice`, `useGdInitiatives` (GD *list* for the Intake tab, its own item) stay.
