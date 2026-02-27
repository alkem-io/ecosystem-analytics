# Research: Activity Pulse Visualization

**Feature**: 004-activity-pulse  
**Date**: 2026-02-25

## R1: SVG Pulse Animation Technique

### Decision: CSS `@keyframes` with `stroke-dasharray` / `stroke-dashoffset`

### Rationale

CSS-animated `stroke-dashoffset` runs on the compositor thread (off main thread), enabling 500+ simultaneous animations at 60fps. Alternatives (D3 transitions, `d3.timer`, `requestAnimationFrame`) require per-frame JS DOM updates and measurably degrade to ~35fps at 500 elements.

### Alternatives Considered

| Technique | Verdict |
|-----------|---------|
| **CSS `@keyframes` + `stroke-dashoffset`** | **Selected** — compositor-driven, zero JS per-frame cost, naturally pausable via `animation-play-state`, `prefers-reduced-motion` handled in CSS |
| D3 `selection.transition()` loop | Rejected — 500 concurrent transitions create timer thrash; interrupts selection-highlight transitions on same elements |
| `d3.timer` / `requestAnimationFrame` batch | Rejected — single callback must touch 500 DOM attributes per frame, forces layout recalc |
| SMIL `<animate>` | Rejected — inconsistent browser support, harder to parameter-control |

### Key Technical Details

- **Dash pattern**: `stroke-dasharray: 8 24` (8px dash, 24px gap = 32px period). Fixed across all tiers — only `animation-duration` varies per tier.
- **Speed mapping**: CSS custom property `--pulse-duration` set per edge. Tiers: inactive = no animation, low = 4s, medium = 2s, high = 0.8s.
- **Direction**: Path winding order (`M source Q ... target`) naturally flows source→target. User→space direction is correct without reversal.
- **Toggle transition (FR-010)**: Fade in by transitioning `stroke-dasharray` from `0 32` to `8 24` over 300ms; reverse for fade out. Remove CSS class after transition ends.
- **Selection composition (FR-011)**: `animation-play-state: paused` on non-connected edges when a node is selected. Runs independently from selection-highlight's `opacity`/`stroke` transitions (different CSS properties — no conflict).
- **Reduced motion (FR-014)**: CSS `@media (prefers-reduced-motion: reduce)` sets `animation: none` and uses static `stroke-dasharray: 4 12` as dotted indicator. JS checks `window.matchMedia` for toggle label.
- **CSS injection**: Use `:global` in CSS Modules for animation classes applied via D3 `.classed()`.
- **No `will-change`**: At 500 elements, `will-change: stroke-dashoffset` would create 500 compositing layers — counterproductive. Browser default batching is optimal.

---

## R2: Alkemio Activity API — Query Strategy

### Decision: Use `activityFeedGrouped` query with `spaceIds` filter

### Rationale

`activityFeedGrouped` provides a flat array of activity entries filtered by space IDs in a single call. It returns `triggeredBy.id` (user) and `space.id` per entry, enabling server-side aggregation into per-user-per-space contribution counts. No pagination needed (uses `limit` param). Avoids N+1 calls (unlike `activityLogOnCollaboration` which needs per-space `collaborationID`).

### Alternatives Considered

| Query | Verdict |
|-------|---------|
| **`activityFeedGrouped`** with `spaceIds` | **Selected** — single call, flat result, `spaceIds` batch filter, `limit` param, deduplication acceptable for tier classification |
| `activityFeed` with cursor pagination | Viable fallback — full fidelity counts, but requires multiple paginated calls; adds complexity |
| `activityLogOnCollaboration` per space | Rejected — requires `collaborationID` (not currently fetched), N+1 calls per space |

### Key Technical Details

- **Query inputs**: `spaceIds: UUID[]` (all L0 space IDs from current dataset), `limit: 5000` (tunable), optional `types` filter for relevant event types only.
- **Response**: `Array<ActivityLogEntry>` with `{ triggeredBy: { id }, space: { id }, type, createdDate }`.
- **Aggregation**: Server-side map of `Map<"userId:spaceId", number>` counting entries per user per space.
- **Event types to include** (FR-012): `CALLOUT_POST_CREATED`, `CALLOUT_POST_COMMENT`, `CALLOUT_MEMO_CREATED`, `CALLOUT_LINK_CREATED`, `CALLOUT_WHITEBOARD_CREATED`, `CALLOUT_WHITEBOARD_CONTENT_MODIFIED`, `DISCUSSION_COMMENT`, `UPDATE_SENT`, `CALENDAR_EVENT_CREATED`. Exclude: `MEMBER_JOINED` (membership, not contribution), `SUBSPACE_CREATED` (admin action), `CALLOUT_PUBLISHED` (setup, not contribution).
- **Deduplication note**: `activityFeedGrouped` may collapse repeated events of the same type on the same resource. This is acceptable — for tier classification, approximate counts are sufficient.
- **Pipeline integration**: Add call in `acquire-service.ts` after space fetching, in parallel with user/org profile fetching. Store in `AcquiredData.activityEntries`. Aggregate in `transformer.ts` when building edges.
- **Codegen**: New `activityFeedGrouped.graphql` query file → `pnpm run codegen` regenerates typed SDK.

---

## R3: Percentile-Based Activity Tier Computation

### Decision: Quartile-based tiers with special "inactive" tier for zero-contribution edges

### Rationale

Percentile-based tiers (from spec clarification) adapt to each ecosystem's activity distribution. Using quartiles on the non-zero contribution counts gives 3 tiers (low/medium/high), with 0-count edges automatically classified as "inactive".

### Algorithm

```
Input: contribution counts for all user→space edges
1. Separate: inactive = edges with count === 0
2. Sort remaining counts ascending
3. p25 = count at 25th percentile
4. p75 = count at 75th percentile
5. Tiers:
   - inactive: count === 0
   - low: 0 < count <= p25
   - medium: p25 < count <= p75
   - high: count > p75
```

### Edge Cases

- If all edges have the same non-zero count → all classified as "medium" (p25 = p75 = that count).
- If only 1-2 non-zero edges → insufficient data for meaningful quartiles; fallback to fixed thresholds (1-2 = low, 3-10 = medium, 11+ = high).
- Tier boundaries are computed per graph load and cached with the dataset.
