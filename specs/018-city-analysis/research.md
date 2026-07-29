# Phase 0 Research: City-perspective analysis

**Feature**: 018-city-analysis | **Date**: 2026-07-29

The Technical Context carried **no NEEDS CLARIFICATION markers** — every technology is already in use in this repo and the one open scope question in the spec (chart population) was resolved with the requester before planning. This document therefore records the design decisions and the codebase findings that justify them.

---

## Finding 0 — Everything this feature needs already exists in the data

Verified in the current tree, so no acquisition work is required:

| Need | Where it already lives |
|---|---|
| City ↔ initiative relationship | `GraphDataset` edges. Groei: community/association edges between `SPACE_L0` and gemeente `ORGANIZATION` nodes. GD: `EdgeType.INITIATIVE_GEMEENTE` edges emitted by `server/src/transform/initiatives.ts:162-164`. |
| City population | `GraphNode.population` — `server/src/types/graph.ts:155`, populated for gemeente org nodes from `server/src/data/nl/municipality-facts.json` joined on `cbsCode` in `server/src/services/vng-registry.ts:144-162`. |
| City province | `GraphNode.provinceCode` / `provinceName` — same source. |
| City geo-location | `GraphNode.location` (lat/long), already used to pin gemeentes on the initiative-details map. |
| Full municipality list (incl. non-participating) | `server/src/data/vng/municipalities.json` via the registry (`gemeenteNameIds()`), joined to the same facts file. |
| Initiative classifications per city | `GraphNode.ndsCategories` / `vng2030Categories` / `vngThemes` on the initiative nodes — already read this way by `InitiativesTab`. |

**Implication**: this is a presentation + aggregation feature, not a data feature. No `.graphql` change, no `pnpm run codegen`, no cache-schema change.

---

## Decision 1 — Define the city↔initiative count as a graph-edge rule

**Decision**: A city's initiative count is the number of **distinct `SPACE_L0` or `INITIATIVE` nodes connected to that gemeente `ORGANIZATION` node by any edge** in the `GraphDataset` for the current selection.

**Rationale**:
- It is the exact inverse of the rule the Initiatives tab already shows ("gemeentes per initiative", `InitiativesTab.tsx:147-177`) and of `countSpaceGemeentes` on the server (`vng-dashboard-service.ts:88-100`). Inverting an existing, user-visible rule guarantees the two perspectives agree (FR-028).
- It is pure over a dataset, so it is unit-testable on both sides with the same fixture.
- Symmetry with `countSpaceGemeentes` means an implementation bug shows up as a visible asymmetry between the Initiatives and Cities tables, which is easy to spot in review.

**Alternatives considered**:
- *Text matching, i.e. `registry.findGemeentesInText(description)`* — this is what `assembleGemeenteDistribution` uses for the GD side (`vng-dashboard-service.ts:132-135`). **Rejected**: it counts gemeentes mentioned in a description even when no organisation node exists for them, whereas `transform/initiatives.ts:162-164` only emits an edge `if (nodeId)`. The two can disagree. For a *city-keyed* view the mismatch is fatal — a city with no node cannot be a row, so counting it would make the chart's totals unreachable from the table. Using the edge rule everywhere removes the class of bug.
- *A dedicated "membership" edge type only* — **rejected**: gemeente association is expressed through several edge types depending on whether the initiative is a Groei space or a GD callout; the existing code deliberately uses "any edge", and narrowing it would silently drop Groei associations.

---

## Decision 2 — The two tabs derive their rows client-side from the already-fetched dataset

**Decision**: `CitiesTab` and `CityDetailsTab` call `useVngGraph(effectiveSpaceIds, { includeInitiatives })` — the same hook the Initiatives, Graph and Initiative-information tabs use — and aggregate through one shared pure module, `frontend/shared/src/dashboard/utils/cities.ts`.

**Rationale**:
- **No new network request and no new wait** (SC-004). The dataset is fetched per selection and cached both in the hook and in server-side SQLite; switching to a city tab reuses it.
- It matches the established precedent exactly: `InitiativesTab` builds its entire table from `dataset` in a `useMemo` with no extra fetch.
- The city profile tab needs gemeente `GraphNode` objects anyway (the map component takes nodes), so it must hold the dataset regardless — deriving the rest of the profile from the same object avoids two sources for one screen.

**Alternatives considered**:
- *A new `POST /api/<app>/cities` endpoint returning finished rows* — **rejected**: adds a round trip and a second acquisition path for data the client already has, and would still not remove the need for the dataset (the map). It also creates a second place for the count rule to drift.
- *Leaving the aggregation inline in each tab component (the current `InitiativesTab` style)* — **rejected**: two tabs plus a mirrored test need one callable function. Extracting it is what makes FR-028 testable.

---

## Decision 3 — The scatter chart is server-computed and rides the existing dashboard response

**Decision**: Add `cityPopulation?: CityPopulationSeries` to `VngDashboardResponse`, assembled by a new `assembleCityPopulation()` in `vng-dashboard-service.ts` and attached in `routes/dashboard.ts` next to `gemeenteDistribution`.

**Rationale**:
- **Only the server has the non-participating municipalities.** Per the confirmed scope, the chart plots all Dutch municipalities, including those with zero initiatives in the current selection. Those never appear as graph nodes; they exist only in the committed registry. Shipping the registry to the browser to compute this client-side would duplicate reference data across the wire on every dashboard load.
- **The export path already reads the response object.** `exportDashboardXlsx({ data, charts, … })` (`DashboardTab.tsx:70-104`) serialises `data` into the "Gegevens" sheet. Putting the series on `data` satisfies FR-025 with the pattern already in place; a client-only series would need a separate parameter threaded through the export.
- **The Dashboard tab does not fetch the graph today** and should not start — it is the cheapest tab, and pulling a full dataset into it purely for a chart would regress its load.
- Additive optional field ⇒ no breaking change; older clients and GovTech ignore it until they render it.

**Alternatives considered**:
- *Compute in the browser from the dataset + a static municipality endpoint* — **rejected** for the three reasons above, principally the export path and the Dashboard tab's current cost profile.
- *A separate `GET /api/<app>/municipalities` static endpoint* — **rejected as unnecessary** once the series is computed server-side; it would only be needed by the client-side variant.

**Consistency guarantee**: `assembleCityPopulation` uses `countCityInitiatives(dataset)` — the server-side twin of `buildCityRows` — so the chart's participating counts and the Cities table's counts are the same rule over the same dataset. A fixture-driven test on each side asserts the identical result (see [contracts/city-aggregation.md](./contracts/city-aggregation.md)).

---

## Decision 4 — Six tabs in the shared shell, with an `openCity` event bridge

**Decision**: Extend `TabKey`/`TABS` in `frontend/shared/src/dashboard/App.tsx:16-17` to `['dashboard', 'details', 'initiatives', 'cityDetails', 'cities', 'graph']`, and add a `${cfg.eventPrefix}:openCity` window event mirroring the existing `${cfg.eventPrefix}:openSpace` bridge (`App.tsx:41-55`).

**Rationale**:
- The initiative pair sits adjacent (`details`, `initiatives`); placing the city pair immediately after keeps the "singular then plural, initiative group then city group" reading order, with `graph` remaining last as the specialist view.
- The `openSpace` custom-event bridge is the shell's established cross-tab navigation mechanism (added for T042/FR-015); reusing its shape for `openCity` satisfies FR-018 and FR-019 with no new pattern and no router change.

**Consequence accepted**: GovTech renders the same shell and therefore gains the tabs. The spec's Assumptions accept this; translation keys are added to `frontend/govtech/src/i18n/{nl,en}.json` in the same change so GovTech never shows raw keys.

**Alternatives considered**:
- *Gate the tabs behind an `AppConfig` flag so only VNG shows them* — **rejected for now**: no requirement asks for it, GovTech reads the same `gemeentedelers` corpus so the views are equally meaningful there, and a flag would add a config dimension to every future dashboard. Trivial to add later if GovTech's owners object.

---

## Decision 5 — Chart form: log-scaled scatter, two series

**Decision**: `recharts` `ScatterChart`; X = population on a **log scale**, Y = initiative count (linear, integer ticks); two `<Scatter>` series — participating cities (filled, `var(--primary)`) and non-participating municipalities (small, muted, hollow) — with a custom legend and tooltip in the same card shell as the existing charts.

**Rationale**:
- **Measured from the committed data** (342 municipalities): populations run 972 → 941 927, just under 3 orders of magnitude, with a median of 33 171. On a linear axis **306 of 342 (89%) fall inside the leftmost 10%** of the plot; on a log axis only **3 of 342 (1%)** do. That is the FR-024 case, quantified — a linear axis would make the chart unreadable for nine cities in ten.
- `recharts` is already a dependency and already carries the dashboard's other three charts; `ScatterChart` needs no new package.
- Log scale is safe here because population is only plotted when it is known and non-zero (unknown-population cities are excluded and counted per FR-023). The zero values in this chart are on the **Y** axis (zero initiatives), which is linear.
- Two visually distinct series satisfy FR-021's "must distinguish the two groups" and let the reader ignore the ~342-point background when they only care about participants.

**Alternatives considered**:
- *Linear X with a zoom/brush* — **rejected**: interaction cost for something a log axis solves statically, and the XLSX export would not carry the zoom.
- *Bubble size encoding population instead of a second axis* — **rejected**: the spec asks for a cross plot of the two variables; encoding one as area makes the correlation much harder to read.

**Implementation note**: the existing charts (`GemeenteDistributionChart.tsx`) establish the card shell, the custom legend (recharts' default legend overlapped), and the custom tooltip component. Follow those; the project's `dataviz` guidance should be consulted before writing the chart code.

---

## Decision 6 — Reuse `InitiativeMap` for the city profile map

**Decision**: `CityDetailsTab` renders the existing `frontend/shared/src/dashboard/components/InitiativeMap.tsx` with `gemeentes={[selectedCityNode]}`.

**Rationale**: Constitution §VII is a HARD requirement — every Dutch dashboard map must render the Netherlands only, tiles clipped to the boundary, nothing outside. `InitiativeMap` wraps the shared `ForceGraph` in map mode, which is where that clipping is implemented. Reusing it unchanged means the requirement is satisfied by construction and cannot regress through this feature. It already accepts an arbitrary list of gemeente nodes, so a single-element list needs no component change.

**Alternatives considered**: a purpose-built single-marker map — **rejected**: it would be a new map implementation subject to §VII, i.e. a new place for a Netherlands-only regression to appear, for no user-visible gain.

---

## Decision 7 — Test placement

**Decision**: Server tests in `server/src/services/vng-cities.test.ts` (Vitest, alongside `vng-dashboard.test.ts`). Frontend tests for the shared pure module in `frontend/vng/src/dashboard/cities.test.ts`.

**Rationale**: `frontend/shared` is a source-only package with no Vitest config of its own. `frontend/vng` already has Vitest, `@testing-library/react`, and a `@ea/shared` → source alias, and its config sets `passWithNoTests: true` precisely because no tests existed yet. Placing the shared module's tests there exercises the real source through the real alias and closes that pre-existing gap.

**Note on the local toolchain**: this macOS host cannot run `tsc`/`vitest`/`vite` (Linux-only native dependencies) — run the test and typecheck gates in the devcontainer.

---

## Open risks

| Risk | Impact | Handling |
|---|---|---|
| Client and server count rules drift over time | FR-028 breaks silently | Mirrored fixture tests on both sides; the contract document states the rule once and both tests cite it. |
| Cold-cache dashboard request now generates the graph twice (different `includeInitiatives` cache keys) | First load on a cold selection slower | Documented in plan.md; optional follow-up task shares one dataset between both assemblers. |
| Duplicate gemeente display names across provinces | Ambiguous rows | Rows are keyed by node id, and province is a visible column — spec edge case already covers it. |
| A municipality with no population figure | Must not become `0` | Rendered as "unknown" in tables (FR-005) and excluded from the chart with the excluded count stated (FR-023). **Measured against the real data during implementation: all 342 registry municipalities have a population, so this path is defensive, not routine.** Brugge and Gent carry no `alkemioNameId`, so they are excluded from the registry set entirely (same as the pre-existing `gemeenteNameIds()`) rather than appearing with a null population — an earlier draft of this table said otherwise. |
