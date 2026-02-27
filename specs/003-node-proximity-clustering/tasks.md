# Tasks: Node Proximity Clustering

**Input**: Design documents from `/specs/003-node-proximity-clustering/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the proximity clustering module and types

- [ ] T001 [P] Create `frontend/src/components/graph/proximityClustering.ts` — Define `ProximityNode` and `ProximityCluster` interfaces. Implement `computeProximityGroups(nodes: ProximityNode[], threshold: number): ProximityCluster[]` using greedy single-pass algorithm with x-sort optimization. Pure function, no D3 dependency.
- [ ] T002 [P] Add `PROXIMITY_THRESHOLD` constant (12) and `MAX_NODES_FOR_CLUSTERING` constant (300) to `frontend/src/components/graph/ForceGraph.tsx` (top of file, near existing constants).

**Checkpoint**: Clustering algorithm ready and importable. No visual changes yet.

---

## Phase 2: User Story 1 — Grouped Badge for Overlapping Nodes (Priority: P1) 🎯 MVP

**Goal**: Nodes within proximity threshold are replaced by a `+N` badge on screen.

**Independent Test**: Load DigiCampus in map mode → overlapping city nodes collapse into `+N` badges instead of stacking.

### Implementation

- [ ] T003 [US1] Import `computeProximityGroups` and types in `frontend/src/components/graph/ForceGraph.tsx`.
- [ ] T004 [US1] Add a badge layer `<g class="cluster-badges">` to the SVG root group `g`, appended **after** the `nodes` group so badges render on top. In `frontend/src/components/graph/ForceGraph.tsx`, after `nodeSelection` creation.
- [ ] T005 [US1] In the `simulation.on('tick')` handler in `frontend/src/components/graph/ForceGraph.tsx`: after updating node positions, call `computeProximityGroups()` with current `simNodes` positions (guarded by `simNodes.length <= MAX_NODES_FOR_CLUSTERING`). Store result in a local variable.
- [ ] T006 [US1] In the tick handler: build a `Set<string>` of all clustered node IDs from the proximity groups. Set `display: none` on clustered node `<g>` elements, `display: ''` on unclustered ones.
- [ ] T007 [US1] In the tick handler: use D3 join pattern on the badge layer to render/update/remove badge groups. Each badge = `<g>` containing: (a) invisible hitbox `<circle>` r=28, fill=transparent, cursor=pointer; (b) visible `<circle>` r=18, fill=#eee, stroke=#333, stroke-width=2; (c) `<text>` showing `+N` count, centered, font-weight bold.
- [ ] T008 [US1] Position each badge `<g>` at the cluster centroid (`centroidX`, `centroidY`) via `transform: translate()`.

**Checkpoint**: Overlapping nodes now collapse into `+N` badges. Clicking badges does nothing yet. MVP is visually complete.

---

## Phase 3: User Story 2 — Click-to-Expand Fan-Out (Priority: P2)

**Goal**: Clicking a badge fans out its members; clicking background collapses them back.

**Independent Test**: Click a `+5` badge → 5 nodes fan out in a circle around the center. Click background → they collapse back.

### Implementation

- [ ] T009 [US2] Add fan-out state refs in `frontend/src/components/graph/ForceGraph.tsx` (`renderGraph` scope): `expandedClusterKey: string | null`, `fannedNodeIds: Set<string>`, `fanOrigin: { x: number, y: number } | null`. These persist across ticks within a single render.
- [ ] T010 [US2] In the `computeProximityGroups` call (tick handler), filter out nodes whose IDs are in `fannedNodeIds` before passing to the algorithm — fanned-out nodes should not be re-clustered.
- [ ] T011 [US2] Add click handler on badge hitbox circles: on click, compute circular fan positions (`angle = 2π × i / count`, radius = `Math.max(30, count * 8)`), set `fx`/`fy` on each member node to the fan position, add member IDs to `fannedNodeIds`, set `expandedClusterKey`, unhide member node `<g>` elements, remove the clicked badge, restart simulation with `alpha(0.3)`.
- [ ] T012 [US2] Add background click handler on `svg`: when `expandedClusterKey` is set and user clicks empty area, clear `fx`/`fy` on fanned nodes (or restore geo `fx`/`fy` in map mode), clear `fannedNodeIds` and `expandedClusterKey`, let the tick handler naturally re-cluster them.
- [ ] T013 [US2] Ensure fanned-out nodes retain all normal interactions: click opens details panel (existing `onNodeClick`), drag works (existing drag handler), avatars display (existing image elements from feature 002).

**Checkpoint**: Full expand/collapse interaction works. Individual fanned nodes are fully interactive.

---

## Phase 4: User Story 3 — Cross-mode & Filter Consistency (Priority: P3)

**Goal**: Clustering works correctly across layout modes and respects visibility filters.

**Independent Test**: Switch between force/cluster/map modes; toggle people/org visibility; verify clustering recalculates correctly each time.

### Implementation

- [ ] T014 [US3] Verify that clustering works in force-directed mode — during simulation warm-up, nodes may temporarily cluster and then separate as they find equilibrium. Ensure badges appear/disappear smoothly.
- [ ] T015 [US3] Verify that clustering works in semantic cluster mode — nodes forced toward cluster centers may overlap; proximity badges should form at those centers.
- [ ] T016 [US3] When `renderGraph()` is called (layout mode change, filter toggle), ensure fan-out state is reset (clear `fannedNodeIds`, `expandedClusterKey`) since node positions are completely recalculated.
- [ ] T017 [US3] Account for zoom transform in threshold: read current zoom scale from the SVG transform and divide `PROXIMITY_THRESHOLD` by `zoomScale` when calling `computeProximityGroups`. This makes clustering zoom-responsive.

**Checkpoint**: Clustering works identically in all modes and responds to zoom.

---

## Phase 5: Polish & Integration

**Purpose**: Edge cases, integration with existing highlighting, performance validation

- [ ] T018 [P] Search highlighting integration: when `searchQuery` is active, apply highlight styling to badge circles if any member's `displayName` matches the query (amber stroke on badge).
- [ ] T019 [P] Selection integration: if `selectedNodeId` is inside a cluster, auto-expand that cluster so the selected node is visible.
- [ ] T020 [P] Insight highlighting integration: if any `highlightedNodeIds` are inside a cluster, give the badge highlight styling (amber stroke, full opacity).
- [ ] T021 Performance validation: load a space with 200+ visible nodes, verify clustering calculation stays under 16ms per tick (check via browser DevTools Performance tab).
- [ ] T022 Run `quickstart.md` verification checklist end-to-end.

**Checkpoint**: Feature is complete, integrated with all existing graph interactions, and performance-validated.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately. T001 and T002 can run in parallel.
- **Phase 2 (US1)**: Depends on Phase 1 (T001 + T002). Tasks T003→T008 are sequential within ForceGraph.tsx.
- **Phase 3 (US2)**: Depends on Phase 2 (badges must exist before click handlers). Tasks T009→T013 sequential.
- **Phase 4 (US3)**: Depends on Phase 2 (core clustering). Can run in parallel with Phase 3 (fan-out). Tasks T014-T016 are verification, T017 is a code change.
- **Phase 5 (Polish)**: Depends on Phase 2+3. T018, T019, T020 can run in parallel (different code sections).

### Parallel Opportunities

```
Phase 1:  T001 ─┐
          T002 ─┤
                ▼
Phase 2:  T003 → T004 → T005 → T006 → T007 → T008  (sequential — same file)
                ▼
Phase 3:  T009 → T010 → T011 → T012 → T013          (sequential — same file)
                ▼                       │
Phase 4:  T014, T015, T016 ──┬── T017  │ (can overlap with Phase 3)
                              ▼         ▼
Phase 5:  T018 ─┐
          T019 ─┤  (parallel — different code sections)
          T020 ─┘
          T021 → T022 (sequential — validation)
```

## Notes

- All implementation tasks modify `frontend/src/components/graph/ForceGraph.tsx` except T001 (new file)
- T001 is the only new file — `proximityClustering.ts`
- No backend or server changes required
- Commit after each phase checkpoint for incremental delivery
- Phase 2 alone delivers visible value (MVP)
