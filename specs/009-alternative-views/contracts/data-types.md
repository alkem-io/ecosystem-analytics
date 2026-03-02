# 009 — Contracts: Data Types Reference

**Date**: 2026-03-02

All new and extended TypeScript types for the 009-alternative-views feature.

---

## 1. Extended Server Types (`server/src/types/graph.ts`)

### Extended `GraphNode`

```typescript
export interface GraphNode {
  // Existing fields
  id: string;
  type: NodeType;
  displayName: string;
  avatarUrl?: string;
  activityScore?: number;
  activityBand?: 'LOW' | 'MEDIUM' | 'HIGH' | 'INACTIVE';
  memberCount?: number;
  subspaceCount?: number;
  level?: SpaceLevel;
  parentSpaceId?: string;

  // ─── New fields (009) ───
  /** ISO 8601 creation timestamp */
  createdDate?: string;
  /** Space visibility status (space nodes only) */
  visibility?: 'ACTIVE' | 'ARCHIVED' | 'DEMO';
  /** Aggregated tagset data from profile */
  tags?: TagData;
}

export interface TagData {
  keywords?: string[];
  skills?: string[];
  default?: string[];
}
```

### Extended `GraphEdge`

```typescript
export interface GraphEdge {
  // Existing fields
  sourceId: string;
  targetId: string;
  type: EdgeType;
  weight?: number;
  degree?: number;

  // ─── New fields (009) ───
  /** Estimated creation timestamp */
  createdDate?: string;
}
```

### Extended `GraphDataset`

```typescript
export interface GraphDataset {
  // Existing fields
  version: string;
  generatedAt: string;
  spaces: SpaceSummary[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  metrics: DatasetMetrics;
  cacheInfo?: CacheInfo;

  // ─── New fields (009) ───
  /** Weekly activity time series per space */
  timeSeries?: SpaceTimeSeries[];
}
```

---

## 2. New Server Types (`server/src/types/graph.ts`)

### `ActivityTimeBucket`

```typescript
/** A single time bucket in a time series */
export interface ActivityTimeBucket {
  /** ISO 8601 week string, e.g. "2026-W09" */
  week: string;
  /** Number of activity events in this week */
  count: number;
}
```

### `SpaceTimeSeries`

```typescript
/** Weekly activity time series for one space */
export interface SpaceTimeSeries {
  spaceId: string;
  spaceDisplayName: string;
  buckets: ActivityTimeBucket[];
}
```

---

## 3. Frontend View Types (`frontend/src/types/`)

### `ViewMode`

```typescript
/** All available visualization modes */
export type ViewMode =
  | 'force-graph'      // Existing default
  | 'treemap'          // New: D3 treemap
  | 'sunburst'         // New: Zoomable sunburst
  | 'chord'            // New: Chord diagram
  | 'timeline'         // New: Activity timeline
  | 'temporal-force';  // New: Temporal force graph
```

### `HierarchySizeMetric`

```typescript
/** Metric used to size hierarchy nodes (Treemap & Sunburst) */
export type HierarchySizeMetric =
  | 'activity'       // activityScore-based
  | 'members'        // memberCount-based
  | 'subspaces';     // subspaceCount-based
```

### `ChordMode`

```typescript
/** What chord ribbons represent */
export type ChordMode =
  | 'shared-members'     // Shared members between spaces
  | 'shared-tags';       // Shared tags between spaces (Phase 2+)
```

### `ViewState`

```typescript
/** Complete view state for all visualization modes */
export interface ViewState {
  mode: ViewMode;

  // Hierarchy views (Treemap & Sunburst)
  hierarchySizeMetric: HierarchySizeMetric;

  // Chord view
  chordMode: ChordMode;

  // Timeline view
  timelineBrushRange: [Date, Date] | null;

  // Temporal force graph
  temporalDate: Date | null;
  temporalPlaying: boolean;
  temporalSpeed: number; // ms per animation frame

  // Shared across views
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
}

export const INITIAL_VIEW_STATE: ViewState = {
  mode: 'force-graph',
  hierarchySizeMetric: 'activity',
  chordMode: 'shared-members',
  timelineBrushRange: null,
  temporalDate: null,
  temporalPlaying: false,
  temporalSpeed: 200,
  selectedNodeId: null,
  hoveredNodeId: null,
};
```

### `HierarchyDatum`

```typescript
/** Node datum for d3.hierarchy — used by Treemap and Sunburst */
export interface HierarchyDatum {
  /** Display name shown in the tile/arc */
  name: string;
  /** Original GraphNode ID */
  nodeId: string;
  /** Node type for styling */
  nodeType: NodeType;
  /** Sizing value (depends on HierarchySizeMetric) */
  value?: number;
  /** Children for branching nodes */
  children?: HierarchyDatum[];
  /** Activity band for color mapping */
  activityBand?: 'LOW' | 'MEDIUM' | 'HIGH' | 'INACTIVE';
}
```

---

## 4. Chord Matrix Utility Types

```typescript
/** Result of computing a chord matrix from graph data */
export interface ChordMatrixResult {
  /** NxN matrix where [i][j] = shared member count between space i and j */
  matrix: number[][];
  /** Ordered space names, indices align with matrix rows/columns */
  spaceNames: string[];
  /** Ordered space IDs, indices align with matrix rows/columns */
  spaceIds: string[];
}
```

---

## 5. Hook Return Types

### `useViewState`

```typescript
export interface UseViewStateReturn {
  viewState: ViewState;
  setMode: (mode: ViewMode) => void;
  setHierarchySizeMetric: (metric: HierarchySizeMetric) => void;
  setChordMode: (mode: ChordMode) => void;
  setTimelineBrushRange: (range: [Date, Date] | null) => void;
  setTemporalDate: (date: Date | null) => void;
  setTemporalPlaying: (playing: boolean) => void;
  setTemporalSpeed: (speed: number) => void;
  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
  reset: () => void;
}
```

### `useHierarchyData`

```typescript
export interface UseHierarchyDataReturn {
  /** Root datum for d3.hierarchy() */
  root: HierarchyDatum | null;
  /** Whether data is being computed */
  loading: boolean;
}
```

### `useChordMatrix`

```typescript
export interface UseChordMatrixReturn {
  /** Chord matrix result */
  result: ChordMatrixResult | null;
  /** Whether matrix is being computed */
  loading: boolean;
}
```

### `useTimeSeries`

```typescript
export interface UseTimeSeriesReturn {
  /** Parsed time series data */
  series: SpaceTimeSeries[];
  /** Computed date extent [min, max] */
  dateExtent: [Date, Date] | null;
  /** Whether data is being processed */
  loading: boolean;
}
```
