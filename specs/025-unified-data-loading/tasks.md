---

description: "Task list for feature 025 — Unified Data Loading"
---

# Tasks: Unified Data Loading

**Input**: Design documents from `/specs/025-unified-data-loading/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — the spec's Independent Tests and quickstart name concrete Vitest/Playwright checks (SC-001, SC-002a, SC-003, SC-004), so each story carries the tests that prove it. Write them alongside the implementation; they are not required to fail first.

**Organization**: Grouped by user story so each is an independently testable increment. Story order follows spec priority: US1 (load once) → US2 (joined-up progress) → US3 (fetch less) → US4 (three layers enforced).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- All paths are repository-relative

## Path Conventions

- BFF: `server/src/` (Express 5, codegen SDK, `better-sqlite3`)
- Shared frontend: `frontend/shared/src/` (`@ea/shared`), dashboards `frontend/vng/`, `frontend/govtech/`, Explorer `frontend/ecosystem-analytics/`
- E2E: `tests/*.spec.mjs` (Playwright)

---

## Phase 1: Setup (shared types, counters, fixtures)

**Purpose**: The type contracts and measurement hooks every story builds on.

- [X] T001 Add `LoadItemKey`, `LoadStage`, `LoadEvent` (union of `stage` / `item` / `result` / `error` exactly as data-model §3), `DashboardCountsBundle`, `ActivityRequest`/`ActivityItem` (`bySpace: Record<string, {day,week,month,total}>`, `fetchedAt`, `unavailable: string[]`), `OrganizationsRequest`/`ExtendedOrganizationProfile` (`description|tagline|website|contactEmail: string|null`, `references?`, `associateCount?`) and the two new optional `GraphGenerationRequest` flags `includeActivity?` / `includeExtendedProfiles?` (documented default `true` on the JSON path) to `server/src/types/api.ts`
- [X] T002 [P] Add synthetic cache-id helpers `activityCacheId(nameId) → '__activity__:<nameId>'` and `orgCacheId(orgId) → '__org__:<orgId>'` next to `GD_CACHE_SPACE_ID`/`GEO_CACHE_SPACE_ID` in `server/src/cache/cache-service.ts`, plus `isRelationalSpaceRow(spaceId)` (true when the id carries no `__` prefix) for the maintenance step
- [X] T003 [P] Add a per-request Alkemio request/byte counter to the SDK client factory in `server/src/graphql/client.ts` (wrap the `graphql-request` fetch; expose `getRequestStats(auth)` reset per `createAlkemioSdk` call) and print `requests=<n> bytes=<n>` on the existing `[Acquire] Acquired … space(s)` summary line in `server/src/services/acquire-service.ts` (research R9, needed for SC-004 / SC-002a)
- [X] T004 [P] Add the strip's i18n keys — `load.item.spaces|gd-initiatives|activity|organizations|gemeente-locations`, `load.stage.queued|loading|processing|done|failed`, `load.by.core|option:gd|tab:initiatives|tab:usage|tab:details`, `load.progress` ("{{done}} of {{total}}"), `load.retry`, `load.failed.*` — to `frontend/vng/src/i18n/en.json`, `frontend/vng/src/i18n/nl.json`, `frontend/govtech/src/i18n/en.json`, `frontend/govtech/src/i18n/nl.json`
- [X] T005 [P] Extend the Playwright BFF fixture used by `tests/vng-*.spec.mjs` (`tests/fixtures/`) with a route stub for `POST /api/graph/generate` that answers SSE when `Accept: text/event-stream` (a configurable sequence of `stage` events then `result`) and JSON otherwise, plus stubs for `POST /api/graph/activity` and `POST /api/graph/organizations`

---

## Phase 2: Foundational (the data layer skeleton every tab will read)

**Purpose**: The provider/store that US1 fills and US2/US4 extend. Nothing story-specific yet.

**⚠️ CRITICAL**: US1–US4 all mount on this.

- [X] T006 Create the external store in `frontend/shared/src/dashboard/data/store.ts`: holds `{ selection, plan: LoadPlan, data: LoadedData | null }`, `subscribe`/`getSnapshot` for `useSyncExternalStore`, reducers `beginLoad(loadKey)`, `applyEvent(loadKey, LoadEvent)`, `setData(loadKey, data)`, `setExtra(loadKey, key, value)`, `failItem`, `supersede(loadKey)`; events for a stale `loadKey` are ignored (data-model §2 rule "a superseded plan is discarded whole")
- [X] T007 Create `frontend/shared/src/dashboard/data/DashboardDataProvider.tsx` exposing the `DashboardData` context value from `contracts/dashboard-data-provider.md` (`selection`, `plan`, `data`, `refresh()`, `retry(item)`, `declare(item, requester)`), computing `loadKey` from `SelectionContext` per data-model §1 (`${app}|${sorted ids}|${gd?1:0}`; `refreshNonce` excluded), with the loading effect stubbed to call a `loadGraph` function injected via props/module so US1 and US2 can swap the transport
- [X] T008 [P] Create the read hooks `useLoadedData()`, `useLoadPlan()`, `useExtraItem(key, requester)` (declare on mount, no-op if already loaded/in flight, returns the item state) in `frontend/shared/src/dashboard/data/hooks.ts` and export them plus the provider from `frontend/shared/src/index.ts`
- [X] T009 [P] Create the derivation memo utility `memoiseByDataset(fn)` in `frontend/shared/src/dashboard/data/derive/memo.ts` — `WeakMap<GraphDataset, Map<string, Result>>` keyed on a stable serialisation of the non-dataset inputs (data-model §7) — with a Vitest spec `frontend/vng/src/dashboard/data/memo.test.ts` (shared code is tested from the VNG package, like `funnel.test.ts`) proving the same dataset + inputs returns the same object and a new dataset identity recomputes
- [X] T010 Mount `DashboardDataProvider` once in `frontend/shared/src/dashboard/App.tsx` inside `SelectionContext` and above the tab row, leaving every tab's mounting (`active === '…' && <Tab/>`) as it is

**Checkpoint**: provider mounts, store tests pass, no tab reads it yet.

---

## Phase 3: User Story 1 — Load once, browse every tab (Priority: P1) 🎯 MVP

**Goal**: One processed dataset per selection per page; every tab derives from it; tab switches issue zero requests; counts arrive with the dataset; selection/GD changes load exactly once.

**Independent Test**: quickstart Scenario 1 — after the strip clears, a tour of all nine tabs issues zero `api/` requests (SC-001); adding a Space or toggling GD produces exactly one `graph/generate`.

### Server — counts delivered with the dataset (FR-015)

- [X] T011 [US1] Refactor `assembleDashboard` in `server/src/services/vng-dashboard-service.ts` to read classification vocabularies/selections from the dataset nodes' `classificationEntries` (already fetched per Space) instead of calling `sdk.SpaceClassifications` per Space (research R0/R4); keep the exported function signature so `routes/dashboard.ts` still works
- [X] T012 [US1] Add `assembleDashboardBundle(userId, auth, spaceIds, dataset, profile): DashboardCountsBundle` in `server/src/services/vng-dashboard-service.ts` returning `categories.base`/`categories.withGd` and `distribution.base`/`distribution.withGd` (the `withGd` variants only when the dataset contains the GD layer) — computed from the one dataset, no further `generateGraph` calls
- [X] T013 [US1] In `server/src/routes/graph.ts` `/generate`, when `app` names a dashboard profile (`config.dashboards[app]`), attach `dashboard: DashboardCountsBundle` to the JSON response body (`{ ...dataset, dashboard }` is NOT allowed — return `GraphDataset` unchanged for non-dashboard callers and `{ dataset, dashboard }` only when the client sends the new `X-EA-Bundle: 1` header or `Accept: text/event-stream`; document in `contracts/api-graph-generate-stream.md`)
- [X] T014 [P] [US1] Vitest: `server/src/services/vng-dashboard-bundle.test.ts` — bundle from a fixture dataset with and without GD nodes yields `withGd` only in the GD case, and the mocked SDK records zero `SpaceClassifications` calls

### Frontend — loader, derivations, tab migration

- [X] T015 [US1] Implement `loadGraph()` (JSON transport for now) in `frontend/shared/src/services/graph-loader.ts`: `POST /api/graph/generate` with `{ spaceIds, app, includeInitiatives, forceRefresh, includeActivity: false, includeExtendedProfiles: false }` + `X-EA-Bundle: 1`, `AbortSignal` support, resolves `{ dataset, dashboard? }`; on 401 call `redirectToLogin()` (already once-guarded)
- [X] T016 [US1] Wire the provider's loading effect in `frontend/shared/src/dashboard/data/DashboardDataProvider.tsx`: on `loadKey` change abort the in-flight load, `beginLoad`, call `loadGraph`, `setData` on success; `refresh()` re-runs the same key with `forceRefresh: true` and re-requests every declared extra; keep previous `data` on screen until the new one lands (research R5)
- [X] T017 [US1] Resolve the VNG orchestrator candidates once per hub in the provider (fetch `GET /api/ecosystem/orchestrator/:hubNameId` through the existing `useOrchestratorChoice` plumbing in `frontend/shared/src/dashboard/hooks/useOrchestratorChoice.ts`) and fold them into `Selection.widenedSpaceIds` before the load (research R7), so the Ecosystem tab never triggers its own load
- [X] T018 [P] [US1] Create derivation modules wrapping the existing pure utils, each memoised with `memoiseByDataset`: `frontend/shared/src/dashboard/data/derive/initiativeRows.ts` (→ `utils/initiatives.ts`, filtered to `effectiveSpaceIds`, `extras.activity` optional), `derive/cityRows.ts` (→ `buildCityRows`), `derive/funnelModel.ts` (→ `utils/funnel.ts`), `derive/ecosystemModel.ts` (→ `utils/ecosystem.ts` + `utils/ecosystem-layout.ts`, widened dataset), `derive/usageView.ts`, `derive/counts.ts` (pick `base`/`withGd` per toggle), `derive/graphView.ts` (GraphTab's filter chain)
- [X] T019 [P] [US1] Expose derivation hooks `useInitiativeRows`, `useCityRows`, `useFunnelModel`, `useEcosystemModel`, `useUsageView`, `useCounts`, `useGraphView` in `frontend/shared/src/dashboard/data/derive/index.ts`, each reading `useLoadedData()` and returning `null` until core data exists
- [X] T020 [US1] Migrate `frontend/shared/src/dashboard/pages/DashboardTab.tsx` and `pages/FunnelTab.tsx` off `useDashboard`/`useVngGraph` onto `useCounts(toggles)` / `useFunnelModel()`; the GD checkboxes now only change the toggle passed to `useCounts` (no request)
- [X] T021 [US1] Migrate `pages/GraphTab.tsx`, `pages/SpaceDetailsTab.tsx`, `pages/InitiativesTab.tsx`, `pages/CitiesTab.tsx`, `pages/CityDetailsTab.tsx`, `pages/UsageExplorerTab.tsx`, `pages/EcosystemTab.tsx` (all under `frontend/shared/src/dashboard/pages/`) onto the derivation hooks + `useLoadPlan()`; delete every `useState` of dataset in those files; Ecosystem reads the widened dataset from the provider instead of requesting it
- [X] T022 [US1] Delete `frontend/shared/src/dashboard/hooks/useVngGraph.ts` and `hooks/useDashboard.ts` and remove their exports from `frontend/shared/src/index.ts`; run `pnpm -C frontend/vng run build` and `pnpm -C frontend/govtech run build` to prove no consumer remains
- [X] T023 [P] [US1] Vitest: `frontend/vng/src/dashboard/data/loader.test.ts` (the orchestration lives in the React-free `DashboardLoader`, so no DOM environment is needed) — mounting two consumers triggers one `loadGraph`; re-mounting a consumer after data exists triggers none; a `loadKey` change aborts the previous signal and keeps `data` until the new result; `refresh()` sends `forceRefresh: true` exactly once
- [X] T024 [P] [US1] Playwright: `tests/dashboard-load-once.spec.mjs` — with the SSE/JSON fixture from T005, load the hub, then visit all nine tabs and assert **zero** additional `api/` requests (SC-001); add one Space → exactly one `graph/generate`; GD on/off/on → exactly one extra `graph/generate`

**Checkpoint**: US1 complete — tabs never fetch; counts come with the dataset. (Strip not yet present: tabs still show their old local spinners, driven by `useLoadPlan().coreReady`.)

---

## Phase 4: User Story 2 — One joined-up progress indicator (Priority: P1)

**Goal**: Request-scoped SSE progress from the BFF (loading n-of-m, processing/augmenting, per-item done/failed), rendered by one non-blocking header strip identical on every tab, with per-tab placeholders only for genuinely absent data and per-item retry.

**Independent Test**: quickstart Scenario 2 — start a refresh on Dashboard, switch to Graph then Cities mid-load: one strip, progress never resets, disappears everywhere at once (SC-003); a failed extra item shows Retry and leaves other tabs untouched.

### Server — request-scoped reporter + SSE

- [X] T025 [US2] Create `server/src/services/progress/load-reporter.ts`: `LoadReporter` with `stage(item, stage, {done,total,current})`, `done(item)`, `failed(item, error)`, an `onEvent` sink, and `toGraphProgress()` adapter that keeps feeding today's per-user `progressMap` (`getProgress` in `server/src/services/graph-service.ts`) so the Explorer's poller is unchanged
- [X] T026 [US2] Thread a `LoadReporter` through `buildGraph`/`generateGraph` in `server/src/services/graph-service.ts` (optional parameter; default reporter = the existing `setProgress` behaviour): emit `stage spaces loading` with `done/total/current` (cached Spaces count as done immediately), `stage spaces processing` before transform/metrics/enrichment, `stage gd-initiatives loading|processing` + `item gd-initiatives done|failed` around `loadGdSubgraph`, and `item spaces done` at the end; a fully cached load emits only `processing` (contract rule for SC-002a)
- [X] T027 [US2] Add SSE negotiation to `POST /generate` in `server/src/routes/graph.ts`: when `Accept: text/event-stream`, validate first (same 400/401 JSON bodies), then set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, flush headers, write `event:`/`data:` frames per `LoadEvent`, a `: keep-alive` comment every 10 s, terminal `result` (`{ dataset, dashboard? }`) or `error` (`{ key, detail }`; Alkemio auth failure → key `session.expired` after `invalidateAndReject`-equivalent session invalidation), then `res.end()`; the JSON path stays byte-identical
- [X] T028 [P] [US2] Vitest: `server/src/routes/graph-stream.test.ts` — with the mocked SDK, an SSE request yields ordered `stage`→`item`→`result` frames; validation errors return 400 JSON before any frame; a thrown build yields a terminal `error` frame; `Accept: application/json` still returns the plain dataset
- [X] T029 [P] [US2] Vitest: `server/src/services/progress/load-reporter.test.ts` — event ordering, the `toGraphProgress` adapter mapping (`loading`→`acquiring`, `processing`→`transforming`, done→`ready`), and that a cached-only load emits no `loading` stage

### Frontend — stream transport, strip, placeholders

- [X] T030 [US2] Add `apiStream(path, body, onEvent, signal)` to `frontend/shared/src/services/api.ts` — `fetch` with `Accept: text/event-stream`, `credentials: 'include'`, incremental `ReadableStream` parsing of `event:`/`data:` frames (port the reader from `frontend/ecosystem-analytics/src/services/query-api.ts`), ignore comment lines, reject on premature close with `NetworkError`, 401 → `redirectToLogin()`
- [X] T031 [US2] Switch `loadGraph()` in `frontend/shared/src/services/graph-loader.ts` to `apiStream`, forwarding every `stage`/`item` event to the provider's `applyEvent` and resolving on `result`; keep the JSON call as an automatic fallback if the first response is not `text/event-stream`
- [X] T032 [US2] Create `frontend/shared/src/dashboard/components/LoadStrip.tsx` per `contracts/dashboard-data-provider.md`: renders nothing when `!plan.active` and no failed items; otherwise one strip listing items in plan order with `t('load.item.<key>')`, `t('load.by.<requester>')`, stage, `done/total`, current Space nameId, and a Retry button calling `retry(item)` for failed items; non-blocking, existing tokens/typography
- [X] T033 [US2] Mount `LoadStrip` in `frontend/shared/src/dashboard/App.tsx` directly below the tab row (inside the provider, outside the tab switch) for both the ≥`lg` layout and the compact scrollable-tab layout; confirm the page still never scrolls horizontally (`tests/mobile-navigation.spec.mjs`)
- [X] T034 [US2] Replace each tab's local spinner in `frontend/shared/src/dashboard/pages/*.tsx` with a placeholder shown only while the data **that tab** needs is absent (`!data` for core; `extras[key] === undefined` and the plan item not failed for extras) and a fallback message when the item failed (`load.failed.<key>`); remove all remaining `useGraphProgress` calls and delete `frontend/shared/src/dashboard/hooks/useGraphProgress.ts`
- [X] T035 [US2] Implement `retry(item)` in `frontend/shared/src/dashboard/data/DashboardDataProvider.tsx` (re-run the core load for `spaces`/`gd-initiatives`, re-request the extra for others) and report failures once per item (FR-011)
- [X] T036 [P] [US2] Playwright: `tests/dashboard-load-strip.spec.mjs` — drive the SSE fixture slowly: strip text and `done/total` continue across Dashboard→Graph→Cities (never reset), strip absent on all tabs after `result`; make the activity stub fail: strip shows the failed item + Retry, Cities renders fully, Initiatives shows the unavailable fallback (SC-003, FR-010, FR-011)

**Checkpoint**: US1 + US2 — one load, one strip, per-item failure isolation.

---

## Phase 5: User Story 3 — Only load what the dashboards use (Priority: P2)

**Goal**: Core load = relational data only, organisation core profile inline in the roles query (zero per-org lookups), activity and extended profiles as separately cached on-demand items, GD gemeente resolution in one lookup, users query trimmed, cache rows split with a one-time maintenance sweep, Explorer output unchanged.

**Independent Test**: quickstart Scenario 4 — force-refresh the default hub before/after: `requests=` and `bytes=` at least halved (SC-004); Scenario 3 — page reload shows `requests=0` (SC-002a); Scenario 5 — Explorer JSON output unchanged.

### GraphQL documents (Constitution II — regenerate after each change)

- [X] T037 [US3] Extend `server/src/graphql/fragments/communityRolesFragment.graphql` so `memberOrganizations`/`leadOrganizations` return `id nameID profile { displayName url avatar: visual(type: AVATAR) { uri } location { country city geoLocation { latitude longitude } } tagsets { name tags type } }` (research R2), then run `pnpm -C server run codegen` and commit `server/src/graphql/generated/`
- [X] T038 [P] [US3] Trim `server/src/graphql/queries/usersByIDs.graphql` to the rendered fields — `createdDate` KEPT (the Explorer's temporal view places nodes by it). `organizationByNameId` cannot carry a profile (`lookupByName.organization` returns only an id in the Alkemio schema), so the GD gemeente resolution stays two calls — off the core path and cached a week; run codegen
- [X] T039 [P] [US3] Keep `server/src/graphql/queries/organizationByID.graphql` as the **extended** profile document (description, tagline, website, contactEmail, references, associate count) — add a leading comment stating it is on-demand only; run codegen

### Services

- [X] T040 [US3] In `server/src/services/acquire-service.ts`: build the `organizations` map from the inline role profiles (dedupe by id across Spaces/subspaces) and **remove** the per-org `organizationByID` loop from `acquireSpaces`; gate the two `fetchActivityFeedChunked` sweeps behind a new `options.includeActivity` argument; update `RawOrganization` to the inline shape
- [X] T041 [US3] Create `server/src/services/activity-service.ts`: `loadActivity(userId, auth, spaceIds, { forceRefresh, reporter })` → per Space read `__activity__:<nameId>` row (`activityCacheId`, TTL `cache.ttl_hours`), sweep only missing Spaces with the existing chunked `ActivityFeedGrouped` calls (move `fetchActivityFeedChunked` here), compute `bySpace {day,week,month,total}` with the existing period logic from `server/src/transform/transformer.ts`, write rows, return `ActivityItem` with `unavailable` for unreadable Spaces (never throw for one Space)
- [X] T042 [US3] Create `server/src/services/organization-service.ts`: `loadExtendedProfiles(userId, auth, ids)` → `__org__:<orgId>` rows (24 h), fetch uncached ids one static `organizationByID` each, return `{ organizations, missing }`; cap 50 ids
- [X] T043 [US3] In `server/src/services/graph-service.ts` `buildGraph`: write per-Space relational rows **without** activity-derived fields (`edge.activityTier`, `node.totalActivityCount`, `spaceActivityTier`, `activityByPeriod`, `activityTimeline`) and without extended org fields; when `includeActivity !== false` compose `loadActivity` results into the transform (edges' tiers, node counts, metrics/insights as today); when `includeExtendedProfiles !== false` merge `loadExtendedProfiles` into organisation nodes — so the JSON path's output equals today's (FR-018) while the dashboards' stream (`false`/`false`) carries relational data only
- [X] T044 [US3] ~~Refactor `resolveGemeenteOrgNode` to one call~~ — not possible (see T038); unchanged
- [X] T045 [US3] Bump `CACHE_MAINTENANCE_VERSION` 3 → 4 in `server/src/cache/cache-service.ts` with a step that deletes every row where `isRelationalSpaceRow(space_id)` **and** `space_id = GD_CACHE_SPACE_ID`, keeping `GEO_CACHE_SPACE_ID` (data-model §6); extend `invalidateCache` on force refresh to also drop the user's `__activity__:*` and `__org__:*` rows

### Routes

- [X] T046 [US3] Add `POST /activity` (`ActivityRequest` → `ActivityItem`, same `spaceIds`/`max_spaces_per_query` validation, `isAlkemioAuthError` → `invalidateAndReject`) and `POST /organizations` (`OrganizationsRequest`, 400 over 50 ids) to `server/src/routes/graph.ts`, both logging `err.stack` like `/generate`
- [X] T047 [US3] Pass `includeActivity`/`includeExtendedProfiles` from the request body through `generateGraph` in `server/src/routes/graph.ts` and `server/src/routes/dashboard.ts` (dashboard route: `false`/`false`); add both flags to `datasetMemoKey` in `server/src/services/graph-service.ts` so variants never collide in the memo
- [X] T048 [P] [US3] Vitest: `server/src/services/activity-service.test.ts` (cache hit → zero SDK calls; partial miss → sweeps only missing Spaces; unreadable Space → `unavailable`), `server/src/services/organization-service.test.ts` (uncached ids fetched once, second call zero SDK calls, >50 ids → error), and extend `server/src/services/acquire-service.test.ts` to assert zero `organizationByID` calls on the core path and zero `ActivityFeedGrouped` calls when `includeActivity: false`
- [X] T049 [P] [US3] Vitest: extend `server/src/services/graph-memo.test.ts` / `graph-service` tests — relational cache rows contain no `activityTier`/`activityByPeriod`/`website`; JSON-path default (`includeActivity`/`includeExtendedProfiles` omitted) output equals the pre-split fixture; maintenance v4 removes plain-nameId rows and keeps `__gemeente_geo__`

### Frontend — declare the extras

- [X] T050 [US3] In `frontend/shared/src/dashboard/pages/InitiativesTab.tsx` declare `useExtraItem('activity', 'tab:initiatives')`; the provider (`DashboardDataProvider.tsx`) loads it via `POST /api/graph/activity { spaceIds }` once per `loadKey`, stores `extras.activity`, and `derive/initiativeRows.ts` merges `bySpace` into the activity columns (unavailable Spaces render the fallback)
- [X] T051 [US3] In `frontend/shared/src/dashboard/pages/UsageExplorerTab.tsx` declare `useExtraItem('gemeente-locations', 'tab:usage')`; move the `useGemeenteLocations` fetch into the provider so it is announced in the strip and loaded once per page (delete the module-level promise cache in `frontend/shared/src/dashboard/hooks/useGemeenteLocations.ts` or reduce it to a thin wrapper over the provider)
- [X] T052 [US3] (No dashboard view renders extended organisation fields today — `useExtraItem('organizations', 'tab:details', ids)` is wired and tested for the first one that does; the Ecosystem guess already null-safes `tagline`/`description`.) Where a dashboard view opens an organisation's details (`frontend/shared/src/dashboard/pages/SpaceDetailsTab.tsx` organisation list / shared details drawer), declare `useExtraItem('organizations', 'tab:details')` with the opened ids so description/website/references load on demand via `POST /api/graph/organizations`; the Ecosystem orchestrator profile-guess in `frontend/shared/src/dashboard/utils/ecosystem.ts` falls back to `displayName` when `tagline`/`description` are absent
- [X] T053 [P] [US3] Playwright: extend `tests/dashboard-load-once.spec.mjs` — opening Initiatives triggers exactly one `graph/activity` and re-opening none; opening Usage Explorer triggers exactly one `gemeente-locations`; the request bodies of `graph/generate` carry `includeActivity: false` and `includeExtendedProfiles: false`

**Checkpoint**: US3 — core path = `S + U + 1` platform requests; extras on demand; Explorer unchanged.

---

## Phase 6: User Story 4 — Loading, deriving and displaying are three separate things (Priority: P2)

**Goal**: The layering is enforced, documented and cheap to follow for the next tab.

**Independent Test**: trace any tab: it reads a derivation hook + `useLoadPlan()`; derivations read `useLoadedData()`; only the provider/loader import `api`. The guard test fails if a page or derive module imports `api`/`apiStream`/`fetch`.

- [X] T054 [US4] Add an architecture guard test `frontend/shared/src/dashboard/data/layering.test.ts` that reads every file under `frontend/shared/src/dashboard/pages/`, `dashboard/components/`, `dashboard/utils/` and `dashboard/data/derive/` and fails if any imports `../services/api`, `apiStream`, `graph-loader`, or calls `fetch(` — with an allow-list containing only `DashboardDataProvider.tsx`, `hooks.ts` and `graph-loader.ts`
- [X] T055 [P] [US4] ~~dev-only throw on a duplicate load~~ — replaced by a structural guarantee: `DashboardLoader.setSelection` is a no-op for the same key while its load is live or its data is present (and resumes after a StrictMode rehearsal unmount); pinned by `loader.test.ts` ("loads a key once", "resumes a load that a dispose() aborted"). A throw would have fired on legitimate core retries.
- [X] T056 [P] [US4] Write `frontend/shared/src/dashboard/data/README.md` (≤ 1 page): the three layers, how a new tab declares an extra item, how to add a derivation with `memoiseByDataset`, and the "tabs never hold dataset state" rule; link it from the Speckit/architecture section of `CLAUDE.md` (one bullet under Architecture: "Dashboard data loading: one provider, derivations, display — see `frontend/shared/src/dashboard/data/README.md`")
- [X] T057 [US4] Vitest: `frontend/shared/src/dashboard/data/derive/derive.test.ts` — for each derivation hook, two consumers with identical inputs receive the same object reference; changing a non-dataset input recomputes; a tab switch (unmount/remount of a consumer) does not recompute (FR-006, US4 scenarios 1–2)

**Checkpoint**: all four stories independently verifiable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T058 [P] Update `CLAUDE.md` Architecture with the new data flow (generate stream + on-demand items + cache row kinds) and add the feature's line to "Active Technologies" / "Recent Changes" by hand (the plan step no longer does this)
- [X] T059 [P] Update `specs/025-unified-data-loading/contracts/api-graph-generate-stream.md` with the final frame shapes and the `X-EA-Bundle` header decision from T013; update `quickstart.md` if any step changed
- [X] T060 Run `tsc --noEmit` on `server/` and every `frontend/*` package, `pnpm run test` in `server/`, `frontend/shared/`, `frontend/vng/`, `frontend/ecosystem-analytics/`, then `pnpm run test:visual`; review and accept the header-strip snapshot deltas only (SC-006)
- [X] T061 Execute `specs/025-unified-data-loading/quickstart.md` Scenarios 1–6 — 1/2/3/6 automated and green; **4 and 5 (real Alkemio request counts, Explorer parity) remain manual: they need a signed-in session**, recorded as pending in `research.md` §R0
- [X] T062 Confirm `docker build` succeeds and the image's `/app/dist/data/vng/meta.json` exists (the `cp -R src/data/. dist/data/` fix from `68c94301` is still in place)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies; T002–T005 in parallel after T001.
- **Foundational (Phase 2)**: needs T001; T008/T009 in parallel after T006/T007; T010 last. Blocks every story.
- **US1 (Phase 3)**: needs Phase 2. Server T011→T012→T013 (T014 parallel); frontend T015→T016→T017, T018/T019 parallel with the server work, then T020→T021→T022; T023/T024 once T016 and T021 exist.
- **US2 (Phase 4)**: needs US1's provider/loader (T016) and T005's fixture. Server T025→T026→T027 (T028/T029 parallel); frontend T030→T031→T032→T033→T034→T035; T036 after T033.
- **US3 (Phase 5)**: independent of US2 on the server side (can run in parallel with Phase 4 by a second developer): T037→T038/T039→T040→T041/T042→T043→T044→T045→T046→T047, tests T048/T049 parallel; frontend T050–T052 need US1's `useExtraItem` (T008) and the routes (T046); T053 after T050/T051.
- **US4 (Phase 6)**: needs US1–US3 file layout in place; T054–T057 mostly parallel.
- **Polish (Phase 7)**: after all stories.

### Story completion order

US1 (MVP) → US2 → US3 → US4. US2 and US3 can proceed concurrently once US1 is merged; US4 last because its guard test must see the final files.

### Parallel execution examples

- **US1**: `T014` (bundle test) ‖ `T018` (derive modules) ‖ `T019` (derive hooks) while `T011–T013` land on the server; `T023` ‖ `T024` at the end.
- **US2**: `T028` ‖ `T029` ‖ `T036` (tests) while `T030–T035` proceed; server `T025–T027` ‖ frontend `T030–T032` (different packages).
- **US3**: after `T037`, `T038` ‖ `T039`; `T041` ‖ `T042`; `T048` ‖ `T049` ‖ `T053`.
- **US4**: `T055` ‖ `T056` ‖ `T057` after `T054`.

---

## Implementation Strategy

1. **MVP = Phase 1 + 2 + US1** (T001–T024): tabs stop reloading, counts arrive with the dataset, one request per selection. Ship-able on its own — the old per-tab spinners keep working off `coreReady`.
2. **US2** adds the stream and the strip — the visible proof of the change and the fix for the guest progress collision.
3. **US3** delivers the platform-load reduction; its server half is independent of US2 and can be developed in parallel. The maintenance bump (T045) goes out with it so no pre-split cache row is ever served as relational-only.
4. **US4** locks the architecture in with a guard test and a one-page README so the "each tab loads for itself" pattern cannot creep back.

Every task names its file(s); tests are colocated with the code they prove (`*.test.ts` next to the module, Playwright under `tests/`).
