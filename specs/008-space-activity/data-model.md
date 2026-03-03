# Data Model: Space Activity Volume

**Feature**: 008-space-activity  
**Date**: 2026-03-02

## Entity Changes

### GraphNode (modified)

Two new optional fields added to the existing `GraphNode` interface:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `totalActivityCount` | `number` | No | Sum of direct contributions to this space. Only populated for SPACE_L0/L1/L2 nodes. Defaults to `0` for non-space nodes or when activity data is unavailable. |
| `spaceActivityTier` | `ActivityTier` | No | Percentile-based tier classification of this space's total activity. Uses the existing `ActivityTier` enum (`INACTIVE`, `LOW`, `MEDIUM`, `HIGH`). Defaults to `INACTIVE` when absent. |

**TypeScript definition** (additions to `server/src/types/graph.ts`):

```typescript
export interface GraphNode {
  // ... existing fields ...

  /** Total direct contribution count for this space (L0/L1/L2 only, 0 for others) */
  totalActivityCount?: number;
  /** Activity tier for the space based on percentile distribution */
  spaceActivityTier?: ActivityTier;
}
```

> **Note**: Field name is `spaceActivityTier` (not `activityTier`) to avoid confusion with the distinct `GraphEdge.activityTier` which represents per-user-per-space edge activity.

### GraphEdge (unchanged)

No changes. Existing `activityCount` and `activityTier` fields on edges remain as-is.

### GraphDataset (unchanged)

No changes. The existing `hasActivityData` boolean already gates the feature.

## New Functions

### `aggregateSpaceActivityCounts(countMap: Map<string, number>): Map<string, number>`

**Location**: `server/src/transform/transformer.ts`

Takes the per-user-per-space count map (output of existing `aggregateActivityCounts()`) and produces a per-space total:

```
Input:  Map<"userId:spaceId", count>
Output: Map<"spaceId", totalCount>
```

Logic: iterate entries, split key on `:`, sum counts by spaceId.

### Tier computation

Reuses existing `computeActivityTiers(Map<string, number>): Map<string, ActivityTier>` — pass the space-keyed count map. No new function needed.

## Data Flow

```
ActivityFeedGrouped (GraphQL)
  → RawActivityEntry[]
    → aggregateActivityCounts()
      → Map<"userId:spaceId", count>
        ├── (existing) attach to edges as activityCount/activityTier
        └── (new) aggregateSpaceActivityCounts()
              → Map<"spaceId", totalCount>
                → computeActivityTiers()
                  → Map<"spaceId", ActivityTier>
                    → attach to space GraphNode as totalActivityCount/spaceActivityTier
```

## State Changes (Frontend)

### Explorer.tsx — New state

| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `spaceActivityEnabled` | `boolean` | `false` | Controls whether space activity sizing + glow is active |

### ForceGraph.tsx — New props

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `spaceActivityEnabled` | `boolean` | `false` | Enables/disables space activity visualization |

### ControlPanel.tsx — New props

| Prop | Type | Purpose |
|------|------|---------|
| `spaceActivityEnabled` | `boolean` | Current toggle state |
| `onToggleSpaceActivity` | `() => void` | Toggle callback |

## Visual State (ForceGraph useEffect)

When `spaceActivityEnabled` is toggled, a dedicated `useEffect` applies/reverses these visual changes on space nodes:

| Element | Attribute | Activity ON | Activity OFF |
|---------|-----------|-------------|--------------|
| `circle` (main) | `r` | `activityRadius` (log-scaled by totalActivityCount, max 2.5×) | `nodeRadius(d)` (degree-based) |
| `circle` (main) | `stroke` | Tier color: HIGH=`#f59e0b`, MEDIUM=`#3b82f6`, LOW=`#93c5fd`, INACTIVE=default | Default per-type stroke |
| `circle` (main) | `stroke-width` | Tier width: HIGH=3.5, MEDIUM=2.5, LOW=1.5, INACTIVE=default | Default per-type width |
| `circle` (main) | `filter` | HIGH only: `drop-shadow(0 0 4px #f59e0b)` | `none` |
| `image` | `x`, `y`, `width`, `height` | Scaled to `activityRadius` | Scaled to `nodeRadius(d)` |
| `clipPath circle` | `r` | `activityRadius` | `nodeRadius(d)` |
| `.visibility-badge-bg` | `cx`, `cy` | `activityRadius * 0.6` | `nodeRadius(d) * 0.6` |
| `.visibility-badge-icon` | `x`, `y` | `activityRadius * 0.6` | `nodeRadius(d) * 0.6` |

All transitions: 300ms ease (or instant if `prefers-reduced-motion: reduce`).
