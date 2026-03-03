# Research: Space Activity Volume

**Feature**: 008-space-activity  
**Date**: 2026-03-02

## R1: Per-Space Activity Aggregation Strategy

### Decision: Second-pass aggregation over existing per-user-per-space count map

### Rationale

The existing `aggregateActivityCounts()` returns a `Map<"userId:spaceId", count>`. Rather than duplicating the raw activity parsing, we add a new function `aggregateSpaceActivityCounts()` that takes the same count map and reduces it to `Map<spaceId, totalCount>` by summing all user counts for each space.

This approach:
- Reuses the existing activity parsing pipeline (no new GraphQL queries)
- Keeps the per-user-per-space map intact for edge activity (no regressions)
- Is a pure data transformation (easy to test)

### Alternatives Considered

1. **Parse raw activity entries directly for space totals** — Rejected: duplicates parsing logic, would diverge from edge activity counts if event types change.
2. **Compute on frontend from edge `activityCount` values** — Rejected: would require summing across all edges targeting each space, coupling frontend to edge data shape. Server-side is cleaner and follows BFF boundary principle.
3. **Add a separate GraphQL query for space-level activity** — Rejected: unnecessary API call when data is already available from the existing `ActivityFeedGrouped` query.

## R2: Tier Computation Reuse

### Decision: Reuse `computeActivityTiers()` with a space-keyed count map

### Rationale

`computeActivityTiers()` is generic — it takes a `Map<string, number>` and returns `Map<string, ActivityTier>`. The key format doesn't matter. We can pass it a `Map<spaceId, totalCount>` directly and get per-space tiers using the same percentile-based logic.

The only difference: the population is spaces (typically 5–50 nodes) vs user-space pairs (typically 50–500 edges). With fewer data points, the "fewer than 3 entries" fixed-threshold fallback will trigger more often, which is actually appropriate for small graphs.

### Alternatives Considered

1. **Custom tier function for spaces** — Rejected: same algorithm, no reason to diverge. Consistency with edge tiers is a feature.
2. **Hardcoded absolute thresholds** — Rejected: absolute thresholds (e.g., 10/50/100) would break across different community sizes. Percentile-based is adaptive.

## R3: Animated Radius Change in D3 (No Simulation Restart)

### Decision: Use D3 transitions on `circle[r]`, `image[x,y,width,height]`, `clipPath[r]`, and `stroke` attributes within a useEffect

### Rationale

The feature requires animating node size changes when the toggle is flipped, without restarting the force simulation. The approach:

1. **New useEffect** triggered by `[spaceActivityEnabled, graphVersion]` — same pattern as role filters and visibility filters.
2. **Select space nodes** via `nodeSelRef.current` and filter to space types.
3. **Compute activity-based radius**: For each space node, compute `activityRadius = baseRadius * activityScale` where `activityScale` uses the same logarithmic formula as degree-based scaling but reads from `totalActivityCount` instead of degree, with `MAX_ACTIVITY_SCALE = 2.5`.
4. **Apply D3 transition** (300ms ease):
   - `circle` → transition `r` to new radius
   - `image` → transition `x`, `y`, `width`, `height` to match new radius
   - `clipPath circle` → transition `r` to match
   - Visibility badge → transition position (`cx`/`cy`/`x`/`y` at `newRadius * 0.6`)
   - `stroke` → transition color and width per tier
5. **When disabled**: reverse transitions back to degree-based radius and default stroke.

**Key insight**: The `nodeRadius` function uses module-level `_nodeDegree` map. For activity sizing, we compute a parallel `_nodeActivityRadius` map in the useEffect and use D3 transitions to animate to those values. The original `nodeRadius` function is unmodified — it still drives the initial render. The useEffect overrides visually.

**Reduced-motion**: Check `window.matchMedia('(prefers-reduced-motion: reduce)')`. If true, skip transitions (instant apply).

### Alternatives Considered

1. **Modify `nodeRadius` function directly** — Rejected: would require rebuilding the graph on toggle (simulation restart), violating FR-006.
2. **CSS transitions on SVG attributes** — Rejected: SVG geometric attributes (`r`, `cx`, `x`, `width`) don't support CSS transitions in all browsers. D3's `.transition()` is more reliable.
3. **Re-render entire graph** — Rejected: loses node positions, expensive, violates FR-006.

## R4: Interaction with Existing Node Sizing

### Decision: Activity sizing overrides degree-based sizing for space nodes when enabled; restores on disable

### Rationale

When "Space Activity" is enabled, space node radius is determined by `totalActivityCount` rather than connection degree. The degree-based radius is the "rest state" that the node returns to when activity sizing is disabled.

The activity radius formula: `baseRadius * (1 + t * (MAX_ACTIVITY_SCALE - 1))` where:
- `baseRadius` = `BASE_RADIUS[type]` (18 for L0, 14 for L1, 9 for L2) — same base as degree scaling
- `t = maxCount > 0 ? log(1 + count) / log(1 + maxCount) : 0` — logarithmic, relative to peers at same level
- `MAX_ACTIVITY_SCALE = 2.5`
- Peers are grouped by space level (L0 vs L0, L1 vs L1, L2 vs L2) for fair comparison

This means a zero-activity space shows at `baseRadius` (not degree-scaled) — which is intentional: when you're in "activity mode", you want to see activity, not degree.

### Alternatives Considered

1. **Multiply activity scale on top of degree scale** — Rejected: compounds to extreme sizes (1.5× × 2.5× = 3.75×). Also confusing: what's driving the size?
2. **Blend degree and activity** — Rejected: muddies the visual signal. The toggle should give a clear mode switch.

## R5: Stroke Glow Implementation

### Decision: Modify `stroke` and `stroke-width` with optional `filter: drop-shadow` for soft glow effect

### Rationale

The spec calls for a "border glow" with tier-based colors. Two techniques combined:

1. **Stroke attributes**: Set `stroke` color and `stroke-width` per tier (matches the edge pulse tier-to-visual pattern).
2. **SVG drop-shadow filter** (optional enhancement): Add `filter: drop-shadow(0 0 4px color)` for a soft outer glow on HIGH tier only. This creates the "glow" effect beyond just a thick border.

Tier mapping (from clarified FR-005):
- HIGH: `stroke: #f59e0b`, `stroke-width: 3.5px`, `filter: drop-shadow(0 0 4px #f59e0b)`
- MEDIUM: `stroke: #3b82f6`, `stroke-width: 2.5px`, no drop-shadow
- LOW: `stroke: #93c5fd`, `stroke-width: 1.5px`, no drop-shadow
- INACTIVE: unchanged (default stroke)

All applied via D3 transition (300ms ease). Reversed on disable.

### Alternatives Considered

1. **Append a second, larger circle behind the node** — Rejected: adds DOM complexity, harder to animate, Z-order issues with labels.
2. **CSS `box-shadow`** — Rejected: doesn't work on SVG elements.
3. **SVG `<filter>` with `<feGaussianBlur>`** — Rejected: heavier than `drop-shadow`, and drop-shadow works well for this use case.
