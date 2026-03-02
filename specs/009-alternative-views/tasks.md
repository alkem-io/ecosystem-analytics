# Tasks: 009 — Alternative Visualization Views

**Input**: Design documents from `/specs/009-alternative-views/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Not requested in the specification. No test tasks included.

**Organization**: Tasks grouped by user story (one per view). User stories derived from spec.md Section 2:
- **US1**: Treemap View — "Where is the energy?" (P1)
- **US2**: Sunburst View — "Where does everyone sit?" (P1)
- **US3**: Chord Diagram — "Who cross-pollinates?" (P2)
- **US4**: Activity Timeline — "When does the ecosystem pulse?" (P3)
- **US5**: Temporal Force Graph — "How did this network grow?" (P3)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[US#]**: Maps task to its user story
- All file paths are relative to repository root

---

## Phase 1: Setup

**Purpose**: Verify tooling and create shared type definitions

- [x] T001 Verify D3 hierarchical modules are installed, add missing ones in `frontend/package.json` (`d3-hierarchy`, `d3-chord`, `d3-shape`, `d3-scale`, `d3-brush`, `d3-timer`, `d3-interpolate` and their `@types/` counterparts)
- [x] T002 Create all new frontend type definitions in `frontend/src/types/views.ts` (`ViewMode`, `HierarchySizeMetric`, `ChordMode`, `ViewState`, `INITIAL_VIEW_STATE`, `HierarchyDatum`, `ChordMatrixResult`) per contracts/data-types.md Section 3-4
- [x] T003 [P] Create CSS module for shared view styling in `frontend/src/components/graph/Views.module.css` (container, empty-state message, breadcrumb trail, view-specific tokens using existing palette: `#7dd3fc`, `#38bdf8`, `#1e3a5f`, `#e5e7eb`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side data enrichment and frontend infrastructure that ALL views depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Server — Type & Schema Extensions

- [x] T004 Extend `GraphNode` interface with `createdDate?: string`, `visibility?: 'ACTIVE' | 'ARCHIVED' | 'DEMO'`, and `tags?: TagData` in `server/src/types/graph.ts`; add `TagData` interface per data-model.md Section 1
- [x] T005 Extend `GraphEdge` interface with `createdDate?: string` in `server/src/types/graph.ts` per data-model.md Section 2
- [x] T006 Add `ActivityTimeBucket` and `SpaceTimeSeries` interfaces in `server/src/types/graph.ts` per data-model.md Section 3
- [x] T007 Extend `GraphDataset` interface with `timeSeries?: SpaceTimeSeries[]` in `server/src/types/graph.ts` per data-model.md Section 4
- [x] T008 [P] Add `createdDate` and `visibility` fields to space query, add `tagsets { name tags type allowedValues }` to space profile in `server/src/graphql/queries/` per contracts/server-api.md Section 2
- [ ] T009 [P] Add `createdDate` and `tagsets { name tags type }` fields to `usersByIDs` query in `server/src/graphql/queries/` per contracts/server-api.md Section 2
- [x] T010 [P] Add `tagsets { name tags type }` to organization profile in `server/src/graphql/queries/` per contracts/server-api.md Section 2
- [x] T011 Run `pnpm run codegen` in `server/` to regenerate typed SDK from updated GraphQL fragments

### Server — Transformer Extensions

- [x] T012 Implement `buildTimeSeries()` function in `server/src/transform/transformer.ts` — groups activity entries by `(spaceId, isoWeek)`, returns `SpaceTimeSeries[]` per contracts/server-api.md Section 3
- [x] T013 Implement `estimateEdgeCreatedDate()` function in `server/src/transform/transformer.ts` — priority: Application.createdDate → earliest activity date → space.createdDate per data-model.md Section 2
- [x] T014 Extend `transformToGraph()` in `server/src/transform/transformer.ts` to populate `createdDate`, `visibility`, and `tags` on each `GraphNode`, `createdDate` on each `GraphEdge`, and `timeSeries` on `GraphDataset`

### Frontend — Foundation

- [x] T015 [P] Create `useViewState` hook in `frontend/src/hooks/useViewState.ts` — manages `ViewState` with `INITIAL_VIEW_STATE`, exposes setter functions per contracts/view-props.md useViewState section
- [x] T016 [P] Create `ViewSwitcher` component in `frontend/src/components/graph/ViewSwitcher.tsx` — horizontal tab bar with icons for each `ViewMode`, hides Timeline/Temporal tabs when `hasTemporalData=false` per contracts/view-props.md ViewSwitcher section
- [x] T017 Wire `ViewSwitcher` into `Explorer.tsx` in `frontend/src/pages/Explorer.tsx` — add `useViewState()`, render `ViewSwitcher` above the graph area, add conditional rendering shell that switches on `viewState.activeView`

**Checkpoint**: Foundation ready — all data enriched, types defined, view switching works (shows placeholder content per view). User story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — Treemap View (Priority: P1) 🎯 MVP

**Goal**: Users can view the ecosystem as a space-filling treemap where rectangle area encodes activity (or members) and color encodes activity tier, answering "Where is the energy?"

**Independent Test**: Select a space → switch to Treemap view → see rectangles sized by activity count → click a rectangle to zoom into subspaces → switch size metric to "members" → rectangles resize → `tsc --noEmit` passes

### Implementation

- [x] T018 [P] [US1] Create `useHierarchyData` hook in `frontend/src/hooks/useHierarchyData.ts` — transforms flat `GraphNode[]` + `GraphEdge[]` into `HierarchyDatum` tree per data-model.md Section 6 tree construction algorithm; returns `{ root, loading }` per contracts/data-types.md Section 5
- [x] T019 [US1] Create `TreemapView` component in `frontend/src/components/graph/TreemapView.tsx` — uses `d3.treemap()` layout on `useHierarchyData` root, renders declarative JSX `<rect>` elements, implements zoom-on-click with breadcrumb trail, color-codes by activity tier (`#7dd3fc` LOW, `#38bdf8` MEDIUM, `#1e3a5f` HIGH, `#e5e7eb` INACTIVE), floors empty spaces to value=1 per contracts/view-props.md TreemapView section
- [x] T020 [US1] Add treemap-specific controls to `ControlPanel` in `frontend/src/components/panels/ControlPanel.tsx` — "Size by" dropdown (`Members | Activity day/week/month/all-time`), only visible when `activeView === 'treemap'`
- [x] T021 [US1] Wire `TreemapView` into Explorer conditional rendering in `frontend/src/pages/Explorer.tsx` — pass `dataset`, `sizeMetric`, `focusedSpaceId`, `activityPeriod`, `selectedNodeId`, `width`, `height` and callbacks from `useViewState`

**Checkpoint**: Treemap view fully functional — can switch to it, see sized/colored rectangles, zoom in/out, change size metric. MVP deliverable.

---

## Phase 4: User Story 2 — Sunburst View (Priority: P1)

**Goal**: Users can view the ecosystem as a zoomable radial sunburst where arc width encodes member count (or activity) and nesting shows the space hierarchy, answering "Where does everyone sit?"

**Independent Test**: Switch to Sunburst view → see nested radial arcs (center=ecosystem, rings=L0/L1/L2) → click an arc to zoom in smoothly (~750ms) → click center to zoom out → switch to activity sizing → arcs resize → `tsc --noEmit` passes

### Implementation

- [x] T022 [P] [US2] Create `SunburstView` component in `frontend/src/components/graph/SunburstView.tsx` — uses `d3.partition()` layout on `useHierarchyData` root, renders hybrid: JSX for initial arcs + imperative `d3.transition()` for zoom via `attrTween('d', arcTween)` per research.md Topic 3; center circle shows "Ecosystem" label; depth-band coloring (L0=dark, L1=medium, L2=light); private spaces get diagonal hatch pattern per contracts/view-props.md SunburstView section
- [x] T023 [US2] Add sunburst-specific controls to `ControlPanel` in `frontend/src/components/panels/ControlPanel.tsx` — "Size by" dropdown (reuses treemap metric), "Show members" toggle checkbox, only visible when `activeView === 'sunburst'`
- [x] T024 [US2] Wire `SunburstView` into Explorer conditional rendering in `frontend/src/pages/Explorer.tsx` — pass `dataset`, `sizeMetric`, `activityPeriod`, `selectedNodeId`, `showMembers`, `width`, `height` and callbacks

**Checkpoint**: Sunburst view fully functional — zoomable nested radial diagram, smooth transitions, member/activity sizing toggle.

---

## Phase 5: User Story 3 — Chord Diagram (Priority: P2)

**Goal**: Users can view cross-space membership overlap as a chord diagram where ribbon thickness shows the number of shared members between spaces, answering "Who cross-pollinates?"

**Independent Test**: Switch to Chord view → see L0 space arcs on outer ring → ribbons connect spaces with shared members → hover a ribbon shows tooltip "Space A ↔ Space B: N shared members" → hover an arc highlights its ribbons → switch role filter → ribbons update → `tsc --noEmit` passes

### Implementation

- [x] T025 [P] [US3] Create `useChordMatrix` hook in `frontend/src/hooks/useChordMatrix.ts` — computes `ChordMatrixResult` from `GraphNode[]` + `GraphEdge[]` using `useMemo`; builds N×N shared-member matrix per data-model.md Section 7 algorithm; supports role filter and group level (L0/L1) per contracts/data-types.md Section 4
- [x] T026 [US3] Create `ChordView` component in `frontend/src/components/graph/ChordView.tsx` — uses `d3.chord()` for layout + `d3.ribbon()` for paths, renders declarative JSX `<path>` elements, colors arcs per `d3.schemeTableau10`, hover-highlight with 0.15 opacity dimming, tooltip on ribbon hover, fallback message when `shared-tags` mode has no tag data per contracts/view-props.md ChordView section
- [x] T027 [US3] Add chord-specific controls to `ControlPanel` in `frontend/src/components/panels/ControlPanel.tsx` — "Mode" toggle (`Shared Members | Shared Tags`), "Group by" toggle (`L0 | L1`), only visible when `activeView === 'chord'`
- [x] T028 [US3] Wire `ChordView` into Explorer conditional rendering in `frontend/src/pages/Explorer.tsx` — pass `dataset`, `chordMode`, `roleFilter`, `selectedNodeId`, `groupLevel`, `width`, `height` and callbacks

**Checkpoint**: Chord diagram fully functional — shows cross-pollination, interactive hover, role filtering.

---

## Phase 6: User Story 4 — Activity Timeline (Priority: P3)

**Goal**: Users can view ecosystem activity over time as a stacked area chart with a brush for time-range selection, answering "When does the ecosystem pulse?"

**Independent Test**: Switch to Timeline view → see stacked colored bands (one per space) over time axis → brush a time range → `onBrushChange` fires with `[start, end]` → double-click to clear brush → legend shows space names → click legend entry to toggle band visibility → if no `timeSeries` data, see "No temporal data available" message → `tsc --noEmit` passes

### Implementation

- [x] T029 [P] [US4] Create `useTimeSeries` hook in `frontend/src/hooks/useTimeSeries.ts` — parses `SpaceTimeSeries[]` from `GraphDataset.timeSeries`, computes date extent `[min, max]`, converts ISO week strings to `Date` objects for d3 time scales; returns `{ series, dateExtent, loading }` per contracts/data-types.md Section 5
- [x] T030 [US4] Create `TimelineView` component in `frontend/src/components/graph/TimelineView.tsx` — uses `d3.stack()` + `d3.area()` for stacked band layout, declarative `<path>` for areas, imperative `d3.brushX()` via ref for time selection, auto-scaled axes (x=time, y=count), legend with click-to-toggle, tooltip showing date + per-space counts, supports stacked/stream toggle via `chartType` prop, empty-state fallback per contracts/view-props.md TimelineView section
- [x] T031 [US4] Add timeline-specific controls to `ControlPanel` in `frontend/src/components/panels/ControlPanel.tsx` — "Chart type" toggle (`Stacked | Streamgraph`), brush range display label, only visible when `activeView === 'timeline'`
- [x] T032 [US4] Wire `TimelineView` into Explorer conditional rendering in `frontend/src/pages/Explorer.tsx` — pass `dataset`, `brushRange`, `selectedNodeId`, `chartType`, `width`, `height` and callbacks including `onBrushChange`

**Checkpoint**: Timeline view fully functional — stacked area with brush, time selection, legend interaction.

---

## Phase 7: User Story 5 — Temporal Force Graph (Priority: P3)

**Goal**: Users can animate the existing force graph over time, watching nodes and edges appear at their creation dates with a time scrubber, answering "How did this network grow?"

**Independent Test**: Switch to Force Graph → enable Temporal mode toggle → time scrubber appears → drag scrubber to earliest date → only oldest nodes visible → advance scrubber → nodes/edges fade in (300ms) → press Play → auto-advances at selected speed → new nodes appear with entrance animation → simulation warm-restarts smoothly → pause → switch back to normal mode → all nodes visible → if no `createdDate` data on nodes, temporal toggle is disabled → `tsc --noEmit` passes

### Implementation

- [x] T033 [US5] Add `temporalMode`, `temporalDate`, and `onTemporalDateChange` props to `ForceGraph` component in `frontend/src/components/graph/ForceGraph.tsx` per contracts/view-props.md ForceGraph Temporal Mode Extension section
- [x] T034 [US5] Implement temporal node/edge visibility filtering in `frontend/src/components/graph/ForceGraph.tsx` — in tick handler, set SVG `visibility: hidden` on nodes with `createdDate > temporalDate` and their connected edges; force collision only considers visible nodes per research.md Topic 6
- [x] T035 [US5] Implement entrance animation for appearing nodes in `frontend/src/components/graph/ForceGraph.tsx` — new nodes start `opacity: 0`, tween to 1 over 300ms; simulation warm-restarts with `alpha(0.1)` per research.md Topic 6
- [x] T036 [US5] Implement time scrubber UI in `frontend/src/components/graph/ForceGraph.tsx` — horizontal range input with `min=earliestDate`, `max=latestDate`, `step=86400000` (1 day); play/pause button; speed selector (1x/2x/5x); current date label; uses `d3.timer()` for auto-advance per research.md Topic 6
- [x] T037 [US5] Add temporal mode toggle to `ControlPanel` in `frontend/src/components/panels/ControlPanel.tsx` — "Temporal mode" toggle switch, disabled when no `createdDate` data exists, only visible when `activeView === 'force-graph'`
- [x] T038 [US5] Wire temporal state from `useViewState` into Explorer and ForceGraph in `frontend/src/pages/Explorer.tsx` — pass `temporalMode`, `temporalDate`, `temporalPlaying`, `temporalSpeed` and corresponding callbacks

**Checkpoint**: Temporal force graph fully functional — time scrubber animation, entrance effects, playback controls.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span multiple user stories

- [x] T039 [P] Add graceful degradation empty-state components for all views — "No data available" / "No temporal data available" messages with consistent styling in `frontend/src/components/graph/ViewEmptyState.tsx`
- [x] T040 [P] Performance audit — wrap all `d3.*()` layout computations in `useMemo`, event handlers in `useCallback` across `TreemapView.tsx`, `SunburstView.tsx`, `ChordView.tsx`, `TimelineView.tsx`
- [x] T041 Implement cross-view node selection persistence — selecting a node in any view updates `viewState.selectedNodeId`, which highlights the corresponding element when switching to another view, in `frontend/src/pages/Explorer.tsx`
- [x] T042 [P] Add `aria-label` attributes and keyboard navigation support to `ViewSwitcher.tsx` (arrow keys to switch tabs, Enter to select) in `frontend/src/components/graph/ViewSwitcher.tsx`
- [x] T043 Run `tsc --noEmit` on both `server/` and `frontend/` to validate full type-check passes
- [x] T044 Run quickstart.md validation — follow `specs/009-alternative-views/quickstart.md` Build Verification steps end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ──────────────────────────► (no deps, start immediately)
Phase 2: Foundational ───────────────────► depends on Phase 1 — BLOCKS all user stories
Phase 3: US1 Treemap (P1) ──────────────► depends on Phase 2
Phase 4: US2 Sunburst (P1) ─────────────► depends on Phase 2 + T018 (useHierarchyData from US1)
Phase 5: US3 Chord (P2) ────────────────► depends on Phase 2
Phase 6: US4 Timeline (P3) ─────────────► depends on Phase 2 (needs server timeSeries from T012-T014)
Phase 7: US5 Temporal Force (P3) ────────► depends on Phase 2 (needs server createdDate from T013-T014)
Phase 8: Polish ─────────────────────────► depends on all desired user stories being complete
```

### User Story Dependencies

- **US1 (Treemap)**: Depends on Phase 2 only. Creates `useHierarchyData` hook that US2 also uses.
- **US2 (Sunburst)**: Depends on Phase 2 + `useHierarchyData` from US1 (T018). Can start T022 in parallel if T018 is done.
- **US3 (Chord)**: Depends on Phase 2 only. Fully independent of US1/US2.
- **US4 (Timeline)**: Depends on Phase 2 only (server `timeSeries` data built in Foundational T012-T014). Independent of US1-US3.
- **US5 (Temporal)**: Depends on Phase 2 only (server `createdDate` fields from Foundational T013-T014). Independent of US1-US4.

### Within Each User Story

1. Hook/data layer first (marked [P] — can start immediately after Phase 2)
2. Component implementation (depends on hook)
3. ControlPanel integration (depends on component API being stable)
4. Explorer wiring (depends on component + controls ready)

### Parallel Opportunities

After Phase 2 completes, the following can run **simultaneously**:

- **US1 (Treemap)** + **US3 (Chord)** + **US4 (Timeline)** + **US5 (Temporal)** — all touch different files
- **US2 (Sunburst)** can start in parallel once T018 (`useHierarchyData`) is complete

Within each story, hook creation [P] tasks can run in parallel with hooks from other stories:
- T018 (`useHierarchyData`) ∥ T025 (`useChordMatrix`) ∥ T029 (`useTimeSeries`)

---

## Parallel Example: After Phase 2 Completion

```
┌─ Track A (Hierarchy Views) ────────────────────────────────────┐
│ T018 useHierarchyData.ts                                       │
│ T019 TreemapView.tsx ──► T020 ControlPanel (treemap) ──► T021  │
│ T022 SunburstView.tsx ──► T023 ControlPanel (sunburst) ──► T024│
└────────────────────────────────────────────────────────────────┘

┌─ Track B (Chord) ─────────────────────────────────────────────┐
│ T025 useChordMatrix.ts                                         │
│ T026 ChordView.tsx ──► T027 ControlPanel (chord) ──► T028      │
└────────────────────────────────────────────────────────────────┘

┌─ Track C (Timeline) ──────────────────────────────────────────┐
│ T029 useTimeSeries.ts                                          │
│ T030 TimelineView.tsx ──► T031 ControlPanel (timeline) ──► T032│
└────────────────────────────────────────────────────────────────┘

┌─ Track D (Temporal Force) ────────────────────────────────────┐
│ T033-T036 ForceGraph.tsx temporal ──► T037 ControlPanel ──► T038│
└────────────────────────────────────────────────────────────────┘
```

---

## Implementation Strategy

### MVP First (User Story 1: Treemap Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (server + frontend infrastructure)
3. Complete Phase 3: US1 Treemap
4. **STOP and VALIDATE**: Treemap renders, zoom works, size metric switches correctly
5. Deploy/demo if ready — users can now switch between Force Graph and Treemap

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. **US1 Treemap** → Validate → First new view available (MVP!)
3. **US2 Sunburst** → Validate → Hierarchy exploration complete
4. **US3 Chord** → Validate → Cross-pollination insights available
5. **US4 Timeline** → Validate → Temporal dimension unlocked
6. **US5 Temporal Force** → Validate → Animated network growth
7. Polish → Cross-view selection, accessibility, performance tuning
8. Each story adds a new analytical lens without breaking previous views

---

## Notes

- All views use the same `GraphDataset` — no separate data fetching per view
- The `useHierarchyData` hook is shared between Treemap (US1) and Sunburst (US2)
- ControlPanel changes in each story are additive (conditional blocks gated by `activeView`)
- Explorer.tsx wiring in each story adds one more `case` to the view switch
- Server changes (T004-T014) are all in Foundational to avoid blocking later stories
- Commit after each task or logical group; verify `tsc --noEmit` at each checkpoint
