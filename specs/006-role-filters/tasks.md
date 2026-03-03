# Tasks: Role-Based Filters & Connection Colors

**Input**: Design documents from `/specs/006-role-filters/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3)
- Paths: `server/src/` for BFF, `frontend/src/` for React SPA

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Server-side data model and GraphQL changes that all user stories depend on

- [X] T001 Add `ADMIN` to `EdgeType` enum in `server/src/types/graph.ts`
- [X] T002 Add `ADMIN` entry to `EDGE_WEIGHT` record in `server/src/types/graph.ts`
- [X] T003 Add `adminUsers: usersInRole(role: ADMIN) { id }` field to `server/src/graphql/fragments/communityRolesFragment.graphql`
- [X] T004 Run `pnpm run codegen` in `server/` to regenerate typed SDK in `server/src/graphql/generated/alkemio-schema.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server transformer changes and frontend state wiring that MUST be complete before user story rendering work begins

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Add `adminUsers` to `SpaceLike` interface `roleSet` shape in `server/src/transform/transformer.ts`
- [X] T006 Add admin user edge creation loop in `addContributorEdges()` in `server/src/transform/transformer.ts` — iterate `roleSet.adminUsers`, call `ensureUserNode` + `createEdge(id, space.id, EdgeType.ADMIN, scopeGroup)`
- [X] T007 Update activity attachment filter in `transformToGraph()` in `server/src/transform/transformer.ts` — change `edge.type !== EdgeType.MEMBER && edge.type !== EdgeType.LEAD` to also include `EdgeType.ADMIN`
- [X] T008 Add `showMembers`, `showLeads`, `showAdmins` boolean state (all default `true`) in `frontend/src/pages/Explorer.tsx`
- [X] T009 Wire role filter state as props from `Explorer.tsx` to `ControlPanel` component in `frontend/src/pages/Explorer.tsx`
- [X] T010 Wire role filter state as props from `Explorer.tsx` to `ForceGraph` component in `frontend/src/pages/Explorer.tsx`

**Checkpoint**: Server produces ADMIN edges in dataset; Explorer holds role filter state and passes it to children

---

## Phase 3: User Story 1 — Filter Graph by Role (Priority: P1) MVP

**Goal**: Users can toggle Members/Leads/Admins checkboxes to show/hide edges by role type. Hidden role edges disappear; orphaned user nodes disappear. No simulation restart.

**Independent Test**: Toggle each role checkbox on/off and verify only matching edges (and their connected users) appear/disappear within 300ms, with no simulation restart or node position reset.

### Implementation for User Story 1

- [X] T011 [US1] Add `showMembers`, `showLeads`, `showAdmins` optional props (default `true`) to `ForceGraph` `Props` interface in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T012 [US1] Destructure new role filter props and create stable refs (`showMembersRef`, `showLeadsRef`, `showAdminsRef`) in `ForceGraph` component body in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T013 [US1] Implement role-filter-visibility `useEffect` in `frontend/src/components/graph/ForceGraph.tsx` — deps `[showMembers, showLeads, showAdmins, graphVersion]`: iterate `linkSelRef`, set `display: none` on edges where source node is USER and type doesn't match filter state; compute visible user IDs (users with ≥1 visible edge); set `display: none` on orphaned USER nodes in `nodeSelRef`; update `visibleEdgesRef` with role-filtered edges
- [X] T014 [US1] Ensure role filter `useEffect` composes with selection highlighting — if `selectedNodeIdRef.current` is set, re-apply selection highlight logic after role filter changes in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T015 [US1] Ensure role filter `useEffect` composes with activity pulse — pause animation on hidden edges, resume on visible ones in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T016 [US1] Ensure organization→space edges are NOT affected by role filters — check `sourceNode.type === 'USER'` before applying show/hide logic in the role filter `useEffect` in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T017 [US1] Add `showMembers`, `showLeads`, `showAdmins`, `onToggleMembers`, `onToggleLeads`, `onToggleAdmins` props to `FilterControls` interface and component in `frontend/src/components/panels/FilterControls.tsx`
- [X] T018 [US1] Render three role sub-toggle checkboxes (Members, Leads, Admins) indented below the People toggle in `frontend/src/components/panels/FilterControls.tsx` — disable when `showPeople` is false
- [X] T019 [US1] Add role filter props to `ControlPanel` interface and pass them through to `FilterControls` in `frontend/src/components/panels/ControlPanel.tsx`
- [X] T020 [US1] Add CSS for `.roleFilters` indent container and disabled state styling in `frontend/src/components/panels/FilterControls.module.css`

**Checkpoint**: Core role filtering works — toggling Members/Leads/Admins shows/hides edges + orphaned users within 300ms. People toggle takes precedence. Org edges unaffected.

---

## Phase 4: User Story 2 — Improved Connection Colors for Roles (Priority: P1)

**Goal**: Each edge type (CHILD, LEAD, ADMIN, MEMBER) has a distinct, WCAG-accessible color. Lead no longer uses brown.

**Independent Test**: Load a graph with mixed edge types and verify all four colors are immediately distinguishable. Check legend matches graph colors.

### Implementation for User Story 2

- [X] T021 [P] [US2] Update `EDGE_COLORS` record in `frontend/src/components/graph/ForceGraph.tsx` — CHILD: `rgba(67,56,202,0.60)`, LEAD: `rgba(234,88,12,0.60)`, ADMIN: `rgba(13,148,136,0.60)`, MEMBER: `rgba(148,163,184,0.35)`
- [X] T022 [P] [US2] Update edge `stroke-width` defaults for ADMIN type in selection reset logic in `frontend/src/components/graph/ForceGraph.tsx` — add `ADMIN` case alongside `LEAD` in stroke-width conditionals
- [X] T023 [US2] Update edge opacity defaults for ADMIN type in selection reset logic (deselect path) — add `ADMIN` case alongside `LEAD` for 0.60 opacity in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T024 [P] [US2] Update legend Connections section in `frontend/src/components/panels/ControlPanel.tsx` — replace old color strings with new palette, add Admin legend item between Lead and Member
- [X] T025 [US2] Update simulation force-link distance and strength functions to handle `ADMIN` edge type alongside `LEAD` in `frontend/src/components/graph/ForceGraph.tsx`

**Checkpoint**: All four edge types visually distinct. Legend accurate. WCAG contrast acceptable for CHILD/LEAD/ADMIN; MEMBER intentionally subtle (documented trade-off).

---

## Phase 5: User Story 3 — Role Filter Counts in Control Panel (Priority: P2)

**Goal**: Each role filter checkbox label shows the count of unique users with that role (e.g., "Members (42)").

**Independent Test**: Compare displayed counts against known dataset edge counts. Verify a user in multiple spaces counts once per role.

### Implementation for User Story 3

- [X] T026 [US3] Compute unique user counts per role type in `FilterControls` — iterate `dataset.edges`, collect `Set<sourceId>` for each role type where source is USER, display `Set.size` in `frontend/src/components/panels/FilterControls.tsx`
- [X] T027 [US3] Memoize role count computation with `useMemo` keyed on `dataset` in `frontend/src/components/panels/FilterControls.tsx`

**Checkpoint**: All three role filter labels show accurate unique-user counts. Counts update when dataset changes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Ensure full composition with existing features and cleanup

- [X] T028 [P] Verify role filters compose with search highlighting — search for a user and toggle role filters in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T029 [P] Verify role filters compose with map overlay mode — toggle role filters with map enabled in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T030 Run `pnpm run build` in both `server/` and `frontend/` to verify zero TypeScript errors
- [X] T031 Run quickstart.md manual testing checklist from `specs/006-role-filters/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001–T004) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 (T005–T010) — core filtering
- **User Story 2 (Phase 4)**: Depends on Phase 1 (T001–T002 for ADMIN EdgeType) — colors are independent of filtering logic; can run in parallel with Phase 3
- **User Story 3 (Phase 5)**: Depends on Phase 2 (T008–T009 for FilterControls props) and Phase 3 T017–T018 (FilterControls role toggles exist)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2. No dependencies on US2/US3.
- **User Story 2 (P1)**: Can start after Phase 1. Independent of US1 (colors vs filtering). **Can run in parallel with US1.**
- **User Story 3 (P2)**: Depends on US1 (FilterControls role toggles). Must follow US1.

### Within Each User Story

- ForceGraph props before useEffect implementation
- FilterControls props before UI rendering
- Core logic before composition checks

### Parallel Opportunities

- T001 + T002 can run together (same file, adjacent lines)
- T003 is independent of T001–T002
- T005 + T006 + T007 are sequential in same file (transformer.ts)
- T008 + T009 + T010 are sequential in same file (Explorer.tsx)
- **US1 (Phase 3) and US2 (Phase 4) can run in parallel** — different concerns (filtering vs colors)
- T021 + T024 can run in parallel (ForceGraph.tsx vs ControlPanel.tsx)
- T028 + T029 can run in parallel (independent verification)

---

## Parallel Example: User Story 1 + User Story 2 (concurrent)

```bash
# After Phase 2 completes:

# Developer A — User Story 1 (filtering):
T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020

# Developer B — User Story 2 (colors, only needs Phase 1):
T021 + T024 (parallel — different files)
T022 → T023 → T025 (sequential in ForceGraph.tsx)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T010)
3. Complete Phase 3: User Story 1 (T011–T020)
4. **STOP and VALIDATE**: Toggle role filters, verify edges show/hide within 300ms
5. Deploy/demo if ready — core feature value delivered

### Incremental Delivery

1. Setup + Foundational → ADMIN edges in dataset, state wired
2. Add User Story 1 → Role filtering works → **Deploy (MVP!)**
3. Add User Story 2 → Better colors → Deploy
4. Add User Story 3 → Counts in labels → Deploy
5. Polish → Full composition verified → Final deploy

---

## Notes

- Total tasks: **31**
- Tasks per user story: US1 = 10, US2 = 5, US3 = 2, Setup = 4, Foundational = 6, Polish = 4
- Parallel opportunities: US1 + US2 can run concurrently; multiple [P] tasks within phases
- Independent test for each story: US1 (toggle filters), US2 (visual color check), US3 (count accuracy)
- Suggested MVP scope: Phase 1 + Phase 2 + Phase 3 (User Story 1) = 20 tasks
- All tasks follow checklist format: `- [ ] [TaskID] [P?] [Story?] Description with file path`
