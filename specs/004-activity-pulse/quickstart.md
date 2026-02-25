# Quickstart: Activity Pulse Visualization

**Feature**: 004-activity-pulse  
**Date**: 2026-02-25

## What This Feature Does

Adds an "Activity Pulse" mode to the ecosystem graph visualization. When enabled, user→space edges animate with a flowing pulse effect — faster for highly active contributors, slower for less active ones. This lets analysts see at a glance where energy flows in the ecosystem.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Alkemio Platform API                                       │
│  └── activityFeedGrouped(spaceIds, types, limit)            │
│      → Array<{triggeredBy.id, space.id, type, createdDate}> │
└──────────────┬──────────────────────────────────────────────┘
               │ bearer token
┌──────────────▼──────────────────────────────────────────────┐
│  BFF Server (server/)                                       │
│  ├── acquire-service.ts  — fetch activity entries            │
│  ├── transformer.ts      — aggregate counts, compute tiers   │
│  ├── graph-service.ts    — include in GraphDataset           │
│  └── cache               — cached with dataset (24h TTL)    │
└──────────────┬──────────────────────────────────────────────┘
               │ /api/graph/generate
┌──────────────▼──────────────────────────────────────────────┐
│  Frontend (frontend/)                                       │
│  ├── Explorer.tsx        — activityPulseEnabled state        │
│  ├── ControlPanel.tsx    — Activity Pulse toggle             │
│  └── ForceGraph.tsx      — CSS animation on edges            │
│      └── .edge-pulse class + --pulse-duration per tier      │
└─────────────────────────────────────────────────────────────┘
```

## Key Files to Modify

| File | Change |
|------|--------|
| `server/src/graphql/queries/activityFeedGrouped.graphql` | **NEW** — GraphQL query for activity data |
| `server/src/graphql/generated/alkemio-schema.ts` | **REGEN** — `pnpm run codegen` |
| `server/src/types/graph.ts` | Add `ActivityTier` enum, `ActivityCount` interface; extend `GraphEdge` and `GraphDataset` |
| `server/src/services/acquire-service.ts` | Add `activityFeedGrouped` call; extend `AcquiredData` |
| `server/src/transform/transformer.ts` | Add `aggregateActivityCounts()`, `computeActivityTiers()`; attach to edges |
| `server/src/services/graph-service.ts` | Set `hasActivityData` flag |
| `frontend/src/pages/Explorer.tsx` | Add `activityPulseEnabled` state; pass to ControlPanel and ForceGraph |
| `frontend/src/components/panels/ControlPanel.tsx` | Add Activity Pulse toggle (checkbox row) |
| `frontend/src/components/graph/ForceGraph.tsx` | Add pulse animation logic: `applyPulseAnimation()`, CSS class management, `useEffect([activityPulseEnabled])` |
| `frontend/src/components/graph/ForceGraph.module.css` | Add `@keyframes pulse-flow`, `.edge-pulse`, `prefers-reduced-motion` rules |

## Development Flow

```bash
# 1. Create the GraphQL query
# Add activityFeedGrouped.graphql to server/src/graphql/queries/

# 2. Regenerate typed SDK
cd server && pnpm run codegen

# 3. Update server types
# Edit server/src/types/graph.ts

# 4. Update acquisition + transform pipeline
# Edit acquire-service.ts, transformer.ts, graph-service.ts

# 5. Verify server builds
cd server && npx tsc --noEmit

# 6. Update frontend components
# Edit Explorer.tsx, ControlPanel.tsx, ForceGraph.tsx, ForceGraph.module.css

# 7. Verify frontend builds
cd frontend && npx tsc --noEmit

# 8. Test manually
# Load graph → enable Activity Pulse → verify edges animate
# Test selection highlighting + pulse composition
# Test view switching (force ↔ map)
# Test with prefers-reduced-motion enabled
```

## Key Design Decisions

1. **CSS animations over JS**: `stroke-dashoffset` animation runs on compositor thread — zero JS per-frame cost for 500+ edges.
2. **Data in graph pipeline**: Activity counts fetched alongside space data, not on-demand. Toggle is instant.
3. **Percentile tiers**: Tiers adapt to each ecosystem's distribution. No fixed thresholds that might misclassify.
4. **Graceful degradation**: If activity API fails, graph still works; toggle disabled with tooltip.
5. **`activityFeedGrouped` query**: Single call with `spaceIds` filter; avoids N+1 per-space calls.

## Testing Approach

- **Unit tests** (Vitest): Tier computation function (quartile logic, edge cases), activity aggregation
- **Integration**: Toggle toggle state persists across views, CSS animation lifecycle
- **Visual**: Manually verify pulse speed differences between tiers
- **Performance**: Enable Activity Pulse with 500+ edges, verify smooth pan/zoom
- **Accessibility**: Enable `prefers-reduced-motion`, verify static indicators instead of animation
