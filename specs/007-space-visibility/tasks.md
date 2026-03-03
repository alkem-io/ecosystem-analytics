# Tasks: Space Visibility Indicators

**Input**: Design documents from `/specs/007-space-visibility/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `server/src/` (BFF), `frontend/src/` (React SPA)
- Shared types: `server/src/types/` (imported by frontend via path alias)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend the data pipeline to fetch and propagate privacy mode from the Alkemio API through the BFF to the frontend graph dataset.

- [X] T001 Add `isContentPublic` field to `server/src/graphql/fragments/spaceAboutFragment.graphql`
- [X] T002 Run `pnpm run codegen` in `server/` to regenerate typed SDK in `server/src/graphql/generated/`
- [X] T003 Add `privacyMode: 'PUBLIC' | 'PRIVATE' | null` field to `GraphNode` interface in `server/src/types/graph.ts`
- [X] T004 Add `isContentPublic?: boolean` to `about` in `SpaceLike` interface in `server/src/transform/transformer.ts`
- [X] T005 Map `isContentPublic` → `privacyMode` in `addSpaceNode()` function in `server/src/transform/transformer.ts`
- [X] T006 Set `privacyMode: null` for non-space nodes (USER, ORGANIZATION) in `addUserNode()` and `addOrgNode()` in `server/src/transform/transformer.ts`

**Checkpoint**: BFF returns `privacyMode` on all space nodes in `/api/graph/generate` response. Verify with `curl` per quickstart.md.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: N/A — no additional foundational work needed beyond Phase 1. All user stories depend only on Phase 1 completion (data pipeline).

**⚠️ CRITICAL**: Phase 1 must be complete before any user story work begins.

---

## Phase 3: User Story 1 — Visual Visibility Indicator on Space Nodes (Priority: P1) 🎯 MVP

**Goal**: Each space node (L0, L1, L2) in the graph displays a lock icon (private) or unlock icon (public) as an SVG overlay.

**Independent Test**: Load a graph with mixed public/private spaces. Verify each space node shows the correct icon. Zoom in/out to confirm icons remain legible. Select a node to confirm icon doesn't conflict with selection highlighting.

### Implementation for User Story 1

- [X] T007 [US1] Add `showPublic` and `showPrivate` props to ForceGraph `Props` interface in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T008 [US1] Render white circle background badge on space nodes (bottom-right offset) in node enter selection in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T009 [US1] Render lock/unlock emoji text (`🔒`/`🔓`) inside badge on space nodes based on `privacyMode` in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T010 [US1] Update badge and icon positions in the simulation tick handler to follow node movement in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T011 [US1] Ensure visibility icon z-order: after avatar images, before labels, and does not conflict with selection/pulse effects in `frontend/src/components/graph/ForceGraph.tsx`

**Checkpoint**: Space nodes display lock/unlock icons. Icons are legible at all zoom levels and don't interfere with existing visuals. US1 is independently testable.

---

## Phase 4: User Story 2 — Filter Graph by Visibility (Priority: P2)

**Goal**: Control panel has "Visibility" filter checkboxes (Public/Private) that show/hide space nodes by privacy mode without simulation restart.

**Independent Test**: Toggle "Public" off — public spaces disappear with orphaned connections. Toggle back on — they reappear. Same for "Private". Counts shown next to labels. No position reset.

### Implementation for User Story 2

- [X] T012 [US2] Add `showPublic` and `showPrivate` state variables (default `true`) in `frontend/src/pages/Explorer.tsx`
- [X] T013 [P] [US2] Add `showPublic`, `showPrivate`, `onTogglePublic`, `onTogglePrivate` props to `ControlPanel` interface and pass through to `FilterControls` in `frontend/src/components/panels/ControlPanel.tsx`
- [X] T014 [P] [US2] Add `showPublic`, `showPrivate`, `onTogglePublic`, `onTogglePrivate` props to `FilterControls` interface in `frontend/src/components/panels/FilterControls.tsx`
- [X] T015 [US2] Compute public/private space counts (memoized) and render "Visibility" checkbox section with counts in `frontend/src/components/panels/FilterControls.tsx`
- [X] T016 [US2] Disable visibility section when `showSpaces === false` in `frontend/src/components/panels/FilterControls.tsx`
- [X] T017 [US2] Pass `showPublic` and `showPrivate` from Explorer state to both `ControlPanel` and `ForceGraph` in `frontend/src/pages/Explorer.tsx`
- [X] T018 [US2] Implement visibility filtering in ForceGraph node display update — hide space nodes where `privacyMode` doesn't match active filter in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T019 [US2] Hide CHILD edges connected to hidden space nodes and orphan-remove users/orgs with no visible connections in `frontend/src/components/graph/ForceGraph.tsx`

**Checkpoint**: Visibility filter toggles work. Counts are accurate. No simulation restart. Composes correctly with entity and role filters. US2 is independently testable.

---

## Phase 5: User Story 3 — Legend Entry for Visibility Icons (Priority: P3)

**Goal**: The legend in the control panel includes a "Visibility" group explaining the lock and unlock icons.

**Independent Test**: Open the control panel legend. Verify "Visibility" group exists with entries for public (🔓) and private (🔒).

### Implementation for User Story 3

- [X] T020 [US3] Add `legendIcon` CSS class to `frontend/src/components/panels/ControlPanel.module.css`
- [X] T021 [US3] Add "Visibility" legend group with public/private icon entries after "Connections" group in `frontend/src/components/panels/ControlPanel.tsx`

**Checkpoint**: Legend displays Visibility group with correct icons and labels. US3 is independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify end-to-end integration and edge cases across all user stories.

- [X] T022 Verify graceful degradation: null/undefined `privacyMode` defaults to public (no lock icon) across all components
- [X] T023 Verify TypeScript strict mode passes: `cd server && pnpm run typecheck` and `cd frontend && pnpm run typecheck`
- [X] T024 Run quickstart.md visual verification checklist (12 items) and edge case tests (5 scenarios)
- [X] T025 Commit generated codegen files in `server/src/graphql/generated/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: N/A (merged into Phase 1 for this feature)
- **User Story 1 (Phase 3)**: Depends on Phase 1 completion (data pipeline must deliver `privacyMode`)
- **User Story 2 (Phase 4)**: Depends on Phase 1 completion. Can run in parallel with US1 (different code areas: filter logic vs icon rendering)
- **User Story 3 (Phase 5)**: Depends on Phase 1 completion. Can run in parallel with US1 and US2 (legend is independent UI section)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends only on Phase 1. No dependencies on other stories.
- **User Story 2 (P2)**: Depends only on Phase 1. Uses `showPublic`/`showPrivate` props set up in US1 (T007), but those props can be added independently.
- **User Story 3 (P3)**: Depends only on Phase 1. Completely independent — only adds legend UI.

### Within Each User Story

- Props interface changes before implementation
- State variables before component rendering
- Core rendering before edge case handling

### Parallel Opportunities

- T013 and T014 can run in parallel (different files: ControlPanel.tsx vs FilterControls.tsx)
- US1 (Phase 3), US2 (Phase 4), and US3 (Phase 5) can all start in parallel after Phase 1
- T020 and T021 can run in parallel (CSS file vs TSX file)

---

## Parallel Example: User Story 2

```bash
# Launch interface changes in parallel (different files):
Task T013: "Add visibility props to ControlPanel interface in ControlPanel.tsx"
Task T014: "Add visibility props to FilterControls interface in FilterControls.tsx"

# Then sequential: state → rendering → filtering
Task T012: "Add showPublic/showPrivate state in Explorer.tsx"
Task T015: "Render Visibility checkbox section in FilterControls.tsx"
Task T017: "Pass props from Explorer to ControlPanel and ForceGraph"
Task T018: "Implement visibility filtering in ForceGraph"
Task T019: "Hide edges and orphan-remove hidden nodes in ForceGraph"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T006) — data pipeline
2. Complete Phase 3: User Story 1 (T007–T011) — icon overlays
3. **STOP and VALIDATE**: Icons visible on all space nodes, legible at all zooms
4. Deploy/demo if ready — users can already see public vs private

### Incremental Delivery

1. Phase 1 → Data pipeline ready
2. Add US1 (icons) → Test independently → Deploy (MVP!)
3. Add US2 (filters) → Test independently → Deploy
4. Add US3 (legend) → Test independently → Deploy
5. Phase 6: Polish → Final validation

### Single Developer Strategy

1. Complete Phase 1 (T001–T006)
2. US1 (T007–T011) — icon rendering
3. US2 (T012–T019) — filter checkboxes + filtering logic
4. US3 (T020–T021) — legend entry
5. Phase 6 (T022–T025) — validation & cleanup
