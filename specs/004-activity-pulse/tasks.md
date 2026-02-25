# Tasks: Activity Pulse Visualization

**Input**: Design documents from `/specs/004-activity-pulse/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: GraphQL query definition and type generation — prerequisites for all backend work.

- [X] T001 Create `server/src/graphql/queries/activityFeedGrouped.graphql` with the `ActivityFeedGrouped` query (query `activityFeedGrouped(args)` returning `id`, `type`, `createdDate`, `triggeredBy { id }`, `space { id }`)
- [X] T002 Run `pnpm run codegen` in `server/` to regenerate `server/src/graphql/generated/alkemio-schema.ts` with the new typed SDK method
- [X] T003 Add `ActivityTier` enum (`INACTIVE | LOW | MEDIUM | HIGH`) and `ActivityCount` interface (`userId`, `spaceId`, `count`, `tier`) to `server/src/types/graph.ts`
- [X] T004 [P] Extend `GraphEdge` type in `server/src/types/graph.ts` with optional `activityCount?: number` and `activityTier?: ActivityTier` fields
- [X] T005 [P] Add `hasActivityData?: boolean` field to `GraphDataset` type in `server/src/types/graph.ts`
- [X] T006 [P] Extend `AcquiredData` type in `server/src/services/acquire-service.ts` (or its type file) with optional `activityEntries?: ActivityLogEntry[]` field

**Checkpoint**: Types are defined, SDK is regenerated. Backend implementation can begin.

---

## Phase 2: Foundational — Server-Side Data Pipeline

**Purpose**: Fetch, aggregate, and attach activity data to the graph dataset. BLOCKS all frontend user story work.

**⚠️ CRITICAL**: Frontend Activity Pulse cannot function without edge-level activity data from the server.

- [X] T007 Implement activity data acquisition in `server/src/services/acquire-service.ts`: call `SDK.activityFeedGrouped({ args: { spaceIds, limit: 5000, types: [9 contribution event types] } })` in parallel with existing user/org profile fetching. Store results in `AcquiredData.activityEntries`. Wrap in try-catch — on failure, set `activityEntries` to `undefined` and log warning.
- [X] T008 Implement `aggregateActivityCounts(entries: ActivityLogEntry[]): Map<string, number>` in `server/src/transform/transformer.ts` — aggregate entries into a `Map<"userId:spaceId", count>` by counting entries per `triggeredBy.id` + `space.id` pair.
- [X] T009 Implement `computeActivityTiers(countMap: Map<string, number>): Map<string, ActivityTier>` in `server/src/transform/transformer.ts` — extract non-zero counts, sort ascending, compute p25/p75 quartile boundaries, classify each entry. Handle edge cases: all-same count → MEDIUM; fewer than 3 non-zero entries → fixed thresholds (1-2 = LOW, 3-10 = MEDIUM, 11+ = HIGH); zero count → INACTIVE.
- [X] T010 Integrate activity data into the edge-building step of `server/src/transform/transformer.ts` — for each user→space edge (type MEMBER or LEAD where source is USER node), look up `activityCount` and `activityTier` from the computed maps and attach to the `GraphEdge` object. Leave org→space and CHILD edges without activity fields.
- [X] T011 Set `dataset.hasActivityData = true` in `server/src/services/graph-service.ts` when `activityEntries` is defined; set to `false` otherwise. Ensure the flag is included in the cached dataset.

**Checkpoint**: Server returns `GraphDataset` with `hasActivityData`, and user→space edges carry `activityCount` + `activityTier`. Verify by loading a graph and inspecting the JSON response.

---

## Phase 3: User Story 1 — Enable Activity Pulse Mode (Priority: P1) 🎯 MVP

**Goal**: Toggle in ControlPanel enables/disables CSS pulse animation on user→space edges proportional to contribution intensity.

**Independent Test**: Load a graph, toggle Activity Pulse on → user→space edges animate with tier-based speeds. Toggle off → edges smoothly return to static.

### Implementation

- [X] T012 Add `activityPulseEnabled` boolean state to `frontend/src/pages/Explorer.tsx` (default `false`). Thread it as a prop to `ForceGraph` and `ControlPanel` components. Also pass a `hasActivityData` boolean derived from the loaded dataset.
- [X] T013 Add "Activity Pulse" checkbox toggle to `frontend/src/components/panels/ControlPanel.tsx` — enabled only when `hasActivityData` is `true`; when `false`, show disabled checkbox with a tooltip "Activity data unavailable". Wire `onChange` to update `activityPulseEnabled` state via callback prop.
- [X] T014 Create CSS animation classes (using CSS Modules `:global` scope) in `frontend/src/components/graph/ForceGraph.module.css` (or a new `pulse.css` file alongside ForceGraph):
  - `@keyframes pulse-flow { from { stroke-dashoffset: 32; } to { stroke-dashoffset: 0; } }`
  - `.edge-pulse` — `stroke-dasharray: 8 24; animation: pulse-flow var(--pulse-duration, 2s) linear infinite;`
  - `.edge-pulse-entering` — transition `stroke-dasharray` from `0 32` to `8 24` over 300ms (fade-in)
  - `.edge-pulse-exiting` — transition `stroke-dasharray` from `8 24` to `0 32` over 300ms (fade-out)
  - Tier custom property values: `--pulse-duration: 4s` (LOW), `2s` (MEDIUM), `0.8s` (HIGH)
- [X] T015 Implement `useEffect([activityPulseEnabled])` in `frontend/src/components/graph/ForceGraph.tsx` — when enabled: select all user→space `<path>` edges via D3, set CSS custom property `--pulse-duration` based on `edge.activityTier`, add `.edge-pulse-entering` class, then after 300ms swap to `.edge-pulse`. INACTIVE tier edges get no animation class. When disabled: add `.edge-pulse-exiting` class, remove `.edge-pulse` after 300ms transition ends.
- [X] T016 Ensure org→space edges (`FR-013`) are excluded from pulse animation in the `useEffect` — only edges where the source node is a `USER` type and `activityTier` is defined receive animation classes.

**Checkpoint**: Activity Pulse toggle works end-to-end. Enabling shows pulsing edges at 4 distinct speeds; disabling smoothly fades out. Org edges remain static.

---

## Phase 4: User Story 2 — Contribution Data Included in Graph Load (Priority: P2)

**Goal**: Verify data pipeline is seamless — no secondary fetch, instant toggle activation, graceful degradation on failure.

**Independent Test**: Load a graph → confirm `hasActivityData` is `true` in dataset; toggle activates instantly. Simulate API failure → toggle is disabled.

### Implementation

- [X] T017 Verify `acquire-service.ts` fires activity fetch in parallel with user/org fetching (not sequentially) — adjust `Promise.all` / `Promise.allSettled` grouping if needed to avoid adding to critical-path load time.
- [X] T018 Add error-path handling verification: when `activityFeedGrouped` fails, confirm `hasActivityData === false` in the dataset, and confirm the ControlPanel toggle shows the disabled state with tooltip text (from T013).
- [X] T019 Validate that cached datasets include activity data — load a graph once, confirm second load serves cached data with activity tiers still present on edges (verify via browser DevTools network tab or server log).

**Checkpoint**: Data pipeline is robust — happy path and error path both work correctly. Cache preserves activity data.

---

## Phase 5: User Story 3 — Activity Pulse Works in Both Views (Priority: P3)

**Goal**: Pulse state persists across force graph ↔ map view switches.

**Independent Test**: Enable pulse in force graph → switch to map view → edges still animate. Switch back → still animating.

### Implementation

- [X] T020 Confirm `activityPulseEnabled` state lives in `Explorer.tsx` (parent of both views) — already done in T012. Verify that when switching views, the state is NOT reset.
- [X] T021 Apply pulse animation logic to the map graph component (`frontend/src/components/map/`) — reuse the same CSS classes and tier-to-duration mapping from T014/T015. If map view uses a different edge rendering approach, adapt the D3 selection logic accordingly.
- [X] T022 Test transition: enable pulse in force graph → switch to map → pulse continues. Disable in map → switch to force graph → edges are static.

**Checkpoint**: Pulse toggle state is view-agnostic. Both views render pulse consistently.

---

## Phase 6: User Story 4 — Pulse Intensity on Node Selection (Priority: P4)

**Goal**: Selection highlighting composes with Activity Pulse — selected connections keep their pulse; non-connected edges are subdued.

**Independent Test**: Enable pulse → click a user node → that user's space edges pulse prominently; all other edges are dimmed with paused/slowed animation. Deselect → all edges return to normal pulse.

### Implementation

- [X] T023 Extend the existing `useEffect([selectedNodeId])` in `frontend/src/components/graph/ForceGraph.tsx` to also manage `animation-play-state` on pulse classes: when a node is selected, set `animation-play-state: paused` on non-connected edges (already dimmed by selection highlight). Keep `animation-play-state: running` on 1st-degree connections.
- [X] T024 Handle interaction between dimming and pulse: non-connected edges already get `opacity: 0.1` from selection highlight. Confirm that pausing animation on these edges produces a clean "frozen dim" look (no visual conflict between `opacity` transition and dash-pattern).
- [X] T025 Handle deselection: when `selectedNodeId` clears, restore `animation-play-state: running` on all edges that have the `.edge-pulse` class.

**Checkpoint**: Selection + pulse compose naturally. No visual glitches, no CSS property conflicts.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, performance validation, and cleanup.

- [X] T026 [P] Implement `prefers-reduced-motion` support (FR-014): add CSS `@media (prefers-reduced-motion: reduce)` rule in pulse CSS — set `animation: none` on `.edge-pulse`, use static `stroke-dasharray: 4 12` as dotted indicator with color varying by tier (`INACTIVE` = default, `LOW` = `#93c5fd`, `MEDIUM` = `#3b82f6`, `HIGH` = `#1d4ed8`). In `ControlPanel.tsx`, optionally update toggle label to "Activity Indicators" when reduced motion is detected via `window.matchMedia('(prefers-reduced-motion: reduce)')`.
- [X] T027 [P] Performance validation: load a graph with 500+ user→space edges, enable Activity Pulse, and verify smooth interaction (pan, zoom, drag) at 30+ fps using Chrome DevTools Performance panel. If frame drops detected, investigate and optimize (e.g., reduce dash complexity, batch class additions).
- [X] T028 [P] Code cleanup: ensure all new types are properly exported, unused imports removed. Run `pnpm run tsc --noEmit` in both `server/` and `frontend/` to verify type safety. Run `pnpm run lint` to check linting.
- [X] T029 Run `specs/004-activity-pulse/quickstart.md` validation — follow the developer guide end-to-end to confirm all steps work.

**Checkpoint**: Feature is complete, accessible, performant, and type-safe.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup (T001-T006) — No dependencies, start immediately
    │
    ▼
Phase 2: Foundational (T007-T011) — Depends on Phase 1 (types + codegen)
    │                                BLOCKS all frontend work
    ▼
Phase 3: US1 (T012-T016) ─── P1 MVP ─── Can start after Phase 2
    │
    ├── Phase 4: US2 (T017-T019) ─── Validation of Phase 2 pipeline
    │
    ├── Phase 5: US3 (T020-T022) ─── Depends on T012 (state in Explorer)
    │
    └── Phase 6: US4 (T023-T025) ─── Depends on T015 (pulse useEffect)
         │
         ▼
    Phase 7: Polish (T026-T029) ─── After all user stories complete
```

### Parallel Opportunities

- **Phase 1**: T003 sequential (enum before fields), then T004 + T005 + T006 in parallel (different type extensions)
- **Phase 2**: T007 (acquire) → T008 + T009 in parallel (both in transformer, different functions) → T010 (depends on T008+T009) → T011
- **Phase 3**: T012 → T013 + T014 in parallel (ControlPanel + CSS, different files) → T015 → T016
- **Phases 4-6**: Can all run in parallel after Phase 3 (different concerns, minimal file overlap)
- **Phase 7**: T026 + T027 + T028 all in parallel (different concerns)

### Within Each User Story

- State/prop setup before UI components
- CSS classes before JS logic that references them
- Core implementation before edge-case handling
- Commit after each phase checkpoint

---

## Implementation Strategy

### MVP First (Phases 1-3)

1. Complete Phase 1: Setup (types + codegen)
2. Complete Phase 2: Foundational (server pipeline)
3. Complete Phase 3: User Story 1 (toggle + animation)
4. **STOP and VALIDATE**: Full MVP — working Activity Pulse toggle with tier-based animation
5. Deploy/demo if ready

### Incremental Delivery

1. Phases 1+2 → Server foundation ready
2. Phase 3 → **MVP**: Working pulse toggle (P1)
3. Phase 4 → Data pipeline hardened (P2)
4. Phase 5 → Cross-view persistence (P3)
5. Phase 6 → Selection composition (P4)
6. Phase 7 → Polish, accessibility, performance

---

## Notes

- [P] tasks = different files, no dependencies
- T014 CSS classes use `:global` scope for D3 `.classed()` compatibility
- T009 quartile algorithm has 3 edge-case fallbacks per research.md R3
- T007 activity fetch is fire-and-forget (wrapped in try-catch) — never blocks graph generation
- Activity data is all-time (no date range filter in v1)
- Commit after each phase checkpoint
