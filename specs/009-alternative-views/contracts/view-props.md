# 009 — Contracts: React View Component Props

**Date**: 2026-03-02

---

## ViewSwitcher

```typescript
interface ViewSwitcherProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  /** Whether temporal data is available (hides Temporal/Timeline tabs if not) */
  hasTemporalData: boolean;
}
```

---

## TreemapView

```typescript
interface TreemapViewProps {
  /** Full graph dataset */
  dataset: GraphDataset;
  /** Which metric to use for rectangle area sizing */
  sizeMetric: HierarchySizeMetric;
  /** Currently focused (zoomed-into) space ID, or null for root */
  focusedSpaceId: string | null;
  /** Activity period for activity-based sizing */
  activityPeriod: ActivityPeriod;
  /** Currently selected node ID (for highlight) */
  selectedNodeId: string | null;
  /** Callback when a space is clicked (zoom in) */
  onSpaceClick: (spaceId: string) => void;
  /** Callback when selection changes */
  onNodeSelect: (nodeId: string | null) => void;
  /** Callback to zoom out to parent */
  onZoomOut: () => void;
  /** Container dimensions */
  width: number;
  height: number;
}
```

### Behavior Contract
- Default sizing: `activity-allTime`, falling back to `members` when `activityByPeriod` is undefined on nodes
- Color encoding: activity tier → `#7dd3fc` (LOW), `#38bdf8` (MEDIUM), `#1e3a5f` (HIGH), `#e5e7eb` (INACTIVE/no data)
- Empty spaces (value=0) get minimum area (value floored to 1)
- Clicking a space with children zooms in; clicking a leaf selects
- Breadcrumb trail shows zoom path: Ecosystem > L0 > L1 > L2

---

## SunburstView

```typescript
interface SunburstViewProps {
  dataset: GraphDataset;
  sizeMetric: HierarchySizeMetric;
  activityPeriod: ActivityPeriod;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  /** Whether to include users/orgs as leaf arcs */
  showMembers: boolean;
  width: number;
  height: number;
}
```

### Behavior Contract
- Default sizing: `members` (member count per space)
- Center circle: "Ecosystem" label; click to zoom out to root
- Click any arc to zoom into that space (smooth animated transition, ~750ms)
- Private spaces render with diagonal hatch pattern overlay
- Arcs with no children (leaf spaces with no members shown) still render with minimum arc width
- Color: space depth band (L0=dark, L1=medium, L2=light) from existing palette; users are gray

---

## ChordView

```typescript
interface ChordViewProps {
  dataset: GraphDataset;
  /** Show shared members or shared tags */
  chordMode: ChordMode;
  /** Filter to specific role types */
  roleFilter: EdgeType[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  /** Whether to show L0 or L1 spaces as the chord groups */
  groupLevel: 'L0' | 'L1';
  width: number;
  height: number;
}
```

### Behavior Contract
- Default mode: `shared-members`
- Outer arcs: one per space (L0 by default), sized by total unique members
- Ribbons: thickness proportional to shared member count between two spaces
- Hover arc → highlight all connected ribbons, dim others to 0.15 opacity
- Hover ribbon → show tooltip: "Space A ↔ Space B: 42 shared members"
- Self-loops (diagonal): rendered as arc pad (members unique to that space)
- If `chordMode === 'shared-tags'` and no tags available → show info message, fall back to shared-members
- Color: each space gets a unique color from `d3.schemeTableau10`

---

## TimelineView

```typescript
interface TimelineViewProps {
  dataset: GraphDataset;
  /** Currently brushed time range (null = full range) */
  brushRange: [Date, Date] | null;
  /** Callback when brush range changes */
  onBrushChange: (range: [Date, Date] | null) => void;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  /** Stacked area or streamgraph */
  chartType: 'stacked' | 'stream';
  width: number;
  height: number;
}
```

### Behavior Contract
- X-axis: time (auto-scaled to data range)
- Y-axis: activity count (auto-scaled)
- Each space = one colored band
- Brush: drag to select time range → fires `onBrushChange([start, end])`
- Double-click brush to clear → fires `onBrushChange(null)`
- Legend: space name + color swatch, click to toggle visibility
- If `timeSeries` is empty/undefined → show "No temporal data available" fallback message
- Tooltip on hover: shows date + per-space counts

---

## ForceGraph.tsx (Temporal Mode Extension)

Existing props extended with:

```typescript
interface ForceGraphProps {
  // ... all existing props ...

  /** Enable temporal animation mode */
  temporalMode?: boolean;
  /** Current date position for temporal mode */
  temporalDate?: Date | null;
  /** Callback when temporal date changes (from scrubber) */
  onTemporalDateChange?: (date: Date) => void;
}
```

### Behavior Contract
- When `temporalMode=false` (default): existing behavior, no changes
- When `temporalMode=true`:
  - Nodes with `createdDate > temporalDate` → SVG `visibility: hidden`
  - Edges with hidden source or target → SVG `visibility: hidden`
  - New nodes appearing → fade in with opacity 0→1 (300ms transition)
  - Simulation warm-restarts with `alpha(0.1)` when new nodes appear
  - Force collision only considers visible nodes

---

## useViewState Hook

```typescript
function useViewState(): {
  state: ViewState;
  setActiveView: (view: ViewMode) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setFocusedSpace: (spaceId: string | null) => void;
  setSizeMetric: (metric: HierarchySizeMetric) => void;
  setChordMode: (mode: ChordMode) => void;
  setTemporalDate: (date: Date | null) => void;
  setTemporalPlaying: (playing: boolean) => void;
  setTemporalSpeed: (speed: number) => void;
  setTimelineBrush: (range: [Date, Date] | null) => void;
};
```

### Initial State
```typescript
const INITIAL_VIEW_STATE: ViewState = {
  activeView: 'force-graph',
  selectedNodeId: null,
  focusedSpaceId: null,
  sizeMetric: 'members',
  chordMode: 'shared-members',
  temporalDate: null,
  temporalPlaying: false,
  temporalSpeed: 1,
  timelineBrush: null,
};
```
