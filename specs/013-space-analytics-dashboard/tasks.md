# Tasks: Space Analytics Dashboard

**Input**: Design documents from `/specs/013-space-analytics-dashboard/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/dashboard-api.md, quickstart.md

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US7)
- All file paths relative to repository root

---

## Phase 1: Setup

**Purpose**: Create type definitions and GraphQL queries — the schema contract that everything else depends on.

- [X] T001 Create dashboard type definitions at server/src/types/dashboard.ts — define DashboardDataset, HeadlineMetrics, CalloutDetail, ContributorDetail, SubspaceMetrics, TimelineBucket, PhaseInfo, MemberInfo, OrganizationActivity, DashboardSpaceInfo, and cache metadata interfaces per data-model.md
- [X] T002 [P] Create GraphQL fragments at server/src/graphql/fragments/analyticsFragments.graphql — reusable fragments for callout contribution metadata, room message counts, and contributor profile fields
- [X] T003 [P] Create GraphQL query at server/src/graphql/queries/spaceAnalytics.graphql — query that traverses Space → collaboration → calloutsSet → callouts → contributions (metadata only) + contributionsCount + comments (messagesCount) + community roleSet (memberUsers, leadUsers, adminUsers, memberOrganizations, leadOrganizations) + subspaces (recursive L1/L2)
- [X] T004 Run `pnpm run codegen` in server/ to regenerate server/src/graphql/generated/alkemio-schema.ts with the new query and fragment types
- [X] T005 [P] Add DashboardGenerationRequest type to server/src/types/api.ts — fields: spaceId (string), forceRefresh (boolean, optional)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side data pipeline and frontend data layer — MUST complete before any user story visualization work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Server

- [X] T006 Implement dashboard-service.ts at server/src/services/dashboard-service.ts — fetches analytics data from Alkemio GraphQL using the codegen SDK. Accepts a spaceId + user session, executes spaceAnalytics query for L0 space, iterates L1/L2 subspaces in parallel (reuse pattern from acquire-service.ts), collects raw callout/contribution/member/role data into RawAnalyticsSpace structures. Also fetches activityFeedGrouped for timestamp data. Returns collected raw data.
- [X] T007 Implement dashboard-transform.ts at server/src/transform/dashboard-transform.ts — transforms raw analytics data into DashboardDataset. MUST aggregate across all subspace levels (L0+L1+L2) when computing totals (FR-009). Computes: headline metrics (totals, ratios, averages per data-model.md validation rules), callout details (per-callout contribution/comment counts, engagement, last activity), contributor details (per-user totals, role, org, per-subspace breakdown, first/last dates), subspace metrics (per-subspace aggregated counts), timeline buckets (monthly, with byType + newContributors), phase info, member info, and organization activity summaries.
- [X] T008 Implement dashboard route at server/src/routes/dashboard.ts — Express router with authMiddleware + resolveUser. POST /api/dashboard/generate: validates spaceId, checks cache (key: `dashboard:{spaceId}`), calls dashboard-service + dashboard-transform if cache miss or forceRefresh, stores result in cache, returns DashboardDataset. Error responses per contracts/dashboard-api.md (400/401/502).
- [X] T009 Register dashboard router in server/src/app.ts — import dashboardRouter, mount at `/api/dashboard` with same middleware pattern as graphRouter.

### Frontend

- [X] T010 [P] Add dashboard API methods to frontend/src/services/api.ts — add `generateDashboard(spaceId: string, forceRefresh?: boolean)` method that POSTs to `/api/dashboard/generate` and returns typed DashboardDataset (import type from @server/types/dashboard.js).
- [X] T011 Create useDashboard hook at frontend/src/hooks/useDashboard.ts — manages dashboard state: selectedSpaceId, dataset (DashboardDataset | null), loading, error. Exposes `generate(spaceId, forceRefresh?)` that calls the API method. Follow pattern from useGraph.ts. Also manages client-side filter state: selectedTimeRange (preset enum), selectedPhaseId (string | null). Provides filtered views of dataset arrays based on active filters.
- [X] T012 [P] Create DashboardPanel wrapper component at frontend/src/components/dashboard/DashboardPanel.tsx — shared wrapper for each visualization panel. Props: title, loading (shows skeleton), error (shows error message), empty (shows empty state message), children. Renders a card with consistent header, loading spinner/skeleton animation, and graceful empty state per FR-010 and FR-011.

**Checkpoint**: Server returns a complete DashboardDataset via POST /api/dashboard/generate. Frontend can fetch and store it. Panel wrapper is ready for visualization components.

---

## Phase 3: US1 + US7 — Headline Metrics + Navigation (P1) 🎯 MVP

**Goal**: User can navigate to /dashboard, select a space, and see headline metric cards with all P1 metrics. This is the MVP — directly answers the TIP client request.

**Independent Test**: Authenticate → click Dashboard in top nav → select a space → see metric cards with correct totals.

### Implementation

- [X] T013 [US7] Add /dashboard route to frontend/src/App.tsx — add new Route for Dashboard page, wrapped in UserProvider and auth guard (same pattern as /explorer). Import Dashboard page component lazily.
- [X] T014 [US7] Create top-level navigation component at frontend/src/components/navigation/TopNavigation.tsx — horizontal nav bar with links to /explorer ("Network") and /dashboard ("Dashboard"). Highlights the active route. Includes user menu (logout, theme toggle). Replaces or wraps the existing TopBar used in Explorer.
- [X] T015 [US7] Integrate TopNavigation into Explorer page at frontend/src/pages/Explorer.tsx — replace or augment existing TopBar to include the shared TopNavigation, so Navigator/Dashboard links are visible from Explorer.
- [X] T016 [US7] Create DashboardSpacePicker component at frontend/src/components/dashboard/DashboardSpacePicker.tsx — inline dropdown that lists spaces the user has access to (reuse useSpaces hook). Pre-selects spaceId from URL query parameter or context. On selection, triggers useDashboard.generate(). Shows loading state while spaces load.
- [X] T017 [US1] [US7] Create Dashboard page at frontend/src/pages/Dashboard.tsx — page shell with TopNavigation, DashboardSpacePicker, and a grid layout for dashboard panels. Reads ?space= query param to pre-select. Uses useDashboard hook. Renders DashboardPanel wrappers for each visualization slot. Initially only renders HeadlineMetrics panel.
- [X] T018 [P] [US1] Create Dashboard page styles at frontend/src/pages/Dashboard.module.css — responsive CSS grid layout for dashboard (2-3 column grid on wide screens, single column on 1024px). Uses existing CSS custom property design tokens for colors, spacing, shadows.
- [X] T019 [US1] Create HeadlineMetrics component at frontend/src/components/dashboard/HeadlineMetrics.tsx — renders a grid of metric cards from DashboardDataset.headline. Cards: Total Callouts, Total Contributions, Total Comments, Unique Contributors, Engagement Ratio (as %), Unanswered Callout %, Avg Contributions per Callout. Each card shows value + label. Respects active time-range/phase filters from useDashboard (re-computes from filtered data when filters are active).

**Checkpoint**: MVP functional — user can navigate to /dashboard, pick a space, and see headline metrics. US1 and US7 acceptance scenarios pass.

---

## Phase 4: US5 — Filter Dashboard by Phase/Tab (P2)

**Goal**: User can filter all dashboard panels by phase/tab (Knowledge Base, Innovation Flow, etc.) and by time range (last 30 days, quarter, year, all-time).

**Independent Test**: Select a space → select "Knowledge Base" phase filter → verify all panels show only Knowledge Base data. Select "Last 30 days" → verify metrics update.

### Implementation

- [X] T020 [US5] Create DashboardFilters component at frontend/src/components/dashboard/DashboardFilters.tsx — renders time-range preset selector (All Time, Last 30 Days, Last Quarter, Last Year) and phase/tab dropdown (populated from DashboardDataset.phases, with "All Phases" default). On change, updates filter state in useDashboard hook. Placed at top of Dashboard page below the space picker.
- [X] T021 [US5] Implement client-side filtering logic in frontend/src/hooks/useDashboard.ts — when time range or phase filter changes, compute filtered views: filter callouts[] by phaseId and by date range, recompute headline metrics from filtered callouts, filter contributors by activity within filtered callouts, filter timeline buckets by date range. Expose filtered dataset alongside the raw dataset. Use useMemo for performance.
- [X] T022 [US5] Integrate DashboardFilters into Dashboard page at frontend/src/pages/Dashboard.tsx — render DashboardFilters between space picker and panels grid. Wire to useDashboard filter state. Ensure HeadlineMetrics receives filtered data.

**Checkpoint**: Phase and time-range filtering works across all existing panels (headline metrics). Subsequent panels will automatically respect filters.

---

## Phase 5: US2 — Activity Over Time (P2)

**Goal**: User sees a time-series chart showing contributions over time with trend indication and type breakdowns.

**Independent Test**: Select a space with multi-month activity → see a line/area chart with monthly data points → hover for tooltip → verify types are distinguishable by color.

### Implementation

- [X] T023 [US2] Create ActivityTimeline component at frontend/src/components/dashboard/ActivityTimeline.tsx — D3.js time-series visualization using d3.line + d3.area. X-axis: monthly periods from DashboardDataset.timeline (filtered). Y-axis: contribution count. Stacked area by type (post, memo, link, whiteboard) with distinct colors from design tokens. Includes trend line (linear regression or moving average). Tooltip on hover showing period, total count, and per-type breakdown. Responsive SVG with proper margins. Renders inside DashboardPanel wrapper.
- [X] T024 [US2] Integrate ActivityTimeline into Dashboard page at frontend/src/pages/Dashboard.tsx — add a DashboardPanel for the timeline chart, passing filtered timeline data from useDashboard.

**Checkpoint**: Activity timeline renders with real data, respects filter state.

---

## Phase 6: US3 — Top Contributors & Community Breakdown (P2)

**Goal**: User sees contributor rankings, engagement distribution, organization representation, and role-based activity split.

**Independent Test**: Select a space → see a bar chart of top contributors → see active vs. inactive member distribution → see org leaderboard → see role activity split.

### Implementation

- [X] T025 [P] [US3] Create ContributorRanking component at frontend/src/components/dashboard/ContributorRanking.tsx — D3 horizontal bar chart using d3.scaleBand. Shows top 15 contributors ranked by totalContributions (from filtered ContributorDetail[]). Each bar shows avatar, name, count, and org affiliation. Tooltip with full details. Renders inside DashboardPanel.
- [X] T026 [P] [US3] Create EngagementQuality component at frontend/src/components/dashboard/EngagementQuality.tsx — multi-section panel showing: (1) engagement ratio gauge/meter (contributors/members), (2) role activity split as stacked bar (admin/lead/member using d3.scaleBand), (3) new contributors per month sparkline. Data from filtered MemberInfo[] + ContributorDetail[] + TimelineBucket[].newContributors.
- [X] T027 [P] [US3] Create OrganizationBreakdown component at frontend/src/components/dashboard/OrganizationBreakdown.tsx — horizontal bar chart or table showing organizations ranked by totalContributions. Shows memberCount, activeContributorCount, and totalContributions per org. Data from filtered OrganizationActivity[]. Renders inside DashboardPanel.
- [X] T028 [US3] Integrate contributor and community panels into Dashboard page at frontend/src/pages/Dashboard.tsx — add DashboardPanel slots for ContributorRanking, EngagementQuality, and OrganizationBreakdown. Pass filtered data from useDashboard.

**Checkpoint**: All community/contributor visualizations render. US3 acceptance scenarios pass.

---

## Phase 7: US4 — Subspace Activity Distribution (P3)

**Goal**: User sees a treemap visualization showing how activity is distributed across subspaces.

**Independent Test**: Select a space with L1/L2 subspaces → see treemap with areas proportional to contribution count → verify labels and empty state for spaces without subspaces.

### Implementation

- [X] T029 [US4] Create SubspaceDistribution component at frontend/src/components/dashboard/SubspaceDistribution.tsx — D3 treemap (d3.treemap) visualization. Builds hierarchy from SubspaceMetrics[] (parentId relationships). Size = totalContributions. Color intensity by engagement (uniqueContributors / totalMembers). Labels show subspace name + count. Tooltip with full metrics. If space has no subspaces, renders empty state message. Responsive SVG. Renders inside DashboardPanel.
- [X] T030 [US4] Integrate SubspaceDistribution into Dashboard page at frontend/src/pages/Dashboard.tsx — add DashboardPanel for treemap, passing SubspaceMetrics[] from useDashboard. Conditionally show/hide based on space.hasSubspaces.

**Checkpoint**: Treemap renders for multi-subspace spaces, shows empty state for flat spaces.

---

## Phase 8: US6 — Content Type Mix & Whiteboard Activity (P3)

**Goal**: User sees a donut chart of content type proportions and whiteboard-specific metrics.

**Independent Test**: Select a space → see donut chart showing post/memo/link/whiteboard proportions → see whiteboard metrics (total, modifications, avg modifications).

### Implementation

- [X] T031 [P] [US6] Create ContentTypeMix component at frontend/src/components/dashboard/ContentTypeMix.tsx — D3 donut chart (d3.pie + d3.arc). Segments for post, memo, link, whiteboard counts from filtered HeadlineMetrics.contributionsByType. Color per type from design tokens. Labels show type name + count + percentage. Center text shows total. Tooltip on hover. Renders inside DashboardPanel.
- [X] T032 [P] [US6] Create WhiteboardMetrics component at frontend/src/components/dashboard/WhiteboardMetrics.tsx — metric cards panel showing total whiteboards, total whiteboard modifications, and average modifications per whiteboard from filtered HeadlineMetrics. Renders inside DashboardPanel. Shows empty state if totalWhiteboards = 0.
- [X] T033 [US6] Integrate ContentTypeMix and WhiteboardMetrics into Dashboard page at frontend/src/pages/Dashboard.tsx — add DashboardPanel slots for both components, passing filtered data.

**Checkpoint**: Content type breakdown and whiteboard metrics render. US6 acceptance scenarios pass.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Advanced metrics, export, and quality hardening.

- [X] T034 [P] Implement top callouts by engagement view in frontend/src/components/dashboard/TopCallouts.tsx — ranked list/table showing callouts sorted by totalEngagement (contributions + comments). Shows title, phase, contribution count, comment count, last activity date. Limit to top 10. Data from filtered CalloutDetail[]. FR-022.
- [X] T035 [P] Implement dormant callouts indicator in frontend/src/components/dashboard/DormantCallouts.tsx — list of callouts with no activity in the last 30/60/90 days (user-selectable threshold). Shows callout title, phase, last activity date, days dormant. Data from filtered CalloutDetail[]. FR-023.
- [X] T036 [P] Implement contributor concentration metric in EngagementQuality component at frontend/src/components/dashboard/EngagementQuality.tsx — add a section showing top-5 contributors' share of total contributions (e.g. "Top 5 contributors account for 78% of all contributions"). FR-024.
- [X] T037 [P] Implement contributor return rate metric — add to EngagementQuality or create dedicated section. Compare contributor sets between consecutive monthly timeline buckets to compute retention %. FR-025.
- [X] T038 [P] Implement cross-active contributors view in ContributorRanking or a new component — highlight contributors active in 2+ subspaces. Data from ContributorDetail[].activeSubspaceCount. FR-026.
- [X] T039 Implement CSV export at frontend/src/components/dashboard/ExportButton.tsx — button that converts current filtered DashboardDataset sections (headline, contributors, callouts, timeline) to CSV and triggers browser download. Client-side generation using Blob + URL.createObjectURL. Place in Dashboard page header area. FR-027.
- [X] T040 Integrate T034–T039 components into Dashboard page at frontend/src/pages/Dashboard.tsx — add DashboardPanel slots for TopCallouts, DormantCallouts, ExportButton. Update grid layout to accommodate new panels.
- [X] T041 [P] Add visual regression test snapshots for Dashboard page at tests/visual/ — add Playwright test covering dashboard with sample data (similar pattern to existing visual tests). MUST include viewport snapshots at 1024px and 2560px widths to verify responsive layout (SC-006).
- [X] T042 Run quickstart.md validation — follow the quickstart steps end-to-end: install deps, start server, start frontend, navigate to dashboard, select a space, verify all panels render.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ─────────────────────────────────► Phase 2 (Foundational) ──► Phase 3 (US1+US7 MVP)
                                                                              │
                                                                              ├──► Phase 4 (US5 Filters)
                                                                              │      │
                                                                              │      ▼
                                                                              ├──► Phase 5 (US2 Timeline)
                                                                              ├──► Phase 6 (US3 Contributors)
                                                                              ├──► Phase 7 (US4 Subspaces)
                                                                              ├──► Phase 8 (US6 Content Mix)
                                                                              │
                                                                              ▼
                                                                           Phase 9 (Polish)
```

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1+US7)**: Depends on Phase 2 — this is the MVP
- **Phase 4 (US5)**: Depends on Phase 3 — filters require the dashboard page to exist
- **Phases 5–8**: Depend on Phase 3 (dashboard page shell exists) and benefit from Phase 4 (filters), but can technically start after Phase 3. Recommend completing Phase 4 first so all visualizations respect filters from the start.
- **Phase 9 (Polish)**: Depends on Phases 3–8 being complete

### User Story Dependencies

- **US1 (P1) + US7 (P1)**: Combined in Phase 3 — no dependencies on other stories. **This is the MVP.**
- **US5 (P2)**: Logically depends on US1/US7 (needs dashboard page). Should be done before other P2 stories so they benefit from filtering.
- **US2 (P2)**: Independent after US7 (needs page). Better after US5 (benefits from filters).
- **US3 (P2)**: Independent after US7 (needs page). Better after US5 (benefits from filters).
- **US4 (P3)**: Independent after US7 (needs page).
- **US6 (P3)**: Independent after US7 (needs page).

### Parallel Opportunities per Phase

**Phase 1**: T002 ‖ T003 ‖ T005 (all independent files, T001 can run alongside)
**Phase 2**: T010 ‖ T012 (frontend, after T001) while T006/T007 run sequentially (both need types)
**Phase 3**: T014 ‖ T018 (nav and styles are independent files)
**Phase 5–8**: Entire phases can run in parallel with each other (different component files)
**Phase 6**: T025 ‖ T026 ‖ T027 (three independent component files)
**Phase 8**: T031 ‖ T032 (two independent component files)
**Phase 9**: T034 ‖ T035 ‖ T036 ‖ T037 ‖ T038 (all independent components)

---

## Implementation Strategy

### MVP First (Phase 1–3)

Deliver the minimum that answers the TIP client request:
1. Server data pipeline (GraphQL → transform → BFF endpoint)
2. Dashboard page with navigation and space picker
3. Headline metric cards

This is **independently deployable and demonstrable** — a user can navigate to the dashboard, select a space, and see the key numbers.

### Incremental Delivery (Phases 4–8)

Each subsequent phase adds one visualization panel. After each phase, the dashboard becomes richer:
- Phase 4: Filters make all data sliceable by time + phase
- Phase 5: Timeline chart shows trends
- Phase 6: Contributor/community panels show the people side
- Phase 7: Treemap shows structural distribution
- Phase 8: Content mix + whiteboard specifics

### Polish (Phase 9)

Advanced metrics and export — nice-to-have features that round out the dashboard for power users and stakeholders who need to share data.

### Suggested MVP Scope

**Phases 1–3 (T001–T019)** — 19 tasks. Delivers: working dashboard page, headline metrics, navigation. This is the minimum to show TIP and get feedback.
