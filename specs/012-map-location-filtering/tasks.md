# Tasks: Map Location Filtering & Readability

**Feature**: 012-map-location-filtering
**Generated**: 2026-03-09
**Source**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/interfaces.md](contracts/interfaces.md), [quickstart.md](quickstart.md)

**Total Tasks**: 14
**User Stories**: 3 (US1: P1, US2: P2, US3: P3)
**Tests Requested**: No (visual regression baseline updates in Polish phase only)

---

## Phase 1: Setup & Shared Infrastructure

**Purpose**: Create the new utility module and prepare ForceGraph.tsx for boundary-aware rendering.

- [X] T001 Create `mapBoundary.ts` with `isWithinRegion()`, `computePinnedNodeIds()`, and `computeMapBounds()` in `frontend/src/components/graph/mapBoundary.ts`
- [X] T002 Cache parsed GeoJSON data in ForceGraph.tsx `fetch()` block for boundary checking reuse in `frontend/src/components/graph/ForceGraph.tsx`

### T001 Details
- Export `isWithinRegion(geojson, longitude, latitude)` → calls `d3.geoContains(geojson, [lon, lat])` (R1)
- Export `computePinnedNodeIds(nodes, geojson)` → iterates nodes, returns `Set<string>` of IDs where `latitude` AND `longitude` are non-null AND `isWithinRegion` returns true (FR-011)
- Export `computeMapBounds(geojson, projection)` → projects GeoJSON extent to pixel bounding box `{x, y, width, height}` for repulsion force (R3)
- See [contracts/interfaces.md](contracts/interfaces.md) for full type signatures
- Import `FeatureCollection` type from `geojson`; import `geoContains` from `d3-geo`

### T002 Details
- In the existing GeoJSON `fetch()` block (~line 752), after parsing JSON for map rendering, store the result in a component-scoped variable (e.g., `cachedGeoJSON`) accessible to the boundary-checking logic
- This cached reference is reused by `computePinnedNodeIds` and `computeMapBounds` on each region change
- No additional fetch — reuses the same fetch already performed for map overlay rendering (R2)

**Checkpoint**: Utility module ready, GeoJSON cached. User story implementation can begin.

---

## Phase 2: User Story 1 — Map-Filtered Node Placement (Priority: P1) 🎯 MVP

**Goal**: Only entities within the selected map region's GeoJSON boundaries are geo-pinned. All others float freely, pushed away from the map by a soft repulsion force. Region switches animate smoothly.

**Independent Test**: Select "Netherlands" map → only entities geolocated within the Netherlands are pinned. Japan/US/no-location entities float freely outside the map area. Switch to "World" → all entities with coordinates become pinned. Switch to "Europe" → South America entities unpin and drift away (~600ms).

**Covers**: FR-001, FR-002, FR-003, FR-004, FR-009, FR-010, FR-011, FR-012 · SC-001, SC-002, SC-005

### Implementation for User Story 1

- [X] T003 [US1] Replace geo-target computation with `computePinnedNodeIds` boundary filtering in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T004 [US1] Update geographic pinning (fx/fy assignment) to only pin boundary-filtered nodes in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T005 [P] [US1] Implement `mapRepulsionForce()` custom D3 force function in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T006 [US1] Register `map-repulsion` force in simulation configuration in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T007 [P] [US1] Update drag-end snap-back handler to only apply to pinned nodes in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T008 [US1] Add simulation alpha restart (~600ms) for animated region transitions in `frontend/src/components/graph/ForceGraph.tsx`

### T003 Details
- Replace the existing geo-target computation block (~lines 808-818) that pins ALL nodes with lat/lon
- Use `computePinnedNodeIds(simNodes, cachedGeoJSON)` to get only nodes within the selected region
- Build `geoTargets` map only for pinned IDs: project `[lon, lat]` → `{x, y}` via `projection()`
- World map: all nodes with valid coords are pinned (FR-010); Netherlands: only NL-located nodes (FR-001)
- Nodes with country but no lat/lon are NOT pinned (FR-011)
- This block must re-execute on region change (FR-004)

### T004 Details
- In the geographic pinning block (~lines 1101-1113), ensure `fx`/`fy` are only set for nodes in the new `geoTargets` map
- For nodes NOT in `geoTargets`: set `fx = null`, `fy = null` so force simulation governs their position (FR-003)
- Previously pinned nodes that are now unpinned due to region change should have fx/fy cleared

### T005 Details
- Implement as a custom D3 force function following the pattern of existing forces (R3)
- On each tick, for each free-floating node (not in `pinnedIds`):
  - If node is inside map bounds + 50px margin → apply repulsion vector away from map center
  - `repulsionStrength = 0.3` (tunable)
- Input: `mapBounds` from `computeMapBounds()`, `pinnedIds` from `computePinnedNodeIds()`
- Returns `(alpha: number) => void` compatible with `d3.forceSimulation.force()`
- See [contracts/interfaces.md](contracts/interfaces.md) for signature

### T006 Details
- Add `.force('map-repulsion', isGeoMode ? mapRepulsionForce(mapBounds, pinnedIds) : null)` to simulation config (~line 1089)
- When map mode is inactive (`!isGeoMode`), force is null (removed from simulation)
- Must update on region change (recompute bounds and pinned set)

### T007 Details
- In the drag-end handler (~lines 860-872), only snap nodes back to geographic position if the node is in the pinned set
- Free-floating nodes should remain where the user dragged them (no snap-back to projected coordinates)

### T008 Details
- On region change: restart simulation with `simulation.alpha(0.3).restart()` for ~600ms of activity (R6)
- Newly pinned nodes animate to their projected fx/fy positions via simulation convergence
- Newly unpinned nodes drift away naturally as the simulation runs with repulsion force active
- No explicit D3 transition needed — simulation alpha restart provides the animated drift (FR-012)

**Checkpoint**: US1 complete — map filtering, repulsion, drag behavior, and transitions all functional. This is the MVP.

---

## Phase 3: User Story 2 — Remove Proximity Clustering (Priority: P2)

**Goal**: Proximity clustering is fully disabled in map mode. Every entity renders as an individual node — no cluster badges, no grouping.

**Independent Test**: Activate map mode with 50+ co-located entities. Verify no cluster badges appear at any zoom level. Each entity is its own node. Toggle map off → clustering resumes in force graph view.

**Covers**: FR-005, FR-006 · SC-003, SC-006

### Implementation for User Story 2

- [X] T009 [P] [US2] Disable proximity clustering invocation in map mode in `frontend/src/components/graph/ForceGraph.tsx`

### T009 Details
- Guard the clustering block (~lines 1149-1157) so it never executes when map mode is active (R5)
- Simplest approach: change condition to `if (false && showMap && simNodes.length <= MAX_NODES_FOR_CLUSTERING)` with a code comment referencing spec 012
- Do NOT delete `proximityClustering.ts` — clustering remains available for non-map force graph view
- This ensures individual nodes are always rendered in map mode (FR-006), no cluster badges appear (FR-005)
- Cluster badge/hull rendering downstream is naturally disabled when the clustering block doesn't execute

**Checkpoint**: US2 complete — no clusters in map mode, individual nodes targetable for interaction.

---

## Phase 4: User Story 3 — Reduced Node Sizes for Map Readability (Priority: P3)

**Goal**: Node radii are reduced by 50% base in map mode, scaling responsively with zoom. Map labels and borders remain legible. Sizes restore when map mode deactivates.

**Independent Test**: Activate map mode → nodes visibly smaller at default zoom. Zoom in → nodes grow toward normal size. Toggle map off → nodes return to standard dimensions. Country borders/labels visible between nodes.

**Covers**: FR-007, FR-008 · SC-004

### Implementation for User Story 3

- [X] T010 [P] [US3] Create `effectiveRadius()` zoom-responsive sizing function in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T011 [US3] Update node circle `r` attribute rendering to use `effectiveRadius` in `frontend/src/components/graph/ForceGraph.tsx`
- [X] T012 [US3] Update collision force radius to use `effectiveRadius` in `frontend/src/components/graph/ForceGraph.tsx`

### T010 Details
- Implement `effectiveRadius(node, isGeoMode, zoomScale)` per contracts/interfaces.md and R4
- Formula: `base * Math.min(1.0, 0.5 + (zoomScale - 1) * 0.15)` when `isGeoMode`; otherwise returns `nodeRadius(node)` unchanged
- Multiplier range: 0.5× at zoom=1, 0.65× at zoom=2, 0.95× at zoom=4, 1.0× at zoom≥5
- Uses existing `nodeRadius()` as base; uniform multiplier across all node types (FR-007)
- When `!isGeoMode`, returns base → sizes automatically restored (FR-008)

### T011 Details
- Replace `nodeRadius(d)` with `effectiveRadius(d, isGeoMode, currentZoomScale)` in circle `r` attribute setters
- Also update any text/label/icon sizing that depends on node radius for visual consistency
- `currentZoomScale` is already tracked (~line 671, 680)

### T012 Details
- Update `d3.forceCollide()` radius function to use `effectiveRadius` so collision detection matches visual size
- Prevents overlap based on actual rendered size rather than full-size radius

**Checkpoint**: US3 complete — nodes smaller in map mode, zoom-responsive, restored on deactivation.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validation across all user stories, visual regression baselines.

- [ ] T013 Run quickstart.md manual verification checklist against running application
- [ ] T014 Update Playwright visual regression test baselines in `tests/visual/`

### T013 Details
- Follow the 10-item checklist in [quickstart.md](quickstart.md):
  1. Select Netherlands → only NL entities pinned
  2. Select World → all entities with coords pinned
  3. Switch Europe → South America entities drift away
  4. Free-floating nodes outside map area
  5. No cluster badges in map mode
  6. Nodes smaller at default zoom, grow on zoom-in
  7. Toggle map off → standard sizes restored
  8. Drag free-floating node → stays where released
  9. Drag pinned node → snaps back on release
  10. 60fps performance with ~500 nodes

### T014 Details
- Run existing Playwright visual tests — expect failures due to changed node sizes and positions
- Update baseline screenshots to reflect new map mode rendering
- Ensure non-map-mode tests still pass unchanged

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on Phase 1 (needs `mapBoundary.ts` and cached GeoJSON)
- **US2 (Phase 3)**: No dependency on Phase 1 — can start in parallel with US1
- **US3 (Phase 4)**: No dependency on Phase 1 — can start in parallel with US1
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Setup. No dependencies on other stories.
- **US2 (P2)**: Independent — only guards an existing code block. Can run in parallel with US1/US3.
- **US3 (P3)**: Independent — only adds a sizing wrapper. Can run in parallel with US1/US2.

### Within User Story 1

- T003 (geo-target filtering) before T004 (fx/fy assignment) — T004 uses filtered targets
- T005 (repulsion force impl) can parallel with T003 — different code area [P]
- T006 (register force) after T005 — uses the force function
- T007 (drag handler) can parallel with T003-T006 — separate code block [P]
- T008 (transition animation) after T003-T006 — depends on new pinning + repulsion being wired

### Within User Story 3

- T010 (effectiveRadius function) first
- T011 (circle rendering) and T012 (collision force) both depend on T010

---

## Parallel Execution Examples

### Parallel Batch 1 (after Phase 1 Setup)
```
T003 [US1] — Geo-target filtering (ForceGraph geo-target block)
T005 [US1] — Repulsion force function (new function, no overlap)
T007 [US1] — Drag handler update (separate code block)
T009 [US2] — Clustering bypass (separate code block)
T010 [US3] — effectiveRadius function (new function, no overlap)
```

### Parallel Batch 2 (after Batch 1)
```
T004 [US1] — fx/fy pinning update (depends on T003)
T006 [US1] — Register repulsion force (depends on T005)
T011 [US3] — Circle rendering update (depends on T010)
T012 [US3] — Collision force update (depends on T010)
```

### Parallel Batch 3 (after Batch 2)
```
T008 [US1] — Transition animation (depends on T003-T006)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: User Story 1 (T003-T008)
3. **STOP AND VALIDATE**: Test boundary filtering, repulsion, and transitions
4. This alone delivers the highest-impact improvement — regional maps show only relevant entities

### Incremental Delivery

1. Setup → Foundation ready
2. US1 → Boundary filtering + repulsion + transitions → Test → Deploy/Demo (MVP!)
3. US2 → No clusters in map mode → Test → Deploy/Demo
4. US3 → Smaller zoom-responsive nodes → Test → Deploy/Demo
5. Polish → Baselines updated, full verification

### Parallel Strategy (if capacity allows)

After Phase 1 completes, US1/US2/US3 can all begin simultaneously since they modify different code blocks in ForceGraph.tsx. Merge conflicts are unlikely due to non-overlapping line ranges.

---

## FR → Task Mapping

| Requirement | Task(s) | Story |
|-------------|---------|-------|
| FR-001 GeoJSON point-in-polygon | T001, T003 | US1 |
| FR-002 Pin only within-region nodes | T003, T004 | US1 |
| FR-003 Free-floating for outside/no-location | T004 | US1 |
| FR-004 Recompute on region change | T003, T008 | US1 |
| FR-005 Remove clustering in map mode | T009 | US2 |
| FR-006 Individual nodes always | T009 | US2 |
| FR-007 0.5× zoom-responsive sizing | T010, T011, T012 | US3 |
| FR-008 Restore sizes on deactivation | T010 | US3 |
| FR-009 Soft repulsion force | T005, T006 | US1 |
| FR-010 World map all-inclusive | T003 | US1 |
| FR-011 Incomplete location = no pin | T001, T003 | US1 |
| FR-012 Animated transition ~600ms | T008 | US1 |

## SC → Task Mapping

| Success Criteria | Task(s) | Verified By |
|-----------------|---------|-------------|
| SC-001 Outside-region entities free-floating | T003, T004, T005, T006 | T013 |
| SC-002 World map pins all valid nodes | T003 | T013 |
| SC-003 No cluster badges in map mode | T009 | T013 |
| SC-004 Map features legible with ≤100 nodes | T010, T011, T012 | T013 |
| SC-005 Smooth transition ~600ms on region switch | T008 | T013 |
| SC-006 Individual node interaction in dense areas | T009 | T013 |
