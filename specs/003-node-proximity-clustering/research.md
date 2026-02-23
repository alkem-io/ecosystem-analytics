# Research: Node Proximity Clustering

**Feature**: 003-node-proximity-clustering
**Date**: 2026-02-23

## Research Questions

### RQ-1: What proximity clustering algorithm is best suited for real-time D3 force graph use?

**Decision**: Greedy single-pass scan with x-sort optimization.

**Rationale**:
- The old analytics-playground used a naive O(n²) double loop checking all pairs. For ≤300 nodes this runs in <1ms, well within a 16ms frame budget.
- Sorting nodes by x-coordinate first allows early termination: once `dx > threshold`, no further nodes in the sorted list can be within range. This doesn't change worst-case but improves average case significantly.
- More sophisticated algorithms (DBSCAN, k-means, quadtree spatial indexing) are overkill for ≤300 nodes and add complexity without meaningful performance gain.
- The greedy nature (first node encountered becomes cluster seed) matches the old repo's pattern and produces stable, predictable groupings.

**Alternatives Considered**:
- **DBSCAN**: Density-based — better for arbitrary-shape clusters but more complex, requires epsilon + minPts tuning. Not needed for simple proximity.
- **Quadtree / R-tree**: Spatial indexing reduces lookup to O(n log n) but constructor overhead makes it slower than brute-force at n ≤300.
- **D3 quadtree**: Built into d3-quadtree, but meant for force calculations rather than grouping. Would need post-processing to extract clusters.

### RQ-2: Should clustering run on every tick or only when simulation stabilizes?

**Decision**: Run on every tick during simulation, but use the optimized scan.

**Rationale**:
- The old repo ran clustering on every `animateNode()` call (every tick).
- Running only at stabilization would mean overlapping nodes are visible during simulation warm-up — defeating the purpose.
- The <1ms cost per tick for ≤300 nodes is negligible vs. the 16ms frame budget.
- Once the simulation stabilizes (alpha → 0), tick frequency drops to near-zero, so there's no ongoing cost.

**Alternatives Considered**:
- **Throttled (every N ticks)**: Would cause visible flickering as clusters form/dissolve.
- **Only on stabilization**: Overlapping nodes visible during warm-up — bad UX.
- **Debounced**: Similar flickering issues.

### RQ-3: How should the badge be rendered in D3 — join pattern or manual enter/exit?

**Decision**: Use D3 join pattern (`selectAll().data().join()`) on a dedicated group layer.

**Rationale**:
- The join pattern handles enter/update/exit automatically — ideal for data that changes every tick.
- A dedicated `<g class="cluster-badges">` layer positioned above the node layer ensures badges render on top.
- The old repo used manual `remove()` + `append()` every tick, which works but is less idiomatic D3.
- Join pattern with key function (`d => clusterKey`) ensures smooth transitions when clusters merge/split.

### RQ-4: How should expanded (fanned-out) clusters interact with the force simulation?

**Decision**: Fan-out nodes get temporary `fx`/`fy` overrides. They are excluded from proximity clustering while expanded.

**Rationale**:
- Setting `fx`/`fy` pins nodes to their fan-out positions, preventing the simulation from pulling them back.
- Excluding expanded nodes from the clustering algorithm prevents them from being immediately re-clustered.
- On collapse, `fx`/`fy` is restored to the original value (geo position in map mode, null otherwise).
- A `Set<string>` of expanded node IDs is maintained to track which nodes are "fanned out".

### RQ-5: What is the right proximity threshold?

**Decision**: 12 pixels as default, matching approximately the diameter of a USER node (radius ~5.2px × 2 ≈ 10.4px).

**Rationale**:
- The old repo used 10px. Our nodes are slightly larger with the stroke border (5.2px radius + 1.5px stroke = 6.7px visual radius).
- 12px means nodes must be nearly overlapping to cluster — this avoids over-aggressive grouping while still catching the core problem.
- Threshold is defined as a constant, easy to tune.

### RQ-6: How does zoom affect clustering?

**Decision**: Clustering operates on screen-space coordinates (post-transform), so zoom level automatically affects grouping.

**Rationale**:
- D3 simulation operates in data space, but node positions are transformed by the zoom level.
- However, the tick handler sets `transform` on node groups — the x/y values are in data space.
- For correct screen-space clustering, we need to account for the current zoom transform scale factor.
- Solution: multiply the proximity threshold by `1/zoomScale`. When zoomed in, the effective threshold in data-space shrinks, so nodes spread apart visually. When zoomed out, threshold grows, catching more overlapping nodes.
- This means clustering is naturally zoom-responsive without explicit recalculation on zoom.

## Summary

- Greedy O(n²) scan with x-sort, gated at 300 nodes
- Every tick, join pattern for badges
- Fan-out with temporary fx/fy, excluded from re-clustering
- 12px default threshold, zoom-scaled
- Separate `proximityClustering.ts` module — pure function, no D3 dependency
