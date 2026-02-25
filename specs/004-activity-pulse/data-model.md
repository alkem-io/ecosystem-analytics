# Data Model: Activity Pulse Visualization

**Feature**: 004-activity-pulse  
**Date**: 2026-02-25

## Entity Diagram

```
┌──────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   GraphNode  │      │    GraphEdge     │      │ ActivityCount   │
│   (USER)     │ ───→ │  (MEMBER/LEAD)   │ ←─── │  (new type)     │
│              │      │                  │      │                 │
│  id          │      │  sourceId ──→ userId    │  userId         │
│  type: USER  │      │  targetId ──→ spaceId   │  spaceId        │
│  ...         │      │  type           │      │  count          │
│              │      │  activityCount? │      │  tier           │
└──────────────┘      └──────────────────┘      └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │  ActivityTier   │
                                                │  (enum)         │
                                                │                 │
                                                │  INACTIVE       │
                                                │  LOW            │
                                                │  MEDIUM         │
                                                │  HIGH           │
                                                └─────────────────┘
```

## Type Changes

### New Types (in `server/src/types/graph.ts`)

```typescript
/** Activity tier classification based on percentile distribution */
enum ActivityTier {
  INACTIVE = 'INACTIVE',   // 0 contributions
  LOW = 'LOW',             // > 0 and <= p25
  MEDIUM = 'MEDIUM',       // > p25 and <= p75
  HIGH = 'HIGH',           // > p75
}

/** Per-user per-space activity count */
interface ActivityCount {
  userId: string;
  spaceId: string;
  count: number;
  tier: ActivityTier;
}
```

### Modified Types

#### `GraphEdge` — add optional `activityCount` and `activityTier`

```typescript
interface GraphEdge {
  sourceId: string;          // existing
  targetId: string;          // existing
  type: EdgeType;            // existing
  weight: number;            // existing
  scopeGroup: string | null; // existing
  activityCount?: number;    // NEW — raw contribution count (only on MEMBER/LEAD edges where source is a USER)
  activityTier?: ActivityTier; // NEW — computed tier classification
}
```

#### `GraphDataset` — add optional `activityCounts` summary and `hasActivityData` flag

```typescript
interface GraphDataset {
  version: string;           // existing
  generatedAt: string;       // existing
  spaces: string[];          // existing
  nodes: GraphNode[];        // existing
  edges: GraphEdge[];        // existing — edges now carry activityCount/activityTier
  metrics: GraphMetrics;     // existing
  cacheInfo: SpaceCacheInfo[];  // existing
  insights?: GraphInsights;  // existing
  hasActivityData?: boolean; // NEW — true if activity data was successfully fetched
}
```

### Acquired Data Extension

```typescript
// In acquire-service.ts AcquiredData type
interface AcquiredData {
  spacesL0: SpaceL0[];           // existing
  users: Map<string, UserProfile>; // existing
  organizations: Map<string, OrgProfile>; // existing
  activityEntries?: ActivityLogEntry[]; // NEW — raw activity feed entries
}
```

## Data Flow

```
1. acquire-service.ts
   ├── fetchSpaceByName() for each space      (existing)
   ├── batch-fetch user profiles               (existing)
   ├── fetch org profiles                      (existing)
   └── SDK.activityFeedGrouped({              (NEW)
   │     args: {
   │       spaceIds: [...allSpaceIds],
   │       limit: 5000,
   │       types: [contribution event types]
   │     }
   │   })
   └── Store in AcquiredData.activityEntries

2. transformer.ts
   ├── Build nodes and edges                   (existing)
   ├── aggregateActivityCounts(entries)         (NEW)
   │   └── Map<"userId:spaceId", count>
   ├── computeActivityTiers(counts)             (NEW)
   │   └── Quartile boundaries → classify each count
   └── Attach activityCount + activityTier to MEMBER/LEAD edges
       where source is a USER node

3. graph-service.ts
   ├── Set dataset.hasActivityData = true       (NEW)
   └── Cache includes activity data             (existing cache mechanism)

4. Frontend (ForceGraph.tsx)
   ├── Read edge.activityTier                   (NEW)
   ├── Map tier to CSS --pulse-duration         (NEW)
   └── Apply/remove .edge-pulse CSS class       (NEW)
```

## Validation Rules

- `activityCount` is always >= 0
- `activityTier` is always one of the 4 enum values  
- Only edges where `type === MEMBER || type === LEAD` and source node `type === USER` carry activity data
- `CHILD` edges (space→subspace) never have activity data
- Organization→space edges never have activity data (FR-013)
- If `hasActivityData === false`, the Activity Pulse toggle is disabled on the frontend (FR-007)

## Tier Computation Algorithm

```
Input: all activityCount values from user→space edges
1. Collect all counts where count > 0
2. If fewer than 3 non-zero counts:
   - Use fixed thresholds: low=[1,2], medium=[3,10], high=[11+]
3. Otherwise:
   - Sort ascending
   - p25 = value at index floor(n * 0.25)
   - p75 = value at index floor(n * 0.75)
   - INACTIVE: count === 0
   - LOW: 0 < count <= p25
   - MEDIUM: p25 < count <= p75
   - HIGH: count > p75
```
