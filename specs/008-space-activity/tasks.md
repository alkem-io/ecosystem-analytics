# Tasks: Space Activity Volume

**Input**: Design documents from `/specs/008-space-activity/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Data Pipeline — Server)

**Purpose**: Extend the server data model and aggregation pipeline so space nodes carry `totalActivityCount` and `spaceActivityTier` in the BFF response.

- [x] T001 [P] Add `totalActivityCount` (optional number) and `spaceActivityTier` (optional `ActivityTier`) fields to the `GraphNode` interface in `server/src/types/graph.ts` (after the existing `privacyMode` field at L88). Include JSDoc comments matching data-model.md.
- [x] T002 [P] Add `aggregateSpaceActivityCounts(countMap: Map<string, number>): Map<string, number>` function in `server/src/transform/transformer.ts` (after the existing `aggregateActivityCounts` function at L318). Logic: iterate `countMap` entries, split each key on `:`, sum counts by spaceId. Return `Map<spaceId, totalCount>`.
- [x] T003 Wire space activity data into the existing activity attachment block in `server/src/transform/transformer.ts` (at L96–115, inside the `if (data.activityEntries)` block). After the existing edge-attachment loop: call `aggregateSpaceActivityCounts(countMap)` → pass result to `computeActivityTiers()` → iterate `nodes`, for each space node (SPACE_L0/L1/L2) set `node.totalActivityCount` from the space count map and `node.spaceActivityTier` from the space tier map.

**Checkpoint**: `POST /api/graph/generate` response now includes `totalActivityCount` and `spaceActivityTier` on space nodes. Verify with `curl` per quickstart.md §1.

---

## Phase 2: Foundational (Frontend Scaffolding)

**Purpose**: Add the `spaceActivityEnabled` state and wire it through Explorer → ControlPanel → ForceGraph. No visual changes yet — just plumbing.

**⚠️ CRITICAL**: Must complete before any user story phase.

- [x] T004 Add `spaceActivityEnabled` boolean state (default `false`) in `frontend/src/pages/Explorer.tsx` (after the existing `activityPulseEnabled` state at L50).
- [x] T005 Pass `spaceActivityEnabled` and `onToggleSpaceActivity` callback props to `<ControlPanel>` in `frontend/src/pages/Explorer.tsx` (at L155–185, alongside the existing `activityPulseEnabled` prop).
- [x] T006 Pass `spaceActivityEnabled` prop to `<ForceGraph>` in `frontend/src/pages/Explorer.tsx` (at L187–217, alongside the existing `activityPulseEnabled` prop).
- [x] T007 [P] Add `spaceActivityEnabled` (optional boolean) and `onToggleSpaceActivity` (optional callback) to the `Props` interface in `frontend/src/components/panels/ControlPanel.tsx` (at L8–38). Add to destructuring (at L40–63).
- [x] T008 [P] Add `spaceActivityEnabled` (optional boolean, default `false`) to the `Props` interface in `frontend/src/components/graph/ForceGraph.tsx` (at L96–115). Add to destructuring.

**Checkpoint**: TypeScript compiles. Toggle state flows from Explorer through ControlPanel and ForceGraph. No visual effect yet.

---

## Phase 3: User Story 1 — Space Activity Sizing (Priority: P1) 🎯 MVP

**Goal**: When "Space Activity" is enabled, space node radius scales logarithmically by `totalActivityCount` (max 2.5×). Toggling off restores degree-based sizing. No simulation restart. Animated transition (~300ms).

**Independent Test**: Enable "Space Activity" → space nodes visibly resize based on contribution volume. A space with 200 contributions is clearly larger than one with 5. Toggling off restores original sizes. Positions preserved.

### Implementation

- [x] T009 [US1] Add `MAX_ACTIVITY_SCALE` constant (`2.5`) near the existing `MAX_DEGREE_SCALE` constant in `frontend/src/components/graph/ForceGraph.tsx` (at L134–138).
- [x] T010 [US1] Add a `spaceActivityEnabled` ref (`useRef`) synced to the prop value (same pattern as `activityPulseEnabledRef` if it exists, or create new) in `frontend/src/components/graph/ForceGraph.tsx`, so the useEffect can read the latest value.
- [x] T011 [US1] Create a new `useEffect` for space activity sizing in `frontend/src/components/graph/ForceGraph.tsx` (after the visibility filter useEffect at ~L1630). Dependencies: `[spaceActivityEnabled, graphVersion]`. This useEffect:
  - Guards on `nodeSelRef.current` being available.
  - Selects space nodes via `nodeSelRef.current.filter(d => d.data.type.startsWith('SPACE_'))`.
  - When enabled: computes per-level max counts (group space nodes by type: L0/L1/L2, find max `totalActivityCount` per level). For each space node, computes `activityRadius = BASE_RADIUS[type] * (1 + t * (MAX_ACTIVITY_SCALE - 1))` where `t = maxCount > 0 ? Math.log(1 + count) / Math.log(1 + maxCount) : 0` (count = `d.data.totalActivityCount ?? 0`, maxCount = max for that level).
  - Applies D3 transition (300ms ease) on: `circle` → `r` to `activityRadius`; `image` → `x`, `y`, `width`, `height` scaled to `activityRadius`; `clipPath circle` (via `defs.select`) → `r` to `activityRadius`.
  - Repositions `.visibility-badge-bg` (`cx`, `cy`) and `.visibility-badge-icon` (`x`, `y`) to `activityRadius * 0.6` (FR-009 lock badge).
  - When disabled: reverse transitions back to `nodeRadius(d)` (degree-based) for all attributes above.
  - Checks `window.matchMedia('(prefers-reduced-motion: reduce)').matches` — if true, sets transition duration to 0 (instant).

**Checkpoint**: Space Activity sizing is fully functional. Toggling on/off animates node sizes. Lock badges reposition. No simulation restart.

---

## Phase 4: User Story 2 — Activity Border Glow (Priority: P2)

**Goal**: When "Space Activity" is enabled, space nodes display a tier-based colored border glow: HIGH = amber/gold thick stroke with drop-shadow, MEDIUM = blue moderate stroke, LOW = light blue thin stroke, INACTIVE = unchanged.

**Independent Test**: Enable "Space Activity" → HIGH-activity spaces have a thick gold glow, MEDIUM spaces show blue border, LOW spaces show subtle light-blue border, INACTIVE spaces unchanged. Toggling off restores defaults.

### Implementation

- [x] T012 [US2] Extend the space activity sizing useEffect (T011) in `frontend/src/components/graph/ForceGraph.tsx` to also apply tier-based stroke styling when enabled. Within the same space node selection and D3 transition:
  - Read `d.data.spaceActivityTier` for each space node.
  - Set `stroke` color: HIGH = `#f59e0b`, MEDIUM = `#3b82f6`, LOW = `#93c5fd`, INACTIVE = keep default stroke (store original stroke in a datum attribute or compute from type).
  - Set `stroke-width`: HIGH = `3.5`, MEDIUM = `2.5`, LOW = `1.5`, INACTIVE = keep default.
  - Set `filter`: HIGH = `drop-shadow(0 0 4px #f59e0b)`, all others = `none`.
- [x] T013 [US2] In the disable branch of the same useEffect: reverse stroke transitions back to default values per node type (SPACE_L0: `rgba(255,255,255,0.9)` / `2`, SPACE_L1/L2: `rgba(255,255,255,0.7)` / `1`). Clear `filter` to `none`.

**Checkpoint**: Space Activity glow is fully functional. All four tier levels display correctly. Toggling off cleanly restores original strokes.

---

## Phase 5: User Story 3 — Activity Toggle in Control Panel (Priority: P3)

**Goal**: A "Space Activity" checkbox appears in the Activity section of the control panel, alongside the existing "Activity Pulse" checkbox. Disabled when no activity data.

**Independent Test**: Open control panel → Activity section shows two checkboxes: "Activity Pulse" and "Space Activity". Each toggles independently. Both disabled when activity data unavailable.

### Implementation

- [x] T014 [US3] Add a second `<label>` with checkbox for "Space Activity" in the Activity section of `frontend/src/components/panels/ControlPanel.tsx` (after the existing Activity Pulse checkbox at L119–126). Use the same pattern: `checked={spaceActivityEnabled}`, `onChange={onToggleSpaceActivity}`, `disabled={!hasActivityData}`. Display text: `!hasActivityData ? 'Activity data unavailable' : 'Space Activity'`.

**Checkpoint**: Both Activity Pulse and Space Activity checkboxes visible. Each toggles independently. Both disabled when `hasActivityData` is false.

---

## Phase 6: Details Drawer — Contributions Stat (FR-011)

**Purpose**: Show "Contributions: N" in the details drawer for space nodes, regardless of toggle state.

- [x] T015 Add a "Contributions" stat to the stats section in `frontend/src/components/panels/DetailsDrawer.tsx` (after the existing stats at L144–164). Condition: only render when `isSpace` (the existing `isSpace` boolean at L104). Display `node.totalActivityCount ?? 0` as the value and `"Contributions"` as the label. Use the same `styles.stat` / `styles.statValue` / `styles.statLabel` pattern.

**Checkpoint**: Click any space node → "Contributions: N" appears in stats. Click a user or org → no Contributions stat.

---

## Phase 7: Polish & Validation

**Purpose**: Edge cases, cross-feature composition, TypeScript validation, quickstart checklist.

- [x] T016 [P] Verify graceful degradation: load a dataset with `hasActivityData: false` → "Space Activity" checkbox is disabled, no errors in console. Also verify that space nodes with `totalActivityCount` of `0` or `undefined` stay at baseline size and show no glow when toggle is on.
- [x] T017 [P] Verify composition with Activity Pulse: enable both "Activity Pulse" and "Space Activity" simultaneously → edge pulses animate normally alongside space node sizing/glow. No visual conflicts.
- [x] T018 [P] Verify composition with visibility filters: hide private spaces via filter → enable Space Activity → reveal private spaces → they appear with correct activity sizing and glow. No stale sizes.
- [x] T019 [P] Verify composition with role filters: toggle Members/Leads/Admins off and on while Space Activity is enabled → space nodes maintain correct activity sizing throughout.
- [x] T020 Run TypeScript strict mode checks: `cd server && pnpm run typecheck` and `cd frontend && pnpm run typecheck` — both must pass (SC-003).
- [x] T021 Run the full `quickstart.md` visual verification checklist (12 items) and edge case tests (5 items) end-to-end.

**Checkpoint**: Feature complete. All cross-feature compositions work. TypeScript clean. Quickstart checklist passes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup — Server)**: No dependencies — start immediately. T001 and T002 can run in parallel; T003 depends on both.
- **Phase 2 (Foundational)**: No dependency on Phase 1 (frontend scaffolding is independent of server changes). T004→T006 sequential (same file). T007 and T008 in parallel (different files), but after T004-T006.
- **Phase 3 (US1 — Sizing)**: Depends on Phase 1 (server must provide `totalActivityCount`) AND Phase 2 (prop must be wired). T009→T011 sequential (same file).
- **Phase 4 (US2 — Glow)**: Depends on Phase 3 (extends the sizing useEffect). T012→T013 sequential (same useEffect block).
- **Phase 5 (US3 — Toggle)**: Depends on Phase 2 only (props wired). Can run in parallel with Phase 3 and 4. Single task T014.
- **Phase 6 (Details Drawer)**: Independent of all user stories — depends only on Phase 1 (server provides data). Single task T015.
- **Phase 7 (Polish)**: Depends on Phases 3, 4, 5, and 6 all complete. T016–T019 can run in parallel (different test scenarios). T020 and T021 are sequential after all code is done.

### User Story Dependencies

- **US1 (Sizing)**: Phase 1 + Phase 2 → Phase 3
- **US2 (Glow)**: Phase 3 → Phase 4 (extends same useEffect)
- **US3 (Toggle)**: Phase 2 → Phase 5 (independent of US1/US2 implementation)

### Parallel Opportunities

- **Phase 1**: T001 ∥ T002 (different files: types vs transformer)
- **Phase 2**: T007 ∥ T008 (different files: ControlPanel vs ForceGraph)
- **Phase 5 ∥ Phase 3**: T014 (ControlPanel.tsx) can run alongside T009-T011 (ForceGraph.tsx)
- **Phase 6 ∥ Phase 3/4/5**: T015 (DetailsDrawer.tsx) is fully independent
- **Phase 7**: T016 ∥ T017 ∥ T018 ∥ T019 (different test scenarios)

---

## Parallel Example: Fastest Execution Path

```text
# Batch 1 — all independent
T001 (server types) ∥ T002 (server transformer) ∥ T007 (ControlPanel props) ∥ T008 (ForceGraph props) ∥ T015 (DetailsDrawer stat)

# Batch 2 — depends on T001+T002 and T007+T008
T003 (server wiring) + T004→T006 (Explorer state wiring) + T014 (ControlPanel checkbox)

# Batch 3 — depends on Batch 2
T009→T011 (sizing useEffect — sequential within ForceGraph.tsx)

# Batch 4 — depends on Batch 3
T012→T013 (glow — extends sizing useEffect)

# Batch 5 — depends on all above
T016 ∥ T017 ∥ T018 ∥ T019 → T020 → T021
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Server) + Phase 2 (Scaffolding) + Phase 5 (Toggle)
2. Complete Phase 3 (Sizing — US1)
3. **STOP and VALIDATE**: Enable "Space Activity" → spaces resize by contribution volume
4. Deploy/demo if ready — sizing alone provides the core insight

### Incremental Delivery

1. Phase 1 + 2 → Data pipeline + props ready
2. Phase 3 (US1 sizing) → Test independently → Core value delivered (MVP)
3. Phase 4 (US2 glow) → Test independently → Enhanced visual differentiation
4. Phase 5 (US3 toggle) → Already done in parallel with Phase 3
5. Phase 6 (Details drawer) → Already done in parallel
6. Phase 7 (Polish) → Cross-feature validation

### Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All changes are additions to existing files — no new source files
- ~6 files modified, ~150 LOC net change
- Commit after each phase checkpoint
