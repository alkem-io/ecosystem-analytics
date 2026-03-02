# 009 — Alternative Views: Research

**Date**: 2026-03-02 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Research Topic 1: D3 + React Rendering Patterns

**Decision**: Use a **mixed approach** — declarative React rendering for static layouts (Treemap, Chord), hybrid/imperative for interactive views (Sunburst zoom, Timeline brush, Temporal Force Graph).

**Rationale**: D3 v7.9 cleanly separates layout computation from DOM manipulation. For layouts that produce static coordinates (treemap, chord), React JSX is cleaner and works with TypeScript's type system. For views requiring D3 transitions, brushing, or tick-loop animation, we must use refs + useEffect since React reconciliation can't keep up at 60fps.

**Alternatives considered**:
- *Fully declarative everywhere*: Rejected — zoomable sunburst tweens 500 arcs per frame; React state updates would stutter. Brush overlay requires `selection.call(brush)`.
- *Fully imperative everywhere*: Rejected — unnecessary for Treemap/Chord; loses React's benefits (type safety, event handling, accessibility).

### Per-View Rendering Strategy

| View | Layout | Rendering | Interaction |
|------|--------|-----------|-------------|
| **Treemap** | `d3.treemap()` | Declarative JSX `<rect>` | React `onClick` → zoom state update → re-layout |
| **Sunburst** | `d3.partition()` | Hybrid — JSX for initial, `d3.transition()` for zoom | Imperative zoom via `attrTween('d', arcTween)` |
| **Chord** | `d3.chord()` | Declarative JSX `<path>` via `d3.arc()` + `d3.ribbon()` | CSS `:hover` + `hoveredIndex` state for highlighting |
| **Timeline** | `d3.stack()` + `d3.area()` | Declarative `<path>` for areas | Imperative `d3.brushX()` via ref |
| **Temporal** | `d3-force` (existing) | Imperative (extends ForceGraph.tsx) | `d3.timer()` + time scrubber state |

---

## Research Topic 2: Alkemio Schema — Timestamp & Metadata Availability

**Decision**: All key fields are available in the schema. Edge join timestamps have no direct field — fall back to activity-date proxy.

**Findings**:

| Field | Available | Type | Path | Notes |
|-------|-----------|------|------|-------|
| `Space.createdDate` | **Yes** | `DateTime` (non-null) | `space.createdDate` | Ready to add to fragment |
| `User.createdDate` | **Yes** | `DateTime` (non-null) | `user.createdDate` | Ready to add to `usersByIDs` query |
| `Space.visibility` | **Yes** | `SpaceVisibility` enum: `ACTIVE` / `ARCHIVED` / `DEMO` | `space.visibility` | Ready to add to fragment |
| `Profile.tagsets` | **Yes** | `Maybe<Array<Tagset>>` | `*.profile.tagsets[]` with `name`, `tags[]`, `type` | Reserved names: `DEFAULT`, `KEYWORDS`, `SKILLS`, `CAPABILITIES`, `FLOW_STATE` |
| `Callout.activity` | **Yes** | `Float` (non-null) | `space.collaboration.calloutsSet.callouts[].activity` | Lightweight metric |
| `Callout.contributionsCount` | **Yes** | `{link, memo, post, whiteboard}` (all Float) | `...callouts[].contributionsCount` | Per-type counts |
| `CalendarEvent` | **Yes** | Dedicated type with `startDate`, `type`, `profile` | `space.collaboration.timeline.calendar.events[]` | Types: `DEADLINE`, `EVENT`, `MEETING`, `MILESTONE`, `TRAINING`, `OTHER` |
| Role-assignment timestamp | **No** | — | — | `RoleSet.usersInRole` returns `User[]` with no join date wrapper |

**Edge timestamp fallback strategy** (per clarification):
1. Check `Application.createdDate` / `Invitation.createdDate` as partial proxies (only for users who applied/were invited)
2. Fall back to earliest activity entry date per user-space pair
3. Batch remaining zero-activity edges at the space's `createdDate`

---

## Research Topic 3: Zoomable Sunburst in React

**Decision**: Use the canonical Observable zoomable sunburst pattern adapted for React — stash `.current` and `.target` coordinates on datum, tween imperatively, sync React state on `transition.end()`.

**Rationale**: The D3 zoomable sunburst computes arc angles via `d3.partition()` then transitions between zoom levels by interpolating `{x0, x1, y0, y1}` on each node. This requires `attrTween` which must run outside React's reconciliation. React state updates only on transition completion (to set the "focused node" for breadcrumbs/details).

**Key implementation notes**:
- `d3.arc()` generator configured with `startAngle(d.x0)`, `endAngle(d.x1)`, `innerRadius(d.y0 * radius)`, `outerRadius(d.y1 * radius)`
- Zoom: stash target `{x0,x1,y0,y1}` per node, use `d3.interpolate(current, target)` in `attrTween`
- `padAngle` and `padRadius` prevent hairline gaps
- Center circle reserved for "Ecosystem" label; click it to zoom out

---

## Research Topic 4: Chord Matrix Computation Performance

**Decision**: Build the shared-member matrix client-side in `useMemo`. O(u × s²) is fast enough for our scale.

**Rationale**: For each user, iterate their space memberships and increment `matrix[i][j]` for every pair. With 2,000 users × average 2-3 spaces each, this is ~6,000 pair increments across a ~20×20 matrix — effectively instant (<1ms). No server-side computation needed.

**Alternatives considered**:
- *Server-side matrix*: Rejected — adds API surface, caching complexity, and the computation is trivial client-side.
- *Pre-computed in GraphDataset*: Rejected — the matrix depends on which spaces are selected, and the user may filter by role type.

---

## Research Topic 5: Time-Series Bucketing Strategy

**Decision**: Server computes weekly buckets from the existing `activityFeedGrouped` entries. Buckets are ISO week strings (`2026-W09`). Returns `SpaceTimeSeries[]` alongside the existing `GraphDataset`.

**Rationale**: Weekly buckets balance granularity vs. payload size. For a 1-year range, that's ~52 buckets per space × 20 spaces = ~1,040 entries — trivially small JSON. Monthly is too coarse to see activity waves; daily would be 365 × 20 = 7,300 entries (still fine, but noisier).

**Bucket format**:
```typescript
interface ActivityTimeBucket {
  week: string;          // ISO week: '2026-W09'
  count: number;         // total activities in that week
}

interface SpaceTimeSeries {
  spaceId: string;
  buckets: ActivityTimeBucket[];
}
```

**Implementation**: In `transformer.ts`, iterate activity entries (which already have `createdDate`), group by `(spaceId, isoWeek)`, count. Return as a new field on `GraphDataset`.

---

## Research Topic 6: Temporal Force Graph Animation Pattern

**Decision**: Enhance existing `ForceGraph.tsx` with a "temporal mode" toggle rather than creating a standalone component. Use `d3.timer()` for animation, SVG `visibility` for show/hide, and warm-restart the simulation.

**Rationale**: The ForceGraph already handles the full rendering pipeline (~2,200 lines: SVG setup, force simulation, zoom, node rendering, edge rendering, collision, click/hover). Duplicating for temporal mode would be massive. Instead:
- Add `temporalMode: boolean` prop + `currentDate: Date | null`
- When temporal mode is on, a time scrubber controls `currentDate`
- In the tick handler, nodes with `createdDate > currentDate` get `visibility: hidden`
- Edges where either endpoint is hidden also get `visibility: hidden`
- When `currentDate` advances and new nodes appear: set initial positions near parent, call `simulation.alpha(0.1).restart()`

**Alternatives considered**:
- *Standalone `TemporalForceGraph.tsx`*: Rejected — massive code duplication, hard to keep in sync.
- *Full re-render on scrub*: Rejected — destroys spatial continuity.

**Key implementation notes**:
- Time scrubber: `<input type="range">` with `min={earliestDate}`, `max={latestDate}`, `step={86400000}` (1 day in ms)
- Play/pause: `d3.timer(elapsed => { currentDate += speed * elapsed; })` — pauses when toggled off
- Speed controls: 1x (1 day/second), 2x, 5x
- Entrance animation: new nodes start with `opacity: 0` and tween to 1 over 300ms
- SVG `visibility` is more performant than `display: none` or array filtering because it preserves D3's data joins and force node indices

---

## All NEEDS CLARIFICATION Resolved

No remaining unknowns. All research topics have concrete decisions. Ready for Phase 1 design.
