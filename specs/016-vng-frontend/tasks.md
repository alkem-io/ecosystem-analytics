---
description: "Task list for 016-vng-frontend implementation"
---

# Tasks: VNG Kenniscentrum Innovatie Frontend

**Input**: Design documents from `/specs/016-vng-frontend/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Targeted tests are included where the plan calls for them (hub resolution, GD tag→node resolution, dashboard category counting) plus VNG visual snapshots. They are not full TDD; write them alongside the code they cover.

**Organization**: Tasks are grouped by the 10 user stories from spec.md so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US10 per spec.md
- File paths are relative to repo root `/Users/neilsmyth/Documents/DevAlkemio/ecosystem-analytics/`

## Path Conventions

Web app, **pnpm workspace**: BFF in `server/`; all frontend packages under `frontend/` — shared lib in `frontend/shared/`, existing Explorer (moved) in `frontend/ecosystem-analytics/`, new VNG app in `frontend/vng/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace + new-app scaffolding

- [ ] T001 Create `pnpm-workspace.yaml` at repo root with packages `server` and `frontend/*` (i.e. `frontend/shared`, `frontend/ecosystem-analytics`, `frontend/vng`); add root dev script to run all three (concurrently) in root `package.json`
- [ ] T001a **Move the existing Explorer** from top-level `frontend/` into `frontend/ecosystem-analytics/` (`git mv`), preserving history; update its `package.json` name and any internal relative paths so it builds in the new location
- [ ] T002 [P] Scaffold `frontend/vng/` Vite + React 19 + TS app (port 5174, `/api` proxy to server): `frontend/vng/{package.json,vite.config.ts,tsconfig.json,index.html,src/main.tsx,src/App.tsx}`
- [ ] T003 [P] Create `frontend/shared/` package skeleton: `frontend/shared/{package.json,tsconfig.json,src/index.ts}` with workspace name `@ea/shared`
- [ ] T004 [P] Add `frontend/vng` dependencies aligned with `frontend/ecosystem-analytics` versions: `recharts`, `i18next`, `react-i18next`, `react-router-dom`, Radix UI primitives, Tailwind v4 (`@tailwindcss/vite`), `class-variance-authority`/`clsx`/`tailwind-merge`, `lucide-react`, plus `vitest` in `frontend/vng/package.json`
- [ ] T005 [P] Configure Tailwind v4 + design tokens + shadcn-style setup in `frontend/vng/` (`frontend/vng/src/styles/`, Tailwind config, `index.css`)
- [ ] T006 [P] Copy map basemaps and required public assets into `frontend/vng/public/maps/` (incl. `netherlands.geojson`) so the shared map renders in the VNG app

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared-code extraction, VNG app shell, server config + snapshot registry. **No user story can start until this is done.**

- [ ] T007 Extract shared modules from `frontend/ecosystem-analytics/src` into `frontend/shared/src/`: `graph/` (ForceGraph, clustering, HoverCard), `map/` (MapOverlay incl. `netherlands` region), `panels/DetailsDrawer`, `services/` (api wrapper, auth `login`/`logout`/`fetchMe`), `ui/`, `styles/tokens`
- [ ] T008 Rewire `frontend/ecosystem-analytics/src` imports to consume `@ea/shared` (no behaviour change); confirm `tsc --noEmit` passes and `pnpm run test:visual` snapshots are unchanged for the Explorer
- [ ] T009 [P] Lift shadcn UI primitives (`tabs`, `alert`, `card`, `badge`, `select`, `chart`) from `client-web@story/9885-remove-mui-library-and-code` `prototype/src/app/components/ui/` into `frontend/shared/src/ui/`
- [ ] T010 [P] Bootstrap i18n in `frontend/vng/src/i18n/index.ts` with `nl.json` (default + fallback) and `en.json`; expose a language switcher hook (Dutch default per FR-036)
- [ ] T011 Build the VNG app shell in `frontend/vng/src/App.tsx`: 3-tab layout (Graph / Space details / Dashboard) via react-router, auth-gated load using `@ea/shared` auth (login redirect + `fetchMe`)
- [ ] T012 [P] Wire the `frontend/vng` API client from `@ea/shared` services (`credentials: 'include'`) in `frontend/vng/src/services/api.ts`
- [ ] T013 [P] Add `VngConfig` interface + parsing in `server/src/config.ts`; add `vng:` block to `server/analytics.yml` and keys to `server/.env.default` (`defaultHubNameId`, `gemeentedelersSpaceNameId`, `gdCacheTtlHours:168`, `tagCategoryMapping`)
- [ ] T014 [P] Create snapshot generator `server/scripts/generate-vng-snapshot.mts` (reads `../vng-gemeente-delers` vault → `municipalities.json`/`themes.json`/`meta.json`) and add `gen:vng-snapshot` script to `server/package.json` (per contracts/snapshot-registry.md)
- [ ] T015 Generate and commit `server/src/data/vng/{municipalities.json,themes.json,meta.json}`; add registry loader `server/src/services/vng-registry.ts` (lookup maps: municipality title→`alkemioNameId`, theme title/priorLabel→slug)
- [ ] T016 [P] Confirm cross-origin session support: `SESSION_COOKIE_DOMAIN` (parent domain) + `SESSION_ALLOWED_ORIGINS` (both subdomains) handling in `server/src/auth/session.ts`; document in `server/.env.default`

**Checkpoint**: Workspace builds; VNG app shell loads behind auth; Explorer unchanged; config + registry available.

---

## Phase 3: User Story 1 - Explore an innovation hub's ecosystem on the graph (Priority: P1) 🎯 MVP

**Goal**: Sign in → default hub's spaces render as a graph over the Netherlands map; switching hub updates graph + selected-space list.

**Independent Test**: Open the VNG app, confirm the default hub's spaces load over the NL map, switch hubs, confirm graph + panel update.

### Tests for User Story 1

- [ ] T017 [P] [US1] Unit test `hub-service` (`listHubs`, `resolveHubSpaceIds`, restricted-space exclusion) in `server/src/services/__tests__/hub-service.test.ts`

### Implementation for User Story 1

- [ ] T018 [P] [US1] Add `innovationHubs.graphql` and `innovationHubByNameId.graphql` (with hub fragment incl. `spaceListFilter`) in `server/src/graphql/queries/`
- [ ] T019 [US1] Run `pnpm -C server run codegen` to regenerate the typed SDK (depends on T018); commit `server/src/graphql/generated/`
- [ ] T020 [US1] Implement `server/src/services/hub-service.ts` (`listHubs`, `resolveHubSpaceIds`) via SDK, filtering to spaces the user may view (FR-009/014)
- [ ] T021 [US1] Implement routes `GET /api/hubs` and `GET /api/hubs/:nameId/spaces` in `server/src/routes/hubs.ts` (per contracts/api-hubs.md) and register in `server/src/app.ts`
- [ ] T022 [P] [US1] `useHubs` hook (fetch `/api/hubs`, expose default) in `frontend/vng/src/hooks/useHubs.ts`
- [ ] T023 [P] [US1] `HubSelector` component (choose from all available hubs) in `frontend/vng/src/components/HubSelector.tsx`
- [ ] T024 [US1] `useSelectedSpaces` hook with default-hub resolution + effective-set computation in `frontend/vng/src/hooks/useSelectedSpaces.ts` (SelectionState per data-model §3)
- [ ] T025 [US1] `GraphTab` + `useVngGraph` hook: POST `/api/graph/generate` and render `@ea/shared` ForceGraph over MapOverlay `netherlands` in `frontend/vng/src/pages/GraphTab.tsx`, `frontend/vng/src/hooks/useVngGraph.ts`
- [ ] T026 [US1] `SelectedSpacesPanel` persistent list (visible on every tab) in `frontend/vng/src/components/SelectedSpacesPanel.tsx`
- [ ] T027 [US1] Empty/error/loading states for empty hub or failed graph (FR-017) in `GraphTab`

**Checkpoint**: MVP — hub-driven graph over the NL map works end to end.

---

## Phase 4: User Story 5 - Run both frontends side by side under one sign-in (Priority: P1)

**Goal**: Both frontends run simultaneously at distinct URLs/ports and share the `ea_session`.

**Independent Test**: Start backend + both frontends; sign in on one, confirm the other recognises the session; sign out invalidates both.

- [ ] T028 [US5] Production serving as sibling subdomains: update deployment/ingress (Traefik/k8s manifests under `specs/005-k8s-deploy-cicd` infra or `Dockerfile`/serve config) + parent-domain cookie config (FR-002/003)
- [ ] T029 [US5] Verify dev coexistence: root `concurrently` script runs server + `frontend/ecosystem-analytics` (5173) + `frontend/vng` (5174), both proxying `/api`; document in `quickstart.md`
- [ ] T030 [US5] 401/session-expiry handling in `frontend/vng` (redirect through Alkemio login, return to prior context) reusing `@ea/shared` auth (FR-026/029) in `frontend/vng/src/services/api.ts`
- [ ] T031 [US5] Validate sign-out in one app invalidates the session in both (integration check; record in quickstart smoke step 10)

**Checkpoint**: Both P1 stories complete — deployable demo.

---

## Phase 5: User Story 2 - Refine the space set with direct selection (Priority: P2)

**Goal**: Add/remove individual spaces on top of the hub set; combined set drives all tabs with clear provenance.

**Independent Test**: With a hub selected, add one space and remove one hub space; panel, graph, dashboard reflect the union.

- [ ] T032 [P] [US2] `SpacePicker` (search/add spaces via existing `/api/spaces`) in `frontend/vng/src/components/SpacePicker.tsx`
- [ ] T033 [US2] Extend `useSelectedSpaces` with `directAdded`/`directRemoved` and hub-switch recomputation (retain still-applicable selections) in `frontend/vng/src/hooks/useSelectedSpaces.ts` (FR-011/012)
- [ ] T034 [US2] `SelectedSpacesPanel` shows provenance (hub vs direct) + remove control (FR-013)
- [ ] T035 [US2] Ensure GraphTab + DashboardTab consume the combined effective set consistently

**Checkpoint**: US1 + US2 work independently.

---

## Phase 6: User Story 3 - Dashboard of charts for the selected spaces (Priority: P2)

**Goal**: Dashboard tab shows NDS + VNG-2030 bar charts derived from the selected spaces; updates on selection change.

**Independent Test**: With spaces selected, open Dashboard; counts match spaces; change selection → charts update.

### Tests for User Story 3

- [ ] T036 [P] [US3] Unit test dashboard category counting (tag→category mapping, uncategorised handling) in `server/src/services/__tests__/vng-dashboard.test.ts`

### Implementation for User Story 3

- [ ] T037 [US3] `POST /api/vng/dashboard` route + **data-source-aware** service applying `vng.tagCategoryMapping`: count GD initiatives when `includeInitiatives` and the GD layer is available, else selected spaces; return `source` + counts in `server/src/routes/vng.ts` and `server/src/services/vng-dashboard-service.ts` (per contracts/api-vng-dashboard.md, FR-022)
- [ ] T038 [P] [US3] `useDashboard` hook in `frontend/vng/src/hooks/useDashboard.ts`
- [ ] T039 [P] [US3] `NdsChart` + `Vng2030Chart` recharts components (via shared `ui/chart`) in `frontend/vng/src/components/charts/`
- [ ] T040 [US3] `DashboardTab` assembling charts, a per-chart **active-source indicator** (spaces vs GD initiatives, FR-021), empty-category and missing-data handling (FR-024) in `frontend/vng/src/pages/DashboardTab.tsx`

**Checkpoint**: US1–US3 independently functional.

---

## Phase 7: User Story 4 - Inspect the details of a particular space (Priority: P3)

**Goal**: Space details tab shows a chosen space's details; reachable via its own picker or by clicking a graph node.

**Independent Test**: Pick a space in the details tab (and click a graph node) → its details show; missing fields degrade gracefully.

- [ ] T041 [US4] `SpaceDetailsTab` with a dedicated space picker, reusing `@ea/shared` DetailsDrawer in `frontend/vng/src/pages/SpaceDetailsTab.tsx` (FR-018)
- [ ] T042 [US4] Cross-tab navigation: clicking a space node in GraphTab opens SpaceDetailsTab for that space (FR-015) via shared selection/route state
- [ ] T043 [US4] Verify graceful degradation for missing optional fields (FR-019)

**Checkpoint**: US1–US4 independently functional.

---

## Phase 8: User Story 6 - VNG branding and data-access warning (Priority: P2)

**Goal**: Persistent VNG branding on every tab + a prominent authorisation warning.

**Independent Test**: Open the app; VNG branding visible on all tabs; a warning-styled notice explains authorised-data-only.

- [ ] T044 [P] [US6] `BrandingHeader` persistent across tabs, using **existing Alkemio branding/tokens** (from `@ea/shared`) with a **text label** "VNG Kenniscentrum Innovatie"; structure it so a VNG-specific visual identity can be dropped in later, in `frontend/vng/src/components/BrandingHeader.tsx` (FR-025)
- [ ] T045 [P] [US6] `AuthorizationWarning` banner using shared `alert` (warning variant), localized, in `frontend/vng/src/components/AuthorizationWarning.tsx` (FR-026/027)
- [ ] T046 [US6] Mount header + warning in the app shell (`frontend/vng/src/App.tsx`)

**Checkpoint**: Branding + warning present everywhere.

---

## Phase 9: User Story 7 - See which spaces an organisation connects to (Priority: P2)

**Goal**: Clicking an organisation reveals its connected spaces in the current graph (and navigation to them).

**Independent Test**: Click an org node → its connected spaces are listed/highlighted (<1s); empty-state when none.

- [ ] T047 [US7] On organisation-node click, derive connected spaces from current `GraphEdge[]` and display in `frontend/vng/src/components/OrgConnections.tsx` (reuse DetailsDrawer connections logic) (FR-030)
- [ ] T048 [US7] Highlight connected spaces in the graph + navigation to Space details; clear empty-state when the org has no in-graph connections (FR-031)

**Checkpoint**: US7 functional.

---

## Phase 10: User Story 8 - Show or hide gemeentes (Priority: P3)

**Goal**: Toggle that consistently shows/hides gemeente organisations in both graph and dashboard.

**Independent Test**: Toggle hide → gemeente nodes leave graph + dashboard; toggle back restores; no non-gemeente affected.

- [ ] T049 [US8] Server: set `GraphNode.isGemeente` by matching `ORGANIZATION.nameId` against the registry (assert **no false positives** — non-gemeente orgs stay `isGemeente:false`), in `server/src/transform/transformer.ts` / `server/src/services/graph-service.ts` (FR-032/035)
- [ ] T050 [P] [US8] `GemeenteToggle` component in `frontend/vng/src/components/GemeenteToggle.tsx`
- [ ] T051 [US8] Apply the toggle: filter `isGemeente` nodes/edges in the graph and pass `includeGemeentes` to `/api/vng/dashboard`, consistently (FR-034) in GraphTab + DashboardTab

**Checkpoint**: US8 functional.

---

## Phase 11: User Story 9 - Use the dashboard in Dutch (Priority: P2)

**Goal**: Dutch by default, switch to English; all labels incl. chart titles + category names localised.

**Independent Test**: App loads in Dutch; switch to English → all labels update; switch back.

- [ ] T052 [P] [US9] Populate `frontend/vng/src/i18n/nl.json` + `en.json` with all UI labels, navigation, chart titles, and category names (seed from `client-web` `i18n/*.nl.json`/`*.en.json`) (FR-037)
- [ ] T053 [US9] Apply `useTranslation` across all `frontend/vng` components; mount language switcher in `BrandingHeader`; persist selection for the session (FR-036/038)
- [ ] T054 [US9] Localize dashboard category labels by `key` and add missing-key fallback (edge case) in `frontend/vng/src/components/charts/`

**Checkpoint**: US9 functional.

---

## Phase 12: User Story 10 - Fold GemeenteDelers initiatives into the graph (Priority: P2)

**Goal**: "Include GemeenteDelers initiatives" folds ~305 KB-callout initiatives into the graph, linked to existing gemeente nodes + theme nodes, with a provenance note; toggling off restores the base graph.

**Independent Test**: Enable → initiative nodes appear linked to existing gemeentes/themes (no duplicates) + provenance note; disable → base graph restored.

### Tests for User Story 10

- [ ] T055 [P] [US10] Unit test GD tag→node/edge resolution (gemeente reuse by nameId, theme canonicalisation `theme:<slug>`, no duplicate identity, unmatched-tag handling) in `server/src/transform/__tests__/initiatives.test.ts`

### Implementation for User Story 10

- [ ] T056 [P] [US10] Add `spaceKnowledgeCallouts.graphql` (gemeentedelers KB callouts + `framing.profile.tags`, `nameID`, link contributions) and `organizationByNameId.graphql` in `server/src/graphql/queries/`
- [ ] T057 [US10] Run `pnpm -C server run codegen` (depends on T056); commit generated SDK
- [ ] T058 [US10] Extend graph types in `server/src/types/graph.ts` (`NodeType.INITIATIVE`/`THEME`, `EdgeType.INITIATIVE_GEMEENTE`/`INITIATIVE_THEME`, new `GraphNode` fields) and `server/src/types/api.ts` (`GraphGenerationRequest.includeInitiatives`)
- [ ] T059 [US10] Implement `server/src/services/gd-initiatives-service.ts` (fetch callouts) + `server/src/transform/initiatives.ts` (resolve tags via registry → INITIATIVE/THEME nodes + edges)
- [ ] T060 [US10] Fold-in in `server/src/services/graph-service.ts` when `includeInitiatives`: dedupe `ORGANIZATION` by `nameId`, resolve missing gemeente orgs once via `organizationByNameId`, attach `gdLayer` metadata (per contracts/api-graph-generate.md) (FR-040/043)
- [ ] T061 [US10] Per-user GD cache entry (`space_id="__gd_initiatives__"`, TTL `gdCacheTtlHours`) with READ check on the gemeentedelers space; non-fatal fallback when unreadable (FR-044/046) in `server/src/services/graph-service.ts` + `server/src/cache/`
- [ ] T062 [P] [US10] `InitiativesToggle` + provenance note (from `gdLayer.source`, links `vng.nl/praktijkvoorbeelden`) in `frontend/vng/src/components/InitiativesToggle.tsx` (FR-039/047)
- [ ] T063 [US10] GraphTab: pass `includeInitiatives`, style/legend INITIATIVE + THEME nodes and their edges, remove cleanly on disable, handle hidden-gemeente edges + non-fatal errors (FR-042, edge cases)

**Checkpoint**: All user stories independently functional.

---

## Phase 13: Polish & Cross-Cutting Concerns

- [ ] T064 [P] Ensure `tsc --noEmit` passes on `server`, `frontend/ecosystem-analytics`, `frontend/vng`, `frontend/shared`
- [ ] T065 [P] Add Playwright visual snapshots for the VNG app tabs (root `pnpm run test:visual:update`)
- [ ] T066 [P] Update `CLAUDE.md` + README dev instructions for the VNG app, workspace, and snapshot regeneration
- [ ] T067 Run `quickstart.md` smoke validation across all 11 checks (maps to SC-001…SC-015), including a side-by-side **control-count review** vs the Explorer (SC-009) and confirming the large-hub cap message at `max_spaces_per_query`
- [ ] T068 [P] Performance verification: first load ≤5s (SC-002), hub switch ≤5s (SC-003), selection change ≤3s (SC-004), org reveal <1s (SC-012)
- [ ] T069 Security pass: no token logging, per-user cache scoping (incl. GD entry), parameterised SQL, gemeentedelers READ enforcement (Principle IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**. (T007→T008 sequential; T015 depends on T014.)
- **User Stories (Phase 3–12)**: all depend on Foundational. US1 is the MVP. Recommended order = priority: US1, US5 (both P1) → US2, US3, US6, US7, US9, US10 (P2) → US4, US8 (P3).
- **Polish (Phase 13)**: after the desired stories.

### Story-level dependencies & notes

- **US1** independent (needs hub endpoints + shared graph/map). **US5** mostly Foundational scaffolding + cookie/deploy config; verify after US1.
- **US2** builds on US1 selection state. **US3** needs the selected set + dashboard endpoint; independent of US2 mechanics. **US4** needs the graph (node click) + details tab. **US6/US9** are cross-cutting UI (apply broadly but independently testable). **US7** needs the graph (US1). **US8** needs `isGemeente` (server) + registry (Foundational). **US10** is the largest; needs registry (Foundational) + new queries; reuses gemeente nodes from the base graph.
- **Codegen tasks** (T019, T057) must follow their `.graphql` additions and precede the services that use the SDK.

### Parallel opportunities

- Setup: T002–T006 in parallel.
- Foundational: T009/T010/T012/T013/T014/T016 in parallel (after T007/T008 land the shared lib); T015 after T014.
- Within a story, `[P]` tasks touch different files (e.g. US1 T022/T023; US3 T038/T039; US10 T056 + T062).
- After Foundational, P2/P3 stories can be staffed in parallel by different developers.

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational → **Phase 3 (US1)**.
2. Add Phase 4 (US5) to prove coexistence + shared sign-in. **STOP & VALIDATE** → deployable demo.

### Incremental Delivery

US2 → US3 → US6 → US7 → US9 → US10 → US4 → US8, validating each independently against its acceptance scenarios. US10 (GD fold-in) and US3 (dashboard) deliver the headline VNG value and can be prioritised earlier if needed once Foundational is stable.

### Notes

- `[P]` = different files, no incomplete-task dependency.
- Re-run `pnpm -C server run codegen` whenever `.graphql` files change (Principle II); commit generated SDK.
- Keep the Explorer (`frontend/ecosystem-analytics/`) behaviour unchanged through the move (T001a) and shared-lib extraction (T008 is the guard).
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
