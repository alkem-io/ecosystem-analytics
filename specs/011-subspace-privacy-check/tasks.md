# Tasks: Subspace Privacy-Aware Loading

**Input**: Design documents from `/specs/011-subspace-privacy-check/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: GraphQL schema changes, type extensions, and SDK regeneration that all user stories depend on.

- [x] T001 Add `restricted?: boolean` field after `privacyMode` in GraphNode interface in `server/src/types/graph.ts`
- [x] T002 [P] Add `membership { myPrivileges }` to `spaceAboutFragment` in `server/src/graphql/fragments/spaceAboutFragment.graphql`
- [x] T003 [P] Create new `SpaceAboutOnlyFragment` fragment file at `server/src/graphql/fragments/spaceAboutOnlyFragment.graphql` — includes `id`, `nameID`, `createdDate`, `visibility`, `about { ...spaceAboutFragment }` on Space type
- [x] T004 [P] Create new `subspaceCommunity` query file at `server/src/graphql/queries/subspaceCommunity.graphql` — accepts `$subspaceId: UUID!`, returns `lookup { space(ID: $subspaceId) { id, community { ...communityRolesFragment } } }`
- [x] T005 Modify `spaceByName` query in `server/src/graphql/queries/spaceByName.graphql` — L0 keeps `...SpaceGraphInfoFragment`, L1 and L2 subspaces change from `...SpaceGraphInfoFragment` to `...SpaceAboutOnlyFragment`
- [x] T006 Run `pnpm run codegen` in `server/` to regenerate the typed SDK in `server/src/graphql/generated/`

**Checkpoint**: GraphQL layer updated — new fragments, queries, and regenerated SDK ready for service layer.

---

## Phase 2: Foundational (Error Infrastructure)

**Purpose**: Error propagation infrastructure that enables partial-result responses with error reporting across all user stories.

**CRITICAL**: Must complete before user story implementation.

- [x] T007 Add `errors?: string[]` field to the graph generation response type — update the BFF endpoint handler in `server/src/routes/graph.ts` to include an `errors` array alongside graph data in the JSON response. Collect errors from the service layer and return them.
- [x] T008 Update `useGraph` hook in `frontend/src/hooks/useGraph.ts` to parse and store the `errors` array from the BFF response separately from the fatal `error` state. The hook should expose a new `warnings: string[]` state for non-fatal errors.
- [x] T009 Add an error banner component to `frontend/src/pages/Explorer.tsx` that displays `warnings` from `useGraph` as a dismissible toast/banner at the top of the page while still rendering the graph below. Use the existing `cacheCleared` state-based notification pattern as reference (Explorer.tsx lines 105-115).

**Checkpoint**: Error propagation pipeline complete — server errors flow to frontend toast/banner while graph renders with partial data.

---

## Phase 3: User Story 1 — View accessible subspaces with full data (Priority: P1) MVP

**Goal**: Two-phase subspace loading where READ-privileged subspaces get full community data, preserving current behavior for accessible spaces.

**Independent Test**: Select a Space where user has READ on all subspaces. Graph renders identically to current behavior — full community data, contributor edges, no lock indicators.

### Implementation for User Story 1

- [x] T010 [US1] Add `fetchSubspaceCommunity()` function to `server/src/services/space-service.ts` — calls the new `subspaceCommunity` query with a subspace ID, returns community/roleSet data. Log and collect (not throw) any GraphQL errors with full Alkemio error message.
- [x] T011 [US1] Implement privilege-checking logic in `server/src/services/acquire-service.ts` — after Phase 1 `fetchSpaceByName()` returns about-only subspaces, iterate L1 subspaces: check `subspace.about.membership.myPrivileges` for `READ`. If READ present, call `fetchSubspaceCommunity()` to get community data and merge it onto the subspace object. Then process L2 children of that L1 with the same logic. Pass collected errors back to caller.
- [x] T012 [US1] Update `collectContributorIds()` in `server/src/services/acquire-service.ts` to handle subspaces that now have community data merged from Phase 2 (the data shape should be the same as before — `space.community.roleSet` — so this may require no changes, but verify).
- [x] T013 [US1] Update `transformToGraph()` in `server/src/transform/transformer.ts` — for subspaces that went through Phase 2 successfully (have community data), set `restricted: false` on the node. Ensure contributor edges are still created via `addContributorEdges()` as before.
- [x] T014 [US1] Wire error collection through `server/src/services/graph-service.ts` — pass the errors array from `acquireSpaces()` through to the route handler so T007's response includes them.

**Checkpoint**: Two-phase fetch works for fully-accessible spaces. Graph output identical to before for READ-privileged subspaces. Errors flow to frontend.

---

## Phase 4: User Story 2 — View restricted subspaces with lock indicator (Priority: P1)

**Goal**: READ_ABOUT-only subspaces appear as restricted nodes with lock badge, no community data. L2 children of restricted L1s are skipped. Missing/invalid privileges log errors and notify user.

**Independent Test**: Select a Space with mixed-access subspaces. Restricted subspaces show with lock icon, no contributor edges. Accessible subspaces show full data. Error banner appears if any privilege anomalies detected.

### Implementation for User Story 2

- [x] T015 [US2] Extend privilege-checking logic in `server/src/services/acquire-service.ts` — for L1 subspaces with READ_ABOUT (no READ): skip `fetchSubspaceCommunity()`, skip all L2 children of that L1 entirely. For subspaces with neither READ nor READ_ABOUT: omit from results, log error with subspace ID, add message to errors array. For missing/empty `myPrivileges`: log error, add to errors array.
- [x] T016 [US2] Update `addSpaceNode()` in `server/src/transform/transformer.ts` — accept a `restricted` parameter. When `restricted: true`, set the field on the GraphNode. Update calls in `transformToGraph()`: restricted subspaces (READ_ABOUT only) get `restricted: true`, accessible ones get `restricted: false`.
- [x] T017 [US2] Update `transformToGraph()` in `server/src/transform/transformer.ts` — skip `addContributorEdges()` for restricted nodes. Still create CHILD edge from restricted node to parent. Skip L2 processing when L1 is restricted.
- [x] T018 [US2] Extend lock badge filter in `frontend/src/components/graph/ForceGraph.tsx` (lines 966-972) — change `privateSpaceNodes` filter from `d.data.privacyMode === 'PRIVATE'` to `d.data.privacyMode === 'PRIVATE' || d.data.restricted === true`
- [x] T019 [US2] Update `frontend/src/components/panels/DetailsDrawer.tsx` for restricted nodes — extend the existing `privacyMode === 'PRIVATE'` condition (line 140-142) to also show a "Restricted" badge when `node.restricted === true`. Hide Direct Connections, Related Spaces, and stats sections when `node.restricted === true` (no community data). Add a visible privacy notice ("You do not have access to view the full contents of this space") below the header for restricted nodes.

**Checkpoint**: Mixed-access spaces render correctly — restricted nodes show lock badge, no contributor edges, no L2 children for restricted L1s. Privilege anomalies surface as error banners.

---

## Phase 5: User Story 3 — Lock symbol tooltip and interaction (Priority: P2)

**Goal**: Hovering or clicking on a restricted node shows "about" info with a privacy notice, without empty community sections.

**Independent Test**: Hover over a restricted node — hover card shows name, tagline, and "Content restricted" message. Click to open detail panel — shows about info, no empty community sections.

### Implementation for User Story 3

- [x] T020 [US3] Update `HoverCard.tsx` in `frontend/src/components/graph/HoverCard.tsx` — when `node.restricted === true`, add a "Content restricted" notice below the type badge. Keep displaying name, tagline, and avatar as normal.

**Checkpoint**: Restricted node hover interaction is informative — users understand why content is limited. (DetailsDrawer changes consolidated into T019.)

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup and validation across all stories.

- [x] T022 [P] Verify D3 visibility filter in `frontend/src/components/graph/ForceGraph.tsx` (lines 1654-1727) handles `restricted` nodes correctly with `showPublic`/`showPrivate` toggles — restricted nodes should follow the `showPrivate` toggle behavior.
- [x] T023 [P] Verify metrics computation in `server/src/transform/transformer.ts` includes restricted nodes in all calculations (node counts, degree centrality, connectivity scores) per FR-006.
- [ ] T024 (Manual) Benchmark graph generation time for a fully-accessible space (all subspaces READ) — compare before/after the two-phase fetch changes. Verify increase is within 20% per SC-003.
- [ ] T025 (Manual) Run quickstart.md validation — follow the test steps in `specs/011-subspace-privacy-check/quickstart.md` end-to-end against a live Alkemio instance with mixed-access subspaces.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T006 specifically — regenerated SDK)
- **US1 (Phase 3)**: Depends on Phase 1 + Phase 2
- **US2 (Phase 4)**: Depends on Phase 3 (extends the privilege-checking logic from T011)
- **US3 (Phase 5)**: Depends on Phase 4 (needs `restricted` field populated on nodes)
- **Polish (Phase 6)**: Depends on all user stories complete

### Within Each Phase

- T002, T003, T004 can run in parallel (different files)
- T005 depends on T003 (new fragment must exist before query references it)
- T006 depends on T002-T005 (all .graphql changes must be done before codegen)
- T010 can start as soon as T006 completes
- T018, T019 can run in parallel (different frontend files)
- T020 is the sole Phase 5 task (DetailsDrawer changes consolidated into T019)
- T022, T023 can run in parallel (different concerns)

### Parallel Opportunities

```text
# Phase 1 parallel batch:
T001, T002, T003, T004  (all different files)

# Phase 2 parallel batch (after T006):
T007, T008, T009  (server route, frontend hook, frontend page — different files)

# Phase 4 frontend parallel batch:
T018, T019  (ForceGraph.tsx, DetailsDrawer.tsx)

# Phase 5:
T020  (HoverCard.tsx only — DetailsDrawer changes consolidated into T019)

# Phase 6 parallel batch:
T022, T023  (different files)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: GraphQL changes + codegen
2. Complete Phase 2: Error infrastructure
3. Complete Phase 3: Two-phase fetch for READ subspaces
4. **STOP and VALIDATE**: Graph renders identically for fully-accessible spaces, errors propagate to frontend
5. Deploy if ready — no visual changes for fully-accessible users

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Add US1 (Phase 3) → Two-phase fetch works → Deploy (MVP — no regression for accessible spaces)
3. Add US2 (Phase 4) → Restricted nodes visible with lock → Deploy (core new feature)
4. Add US3 (Phase 5) → Hover/click interactions → Deploy (UX polish)
5. Phase 6 → Final validation and cleanup

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Commit after each task or logical group
- Run `pnpm run codegen` only once after all .graphql changes (T006)
- The `restricted` field is additive — existing cached data without it is treated as `false` (falsy check)
- Error handling is non-blocking — graph always renders with available data
