# Tasks: VNG Ecosystem Map

**Input**: Design documents from `/specs/024-vng-ecosystem-map/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-ecosystem-orchestrator.md, quickstart.md

**Tests**: Included — the plan lists them explicitly and every prior VNG feature (018/019/022) ships vitest + Playwright coverage in the same locations. Unit tests are written *before* the module they cover so the pure modules are driven by their invariants.

**Organization**: Tasks are grouped by user story. US1 (the map) is the MVP; US2 (orchestrator control) and US3 (bridges) layer on it.

**Revised after `/speckit.analyze` (2026-09-21)** — two decisions changed this list:
- **C1 (constitution §IV)**: the community preset is readability-filtered server-side before it reaches the browser (T028–T030), so a Space the caller cannot read never appears in a response.
- **I1 (build-breaker)**: the built-in table and a **read-only `GET`** move into Phase 2 (T012–T015), so US1 consumes the endpoint instead of importing a server file the frontend cannot reach (`@server/types/*` is the only alias, and it is types-only). US2 then adds the store, `PUT`/`DELETE` and the real `own`/`community` — the response shape never changes, so nothing US1 writes gets rewritten.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 = map, US2 = orchestrator control, US3 = drill-through
- Every path is repo-relative

## Path Conventions

Web app, existing layout: `server/src/` (BFF), `frontend/shared/src/` (`@ea/shared`, all UI), `frontend/vng/src/` (config, i18n, unit tests), `tests/` (Playwright).

---

## Phase 1: Setup

**Purpose**: Wire the tab into the shell and the app so every later task has a place to render.

- [X] T001 Add `ecosystem?: boolean` to `AppConfig` with a doc comment matching `funnel`'s in `frontend/shared/src/app/AppConfig.tsx`
- [X] T002 Add `'ecosystem'` to `TabKey`, insert `...(cfg.ecosystem ? (['ecosystem'] as TabKey[]) : [])` after `intake` and before `'graph'` in `TABS`, and render `{active === 'ecosystem' && <EcosystemTab />}` inside the `ErrorBoundary` in `frontend/shared/src/dashboard/App.tsx` (import from `./pages/EcosystemTab.js`)
- [X] T003 [P] Create a placeholder `EcosystemTab` (renders `t('ecosystem.title')`) and export it from `frontend/shared/src/dashboard/pages/EcosystemTab.tsx`
- [X] T004 [P] Set `ecosystem: true` with a `// Feature 024 — the ecosystem map. VNG-only for now.` comment in `frontend/vng/src/appConfig.ts`
- [X] T005 [P] Add `tabs.ecosystem` ("Ecosystem" / "Ecosysteem") and the full `ecosystem.*` key block from plan.md §Design Notes 7 to `frontend/vng/src/i18n/en.json` and `frontend/vng/src/i18n/nl.json` (both languages, every key)
- [X] T006 [P] Add `'Ecosysteem'` before `'Graph'` in `TAB_NAMES` (and fix the "eight tabs" comment to nine) in `tests/mobile-navigation.spec.mjs`

**Checkpoint**: `pnpm -C frontend/vng dev` shows a ninth "Ecosysteem" tab rendering a title; `tsc --noEmit` passes in `frontend/shared` and `frontend/vng`.

---

## Phase 2: Foundational — the derived model + the built-in default endpoint

**Purpose**: The pure ecosystem model every story reads, and the read-only orchestrator endpoint US1 needs so no component ever hardcodes the built-in table. Blocking for US1–US3.

### The model

- [X] T007 Write unit tests for the model in `frontend/vng/src/dashboard/ecosystem.test.ts` covering, with a hand-built `GraphDataset` (2 listed L0 Spaces, 1 unlisted orchestrator L0, one L1 and one L2 under a listed Space, 5 organisations incl. one gemeente, LEAD/MEMBER org edges, USER/ADMIN edges to ignore): (a) listed vs unlisted → `initiatives` / `orchestrator` / `EcoSpace.listed`; (b) L2 role rolls up to its L0 with `provenance: 'viaSubspace'` and `subspaceIds` filled; (c) L0 + L1 roles → `provenance: 'direct'`, `strength: 'lead'` when either is LEAD; (d) one connection per org–L0 pair; (e) `orgCount` counts distinct orgs incl. via-subspace; (f) `isConnector`, `linkedToOrchestrator`, `multiMembership` flags; (g) `spaceLinks` = one `partOf` per initiative, none when orchestrator is null; (h) no self-links, USER nodes absent; (i) two `EcosystemInput`s sharing an org → one `EcoOrganisation` with two `ecosystemIds`
- [X] T008 Write unit tests for `resolveOrchestrator` and `guessOrchestrator` in the same file `frontend/vng/src/dashboard/ecosystem.test.ts`: own > community > builtIn > guess; a candidate absent from the dataset is skipped; `builtInMissing` set only when `builtIn` is non-null and absent; guess prefers a profile hit ("Kenniscentrum Innovatie" tagline) over overlap, then overlap ≥ 2, returns null when nothing qualifies, and tie-breaks by displayName (SC-007 holds only for candidates — an orchestrator outside the candidate set is not guessable by design)
- [X] T009 Write unit tests for `applyFilters` in `frontend/vng/src/dashboard/ecosystem.test.ts`: each filter alone, both (intersection), hidden count, Spaces and `spaceLinks` untouched, `orgCount` unchanged by filters
- [X] T010 Implement the model per data-model.md §1 in `frontend/shared/src/dashboard/utils/ecosystem.ts`: export types (`Ecosystem`, `EcoSpace`, `EcoOrganisation`, `OrgConnection`, `SpaceLink`, `EcosystemModel`, `EcosystemFilters`, `OrchestratorSource`, `EcosystemInput { hubNameId, hubDisplayName, listedSpaceNameIds, selectedSpaceNameIds, orchestratorNameId | null, orchestratorSource | null }`), `buildEcosystemModel(dataset, inputs: EcosystemInput[])`, `topLevelAncestor(nodeId)` via `parentSpaceId`, `resolveOrchestrator({ candidatesInDataset, own, community, builtIn, guess })`, `guessOrchestrator(dataset, candidateNameIds)` with the R6 keyword regex, `applyFilters(model, filters) → { model, hiddenCount }`, `candidateSpaces(model, extraNameIds)`; header comment must state the R7 difference from `utils/initiatives.ts`'s direct-only gemeente count
- [X] T011 Run `pnpm -C frontend/vng test -- ecosystem` until T007–T009 pass

### The built-in default, served (I1)

- [X] T012 [P] Create `server/src/data/ecosystem/orchestrators.ts` exporting `BUILT_IN_ORCHESTRATORS: Readonly<Record<string, string>> = { 'vih-test': 'programmagroei', vih: 'programmagroei' }` with a header comment: stopgap until Alkemio can designate an orchestrator; keyed by hub nameID; a code change to alter (spec Q5); acceptance hub deliberately absent
- [X] T013 [P] Write `server/src/routes/ecosystem.test.ts` for the read-only endpoint (pattern: `image-proxy.test.ts`): 401 without a session; 400 when `:hubNameId` fails `^[a-z0-9-]{1,64}$`; 200 returning exactly `{ hubNameId, own: null, community: null, builtIn }` with `builtIn` from the table and `null` for an unknown hub
- [X] T014 Implement `server/src/routes/ecosystem.ts` — `ecosystemRouter`, `router.use(resolveUser)`, the nameId guard, `GET /orchestrator/:hubNameId` answering `own: null, community: null, builtIn` (no database yet; the shape is final per the contract), logging hub/space nameIds only — and mount `app.use('/api/ecosystem', ecosystemRouter)` in `server/src/app.ts`
- [X] T015 Implement the read half of `useOrchestratorChoice(hubNameId)` in `frontend/shared/src/dashboard/hooks/useOrchestratorChoice.ts`: GET via `api` on mount and on hub change, expose `{ own, community, builtIn, loading, error }`; `choose()` / `reset()` are added in T031

**Checkpoint**: model tests green, and `curl -b <session> localhost:4000/api/ecosystem/orchestrator/vih-test` returns `builtIn: "programmagroei"`.

---

## Phase 3: User Story 1 — See the VIH ecosystem map (Priority: P1) 🎯 MVP

**Goal**: Cloud, orchestrator at centre, initiative cards with counts, organisation logo circles, weighted/styled lines, connectors emphasised, hover highlighting, filters, pan/zoom, responsive. The orchestrator comes from the Phase-2 endpoint's `builtIn` (own/community are always null until US2).

**Independent Test**: sign in, VIH selected, open Ecosystem: one cloud, `programmagroei` at the centre (fetched in addition to the 23 listed Spaces), 23 cards with `· N`, "VNG Kenniscentrum Innovatie" emphasised, filters reduce the map and show the hidden count, page never scrolls horizontally at 390 px.

### Layout (pure)

- [X] T016 [P] [US1] Write unit tests in `frontend/vng/src/dashboard/ecosystem-layout.test.ts`: identical output on two runs (determinism); orchestrator at the region centre; every initiative at the ring radius (± 0.5 px) with distinct angles; every organisation outside the ring radius; an organisation shared by two regions lands between their centres (x strictly between); cloud path is a closed `M…Z` string containing every Space position inside its hull; `bounds` encloses every drawn position; no NaN with 0 initiatives, 1 initiative, or no orchestrator
- [X] T017 [US1] Implement `layoutEcosystems(model: EcosystemModel, size: { width, height }): EcosystemLayout` in `frontend/shared/src/dashboard/utils/ecosystem-layout.ts` per research R5: regions on a row sized by Space count; orchestrator fixed at centre, initiatives fixed on a ring; organisations seeded at the centroid of their connected Spaces pushed outward by index angle, then `forceSimulation(...).stop()` with `forceLink` (org→Space), `forceCollide`, `forceRadial` per region (outside the ring), `forceManyBody` weak, run `tick(300)` synchronously; cloud = `polygonHull` of Space positions padded by the card radius, rendered via `line().curve(curveBasisClosed)`; return `{ regions: [{ id, cx, cy, cloudPath, label }], spaces: Map<id,{x,y}>, orgs: Map<id,{x,y}>, bounds }`
- [X] T018 [US1] Run `pnpm -C frontend/vng test -- ecosystem-layout` until T016 passes

### Renderer

- [X] T019 [US1] Implement `EcosystemMap` in `frontend/shared/src/dashboard/components/EcosystemMap.tsx` — props `{ model, layout, filters, hoverId, onHover, onActivateSpace(nameId), onActivateOrg(org), transform, onTransformChange }`; React-rendered SVG with `<g transform>` driven by `d3-zoom` attached to the `<svg>` (scaleExtent 0.3–4, wheel + drag + touch); **fit-to-view**: compute the transform that fits `layout.bounds` into the viewport and apply it on mount, on a `bounds` change, and when the parent raises the fit action (FR-021); draws per contract: `<g data-ecosystem>` + `<path class="eco-cloud">` + region label; `<line data-edge="partOf">` (lightest, always); `<line data-edge="org" data-strength data-provenance>` (width 1.25/2.5, `stroke-dasharray` for viaSubspace); initiative cards `<g data-space data-role="initiative">` (rounded rect, name, `· N` when `orgCount>0`); orchestrator `<g data-role="orchestrator">` (larger, filled with the dashboard primary token, bold label); organisation `<g data-org data-connector>` circles (r 14; connectors r 20 + ring stroke) with `<image clipPath>` logo via `proxyImageUrl` and `isImageFailed`/`markImageFailed` from `../../lib/badImageCache.js`, initials `<text>` fallback (extract the two-letter rule from `UserMenu.tsx` into `frontend/shared/src/lib/initials.ts` and import it in both files); hover/focus (`tabIndex=0`, `role="button"`, Enter/Space activates) sets `hoverId`, unrelated nodes/edges get `opacity .15`; Escape clears; filtered-out organisations are not rendered
- [X] T020 [P] [US1] Implement `EcosystemFilterBar` in `frontend/shared/src/dashboard/components/EcosystemFilterBar.tsx` — two `checkbox` inputs (`ecosystem-filter-orchestrator`, `ecosystem-filter-multi`) using `ui/checkbox.tsx`, hidden count `ecosystem-filter-hidden` (absent when 0), clear button `ecosystem-filter-clear` (visible iff any on), fit-to-view button `ecosystem-fit` wired to the T019 fit action, and a legend (lead/member/direct/viaSubspace/partOf/connector) styled like `TableFilterBar`
- [X] T021 [P] [US1] Implement `useEcosystemViewState(hubNameId)` in `frontend/shared/src/dashboard/hooks/useEcosystemViewState.ts` — `{ filters, setFilters, transform, setTransform, guestChoice, setGuestChoice }` persisted to `sessionStorage` under `${storagePrefix}:ecosystem:${hubNameId}` (read `storagePrefix` via `useAppConfig()`), try/catch on every storage access, defaults `{ filters: {false,false}, transform: null }`
- [X] T022 [US1] Compose `EcosystemTab` in `frontend/shared/src/dashboard/pages/EcosystemTab.tsx`: read `activeHubNameId`, `hubs` (for display name), `state.hubSpaceIds`, `effectiveSpaceIds`, `refreshNonce` from `useSelectionContext()`; call `useOrchestratorChoice(activeHubNameId)` (T015) and `useVngGraph([...new Set([...effectiveSpaceIds, own, community, builtIn].filter(Boolean))], { refreshNonce })`; resolve, build model, apply filters, `ResizeObserver` the host (min height 480 px, fills the panel like `FunnelTab`), memoise `layoutEcosystems`; render `EcosystemFilterBar` + `EcosystemMap`; loading state with `Loader2` like `FunnelTab`; error state reusing the dashboard's standard error pattern with a retry calling `reload()`; empty states `ecosystem-empty` for no hub / no Spaces / no organisations match; show the FR-013 notice `ecosystem-orchestrator-notice` when `builtInMissing`
- [X] T023 [US1] Responsive pass in `EcosystemTab.tsx` / `EcosystemMap.tsx`: the SVG fills its container (`width:100%`, `touch-action:none` on the svg only), the filter bar wraps at `useIsCompact()`, and nothing sets a `min-width` wider than the viewport — verify at 390/820/1440 px with `pnpm run test:visual -- mobile-navigation`, checking also that no node label is clipped and no rendered text falls below 10px (SC-005)

### End-to-end

- [X] T024 [P] [US1] Create `tests/fixtures/vng-ecosystem-fixtures.json` by copying `tests/fixtures/vng-city-fixtures.json`'s shape and adding: an unlisted L0 `programmagroei` ("Kenniscentrum Innovatie"), an L1 under one listed Space with a MEMBER org edge from a gemeente org, one org LEAD on `programmagroei` and MEMBER on two initiatives (connector), one org MEMBER on a single initiative, and the hub payload listing the L0s minus `programmagroei`
- [X] T025 [US1] Write `tests/vng-ecosystem.spec.mjs` modelled on `tests/vng-funnel.spec.mjs` (mocked BFF routes: `/api/hubs*`, `/api/graph/generate`, `/api/vng/dashboard`, `/api/ecosystem/orchestrator/*` → `{ own:null, community:null, builtIn:'programmagroei' }`): asserts one `[data-ecosystem]`, `[data-role="orchestrator"][data-space="programmagroei"]`, initiative count = listed count, a `[data-edge="org"][data-provenance="viaSubspace"]` exists, `[data-connector="true"]` count ≥ 1, `[data-edge="partOf"]` count = initiative count, card text contains `· N`, hovering an org dims unrelated nodes, `ecosystem-filter-multi` removes the single-initiative org and shows `ecosystem-filter-hidden`, clear restores, the first `[data-ecosystem]` is visible **within 3 s** of the tab click with routes pre-mocked (SC-003), and `document.documentElement.scrollWidth <= clientWidth` at 390 px

**Checkpoint**: US1 demonstrable end-to-end against the Phase-2 endpoint; no database involved yet.

---

## Phase 4: User Story 2 — Confirm or correct the orchestrator (Priority: P2)

**Goal**: Dropdown of candidate Spaces, source badge, reset, per-user cross-device memory, readability-filtered community preset, guess fallback, FR-013 notice.

**Independent Test**: change the select → map re-centres < 1 s, badge "your choice", reload/other browser keeps it; second user sees "chosen by other viewers"; reset clears.

### Server: store, readability filter, write routes

- [X] T026 [P] [US2] Add the `orchestrator_choices` table + `idx_orchestrator_choices_hub` index (data-model.md §2) to the `db.exec` block in `server/src/cache/db.ts`
- [X] T027 [P] [US2] Write `server/src/cache/orchestrator-choice-store.test.ts` (pattern: existing `cache-service.test.ts`, in-memory DB via `initDatabase`): set → getOwn; upsert overwrites and bumps `updated_at`; clear → null; `getCommunityCandidates` returns up to three Spaces ranked by count then most recent `updated_at`; clearing the only choice for a Space drops it from the candidates; user A's own choice is invisible to user B's `getOwn`; empty table → empty candidate list
- [X] T028 [US2] Implement `server/src/cache/orchestrator-choice-store.ts` — `getOwnChoice(userId, hubNameId)`, `getCommunityCandidates(hubNameId): { spaceNameId, count }[]` (**top three**, `ORDER BY COUNT(*) DESC, MAX(updated_at) DESC LIMIT 3` — the readability filter in T030 needs candidates, not a single winner), `setChoice(userId, hubNameId, spaceNameId, now)`, `clearChoice(userId, hubNameId)` using prepared statements from data-model.md §2 (no string interpolation)
- [X] T029 [US2] Implement `canReadSpace(auth, spaceNameId): Promise<boolean>` in `server/src/services/space-readability.ts` — a minimal space lookup through `createAlkemioSdk(auth)` with the CALLER's token; a null result or a thrown/forbidden response means "not readable" (never propagate the error); memoise per `(userId, spaceNameId)` in-process for 5 minutes
- [X] T030 [US2] Extend `server/src/routes/ecosystem.ts`: `GET` now returns the caller's `own` from the store and, for `community`, walks `getCommunityCandidates` in rank order and returns the **first candidate `canReadSpace` accepts** — `null` if none, so a Space the caller cannot read never reaches the browser (constitution §IV, contract "Readability filter"); add `PUT` (body `{ spaceNameId }`, validated, upsert) and `DELETE` (idempotent), both answering with the post-write `GET` shape
- [X] T031 [P] [US2] Extend `server/src/routes/ecosystem.test.ts`: `GET` returns a stored `own`; `community` skips an unreadable top candidate and returns the next readable one; all three unreadable → `community: null` and the unreadable nameIds appear nowhere in the response body; `PUT` returns the post-write shape and rejects a missing/invalid `spaceNameId` with 400; `DELETE` is idempotent (stub `canReadSpace`)

### Client: hook, control, integration

- [X] T032 [US2] Extend `useOrchestratorChoice` in `frontend/shared/src/dashboard/hooks/useOrchestratorChoice.ts` with `choose(spaceNameId)` (PUT) and `reset()` (DELETE), both optimistic; on 401/403 fall back to `setGuestChoice` from `useEcosystemViewState` and expose it as `own`
- [X] T033 [P] [US2] Implement `OrchestratorControl` in `frontend/shared/src/dashboard/components/OrchestratorControl.tsx` — native `<select data-testid="ecosystem-orchestrator-select">` (styled like `TableFilterBar`'s select) listing `candidateSpaces` sorted by name with an empty "choose…" option, source badge `ecosystem-orchestrator-source` (`ecosystem.source.*`), reset button `ecosystem-orchestrator-reset` (visible iff `own`), notice slot `ecosystem-orchestrator-notice`, and a hint line (`ecosystem.hint.addSpace`) explaining that a Space outside the list must first be added to the selection (FR-010)
- [X] T034 [US2] Integrate into `frontend/shared/src/dashboard/pages/EcosystemTab.tsx`: render `OrchestratorControl`, wire `choose`/`reset`, pass the resolved `{nameId, source}` into `buildEcosystemModel`, and add the `empty.noOrchestrator` state when resolution yields null
- [X] T035 [US2] Extend `frontend/vng/src/dashboard/ecosystem.test.ts` with the candidate-set rule: `candidateSpaces` = listed ∪ selection ∪ builtIn ∪ community, deduplicated, only those present in the dataset
- [X] T036 [US2] Extend `tests/vng-ecosystem.spec.mjs`: select a listed Space → `[data-role="orchestrator"]` changes **within 1 s** (SC-004), `programmagroei` now `[data-role="initiative"]`, PUT observed with `{ spaceNameId }`, badge reads the `own` label, reset sends DELETE and badge returns to built-in; a run with mocked `own:null, community:{spaceNameId:'signalen',count:2}, builtIn:'programmagroei'` centres on `signalen` with the community label; a run with `builtIn:'does-not-exist'` shows `ecosystem-orchestrator-notice` and falls through to the guess

**Checkpoint**: US2 complete; community preset verified with two users in quickstart.md, and verified to omit a Space the second user cannot read.

---

## Phase 5: User Story 3 — Drill into existing detail tabs (Priority: P3)

**Goal**: Space click → Space details tab; gemeente click → City information tab; return with state intact.

**Independent Test**: click an initiative → Space details opens for it; click a gemeente org → City information opens; return → orchestrator, filters and zoom unchanged.

- [X] T037 [US3] In `frontend/shared/src/dashboard/pages/EcosystemTab.tsx` implement `onActivateSpace(nameId)` → `window.dispatchEvent(new CustomEvent(\`${eventPrefix}:openSpace\`, { detail: { spaceId: nameId } }))` and `onActivateOrg(org)` → when `org.isGemeente`, `new CustomEvent(\`${eventPrefix}:openCity\`, { detail: { cityId: org.id } })`; non-gemeente organisations only toggle the hover highlight (no bridge exists)
- [X] T038 [US3] Confirm `useEcosystemViewState` restores `transform` into `d3-zoom` on remount (`zoom.transform(select(svg), zoomIdentity.translate(x,y).scale(k))` in an effect in `EcosystemMap.tsx`, taking precedence over the T019 fit-on-mount when a stored transform exists) and that the orchestrator source badge is unchanged after a round trip — add a unit test for the hook's persistence in `frontend/vng/src/dashboard/ecosystem-view-state.test.ts` (mock `sessionStorage`)
- [X] T039 [US3] Extend `tests/vng-ecosystem.spec.mjs`: click an initiative card → the "Initiatief informatie" tab is selected; back to Ecosysteem → filters still on and the zoom transform attribute unchanged; click a gemeente org → "Gemeente informatie" tab selected

**Checkpoint**: all three stories complete.

---

## Phase 6: Polish & Cross-Cutting

- [X] T040 [P] Dark-theme and token pass on `EcosystemMap.tsx` / `EcosystemFilterBar.tsx` / `OrchestratorControl.tsx`: every colour from `@ea/shared` `styles/tokens.css` variables, cloud fill at low alpha of the primary token, verified in both themes (FR-022)
- [X] T041 [P] Performance check with a synthetic 50-Space / 500-org model in `frontend/vng/src/dashboard/ecosystem-layout.test.ts`: `layoutEcosystems` completes < 300 ms; drop `tick` count or add label culling below zoom 0.6 in `EcosystemMap.tsx` if hover feels sluggish
- [X] T042 [P] Update `specs/023-vng-guest-access/tasks.md` with two follow-up tasks: guest `GET /api/ecosystem/orchestrator/:hub` → `own:null` (community still readability-filtered against the guest's access); guest `PUT`/`DELETE` → `403 GUEST_FORBIDDEN` (contract already written)
- [X] T043 [P] Update `CLAUDE.md` architecture bullets with a one-paragraph "Ecosystem map (feature 024)" note: pure client model from the dataset, orchestrator fetched in addition to the hub list, `orchestrator_choices` store with its readability-filtered community preset, built-in table location
- [X] T044 Move `alkemio-hyper-connector-map-v2.drawio` from the repo root to `specs/024-vng-ecosystem-map/` and fix the path reference in `spec.md`'s Overview
- [X] T045 Full verification: `pnpm -C server test`, `pnpm -C frontend/vng test`, `tsc --noEmit` in `server`, `frontend/shared`, `frontend/vng`, `frontend/govtech`, then `pnpm run test:visual` with the VNG dev server up; walk through `specs/024-vng-ecosystem-map/quickstart.md` against the live platform, including the manual SC-001 read-the-picture check

---

## Dependencies & Execution Order

```
Phase 1 (T001–T006)  →  Phase 2 (T007–T015)  →  US1 (T016–T025)  →  US2 (T026–T036)  →  US3 (T037–T039)  →  Polish (T040–T045)
```

- **Phase 2** has two independent tracks: the model (T007–T011) and the built-in endpoint (T012–T015). Either order; both must land before US1.
- **US1** depends on Phase 2 only. It is the MVP.
- **US2** depends on US1's `EcosystemTab` (T022) for integration (T034) — the server track (T026–T031) can be built in parallel with all of US1.
- **US3** depends on US1 (map + view state) and touches nothing in US2's server work.

## Parallel Opportunities

- Phase 1: T003, T004, T005, T006 together after T001–T002.
- Phase 2: the model track (T007→T010, one file, sequential) ∥ the endpoint track (T012, T013 [P], then T014→T015).
- US1: T016 ∥ T020 ∥ T021 ∥ T024 while T017→T019→T022 proceed.
- US2: the server track (T026–T031) ∥ the client track (T032–T033); T034 joins them.
- Polish: T040–T043 all independent.

## Implementation Strategy

1. **MVP = Phase 1 + 2 + US1** (built-in default served read-only): a complete, honest VIH map with filters. Ship-demoable on its own, and no throwaway code.
2. **Increment 2 = US2**: store + readability filter + control. Demonstrates cross-device memory and the community preset.
3. **Increment 3 = US3 + Polish**: bridges, theme, docs, drawio relocation.

## Open findings from `/speckit.analyze` not addressed here

- **G1 (HIGH)**: FR-027 ("the view MUST work for guests") cannot be verified in this feature — feature 023 has 0/65 tasks implemented, so no guest principal exists. T042 files the follow-ups; the spec has not been changed to defer FR-027.
- **G5 (LOW)**: T027 does not assert that the community aggregate recomputes after a clear beyond dropping the Space from the candidate list.
