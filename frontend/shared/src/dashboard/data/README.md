# Dashboard data: one load, derivations on top, tabs only display

Feature 025. Three layers, one rule each.

| Layer | Where | Rule |
|-------|-------|------|
| **Loading** | `DashboardDataProvider.tsx` → `loader.ts` → `store.ts`, transport in `services/graph-loader.ts` | The only code that talks to the BFF. One load per selection key; previous data stays on screen until the new dataset lands. |
| **Derivations** | `derive/index.ts` (memoised with `derive/memo.ts`) | Pure `(dataset, inputs) → result`, cached per dataset identity + inputs. Same object for every consumer; a tab switch recomputes nothing. Never fetches. |
| **Display** | `pages/*`, `components/*` | Read derivation hooks + `useLoadPlan()`. Never hold dataset state, never fetch. |

`layering.test.ts` (in `frontend/vng/src/dashboard/data/`) fails the build if a page, component, util or derivation imports the API or calls `fetch`.

## Reading data in a tab

```ts
const dataset = useGraphDataset();          // scoped to the viewer's selection
const rows = useInitiativeRows();           // shared, memoised
const { data: counts } = useCounts();       // the GD toggle picks a variant — no request
const { loading, error, progress } = useCoreLoadState();
```

`useWidenedDataset()` is the one exception (Ecosystem tab): it includes the orchestrator candidates the provider loads on top of the selection.

## Needing data nobody has loaded

Declare it. The provider fetches it once per selection, announces it in the header strip under your tab's name, and keeps it for the page:

```ts
const activity = useExtraItem('activity', 'tab:initiatives');
// activity.value | activity.loading | activity.failed (strip shows Retry)
```

Items today: `activity` (Initiatives), `gemeente-locations` (Usage Explorer), `organizations` (extended profiles; pass the ids you opened). Adding one: a key in `LoadItemKey` (`server/src/types/api.ts`), a fetcher in `loader.ts` `extraFetchers`, an i18n `load.item.<key>` label.

## Adding a derivation

```ts
const cityRowsOf = memoiseByDataset((dataset, _inputs: Record<string, never>) => buildCityRows(dataset));
export function useCityRows() {
  const dataset = useGraphDataset();
  return useMemo(() => (dataset ? cityRowsOf(dataset, NO_INPUTS) : []), [dataset]);
}
```

Inputs must be JSON-serialisable; keep them small (ids, flags). The dataset identity changes only when the selection changes or a refresh lands.

## What the BFF sends

`POST /api/graph/generate` with `Accept: text/event-stream` (`services/graph-loader.ts`): `stage`/`item` progress frames, then `result` = `{ dataset, dashboard }` — the relational dataset plus the counts bundle in both GD variants. The dashboards always ask for `includeActivity: false, includeExtendedProfiles: false`; the Explorer keeps the plain JSON path with both on. Contracts: `specs/025-unified-data-loading/contracts/`.
