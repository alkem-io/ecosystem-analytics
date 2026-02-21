# Tasks: Ecosystem Analytics — Portfolio Network Explorer

**Input**: Design documents from `/specs/001-ecosystem-analytics/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the spec. Test tasks omitted — add separately if TDD is desired.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `server/src/`, `frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, monorepo structure, shared types

- [x] T001 Create root project structure with `server/` and `frontend/` directories per plan.md
- [x] T002 Initialize server project with Express, TypeScript, better-sqlite3, graphql-request, dotenv dependencies in `server/package.json`
- [x] T003 Initialize frontend project with React 18, Vite, D3 v7, TypeScript dependencies in `frontend/package.json`
- [x] T004 [P] Configure TypeScript for server in `server/tsconfig.json`
- [x] T005 [P] Configure TypeScript and Vite for frontend in `frontend/tsconfig.json` and `frontend/vite.config.ts` (include dev proxy for `/api` → `http://localhost:4000`)
- [x] T006 [P] Configure ESLint and Prettier for both projects in root `eslint.config.js` and `.prettierrc`
- [x] T007 [P] Create shared graph types (NodeType, EdgeType, GraphNode, GraphEdge, GraphDataset, GraphMetrics, NODE_WEIGHT, EDGE_WEIGHT) in `server/src/types/graph.ts` (frontend imports these via TypeScript path alias)
- [x] T008 [P] Create shared API types (SpaceSelectionItem, GraphGenerationRequest, GraphProgress, UserProfile, Error) in `server/src/types/api.ts` (frontend imports these via TypeScript path alias)
- [x] T009 [P] Create CSS custom properties theme from design brief tokens (--background, --foreground, --primary, --text-*, --radius, --elevation-sm, Inter font) in `frontend/src/styles/tokens.css`
- [x] T010 [P] Create server environment configuration loader in `server/src/config.ts` (ALKEMIO_SERVER_URL, ALKEMIO_GRAPHQL_ENDPOINT, ALKEMIO_KRATOS_PUBLIC_URL, PORT, SESSION_SECRET, MAX_SPACES_PER_QUERY, CACHE_TTL_HOURS)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Auth flow, GraphQL codegen, SQLite cache, Express app skeleton — MUST complete before any user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T011 Copy GraphQL query files from analytics-playground into `server/src/graphql/queries/` (me.graphql, mySpacesHierarchical.graphql, spaceByName.graphql, usersByIDs.graphql, organizationByID.graphql)
- [ ] T012 Copy GraphQL fragment files from analytics-playground into `server/src/graphql/fragments/` (SpaceGraphInfoFragment, spaceAboutFragment, communityRolesFragment)
- [ ] T013 Create GraphQL codegen configuration in `server/codegen.ts` (introspect Alkemio schema, generate alkemio-schema.ts + graphql.ts with getSdk(), import-types preset, custom scalars)
- [ ] T014 Run codegen and commit generated files in `server/src/graphql/generated/alkemio-schema.ts` and `server/src/graphql/generated/graphql.ts`
- [ ] T015 [P] Create Express app skeleton with middleware (CORS, JSON body, session, error handler) in `server/src/app.ts`
- [ ] T016 [P] Create server entry point in `server/src/index.ts`
- [ ] T017 Implement auth redirect handler (`GET /api/auth/login` → redirect to Alkemio Kratos browser login flow) in `server/src/auth/login.ts` — reference alkemio/client-web repo for Kratos browser-flow URLs and session exchange pattern
- [ ] T018 Implement auth callback handler (`GET /api/auth/callback` → extract Kratos session, issue bearer token, redirect to frontend) in `server/src/auth/callback.ts` — reference alkemio/client-web repo for callback handling pattern
- [ ] T019 Implement auth middleware (validate bearer token on protected routes) in `server/src/auth/middleware.ts`
- [ ] T020 Implement `GET /api/auth/me` endpoint (return current user profile) in `server/src/auth/me.ts`
- [ ] T021 Implement `POST /api/auth/logout` endpoint in `server/src/auth/logout.ts`
- [ ] T022 Register all auth routes in `server/src/routes/auth.ts`
- [ ] T023 [P] Initialize SQLite database and create cache_entries table (userId, spaceId, datasetJson, createdAt, expiresAt, PK: userId+spaceId) in `server/src/cache/db.ts`
- [ ] T024 [P] Implement cache service (get, set, invalidate, check TTL) in `server/src/cache/cache-service.ts`
- [ ] T025 [P] Create Alkemio GraphQL client wrapper (initialize graphql-request client with bearer token, call getSdk()) in `server/src/graphql/client.ts`
- [ ] T026 [P] Create frontend auth service (store token in memory, attach to requests, handle 401 → redirect to login) in `frontend/src/services/auth.ts`
- [ ] T027 [P] Create frontend API client (base fetch wrapper using auth service for bearer token) in `frontend/src/services/api.ts`
- [ ] T028 Create React app shell with routing (LoginPage, SpaceSelector, Explorer) in `frontend/src/App.tsx`
- [ ] T029 Implement LoginPage with identity gate UI (Screen A from design brief: welcome card, redirect CTA, error state) in `frontend/src/pages/LoginPage.tsx`

**Checkpoint**: Foundation ready — auth flow works end-to-end, codegen SDK available, cache layer operational, frontend can authenticate and route.

---

## Phase 3: User Story 1 — Explore Portfolio Connectivity (Priority: P1) 🎯 MVP

**Goal**: Authenticated user selects L0 Spaces, generates an interactive clustered network graph, explores with search/filter/details.

**Independent Test**: Log in as a Portfolio Owner, select 1–3 L0 Spaces, verify (a) cluster mode switching works, (b) search highlights entities, (c) details drawer opens on node click, (d) can identify connectors and isolated Spaces within 5 minutes.

### Server — Data Acquisition & Transformation

- [ ] T030 [US1] Implement Space listing service (call mySpacesHierarchical via SDK, map to SpaceSelectionItem[]) in `server/src/services/space-service.ts`
- [ ] T031 [US1] Register `GET /api/spaces` route returning user's L0 Spaces in `server/src/routes/spaces.ts`
- [ ] T032 [US1] Implement data acquisition service (for each Space: call spaceByName, collect user/org IDs from community roles, batch-fetch usersByIDs + organizationByID) in `server/src/services/acquire-service.ts`
- [ ] T033 [US1] Implement graph transformation service (raw API data → GraphNode[] + GraphEdge[] with types, weights, scope groups — adapt AlkemioGraphTransformer pattern from analytics-playground) in `server/src/transform/transformer.ts`
- [ ] T034 [US1] Implement metrics computation (totalNodes, totalEdges, averageDegree, density) in `server/src/transform/metrics.ts`
- [ ] T035 [US1] Implement graph generation orchestrator (check cache → acquire missing → transform → merge → compute metrics → cache → return GraphDataset) in `server/src/services/graph-service.ts`
- [ ] T036 [US1] Register `POST /api/graph/generate` route in `server/src/routes/graph.ts`
- [ ] T037 [US1] Implement `GET /api/graph/progress` endpoint for progressive loading status in `server/src/routes/graph.ts`

### Frontend — Space Selection

- [ ] T038 [US1] Create useSpaces hook (fetch /api/spaces, manage loading/error state) in `frontend/src/hooks/useSpaces.ts`
- [ ] T039 [US1] Implement SpaceSelector page (Screen B: search, checkbox multi-select, Select All/Clear, role badges, Generate Graph CTA, empty state) in `frontend/src/pages/SpaceSelector.tsx`

### Frontend — Graph Visualization Core

- [ ] T040 [US1] Create useGraph hook (POST /api/graph/generate, poll progress, manage dataset state) in `frontend/src/hooks/useGraph.ts`
- [ ] T041 [US1] Implement loading overlay component (Screen C overlay: "Acquiring Data" → "Clustering Entities" → "Rendering Graph" step labels) in `frontend/src/components/graph/LoadingOverlay.tsx`
- [ ] T042 [US1] Implement D3 force-directed graph renderer (nodes with type-based sizing/color, edges with type differentiation, zoom/pan/drag; handle null/missing fields gracefully per NFR-005: no avatar, missing location, missing URL) in `frontend/src/components/graph/ForceGraph.tsx`
- [ ] T043 [US1] Implement cluster-by-Space layout (group nodes by L0 Space scope group, draw cluster hulls) in `frontend/src/components/graph/clustering.ts`
- [ ] T044 [US1] Implement cluster-by-Organization layout (group nodes by org membership) in `frontend/src/components/graph/clustering.ts`
- [ ] T045 [US1] Implement cluster mode switcher (Space / Org toggle in left panel, animate layout transition) in `frontend/src/components/panels/ClusterControls.tsx`

### Frontend — Search & Filter

- [ ] T046 [P] [US1] Implement search input with node matching (highlight matches, dim non-matches or filter canvas) in `frontend/src/components/search/SearchBar.tsx`
- [ ] T047 [P] [US1] Implement filter toggles (show/hide People nodes, show/hide Organization nodes, with counts) in `frontend/src/components/panels/FilterControls.tsx`

### Frontend — Details Drawer & Node Interaction

- [ ] T048 [US1] Implement node selection (click handler, highlight selected node + connected edges) in `frontend/src/components/graph/ForceGraph.tsx`
- [ ] T049 [US1] Implement details drawer (slide-in panel: name, type badge, connection counts, link to Alkemio; handle null/missing fields gracefully per NFR-005: no avatar, missing display name, missing location) in `frontend/src/components/panels/DetailsDrawer.tsx`

### Frontend — Left Panel & Top Bar

- [ ] T050 [P] [US1] Implement left control panel (scope chips, cluster controls, filters, legend) in `frontend/src/components/panels/ControlPanel.tsx`
- [ ] T051 [P] [US1] Implement top bar (back button, breadcrumb, search, refresh icon, last sync time, user avatar) in `frontend/src/components/panels/TopBar.tsx`

### Frontend — Explorer Page Assembly

- [ ] T052 [US1] Assemble Explorer page (Screen C: top bar + left panel + graph canvas + details drawer + loading overlay) in `frontend/src/pages/Explorer.tsx`
- [ ] T053 [US1] Implement network metrics display (total nodes, edges, average degree, density in a stats bar or panel section) in `frontend/src/components/panels/MetricsBar.tsx`

**Checkpoint**: US1 complete — user can log in, select Spaces, generate and explore a clustered interactive graph with search, filter, and node details.

---

## Phase 4: User Story 2 — Fast Loading via Protected Caching (Priority: P2)

**Goal**: Reuse previously fetched data with freshness indicator and manual refresh, reducing load times and backend requests.

**Independent Test**: Generate a graph for the same Spaces twice; verify the second load is faster and shows "last updated" timestamp. Verify manual refresh re-fetches all data.

- [x] T05\1 [US2] Add cache-aware logic to graph-service: return cached data with timestamps when fresh, fetch only stale/missing Spaces in `server/src/services/graph-service.ts`
- [x] T05\1 [US2] Add `lastUpdated` timestamp per Space to GraphDataset response in `server/src/types/graph.ts` and `server/src/services/graph-service.ts`
- [x] T05\1 [US2] Implement `forceRefresh` parameter handling (delete cache entries, re-fetch all) in `server/src/services/graph-service.ts`
- [x] T05\1 [US2] Display "last updated" timestamp in top bar (from dataset metadata) in `frontend/src/components/panels/TopBar.tsx`
- [x] T05\1 [US2] Implement refresh button behavior (spin icon, call generate with forceRefresh=true, update display) in `frontend/src/components/panels/TopBar.tsx`
- [x] T05\1 [US2] Display per-Space cache status (cached vs fresh-fetched) during loading overlay in `frontend/src/components/graph/LoadingOverlay.tsx`

**Checkpoint**: US2 complete — second loads are fast, freshness is visible, refresh works.

---

## Phase 5: User Story 3 — Expand the Graph During Exploration (Priority: P3)

**Goal**: Click a connector entity, see related Spaces, add accessible Spaces to the current graph without restarting.

**Independent Test**: Click a person/org node, see related Spaces listed, add an accessible Space, verify graph updates with new data merged in.

- [x] T06\1 [US3] Implement related-Spaces lookup (given a user/org ID, find Spaces they belong to that are not in the current dataset) in `server/src/services/space-service.ts`
- [x] T06\1 [US3] Register `GET /api/spaces/:entityId/related` endpoint returning expandable Spaces in `server/src/routes/spaces.ts`
- [x] T06\1 [US3] Implement incremental graph merge (acquire + transform one new Space, merge nodes/edges into existing dataset, recompute metrics) in `server/src/services/graph-service.ts`
- [x] T06\1 [US3] Register `POST /api/graph/expand` endpoint (add a single Space to the current dataset) in `server/src/routes/graph.ts`
- [x] T06\1 [US3] Add "Related Spaces" section to details drawer (list Spaces connected to selected entity, show accessibility status) in `frontend/src/components/panels/DetailsDrawer.tsx`
- [x] T06\1 [US3] Implement "Add to graph" button per related Space (call /api/graph/expand, merge result into current dataset, re-render graph) in `frontend/src/components/panels/DetailsDrawer.tsx`
- [x] T06\1 [US3] Update scope chips in left panel when a Space is added to the graph in `frontend/src/components/panels/ControlPanel.tsx`

**Checkpoint**: US3 complete — users can follow connections and expand the graph interactively.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Map overlay, insights, export, accessibility, and hardening

### Map Overlay (FR-008, FR-009, TR-007–TR-010)

- [ ] T067 [P] Add GeoJSON basemap files (World, Europe, Netherlands from Natural Earth) to `frontend/src/assets/maps/`
- [ ] T068 [P] Implement map overlay renderer (D3-geo projection, draw GeoJSON paths, toggle on/off) in `frontend/src/components/map/MapOverlay.tsx`
- [ ] T069 Implement map region selector (World / Europe / Netherlands presets) in `frontend/src/components/panels/ControlPanel.tsx`
- [ ] T070 Implement geographic node pinning (fix nodes with lat/long to map coordinates when map is active, graceful fallback when missing) in `frontend/src/components/graph/ForceGraph.tsx`

### Insight Shortcuts (FR-015)

- [ ] T071 [P] Implement super-connector detection (nodes with degree > mean + 2σ) in `server/src/transform/insights.ts`
- [ ] T072 [P] Implement isolated-node detection (nodes with degree ≤ 1) in `server/src/transform/insights.ts`
- [ ] T073 Add insights to GraphDataset response (superConnectors[], isolatedNodes[]) in `server/src/types/graph.ts`
- [ ] T074 Implement insight highlight buttons (highlight super-connectors, highlight isolated nodes) in `frontend/src/components/panels/ControlPanel.tsx`

### Export (FR-016)

- [ ] T075 [P] Implement `POST /api/graph/export` endpoint (return GraphDataset as downloadable JSON with Content-Disposition header) in `server/src/routes/graph.ts`
- [ ] T076 [P] Implement export button in UI (trigger download) in `frontend/src/components/panels/TopBar.tsx`

### Accessibility (NFR-006)

- [ ] T077 Add keyboard navigation to graph nodes (Tab/arrow key focus, Enter to select) in `frontend/src/components/graph/ForceGraph.tsx`
- [ ] T078 Add ARIA labels to all controls (cluster toggle, filters, search, details drawer) across `frontend/src/components/`

### Security Hardening (NFR-001, NFR-002, NFR-003)

- [ ] T079 [P] Audit logging: ensure no bearer tokens or credentials are logged at any level in `server/src/`
- [ ] T080 [P] Add cache access-control check (verify requesting user matches cache userId on every read) in `server/src/cache/cache-service.ts`
- [ ] T081 Validate max Spaces per query server-side (FR-003a) in `server/src/routes/graph.ts`

### Production Build

- [ ] T082 [P] Configure server to serve `frontend/dist/` as static files in production mode in `server/src/app.ts`
- [ ] T083 [P] Add Dockerfile for combined server+frontend deployment in `Dockerfile`
- [ ] T084 Validate quickstart.md end-to-end (clone, install, configure, run, verify all screens)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational phase completion — this is the MVP
- **US2 (Phase 4)**: Depends on US1 (needs graph-service and cache layer working)
- **US3 (Phase 5)**: Depends on US1 (needs graph rendering and details drawer)
- **Polish (Phase 6)**: Can begin after US1; map overlay and insights are independent of US2/US3

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **User Story 2 (P2)**: Depends on US1's graph-service (T035) and cache layer (T023–T024)
- **User Story 3 (P3)**: Depends on US1's details drawer (T049) and graph rendering (T042)

### Within Each User Story

- Server tasks before frontend tasks (API must exist before UI consumes it)
- Models/types before services
- Services before route handlers
- Core rendering before interaction features

### Parallel Opportunities

- T004–T010 (Setup): All [P] tasks can run in parallel
- T015–T016, T023–T027 (Foundational): [P] tasks can run in parallel after T014
- T046–T047 (US1 search/filter): Can run in parallel
- T050–T051 (US1 panels): Can run in parallel
- T067–T068, T071–T072, T075–T076 (Polish): Independent groups can run in parallel
- US2 and US3 can run in parallel once US1 is complete

---

## Parallel Example: User Story 1

```bash
# After T037 (server routes done), launch frontend tasks in parallel groups:

# Group A — Space selection (independent):
Task: T038 "useSpaces hook"
Task: T039 "SpaceSelector page"

# Group B — Graph core (independent of Group A):
Task: T040 "useGraph hook"
Task: T041 "LoadingOverlay"
Task: T042 "ForceGraph renderer"

# Group C — Search + Filter (independent, after T042):
Task: T046 "SearchBar"
Task: T047 "FilterControls"

# Group D — Panels (independent, after T042):
Task: T050 "ControlPanel"
Task: T051 "TopBar"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T010)
2. Complete Phase 2: Foundational (T011–T029)
3. Complete Phase 3: User Story 1 (T030–T053)
4. **STOP and VALIDATE**: Test US1 independently — login, select Spaces, generate graph, explore
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (**MVP!**)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Polish (map overlay, insights, export, a11y) → Final release

### Suggested MVP Scope

**User Story 1 alone** delivers the core value proposition: a Portfolio Owner can log in, select Spaces, and explore an interactive network graph with clustering, search, filter, and details. This is sufficient for initial user validation.

---

## Summary

| Metric | Count |
|--------|-------|
| **Total tasks** | 84 |
| **Setup (Phase 1)** | 10 |
| **Foundational (Phase 2)** | 19 |
| **US1 — Explore (Phase 3)** | 24 |
| **US2 — Caching (Phase 4)** | 6 |
| **US3 — Expand (Phase 5)** | 7 |
| **Polish (Phase 6)** | 18 |
| **Parallel opportunities** | 30+ tasks marked [P] |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
