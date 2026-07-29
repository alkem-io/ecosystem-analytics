---

description: "Task list for 018-city-analysis"
---

# Tasks: City-perspective analysis for the VNG dashboard

**Input**: Design documents from `/specs/018-city-analysis/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks ARE included. [contracts/city-aggregation.md](./contracts/city-aggregation.md) is normative and *requires* two mirrored conformance tests (one per implementation) to satisfy FR-028 — they are not optional extras.

**Organization**: Grouped by user story so each can be implemented, tested and demoed independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3, mapping to the spec's user stories
- Every task names its exact file path

## Path Conventions

Web app, pnpm workspace: BFF in `server/`, SPAs in `frontend/*` sharing `@ea/shared` (`frontend/shared/src`). All paths below are repo-root-relative.

> ✅ **Verified during implementation**: this macOS host runs `tsc`, `vitest` and `vite` fine — `pnpm -C server test`, both frontend typechecks and both production builds all pass locally. (An earlier note claiming otherwise was wrong.)

---

## Phase 1: Setup

**Purpose**: Establish a clean, known-green baseline before touching shared code.

- [X] T001 Confirm a green baseline in the devcontainer: `pnpm -C server test`, `pnpm -C server exec tsc --noEmit`, and `run typecheck:native` in `frontend/vng`, `frontend/govtech`, `frontend/ecosystem-analytics` — record any pre-existing failure so it is not attributed to this feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The single city↔initiative aggregation rule that US1 and US2 both consume, and that US3's server twin must match.

**⚠️ CRITICAL**: US1 and US2 cannot begin until T003 lands. US3 is independent of this phase but its server implementation must port the same rule.

- [X] T002 [P] Write the frontend conformance test in `frontend/vng/src/dashboard/cities.test.ts` using the exact fixture and expected-count table from `specs/018-city-analysis/contracts/city-aggregation.md` (9 nodes incl. a non-gemeente org, an L1 sub-space and a USER; 6 edges incl. a reverse-direction and a duplicate edge). Import via the `@ea/shared/dashboard/utils/cities.js` subpath (the package exposes `"./*": "./src/*"`). Assert: 3 rows, Groningen=2, Brugge=1, Utrecht=0, `population: null` preserved (never `0`), no duplicate ids, rows sorted `Brugge, Groningen, Utrecht`, `groeiCount + gdCount === initiativeCount`, and `buildCityRows(null) === []`. **Write first — it must fail before T003.**
- [X] T003 Implement `CityInitiativeRef`, `CityRow` and the pure `buildCityRows(dataset)` in `frontend/shared/src/dashboard/utils/cities.ts` per `data-model.md` §2 and the rule in `contracts/city-aggregation.md`: one row per `ORGANIZATION` node with `isGemeente === true`; initiatives = distinct `SPACE_L0`/`INITIATIVE` nodes joined by ANY edge in EITHER direction (de-duplicated, `SPACE_L1`/`SPACE_L2`/`USER` excluded); classification arrays are the sorted de-duplicated union across those initiatives; `population`/`provinceName` copied verbatim with `null` preserved. Run T002 until green.

**Checkpoint**: One tested aggregation rule exists — US1 and US2 can now start in parallel.

---

## Phase 3: User Story 1 - Compare all cities side by side (Priority: P1) 🎯 MVP

**Goal**: A sortable, filterable, searchable one-row-per-city table showing province, population, initiative count and the aggregated classification profile of the initiatives each city joins.

**Independent Test**: With a selection active, open the Cities tab: every connected city appears exactly once, sorting by initiative count ranks correctly, the province filter and search narrow the list with a live count, and a city's initiative count matches what the Initiatives tab shows for that city.

### Implementation for User Story 1

- [X] T004 [US1] Create `frontend/shared/src/dashboard/pages/CitiesTab.tsx`: consume `useSelectionContext()` + `useVngGraph(effectiveSpaceIds, { includeInitiatives, refreshNonce })`, derive rows with `buildCityRows(dataset)`, and render the table shell with columns name / province / population / initiatives / Groei / GD / VNG-2030 / NDS / themes. Follow `InitiativesTab.tsx` for the grouped `<thead>`, chip rendering and cell styling. Population renders as a localised number, or an explicit "unknown" marker when `null` (FR-005) — never `0`
- [X] T005 [US1] Add column sorting to `frontend/shared/src/dashboard/pages/CitiesTab.tsx`: `sortKey`/`sortDir` state, `toggleSort`, the `SortIcon`/`headerBtn` pattern from `InitiativesTab.tsx`, text columns defaulting A→Z and numeric columns high→low, and `null` values always sinking to the bottom regardless of direction (FR-009)
- [X] T006 [US1] Add the filter bar to `frontend/shared/src/dashboard/pages/CitiesTab.tsx`: free-text city-name search plus dropdowns for province, VNG-2030, NDS and theme, each option carrying its own match count, only rendering filters that have options, and a right-aligned filtered-row count (FR-010/011/012)
- [X] T007 [US1] Add the initiative drill-down to `frontend/shared/src/dashboard/pages/CitiesTab.tsx`: wrap the initiative-count cell in the shared `Tooltip` primitives listing the initiative names with Groei/GD distinguished, mirroring the gemeente tooltip in `InitiativesTab.tsx` (FR-013, FR-006)
- [X] T008 [US1] Add the state handling to `frontend/shared/src/dashboard/pages/CitiesTab.tsx`: first-load spinner driven by `useGraphProgress` with the current space name, error message, "nothing selected" empty state, and a distinct "no results" message when filters match nothing — matching the Initiatives tab exactly (FR-026, spec Edge Cases)
- [X] T009 [US1] Register the tab in `frontend/shared/src/dashboard/App.tsx`: add `'cities'` to `TabKey` and to `TABS` (after `'initiatives'`), and render `{active === 'cities' && <CitiesTab />}` inside the existing `ErrorBoundary`
- [X] T010 [P] [US1] Add the Cities-table strings to `frontend/vng/src/i18n/nl.json` and `frontend/vng/src/i18n/en.json`: `tabs.cities` ("Gemeenten" / "Cities") plus a `citiesTab.*` block (column headers, filter labels, search placeholder, row count, unknown-population marker, loading, no-results)
- [X] T011 [P] [US1] Add the same `tabs.cities` + `citiesTab.*` keys to `frontend/govtech/src/i18n/nl.json` and `frontend/govtech/src/i18n/en.json` — GovTech renders the same shared shell, so a missing key shows a raw string

**Checkpoint**: US1 is independently demoable — the MVP. Verify against `quickstart.md` §1, including the FR-028 cross-check against the Initiatives tab.

---

## Phase 4: User Story 2 - Profile a single city (Priority: P2)

**Goal**: A one-city-at-a-time profile: picker, population + province, the city pinned on the Netherlands map, and the list of initiatives it participates in.

**Independent Test**: Open the City information tab, pick a city, and confirm its population, province, map position and initiative list match that city's row in the Cities table. Reachable from an initiative's gemeente grid without US1 being present.

**Depends on**: Phase 2 (T003). T014 additionally requires US1's `CitiesTab` (FR-018); every other task is independent of US1.

### Implementation for User Story 2

- [X] T012 [US2] Create `frontend/shared/src/dashboard/pages/CityDetailsTab.tsx`: derive rows with `buildCityRows(dataset)`, render a Radix `Select` picker listing every city with its `(N)` initiative count, default to the alphabetically first city, and re-select safely when the selection changes or the current city disappears — following `SpaceDetailsTab.tsx`'s picker and selection-reset effects (FR-014/015)
- [X] T013 [US2] Add the profile body to `frontend/shared/src/dashboard/pages/CityDetailsTab.tsx`: city name with avatar (initials fallback via `SafeImage`, as in `SpaceDetailsTab.tsx`), population and province each rendering an explicit "unknown" indicator when `null` (FR-016, FR-005), and the list of participating initiatives with their VNG-2030 / NDS / theme chips and a Groei-vs-GD badge (FR-017)
- [X] T014 [US2] Add the map to `frontend/shared/src/dashboard/pages/CityDetailsTab.tsx` by rendering the existing `InitiativeMap` with `gemeentes={[cityNode]}` — **reuse it unchanged**; do not write a new map. This is what preserves constitution §VII (Netherlands-only, tiles clipped, nothing outside)
- [X] T015 [US2] Add loading / error / empty states to `frontend/shared/src/dashboard/pages/CityDetailsTab.tsx` using `useGraphProgress` + `LoadingOverlay`, matching the other tabs (FR-026)
- [X] T016 [US2] Register the tab in `frontend/shared/src/dashboard/App.tsx`: add `'cityDetails'` to `TabKey` and to `TABS` (immediately before `'cities'`, giving the order dashboard → details → initiatives → cityDetails → cities → graph) and render `{active === 'cityDetails' && <CityDetailsTab … />}`. Sequential after T009 — same file
- [X] T017 [US2] Add the cross-tab navigation bridge to `frontend/shared/src/dashboard/App.tsx`: an `${cfg.eventPrefix}:openCity` window-event listener carrying `{ cityId }` that sets `openCityId`/`openCitySeq` and switches to `cityDetails`, mirroring the existing `openSpace` bridge; thread `openCityId`/`openCitySeq` into `CityDetailsTab` as props. Sequential after T016 — same file
- [X] T018 [US2] Dispatch `${cfg.eventPrefix}:openCity` from the gemeente avatar grid in `frontend/shared/src/dashboard/pages/SpaceDetailsTab.tsx` so choosing a gemeente on an initiative opens that city's profile (FR-019)
- [X] T019 [US2] Dispatch `${cfg.eventPrefix}:openCity` from the city name cell in `frontend/shared/src/dashboard/pages/CitiesTab.tsx` (FR-018). **Requires US1** — skip if US1 has not been implemented; every other US2 task stands alone
- [X] T020 [P] [US2] Add the City-information strings to `frontend/vng/src/i18n/nl.json` and `frontend/vng/src/i18n/en.json`: `tabs.cityDetails` ("Gemeente informatie" / "City information") plus a `cityDetailsTab.*` block (picker label, population, province, unknown marker, initiative-list heading, empty states)
- [X] T021 [P] [US2] Add the same `tabs.cityDetails` + `cityDetailsTab.*` keys to `frontend/govtech/src/i18n/nl.json` and `frontend/govtech/src/i18n/en.json`

**Checkpoint**: US1 and US2 both work independently. Verify against `quickstart.md` §2 — **including the constitution §VII map regression check**.

---

## Phase 5: User Story 3 - See whether city size predicts participation (Priority: P3)

**Goal**: A Dashboard scatter chart of population against initiative count, plotting participating cities and non-participating Dutch municipalities as two distinguishable series, with the excluded-unknown-population count stated and the values carried into the XLSX export.

**Independent Test**: With a selection active, open the Dashboard tab: the chart renders one point per municipality with a known population, hover/focus identifies city + population + count, the excluded count is stated, small and large municipalities are both distinguishable, and a point's count matches the Cities table.

**Depends on**: Phase 1 only. Fully independent of US1/US2 — it has its own server-side implementation of the shared rule.

### Tests for User Story 3

- [X] T022 [US3] Write the server conformance test in `server/src/services/vng-cities.test.ts` using the **same** fixture and expected-count table as `contracts/city-aggregation.md` (identical to T002's), plus the series-assembly cases from `contracts/api-dashboard-city.md`: `population: null` municipality absent from both arrays and counted in `excludedUnknownPopulation`; registry municipality absent from the graph lands in `nonParticipating` with count `0`; a graph gemeente absent from the registry still lands in `participating`; `includeGd: false` ⇒ `gdIncluded === false` and no GD contribution; arrays disjoint by `nameId` and sorted by population desc then name. **Write first — it must fail before T024.**

### Implementation for User Story 3

- [X] T023 [P] [US3] Add the `municipalities(): { nameId, title, info }[]` accessor to the `VngRegistry` interface and its implementation in `server/src/services/vng-registry.ts`, built from the existing `municipalities.json` + `municipality-facts.json` join at load time (skip entries without `alkemioNameId`, matching `gemeenteNameIds()`); update the registry mock in `server/src/transform/initiatives.test.ts` and `server/src/services/vng-registry.geo.test.ts` if they stub the interface
- [X] T024 [P] [US3] Add `CityPopulationPoint`, `CityPopulationSeries` and the optional `cityPopulation?: CityPopulationSeries` field on `VngDashboardResponse` in `server/src/types/api.ts`, per `contracts/api-dashboard-city.md`. Keep the field optional so GovTech and cached clients are unaffected
- [X] T025 [US3] Implement the exported pure `countCityInitiatives(dataset)` in `server/src/services/vng-dashboard-service.ts` — the server twin of `buildCityRows`, applying the identical edge rule and returning `{ nameId, name, provinceName, population, initiativeCount }[]`. Export it (not module-private) so it is directly testable, mirroring `countSpaceGemeentes`. **Must NOT use `findGemeentesInText`** — see `contracts/city-aggregation.md` "Why not text matching"
- [X] T026 [US3] Implement `assembleCityPopulation(userId, auth, spaceIds, includeGd)` in `server/src/services/vng-dashboard-service.ts`: `generateGraph(… { includeInitiatives: includeGd })`, `countCityInitiatives`, then left-join `registry.municipalities()` into `participating` / `nonParticipating` / `excludedUnknownPopulation` per `data-model.md` §3, keeping graph-only gemeentes in `participating`, and sorting both arrays by population desc then name. Run T022 until green
- [X] T027 [US3] Attach the series in `server/src/routes/dashboard.ts`: `result.cityPopulation = await assembleCityPopulation(req.auth!.userId!, req.auth!, body.spaceIds, body.includeGemeenteDelers ?? false)`, alongside the existing `gemeenteDistribution` assignment
- [X] T028 [US3] Create `frontend/shared/src/dashboard/components/charts/CityPopulationChart.tsx`: a recharts `ScatterChart` with a **log-scaled** population X axis and an integer-tick initiative-count Y axis, two `<Scatter>` series (participating filled in `var(--primary)`; non-participating small, muted and hollow), a custom legend and a custom tooltip showing city + population + count, the excluded-unknown-population count stated in the card subtitle, and the shared card shell + empty state — follow `GemeenteDistributionChart.tsx` for all of these patterns, and consult the project's `dataviz` guidance before writing the chart code (FR-020/021/022/023/024)
- [X] T029 [US3] Mount the chart in `frontend/shared/src/dashboard/pages/DashboardTab.tsx`: add a `cityPopRef`, render `<CityPopulationChart series={data?.cityPopulation} … />` full-width in the existing grid, and add it to the `charts` array passed to `exportDashboardXlsx`
- [X] T030 [US3] Extend `frontend/shared/src/dashboard/utils/exportDashboard.ts` to write the per-city rows (name, province, population, initiative count, participating yes/no) into the data sheet alongside the existing chart data, with the new label strings threaded through the existing `text` argument (FR-025)
- [X] T031 [P] [US3] Add the chart strings to `frontend/vng/src/i18n/nl.json` and `frontend/vng/src/i18n/en.json`: `dashboard.cityPopulation` title, axis labels, the two series names, the excluded-count sentence, and the export column headers
- [X] T032 [P] [US3] Add the same chart keys to `frontend/govtech/src/i18n/nl.json` and `frontend/govtech/src/i18n/en.json`

**Checkpoint**: All three stories independently functional. Verify against `quickstart.md` §3, including the XLSX export and the cross-check against the Cities table.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T033 [P] Share one dataset between assemblers in `server/src/routes/dashboard.ts`: generate the graph once and pass it into both `assembleGemeenteDistribution` and `assembleCityPopulation` (add an optional `dataset` parameter to each), removing the second cold-cache `generateGraph` call documented in `plan.md` → Known Costs. Optional optimisation — behaviour must not change, both service tests must stay green
- [X] T034 [P] **Run: 4 passed, 4 skipped, 0 snapshots to update.** `pnpm run test:visual` executes the two constitution-§VII map guards (`tests/vng-map-nl-only.spec.mjs`, `tests/govtech-map-nl-only.spec.mjs`) — both PASS. The four Explorer visual-snapshot tests skip by design (they need `BASE_URL` or the absent `.prototype/alkemio-redesign`) and target the Explorer at `/analytics`, which does not use `DashboardApp`, so the four-to-six tab change cannot move them. Original task: run the visual-regression suite from the repo root (`pnpm run test:visual`) — the shared shell went from four tabs to six, so VNG/GovTech snapshots may legitimately shift; review each diff and update with `pnpm run test:visual:update` only where the change is the intended tab bar
- [X] T035 [P] Sweep both apps in both languages for raw i18n keys across all six tabs and the new chart (`nl` and `en`, VNG :5174 and GovTech :5175)
- [X] T036 Run the full gate set in the devcontainer: `pnpm -C server test`, `pnpm -C frontend/vng test`, `pnpm -C server exec tsc --noEmit`, and `run typecheck:native` in `frontend/vng`, `frontend/govtech`, `frontend/ecosystem-analytics`
- [~] T037 **Largely automated; the remainder needs a human + an Alkemio login.** `tests/vng-city-perspective.spec.mjs` now covers quickstart §1–§3 headlessly against the real UI with a mocked BFF (see §3b) — 7 checks, all passing. Still needs a human: real map tiles and real avatars, which the harness stubs. Original task: walk `specs/018-city-analysis/quickstart.md` end to end, including §5's manual regression sweep — all four original tabs, the graph→initiative-details `openSpace` bridge, and the GraphTab Netherlands-only map (constitution §VII)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: after Setup — **blocks US1 and US2**; does not block US3
- **US1 (Phase 3)**: after Phase 2
- **US2 (Phase 4)**: after Phase 2 (T019 alone also needs US1)
- **US3 (Phase 5)**: after Phase 1 — **can start immediately, in parallel with Phase 2**
- **Polish (Phase 6)**: after the stories you intend to ship

### User Story Dependencies

- **US1 (P1)**: needs only the foundational module. Fully standalone — the MVP.
- **US2 (P2)**: needs only the foundational module. FR-019 (entry from an initiative's gemeente grid) works without US1; only FR-018 (entry from the Cities table, T019) requires US1.
- **US3 (P3)**: no dependency on US1 or US2 — it ports the same rule server-side. Ship it alone if the chart is the priority.

### Critical File Serialisation

These files are touched by more than one task and must be edited **sequentially** (never marked `[P]` against each other):

| File | Tasks | Order |
|---|---|---|
| `frontend/shared/src/dashboard/pages/CitiesTab.tsx` | T004 → T005 → T006 → T007 → T008 → T019 | as listed |
| `frontend/shared/src/dashboard/pages/CityDetailsTab.tsx` | T012 → T013 → T014 → T015 | as listed |
| `frontend/shared/src/dashboard/App.tsx` | T009 → T016 → T017 | US1's tab, then US2's tab, then the bridge |
| `frontend/shared/src/dashboard/utils/cities.ts` | T003 | single task |
| `server/src/services/vng-dashboard-service.ts` | T025 → T026 (→ T033) | rule, then assembler |
| `server/src/routes/dashboard.ts` | T027 (→ T033) | attach, then optimise |
| `frontend/vng/src/i18n/*.json` | T010 → T020 → T031 | one per story |
| `frontend/govtech/src/i18n/*.json` | T011 → T021 → T032 | one per story |

### Parallel Opportunities

- **Across stories**: US3 (Phase 5) is independent of Phase 2, so it can run start-to-finish alongside Foundational + US1 + US2.
- **Within US1**: T010 ‖ T011 (different app packages).
- **Within US2**: T020 ‖ T021; T018 (SpaceDetailsTab) ‖ T012-T015 (CityDetailsTab).
- **Within US3**: T023 ‖ T024 (registry vs types); T031 ‖ T032.
- **Polish**: T033 ‖ T034 ‖ T035.

---

## Parallel Example: User Story 3

```bash
# Independent server groundwork, different files:
Task: "T023 Add municipalities() accessor in server/src/services/vng-registry.ts"
Task: "T024 Add CityPopulationSeries types in server/src/types/api.ts"

# After T026 lands, the two i18n packages in parallel:
Task: "T031 Add chart strings to frontend/vng/src/i18n/{nl,en}.json"
Task: "T032 Add chart strings to frontend/govtech/src/i18n/{nl,en}.json"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 → Phase 2 (T001-T003) — one tested aggregation rule
2. Phase 3 (T004-T011) — the Cities table
3. **STOP and VALIDATE**: `quickstart.md` §1, including the FR-028 cross-check against the Initiatives tab
4. Ship — city comparison already answers the highest-value question on its own

### Incremental delivery

1. Setup + Foundational → rule ready
2. + US1 → Cities table → demo (**MVP**)
3. + US2 → city profile + cross-navigation → demo
4. + US3 → population chart + export → demo
5. Polish

### Parallel team strategy

- Developer A: Phase 2 → US1 → US2 (the shared-frontend track; these serialise on `App.tsx` and the tab files)
- Developer B: US3 start-to-finish (the server + chart track — no overlap with A except the two i18n files, which are appended per story)
- Both converge on Phase 6

---

## Notes

- `pnpm run codegen` is **not** needed — this feature adds no GraphQL and touches no `.graphql` file.
- No cache-schema change, no new environment variable, no new dependency.
- The counting rule is stated once in `contracts/city-aggregation.md`. If it changes, T003 and T025 **and** both tests (T002, T022) change in the same commit — that is what keeps FR-028 true.
- Constitution §VII is a hard requirement: T014 reuses `InitiativeMap` rather than writing a map. Any deviation there blocks the change.
- Commit per task or per logical group; stop at any checkpoint to validate a story on its own.

---

## Post-implementation additions (not in the original breakdown)

- [X] T038 Add `tests/vng-city-perspective.spec.mjs` + `tests/fixtures/vng-city-fixtures.json` — a headless UI regression guard driving the real VNG dashboard with the BFF mocked at the network layer. Skips cleanly when no dev server is listening (same convention as the Explorer visual specs), so `pnpm run test:visual` stays green either way. Fixtures generated by the real `buildCityPopulationSeries` over the real 342-municipality registry.
- [X] T039 **Bug found and fixed (this feature)**: `CityDetailsTab` ignored the requested city on the mount triggered by `openCity` — this effect and the cross-tab effect run in the same commit, and the default-selection effect read a stale `selected` and clobbered it with the alphabetically first city. Fixed with a functional `setSelected` updater. FR-018/019 were broken before this.
- [X] T040 **Pre-existing bug found and fixed (outside this feature)**: `SpaceDetailsTab` had the identical race, so clicking any node in the Graph tab opened the FIRST initiative rather than the clicked one — T042/FR-015 from feature 016 was silently broken. Same one-line fix. Guarded by the new spec. **Drop this commit if you would rather fix it separately.**
- [X] T041 **Bug found and fixed (this feature)**: the chart tooltip called `toLocaleString()` with no locale, rendering `569,468` while the Cities table rendered `569.468`. Now formats with `i18n.language`.
- [X] T042 Chart legibility pass against real data: clamped the Y domain to `dataMax` (it was reserving space up to 8 for a maximum of 5), forced whole-number Y ticks (recharts produced 0/2/5), and lightened the non-participating rug (r 3.5 → 2.5, opacity 0.7 → 0.5) so the dense 10k–100k band reads as texture rather than a bar.
