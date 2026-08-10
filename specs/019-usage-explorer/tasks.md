---

description: "Task list for 019-usage-explorer"
---

# Tasks: Usage Explorer

**Input**: Design documents from `/specs/019-usage-explorer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. The design documents require them explicitly — `contracts/usage-aggregation.md` §8 lists ten binding test obligations, and constitution §VII makes the Netherlands-only Playwright specs a gate on the basemap extraction rather than an optional extra.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task serves (US1–US4)

## Path Conventions

Web application, pnpm workspace: `server/src/…` for the BFF, `frontend/shared/src/…` for code shared by every dashboard SPA, `frontend/vng/src/…` for VNG-only wiring, `tests/…` for root-level Playwright specs.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the baseline that later phases measure against, plus the small config and type surfaces every phase touches.

- [X] T001 Capture the constitution §VII baseline **before any code changes**: run `npx playwright test tests/vng-map-nl-only.spec.mjs tests/govtech-map-nl-only.spec.mjs` and archive the passing output/screenshots — this is the diff target for the T014 extraction gate
- [X] T002 Add `geo_cache_ttl_hours` (default `168`) to the `vng` and `govtech` dashboard profiles in `server/analytics.yml`, and surface it as `geoCacheTtlHours` in the `DashboardAppConfig` parsing in `server/src/config.ts`
- [X] T003 [P] Add `export const GEO_CACHE_SPACE_ID = '__gemeente_geo__';` to `server/src/cache/cache-service.ts` alongside `GD_CACHE_SPACE_ID`
- [X] T004 [P] Add `GemeenteLocation`, `GemeenteLocationSet`, and `GemeenteLocationsResponse` interfaces to `server/src/types/api.ts` per `data-model.md` (fields: `nameId`, `title`, `cbsCode`, `latitude`, `longitude`, `provinceCode`, `provinceName`; envelope: `locations`, `expected`, `withLocation`, `partial`, `fetchedAt`, `cached`)
- [X] T005 [P] Add optional `usageExplorer?: boolean` to the `AppConfig` interface in `frontend/shared/src/app/AppConfig.tsx`, and set `usageExplorer: true` in `frontend/vng/src/appConfig.ts` only (FR-003)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The location dataset, the extracted basemap, and the empty tab shell. Nothing in Phase 3+ can start until these land.

**⚠️ CRITICAL**: T012–T014 touch constitution-critical code. Do them as their own commits so a §VII regression bisects cleanly.

### Server — the gemeente location set

- [X] T006 Create `server/src/graphql/queries/gemeenteLocations.graphql` — an `organizationsPaginated(first, after, filter)` query selecting `nameID`, `profile.displayName`, and `profile.location.geoLocation { latitude longitude }`, plus `pageInfo` for cursoring (research R1)
- [X] T007 Run `pnpm -C server run codegen` and commit the regenerated `server/src/graphql/generated/` (constitution §II — generated files are committed, never hand-edited)
- [X] T008 Implement `server/src/services/gemeente-geo-service.ts`: page through `organizationsPaginated`, inner-join results against `loadVngRegistry()` entries having **both** `alkemioNameId` and `cbsCode` (342 today), emit `GemeenteLocation[]` sorted by `title` with `latitude`/`longitude` null when Alkemio holds no geo-location (FR-005, FR-005a, FR-005c)
- [X] T009 Add cache read/write to `gemeente-geo-service.ts` using `getCacheEntry`/`setCacheEntry` with `GEO_CACHE_SPACE_ID` and `geoCacheTtlHours`; a cache hit MUST NOT contact Alkemio (FR-005b), and an expired entry MUST NOT be deleted until a replacement is in hand (FR-030a)
- [X] T010 Attempt the `filter: { nameID: 'gemeente-' }` optimisation in `gemeente-geo-service.ts` behind a fallback to an unfiltered sweep; log which path ran, and keep the registry join as the correctness boundary regardless (research R1)
- [X] T011 [P] Write `server/src/services/gemeente-geo-service.test.ts` covering: exactly 342 eligible entries; Brugge/Gent excluded; a gemeente with null coordinates still emitted and counted in `expected − withLocation`; a cache hit issuing zero Alkemio calls; partial-sweep results marked `partial: true` with the short TTL
- [X] T012 Add `GET /gemeente-locations` to `server/src/routes/dashboard.ts` per `contracts/api-gemeente-locations.md` — no body, no query params, inheriting `authMiddleware` + `resolveUser`; return `200` (cached/fresh/partial/stale) or `503` when no data exists at all
- [X] T013 [P] Write route tests in `server/src/routes/` covering the failure matrix in the API contract: cache hit, cold sweep, partial sweep, total failure → `503`, and expired-plus-failed-refresh → `200` with the stale entry

### Frontend — extracting the Netherlands basemap (§VII)

- [X] T014 Create `frontend/shared/src/map/nl-basemap.ts` by **moving verbatim** the projection setup, tile rendering, and white-complement masking from `frontend/shared/src/graph/ForceGraph.tsx` (roughly lines 923–1075); expose `renderNlBasemap({ svg, group, region, width, height }) → { projection, renderTiles }`. No behavioural edits, no cleanups, no renames beyond what the extraction requires (research R6)
- [X] T015 Rewire `frontend/shared/src/graph/ForceGraph.tsx` to consume `renderNlBasemap` from `nl-basemap.ts`, deleting the inlined copy; export the new module from `frontend/shared/src/index.ts`
- [X] T016 **Extraction gate**: re-run `npx playwright test tests/vng-map-nl-only.spec.mjs tests/govtech-map-nl-only.spec.mjs` and diff against the T001 baseline. Any pixel difference means revert and retry — do **not** re-baseline (constitution §VII)

### Frontend — the tab shell

- [X] T017 Create `frontend/shared/src/map/UsageMap.tsx`: an SVG map calling `renderNlBasemap` with region `netherlands` **always** (never a masked province basemap — see plan.md "§VII / FR-013a interaction"), a single `d3.zoom` transform group, and an `onViewportChange` callback stub. No markers yet
- [X] T018 [P] Create `frontend/shared/src/dashboard/hooks/useGemeenteLocations.ts` fetching `GET /api/${apiNamespace}/gemeente-locations` via the shared `api` wrapper, following the `useDashboard.ts` pattern; cache the result for the session so tab switches do not refetch
- [X] T019 Create `frontend/shared/src/dashboard/pages/UsageExplorerTab.tsx`: map above, ranking region below, wired to `useGemeenteLocations` + `useSelectionContext`, reusing the dashboard's existing loading, empty-selection, and error presentations (FR-004, FR-032)
- [X] T020 Register the tab in `frontend/shared/src/dashboard/App.tsx` — add `'usage'` to `TabKey`/`TABS` and render `UsageExplorerTab`, **gated on `useAppConfig().usageExplorer`** so it appears in VNG only (FR-003)
- [X] T021 [P] Add `usageExplorer.*` translation keys to `frontend/vng/src/i18n/nl.json` and `frontend/vng/src/i18n/en.json` — tab label, legend labels, "N of M in view", municipality/participation counts, unplaced disclosure, and every empty/error state (FR-001)

**Checkpoint**: The tab opens, shows a Netherlands map with tiles and nothing outside the border, and the location endpoint serves 342 gemeentes. No markers yet.

---

## Phase 3: User Story 1 — See national initiative-usage coverage on a map (Priority: P1) 🎯 MVP

**Goal**: Every Dutch gemeente drawn — a dot sized linearly by initiative count (1 = smallest, selection max = 3×) or a grey square for none — at constant on-screen size, with hover identification and a size legend.

**Independent Test**: Open the tab with a selection active; confirm all 342 gemeentes are represented exactly once, that the largest dot measures exactly 3× the smallest, that zero-initiative gemeentes are grey squares, and that hovering shows a name and count matching the Cities view.

### Tests for User Story 1

- [X] T022 [P] [US1] Write the marker-geometry half of `frontend/vng/src/dashboard/usage.test.ts` per `contracts/usage-aggregation.md` §8 obligations 1–5 and 8–10: `diameter(1) = MIN` across several `maxCount` values; `diameter(maxCount) = 3 × MIN`; `maxCount ≤ 1` → all participating dots at MIN; zero count → square; `maxCount` computed selection-wide and unchanged by viewport; ineligible entries absent; unplaced gemeentes excluded but counted; counts agreeing with `buildCityRows` on a shared fixture

### Implementation for User Story 1

- [X] T023 [US1] Create `frontend/shared/src/dashboard/utils/usage.ts` with `buildUsageMarkers(cityRows, locations)` producing `UsageMarker[]` per `data-model.md` — joining on `nameId`, defaulting absent gemeentes to count 0, and **consuming** `CityRow.initiativeCount` without recounting (FR-029, aggregation contract §0)
- [X] T024 [US1] Implement the normative size formula in `usage.ts`: `MIN_DIAMETER`, `MAX_DIAMETER = 3 × MIN`, `maxCount` over all eligible gemeentes in the selection, and the anchored linear interpolation with the `maxCount ≤ 1` special case (FR-007, FR-008, FR-008a, FR-008b)
- [X] T025 [US1] Project each gemeente's lon/lat to static `(x, y)` once in `usage.ts` using the shared NL projection from `nl-basemap.ts`, memoised so zoom and pan never reproject (research R3/R5)
- [X] T026 [US1] Render markers in `frontend/shared/src/map/UsageMap.tsx`: `<circle>` for participating gemeentes, grey `<rect>` for zero-initiative ones with edge ≤ `MIN_DIAMETER` and distinguishable by both shape and colour (FR-006, FR-009)
- [X] T027 [US1] Counter-scale each marker group by exactly `1/k` on every zoom event in `UsageMap.tsx` so on-screen size is invariant — do **not** reuse or modify `ForceGraph`'s `effectiveRadius` `1/√k` behaviour (FR-015, research R4)
- [X] T028 [US1] Order marker rendering smallest-diameter-last (or equivalent hit-test handling) in `UsageMap.tsx` so small markers stay hoverable and selectable when overlapped by large ones (FR-011)
- [X] T029 [P] [US1] Add hover identification to `UsageMap.tsx` revealing the gemeente's name and its initiative count, reusing the dashboard's existing hover-card treatment (FR-010)
- [X] T030 [P] [US1] Add the size legend to `UsageExplorerTab.tsx` relating dot size to initiative count and including the grey zero-initiative marker; it must stay correct at every zoom, which T027 guarantees (FR-015a)
- [X] T031 [US1] Display the unplaced-gemeente disclosure in `UsageExplorerTab.tsx` from `expected − withLocation`, and render the stale/partial note when the location set reports it (FR-030, FR-030a)
- [X] T032 [US1] Add `tests/vng-usage-explorer-nl-only.spec.mjs` — the §VII guard for this third Dutch map, asserting nothing outside the Netherlands renders at national zoom and at high zoom near a land border

**Checkpoint**: US1 is independently demonstrable — the national coverage map stands alone with no ranking, province selector, or focus.

---

## Phase 4: User Story 2 — Read which initiatives are in use in the visible area (Priority: P1)

**Goal**: A ranked list under the map covering exactly the gemeentes in view, each entry reading "name — N of M in view", updating on zoom and pan.

**Independent Test**: Zoom to a region with a known gemeente set; confirm the list holds exactly the initiatives those gemeentes participate in, each count ≤ the visible total, the denominator identical across rows, and the order stable.

### Tests for User Story 2

- [X] T033 [P] [US2] Write the ranking half of `frontend/vng/src/dashboard/usage.test.ts` per `contracts/usage-aggregation.md` §8 obligations 6 and 7: tie-break ordering stable across repeated runs; denominator includes zero-initiative gemeentes; a gemeente appearing twice in the underlying data counted once (FR-028)

### Implementation for User Story 2

- [X] T034 [US2] Implement `computeVisibleArea(markers, transform, width, height)` in `frontend/shared/src/dashboard/utils/usage.ts` — invert the two viewport corners and test each marker's **anchor point**, not its bounds, returning `markers`, `total`, and `participating` (FR-016, FR-017, aggregation contract §4)
- [X] T035 [US2] Implement `buildAreaRanking(visibleMarkers)` in `usage.ts` using a `Map<initiativeId, Set<nameId>>` so distinctness is structural, sorted by `cityCount` descending then `name.localeCompare` ascending (FR-018, FR-020, FR-028)
- [X] T036 [US2] Wire `onViewportChange` in `frontend/shared/src/map/UsageMap.tsx` to emit the current `d3.zoomTransform`, throttled to animation frames during a gesture with a ~150 ms settle debounce (FR-021, SC-005, research R5)
- [X] T037 [US2] Build the ranked list in `frontend/shared/src/dashboard/pages/UsageExplorerTab.tsx`: each row showing name, count, and the shared denominator as "N of M in view" (FR-019, FR-019a, FR-019b)
- [X] T038 [US2] Display the visible-area totals in `UsageExplorerTab.tsx` — how many gemeentes are in view and how many of those participate (FR-017)
- [X] T039 [US2] Add the ranked-list empty state to `UsageExplorerTab.tsx` for a viewport containing no participating gemeente — explicit copy, never a blank region or an error (FR-022)
- [X] T040 [US2] Make each list row open the existing initiative detail view, reusing the `<app>:openSpace` event bridge that `CitiesTab` already uses for cross-tab navigation (FR-023)

**Checkpoint**: US1 + US2 together are the minimum viable feature — the map shows *where*, the list shows *what*.

---

## Phase 5: User Story 3 — Jump to a province (Priority: P2)

**Goal**: A province selector that reframes the map without masking, so neighbouring provinces' gemeentes stay visible and counted.

**Independent Test**: Select a province; confirm the map fits it, the surrounding country still renders, the visible set covers that province plus in-frame neighbours, and the ranking follows.

### Tests for User Story 3

- [X] T041 [P] [US3] Extend `tests/vng-usage-explorer-nl-only.spec.mjs` to assert that after selecting a province the basemap is still `netherlands` — neighbouring Dutch provinces visible (FR-013a) while everything outside the Netherlands stays white (§VII). These are different boundaries and the test must check both

### Implementation for User Story 3

- [X] T042 [US3] Add a province selector to `frontend/shared/src/dashboard/pages/UsageExplorerTab.tsx` listing the twelve provinces from `registry.provinces()` plus an "all of the Netherlands" option (FR-013)
- [X] T043 [US3] Implement province reframing in `frontend/shared/src/map/UsageMap.tsx` by computing a d3-zoom transform from the province bounds in `frontend/shared/src/map/province-basemaps.generated.ts` — using it as a **source of bounds only**, never switching the rendered basemap (FR-013a, plan.md §VII interaction)
- [X] T044 [US3] Ensure manual zoom and pan after a province choice override the framing and drive the visible set from the resulting viewport rather than the province boundary (FR-014)
- [X] T045 [US3] Add a reset-to-national control to `UsageMap.tsx`/`UsageExplorerTab.tsx` restoring the full Netherlands view and recomputing the ranking (FR-012)

**Checkpoint**: All three of map, ranking, and regional navigation work together.

---

## Phase 6: User Story 4 — Focus one municipality and see its neighbourhood (Priority: P3)

**Goal**: Select a gemeente to see its own initiatives beside the area ranking, with shared initiatives visually distinguished.

**Independent Test**: Select a gemeente on the map; its own initiative list appears separately, the area ranking's numbers are unchanged, and clearing the focus restores the default view.

### Tests for User Story 4

- [X] T046 [P] [US4] Add focus tests to `frontend/vng/src/dashboard/usage.test.ts` asserting that focusing changes **no** count, ordering, denominator, or diameter — focus is a presentation overlay only (aggregation contract §6)

### Implementation for User Story 4

- [X] T047 [US4] Add marker selection and clearing to `frontend/shared/src/map/UsageMap.tsx`, with a distinct focused-marker treatment (FR-024)
- [X] T048 [US4] Add the focused-gemeente panel to `frontend/shared/src/dashboard/pages/UsageExplorerTab.tsx` listing that gemeente's own initiatives separately from the area ranking, with an explicit "no initiatives" state for a zero-count gemeente (FR-025, US4 scenario 3)
- [X] T049 [US4] Set `usedByFocused` on ranking entries in `frontend/shared/src/dashboard/utils/usage.ts` and style those rows distinctly in the list, so initiatives the focused gemeente already uses are separable from those only its neighbours use (FR-026)
- [X] T050 [US4] Add a route from the focused panel into the existing city detail view via the `<app>:openCity` event bridge that `CitiesTab` and `InitiativeGemeentesPanel` already use (FR-027)
- [X] T051 [US4] Clear focus silently when the focused gemeente is no longer present after a selection change, preserving province framing where still valid (edge case)

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T052 Verify SC-006 and SC-007 with all 342 markers rendered — national view within 3 s of tab open, no perceptible stutter while zooming or panning; if the counter-scale pass in T027 is the bottleneck, batch the attribute writes rather than reaching for canvas (research R3)
- [X] T053 [P] Confirm graceful degradation end to end: unknown province, unknown population, missing initiative name, and a gemeente absent from the registry must none of them prevent the map or list rendering (FR-031, constitution §V)
- [X] T054 [P] Keyboard and screen-reader access for markers and ranked-list rows, matching the treatment used by the existing Cities table
- [X] T055 [P] Confirm every user-visible string resolves in both `nl` and `en` with no missing-key fallbacks, including the numeric interpolation in "N of M in view"
- [X] T056 Run `pnpm -C server exec tsc --noEmit`, `pnpm -C frontend/shared exec tsc --noEmit`, and `pnpm -C frontend/vng exec tsc --noEmit` — strict mode must pass on every touched package before merge (constitution Development Workflow)
- [ ] T057 Run the full `quickstart.md` verification table by hand, paying particular attention to the two boundaries that must hold simultaneously: province reframe does not mask other Dutch provinces, and nothing outside the Netherlands ever renders
- [X] T058 Update `specs/019-usage-explorer/research.md` R1 with what the live Alkemio API actually did — whether `OrganizationFilterInput.nameID` matched by prefix, and which rung of the fallback ladder shipped

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T001 must run before any source change or the §VII baseline is worthless.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks every user story.**
- **User Stories (Phases 3–6)**: All depend on Phase 2. US1 and US2 are both P1 and together form the MVP.
- **Polish (Phase 7)**: Depends on the stories being delivered.

### Critical path inside Phase 2

```
T006 → T007 (codegen) → T008 → T009 → T012        server: query → SDK → service → cache → route
T001 → T014 → T015 → T016                          §VII: baseline → extract → rewire → gate
T014 → T017 → T019 → T020                          shell: basemap module → map → tab → registration
```

T016 gates everything downstream of the map: if the extraction diff is not clean, no marker work should start on top of it.

### User Story Dependencies

- **US1 (P1)**: Needs Phase 2 only. Fully independent.
- **US2 (P1)**: Needs Phase 2 and `buildUsageMarkers` from T023. In practice US1 → US2; the ranking has nothing to rank without markers.
- **US3 (P2)**: Needs Phase 2 and US2's viewport computation (T034) to be meaningful.
- **US4 (P3)**: Needs Phase 2, US1's markers (selection target) and US2's ranking (the thing focus highlights against).

### Within each user story

- Tests before the implementation they pin — the aggregation contract's obligations exist to be failed first
- Pure functions in `utils/usage.ts` before the components that render them
- Map behaviour before the panel that reads it

### Parallel Opportunities

- **Phase 1**: T003, T004, T005 are three separate files — fully parallel after T002
- **Phase 2**: the server track (T006–T013) and the frontend basemap track (T014–T016) touch disjoint packages and can proceed simultaneously; T018 and T021 are independent of both
- **Phase 3**: T029 (hover) and T030 (legend) are parallel once T026 lands
- **Phase 7**: T053, T054, T055 are independent

---

## Parallel Example: Phase 2

```bash
# Two developers, disjoint file sets, no coordination needed:

# Developer A — server track
Task: "Create gemeenteLocations.graphql (T006)"
Task: "Run codegen and commit generated SDK (T007)"
Task: "Implement gemeente-geo-service.ts (T008, T009, T010)"
Task: "Add GET /gemeente-locations route (T012)"

# Developer B — frontend basemap track
Task: "Extract nl-basemap.ts from ForceGraph verbatim (T014)"
Task: "Rewire ForceGraph to consume it (T015)"
Task: "Run the §VII extraction gate (T016)"
Task: "Create the UsageMap shell (T017)"
```

---

## Implementation Strategy

### MVP scope

US1 **and** US2 together. Both are P1 for a reason: a coverage map with no ranking answers "where", and a ranking with no map has nothing to drive it. The stated goal — zoom into an area and see what nearby gemeentes use — needs both. US3 and US4 are genuine increments on top.

### Incremental delivery

1. Phase 1 + Phase 2 → tab opens with an empty, correctly-clipped NL map and a working location endpoint
2. Phase 3 (US1) → national coverage visible; demo-able alone
3. Phase 4 (US2) → **MVP complete**; the feature answers its core question
4. Phase 5 (US3) → regional navigation
5. Phase 6 (US4) → the neighbourhood comparison that motivated the feature
6. Phase 7 → polish

### Riskiest work first

T014–T016 (the basemap extraction) is the highest-risk change in the feature: constitution-critical code, a 2 877-line host component, and subtle winding-dependent geometry. It sits early in Phase 2 deliberately — discovering the extraction is unsafe *before* four phases of marker work are built on it is the whole point of that ordering.

---

## Notes

- `[P]` = different files, no dependency on incomplete work
- The aggregation contract (`contracts/usage-aggregation.md`) is normative; `usage.ts` and `usage.test.ts` change together or not at all
- Initiative counts are **inherited** from `buildCityRows` — five places already agree on that rule, and this feature must not become a sixth implementation
- Commit T014, T015, and T016 separately so a §VII regression bisects to a single change
- Stop at any checkpoint to validate a story independently

---

## Implementation Notes (recorded during /speckit.implement)

Deviations from the task list as written, and why. Recorded rather than silently absorbed.

**T013 — route tests substituted, not skipped.** The task asked for HTTP-level route tests. The
repo has no HTTP test harness: routes are tested by unit-testing extracted logic (see
`server/src/routes/image-proxy.test.ts`), and adding supertest would contradict plan.md's
"no new dependencies". The full failure matrix from the API contract — cache hit, cold sweep,
partial sweep with short TTL, total failure, expired-plus-failed-refresh, and per-user isolation —
is covered in `server/src/services/gemeente-geo-service.test.ts`, at the layer where the logic
actually lives. The route itself is a nine-line wrapper.

**T001/T016 — the §VII gate was weaker than the plan assumed, and was strengthened.** The two
existing NL-only Playwright specs reproduce the masking *algorithm* standalone (a red rectangle
stands in for tiles); they never load `ForceGraph`. They would therefore have passed no matter
what the extraction did to the component — the plan's stated mitigation did not hold. Before
touching `ForceGraph`, a new test was added (`frontend/vng/src/dashboard/nl-basemap.test.ts`)
asserting the **shipped** `buildComplementPath` produces exactly the path string those
pixel-verified specs prove correct. That completes the chain: pixels verified → reference path →
shipped code. Both gates were run before and after the extraction; both stayed green.

**T014 — extraction is a move plus one callback, not a pure verbatim move.** The GeoJSON `.then()`
in `ForceGraph` also pinned nodes, rebuilt the repulsion force, and restarted the simulation. That
work is not basemap logic and could not move. `renderNlBasemap` therefore exposes an `onGeoJson`
hook and `ForceGraph` does its simulation work there. The masking geometry itself moved verbatim.

**T032/T041 — no jsdom, so the map component is guarded by pure functions plus pixels.** Rendering
`UsageMap` in a test would need jsdom (a new dependency). Instead the province framing maths was
extracted as the pure, exported `provinceViewTransform`, and the §VII/FR-013a distinction is
pinned two ways: `usage-map.test.ts` asserts the basemap region is always `netherlands` and that
neighbouring territory stays inside a province frame, and `tests/vng-usage-explorer-nl-only.spec.mjs`
samples real pixels at national view, at province zoom (checking Gouda in Zuid-Holland is still
rendered beside a Utrecht frame), and at high coastal zoom.

**T052 and T057 remain OPEN.** Both need a live authenticated session against Alkemio, which this
environment cannot complete (OIDC redirect flow). What was verified without one: the server boots
with the new config, all three dashboards listen, and `GET /api/vng/gemeente-locations` returns 401
unauthenticated exactly as the existing dashboard routes do. Still unverified on real data: the
cold-sweep timing against production Alkemio, whether `OrganizationFilterInput.nameID` matches by
prefix (the code falls back to an unfiltered sweep if it does not — covered by a test), 60 fps pan
and zoom with all 342 markers, and the manual quickstart table.

**ESLint could not be run** — `@eslint/js` is not installed at the repo root. `tsc --noEmit` passes
on all four packages, which is the gate the constitution names.
