# Implementation Plan: Node Proximity Clustering

**Branch**: `003-node-proximity-clustering` | **Date**: 2026-02-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-node-proximity-clustering/spec.md`

## Summary

When nodes overlap or are very close together on screen (especially in map mode where many users share a city), replace the pile of overlapping circles with a single grouped badge showing the count. Clicking the badge fans out the member nodes in a circle; clicking the background collapses them back. The clustering is recalculated on every simulation tick and runs entirely in the frontend.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), React 19.2.4
**Primary Dependencies**: D3 v7.9 (d3-selection, d3-force, d3-transition), Vite 7.3.1
**Storage**: N/A (no backend changes)
**Testing**: Manual visual testing
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: Web application (frontend-only change)
**Performance Goals**: Cluster calculation within one frame (16ms) for ≤300 nodes; O(n²) proximity scan gated by node count
**Constraints**: Must coexist with existing avatar rendering (feature 002) and all layout modes
**Scale/Scope**: Primary change in `ForceGraph.tsx` (~411 lines currently), new utility module for proximity logic

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Auth | ✅ Pass | No auth changes. |
| II. Typed GraphQL Contract | ✅ Pass | No GraphQL changes. |
| III. BFF Boundary | ✅ Pass | Frontend-only — no API calls. |
| IV. Data Sensitivity | ✅ Pass | No new data exposure. |
| V. Graceful Degradation | ✅ Pass | Clustering is additive enhancement. Disabled above 300 nodes for performance. Nodes without clustering render as before. |
| VI. Design Fidelity | ✅ Pass | New interaction not conflicting with design brief. |

## Project Structure

### Documentation

```text
specs/003-node-proximity-clustering/
├── plan.md              # This file
├── research.md          # Phase 0: technique research
├── data-model.md        # Phase 1: data structures
├── quickstart.md        # Phase 1: dev setup & testing
├── contracts/           # Empty — no API changes
└── tasks.md             # Phase 2: task breakdown
```

### Source Code

```text
frontend/src/
├── components/graph/
│   ├── ForceGraph.tsx              # MODIFY — integrate clustering into tick + render
│   └── proximityClustering.ts      # NEW — pure function: compute proximity clusters
└── styles/
    └── tokens.css                  # NO CHANGE — badge uses neutral colors
```

**Structure Decision**: Extract the proximity clustering algorithm into its own pure-function module (`proximityClustering.ts`) to keep ForceGraph.tsx manageable and the logic testable. The module has no D3 dependency — just takes node positions and returns cluster groups.

## Technical Approach

### Architecture

```
ForceGraph.tsx (orchestrator)
  │
  ├── simulation.on('tick') ──→ proximityClustering.computeProximityGroups(simNodes)
  │                                 Returns: ProximityCluster[]
  │
  ├── Per tick:
  │   1. Move nodeSelection (existing)
  │   2. Compute proximity groups
  │   3. Hide nodes that are clustered (display: none on <g>)
  │   4. Update badge group (join pattern: enter/update/exit)
  │
  └── Click handlers:
      ├── Badge click → fan out members to circular positions (fx/fy offset)
      └── Background click → collapse back (remove fx/fy overrides)
```

### Proximity Algorithm (proximityClustering.ts)

```
Input:  nodes[] with { id, x, y }, threshold (px)
Output: ProximityCluster[] with { centroid, memberIds[] }

Algorithm (greedy single-pass):
  1. Sort nodes by x-coordinate
  2. For each unassigned node:
     a. Find all unassigned nodes within `threshold` pixels (Euclidean distance)
     b. If 2+ nodes found → create cluster with average position
     c. Mark all members as assigned
  3. Return clusters (singletons are not clustered)

Complexity: O(n²) worst case, but x-sorting enables early termination on dx > threshold.
Gated: Skip entirely if nodeCount > 300.
```

### Badge Rendering

- Badge is a `<g>` in a separate group layer (above nodes, below labels)
- Contains: circle (r=18, neutral fill `#eee`, dark stroke `#333`) + text (`+N`)
- Positioned at cluster centroid
- Larger invisible hitbox circle (r=28) for easy clicking
- Cursor: pointer

### Fan-Out Mechanics

- On badge click: compute circular positions, set `fx`/`fy` on member nodes, unhide them, remove badge
- On background click: clear `fx`/`fy` overrides (or restore geo position in map mode), rehide, recreate badge
- Fan-out radius: `Math.max(30, memberCount * 8)` — scales with cluster size
- Transition: 300ms ease-out for smooth fan animation

### Integration with Existing Features

| Feature | Integration |
|---------|------------|
| Avatars (002) | Fanned-out nodes show avatars as usual — they're just regular node `<g>` elements being unhidden |
| Search highlight | Clustered nodes matching search: badge gets highlight treatment (amber border) |
| Selection | If selected node is in a cluster: auto-expand that cluster |
| Insight highlight | Same as search — badge reflects member state |
| Map mode | Works identically — geo-pinned nodes at same location get clustered |
| Drag | Fanned-out nodes are draggable. On drag-end, they snap back to fan position (not geo position) until collapse |

### Tick Handler Changes

Current tick handler is simple (just translate). New version:

```
simulation.on('tick', () => {
  // 1. Update link positions (existing)
  // 2. Update node positions (existing)
  // 3. IF nodeCount ≤ 300:
  //      Compute proximity clusters
  //      Hide clustered nodes
  //      Update badge positions (D3 join)
  //    ELSE:
  //      Show all nodes, remove badges
});
```

The clustering recomputes every tick during simulation warm-up (~300 ticks), then stabilizes as nodes settle. This is acceptable because the O(n²) scan on ≤300 nodes is <1ms.

## Phases Summary

| Phase | Output | Purpose |
|-------|--------|---------|
| Phase 0 | research.md | Validate proximity algorithm + D3 join pattern for badges |
| Phase 1 | data-model.md, quickstart.md | Data structures + dev testing guide |
| Phase 2 | tasks.md | Actionable implementation tasks |
