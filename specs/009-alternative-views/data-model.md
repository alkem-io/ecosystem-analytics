# 009 — Alternative Views: Data Model

**Date**: 2026-03-02 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## 1. Extended GraphNode

Existing `GraphNode` type in `server/src/types/graph.ts` gains new fields:

```typescript
export interface GraphNode {
  // ... existing fields ...

  /** ISO 8601 timestamp when the node entity was created on Alkemio */
  createdDate?: string;

  /** Space visibility — ACTIVE, ARCHIVED, or DEMO (spaces only) */
  visibility?: 'ACTIVE' | 'ARCHIVED' | 'DEMO';

  /** Tags from the profile's tagsets, keyed by reserved name */
  tags?: {
    keywords?: string[];
    skills?: string[];
    default?: string[];
  };
}
```

### Field Sources

| Field | Source (Alkemio GraphQL) | Node Types | Nullable |
|-------|--------------------------|------------|----------|
| `createdDate` | `space.createdDate` / `user.createdDate` | All | Yes (orgs may not have it) |
| `visibility` | `space.visibility` | SPACE_L0, SPACE_L1, SPACE_L2 | Yes (null for non-spaces) |
| `tags.keywords` | `profile.tagsets[name='keywords'].tags` | All | Yes |
| `tags.skills` | `profile.tagsets[name='skills'].tags` | Users only | Yes |
| `tags.default` | `profile.tagsets[name='default'].tags` | All | Yes |

---

## 2. Extended GraphEdge

Existing `GraphEdge` type gains a creation timestamp:

```typescript
export interface GraphEdge {
  // ... existing fields ...

  /** Estimated ISO 8601 timestamp when this relationship was established */
  createdDate?: string;
}
```

### Edge Timestamp Resolution Strategy

| Priority | Source | Coverage |
|----------|--------|----------|
| 1 | `Application.createdDate` (if user applied to join the space) | Partial — only spaces with application-based membership |
| 2 | Earliest `activityFeedGrouped` entry for this (userId, spaceId) pair | Partial — only active users |
| 3 | Target space's `createdDate` (fallback) | Full — all edges get a timestamp |

---

## 3. New: ActivityTimeSeries

New types for the bucketed time-series data:

```typescript
/** A single weekly activity bucket */
export interface ActivityTimeBucket {
  /** ISO week string, e.g., '2026-W09' */
  week: string;
  /** Total activity count for this week */
  count: number;
}

/** Time-series activity data for a single space */
export interface SpaceTimeSeries {
  spaceId: string;
  spaceDisplayName: string;
  buckets: ActivityTimeBucket[];
}
```

---

## 4. Extended GraphDataset

```typescript
export interface GraphDataset {
  // ... existing fields ...

  /** Weekly activity time series per space (for Timeline view) */
  timeSeries?: SpaceTimeSeries[];
}
```

---

## 5. New: View State Types

Frontend-only types for managing the view switcher:

```typescript
/** Available visualization views */
export type ViewMode =
  | 'force-graph'
  | 'temporal'
  | 'sunburst'
  | 'chord'
  | 'treemap'
  | 'timeline';

/** Sizing metric for hierarchy views */
export type HierarchySizeMetric =
  | 'members'
  | 'activity-day'
  | 'activity-week'
  | 'activity-month'
  | 'activity-allTime';

/** Chord diagram mode */
export type ChordMode = 'shared-members' | 'shared-tags';

/** View-specific state */
export interface ViewState {
  activeView: ViewMode;
  /** Currently selected/focused node ID (shared across views) */
  selectedNodeId: string | null;
  /** Treemap/Sunburst: currently zoomed-into space ID */
  focusedSpaceId: string | null;
  /** Hierarchy size metric */
  sizeMetric: HierarchySizeMetric;
  /** Chord mode */
  chordMode: ChordMode;
  /** Temporal mode: current date position */
  temporalDate: Date | null;
  /** Temporal mode: playing state */
  temporalPlaying: boolean;
  /** Temporal mode: playback speed multiplier */
  temporalSpeed: number;
  /** Timeline: brushed date range */
  timelineBrush: [Date, Date] | null;
}
```

---

## 6. Hierarchy Data Transformation

For Sunburst and Treemap, the flat `GraphNode[]` + `GraphEdge[]` must be transformed into a `d3.hierarchy()`-compatible tree:

```typescript
/** Hierarchy node for d3.treemap() and d3.partition() */
export interface HierarchyDatum {
  id: string;
  name: string;
  type: NodeType;
  /** Leaf value — member count or activity count depending on sizeMetric */
  value: number;
  /** Activity tier for color encoding */
  activityTier?: ActivityTier;
  /** Tags for label display */
  tags?: string[];
  /** Whether this space is private */
  isPrivate: boolean;
  /** Original node reference */
  node: GraphNode;
  /** Children (subspaces, or users/orgs at leaf level) */
  children?: HierarchyDatum[];
}
```

### Tree Construction Algorithm

1. Create root node: `{ id: 'ecosystem', name: 'Ecosystem', children: [] }`
2. For each `SPACE_L0` node → add as child of root
3. For each `SPACE_L1` node → find parent via `parentSpaceId`, add as child
4. For each `SPACE_L2` node → find parent via `parentSpaceId`, add as child
5. For Sunburst only: for each `USER`/`ORGANIZATION` node → find deepest connected space, add as leaf child
6. Compute `value` based on selected `sizeMetric`:
   - `members`: count of USER/ORG edges
   - `activity-*`: `activityByPeriod[period]` or `totalActivityCount`
7. Ensure minimum value of 1 for empty spaces (prevents zero-area rectangles)

---

## 7. Chord Matrix Construction

Client-side computation from existing edges:

```typescript
/** Build an n×n shared-member matrix from edges */
function buildChordMatrix(
  spaces: GraphNode[],       // L0 (or L1 if drilling down)
  edges: GraphEdge[],        // MEMBER/LEAD/ADMIN edges
  roleFilter?: EdgeType[],   // optional: filter to specific roles
): { matrix: number[][]; names: string[] }
```

### Algorithm

1. Filter edges to `roleFilter` types (default: all MEMBER + LEAD + ADMIN)
2. Build Map<userId, Set<spaceId>> from user→space edges
3. For each user, iterate all pairs of their spaces → increment `matrix[i][j]` and `matrix[j][i]`
4. Diagonal `matrix[i][i]` = total unique members (for arc sizing)

---

## 8. Entity Relationship Summary

```
GraphDataset (1)
├── nodes: GraphNode[] (many)
│   ├── createdDate: string?     ← NEW
│   ├── visibility: string?      ← NEW
│   └── tags: { keywords?, skills?, default? }  ← NEW
├── edges: GraphEdge[] (many)
│   └── createdDate: string?     ← NEW
└── timeSeries: SpaceTimeSeries[]  ← NEW
    └── buckets: ActivityTimeBucket[]

ViewState (frontend only)
├── activeView: ViewMode
├── selectedNodeId: string?
├── focusedSpaceId: string?
├── sizeMetric: HierarchySizeMetric
├── chordMode: ChordMode
├── temporalDate: Date?
└── timelineBrush: [Date, Date]?
```

---

## 9. Validation Rules

| Rule | Applies To | Enforcement |
|------|-----------|-------------|
| `visibility` must be `ACTIVE`/`ARCHIVED`/`DEMO` or null | GraphNode | TypeScript union type |
| `createdDate` must be valid ISO 8601 or omitted | GraphNode, GraphEdge | Runtime parse check |
| `week` must match `/^\d{4}-W\d{2}$/` | ActivityTimeBucket | Regex validation in transformer |
| `count` must be ≥ 0 | ActivityTimeBucket | Transform-time floor to 0 |
| Hierarchy value must be ≥ 1 | HierarchyDatum | Floor to 1 in tree construction |
| Chord matrix must be symmetrical | ChordView | Algorithm ensures `matrix[i][j] === matrix[j][i]` |
