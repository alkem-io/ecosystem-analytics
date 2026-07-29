# Implementation Plan: City-perspective analysis for the VNG dashboard

**Branch**: `018-city-analysis` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-city-analysis/spec.md`

## Summary

Add the city-first counterpart to the VNG dashboard's initiative-first views: a **Cities** table (peer of the Initiatives tab), a **City information** profile tab (peer of Initiative information), and a **population × initiative-count scatter chart** on the Dashboard tab.

Technical approach — no new data acquisition. The city↔initiative relationship already exists in the generated `GraphDataset` as edges between gemeente `ORGANIZATION` nodes (`isGemeente`) and `SPACE_L0` / `INITIATIVE` nodes, and gemeente nodes already carry `population`, `provinceName` and geo-location (feature `nl-geo`). The two new tabs therefore derive their rows **client-side from the dataset the tabs already fetch** (mirroring `InitiativesTab`), extracted into one pure shared module so both tabs and their tests share a single aggregation rule. The Dashboard chart additionally needs the **non-participating** municipalities, which never appear as graph nodes — so it is **server-computed** and added to the existing dashboard response, joining the same graph-edge counts with the full municipality list from the VNG snapshot registry. That keeps the XLSX export path unchanged and avoids making the Dashboard tab fetch the (heavy) graph.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM); Node 24 (server), React 19 (frontends)
**Primary Dependencies**: Server — Express 5, `better-sqlite3`, existing codegen GraphQL SDK. Frontend — React 19, Vite 7, `recharts` (new `ScatterChart` usage — library already a dependency), `react-i18next`, Radix UI + Tailwind v4, D3 v7 (map, via the shared `ForceGraph`). **No new dependencies.**
**Storage**: Existing SQLite cache. **No schema change** — the feature reads the already-cached `GraphDataset` (`cache_entries (user_id, space_id)`) and the committed static reference data in `server/src/data/nl/municipality-facts.json` + `server/src/data/vng/municipalities.json`.
**Testing**: Vitest. Server — `server/src/services/*.test.ts` (existing pattern: `vng-dashboard.test.ts`). Frontend — `frontend/vng` has Vitest + `@testing-library/react` configured with `passWithNoTests`; the shared pure aggregation module is tested from there (its `@ea/shared` alias resolves to source), which also lands VNG's first frontend tests.
**Target Platform**: Browser SPA (VNG dashboard, dev :5174 / prod :4001) served by the shared BFF.
**Project Type**: Web application — Express BFF + multiple React SPAs sharing `@ea/shared`.
**Performance Goals**: The two new tabs add **zero** additional network requests (SC-004) — they consume the `GraphDataset` those tabs already fetch. The Dashboard chart adds no new request either (it rides the existing `POST /api/<app>/dashboard` response). Client aggregation is O(nodes + edges), ~1 ms for the largest realistic selection.
**Constraints**: Constitution §VII (Netherlands-only maps) applies to the new city map — satisfied by reusing the shared `InitiativeMap`/`ForceGraph` map mode unchanged. Constitution §V (graceful degradation) — unknown population/province must render as an explicit "unknown", never `0` or a crash. FR-028 (counts identical across views) requires one aggregation rule, enforced by mirrored unit tests.
**Scale/Scope**: 342 Dutch municipalities + 2 Belgian entries in the registry; selections of up to `max_spaces_per_query` initiatives. 2 new tabs, 1 new chart, 1 new shared pure module, 1 server assembler, ~40 new i18n keys × 2 languages × 2 apps.

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| **I. Alkemio OIDC auth** | Indirectly | No auth change. The new server work sits behind the existing `authMiddleware` + `resolveUser` on `dashboardRouter`. No credential handling introduced. **PASS** |
| **II. Typed GraphQL contract** | No | No new Alkemio queries — the feature reads the already-generated `GraphDataset` and committed static reference data. No `.graphql` change, so no `codegen` run required. **PASS** |
| **III. BFF boundary** | Yes | All new frontend data comes from the existing `/api/graph/generate` and `/api/<app>/dashboard` responses. No direct Alkemio calls from the browser. **PASS** |
| **IV. Data sensitivity** | Yes | No new cache entries and no new cache keys — the feature reuses `(user_id, space_id)`-scoped datasets resolved through the caller's session. Municipality population/province is public reference data. No new SQL. Nothing token-adjacent is logged. **PASS** |
| **V. Graceful degradation** | Yes | Explicitly designed for: unknown population and unknown province render as an "unknown" marker (FR-005); the chart states how many cities it excluded (FR-023); missing gemeente geo-location degrades to the existing map behaviour; empty/loading/error states reuse the existing tab components. **PASS** |
| **VI. Design fidelity** | Yes | The new tabs and chart reuse existing dashboard primitives verbatim — the Initiatives table's filter-bar/sort-header/chip patterns, the details tab's picker + map + avatar grid, and the existing chart card shell (`section` + title + subtitle + custom legend). No new design tokens. **PASS** |
| **VII. Dutch-dashboard map scope (Netherlands-only) — HARD** | Yes | The city profile map reuses the shared `InitiativeMap` (shared `ForceGraph`, `mapRegion` default `netherlands`) **unchanged** — no new map implementation, so the clipped Netherlands-only rendering is preserved by construction. A regression check is included in the quickstart. **PASS** |

**Result: PASS — no violations, Complexity Tracking not required.**

Post-Phase-1 re-check: **PASS** — the design added one pure frontend module, one pure server assembler, one response field, two tabs and one chart. No new project, no new persistence, no new external interface beyond an additive field on an existing response.

## Project Structure

### Documentation (this feature)

```text
specs/018-city-analysis/
├── plan.md              # This file
├── research.md          # Phase 0 output — decisions + rationale
├── data-model.md        # Phase 1 output — entities and derivation rules
├── quickstart.md        # Phase 1 output — how to run and verify
├── contracts/
│   ├── city-aggregation.md   # The shared pure module contract (the single count rule)
│   └── api-dashboard-city.md # Additive field on POST /api/<app>/dashboard
├── checklists/
│   └── requirements.md  # Spec quality checklist (already passing)
└── tasks.md             # Phase 2 output — created by /speckit.tasks, NOT by this command
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── data/
│   │   ├── nl/municipality-facts.json      # (existing) CBS code → province + population
│   │   └── vng/municipalities.json         # (existing) slug/title/alkemioNameId/cbsCode
│   ├── services/
│   │   ├── vng-registry.ts                 # MODIFIED — add municipalities() accessor
│   │   ├── vng-dashboard-service.ts        # MODIFIED — add countCityInitiatives() +
│   │   │                                   #            assembleCityPopulation()
│   │   └── vng-cities.test.ts              # NEW — count rule + series assembly tests
│   ├── routes/dashboard.ts                 # MODIFIED — attach cityPopulation to response
│   └── types/api.ts                        # MODIFIED — CityPopulationSeries + response field

frontend/
├── shared/src/dashboard/
│   ├── App.tsx                             # MODIFIED — 4 tabs → 6, `<app>:openCity` bridge
│   ├── utils/cities.ts                     # NEW — buildCityRows(): the single count rule
│   ├── pages/
│   │   ├── CitiesTab.tsx                   # NEW — the plural (table) view
│   │   ├── CityDetailsTab.tsx              # NEW — the singular (profile) view
│   │   ├── SpaceDetailsTab.tsx             # MODIFIED — gemeente avatar → openCity
│   │   └── DashboardTab.tsx                # MODIFIED — mount the new chart + export it
│   ├── components/charts/
│   │   └── CityPopulationChart.tsx         # NEW — the scatter chart
│   └── utils/exportDashboard.ts            # MODIFIED — city sheet rows
├── vng/src/
│   ├── i18n/{nl,en}.json                   # MODIFIED — tab labels + city view/chart strings
│   └── dashboard/cities.test.ts            # NEW — mirrors the server count-rule test
└── govtech/src/i18n/{nl,en}.json           # MODIFIED — same keys (shared shell renders the tabs)
```

**Structure Decision**: Existing web-application layout — Express BFF (`server/`) plus SPA packages under `frontend/` sharing `@ea/shared`. Every new UI file lands in `frontend/shared` because the dashboard shell is shared; the VNG and GovTech app packages only gain translation keys. No new package or directory tier is introduced.

## Key Design Decisions

Full rationale in [research.md](./research.md). Summary:

1. **One aggregation rule, two implementations, mirrored tests.** A city's initiative count = the number of distinct `SPACE_L0` / `INITIATIVE` nodes connected to that gemeente `ORGANIZATION` node by **any** edge in the `GraphDataset`. Implemented once client-side (`buildCityRows`) and once server-side (`countCityInitiatives`), with the same fixture driving a test on each side to guarantee FR-028.
2. **Deliberately *not* the text-matching rule.** `assembleGemeenteDistribution` counts GD gemeente links via `registry.findGemeentesInText(description)`, which can exceed the graph-edge count when a mentioned gemeente has no organisation node (`transform/initiatives.ts:162-164` skips the edge in that case). City rows use the graph-edge rule so a city is never counted for an initiative it has no node relationship with.
3. **Tabs derive client-side; the chart is server-computed.** The tabs already hold the dataset (zero extra requests, SC-004). The chart needs the ~342 non-participating municipalities that are absent from the graph, and its data must reach the XLSX export via the existing `data` object — both point to the server.
4. **Additive response field, no new endpoint.** `VngDashboardResponse.cityPopulation?: CityPopulationSeries`, mirroring how `gemeenteDistribution` and `categoryMatrix` were added. Optional field ⇒ no breaking change for GovTech or any cached client.
5. **Reuse, don't rebuild, the map.** `CityDetailsTab` renders the existing `InitiativeMap` with the single selected gemeente node — constitution §VII holds by construction.

## Known Costs & Mitigations

| Cost | Detail | Mitigation |
|---|---|---|
| Second `generateGraph` call per dashboard request | `assembleCityPopulation` needs the GD `INITIATIVE` nodes, so it calls `generateGraph(includeInitiatives: includeGd)`, while `assembleGemeenteDistribution` calls it with `false` — a different cache key when the GD toggle is on. | Both hit the per-user/per-space SQLite cache, so the second call is a cache read on all but the first cold request. An optional follow-up task generates the dataset once in `routes/dashboard.ts` and passes it into both assemblers. |
| Six tabs in the shared shell | GovTech inherits the new tabs (spec Assumptions accepts this). | Translation keys are added to GovTech's `nl.json`/`en.json` in the same change so no raw key ever renders. |
| ~342 points on the scatter chart | Non-participating municipalities dominate the point count. | Log-scaled population axis, small muted hollow marks for the non-participating series, and a legend that lets the reader separate the two groups (FR-021/FR-024). |

## Complexity Tracking

> Not required — Constitution Check passed with no violations.
