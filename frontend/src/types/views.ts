/**
 * View types for the 009 — Alternative Visualization Views feature.
 *
 * Canonical type definitions used by all new view components,
 * hooks, and Explorer.tsx integration.
 */

import type { NodeType, ActivityTier, ActivityPeriod } from '../../../server/src/types/graph.js';

// ─── View Mode ────────────────────────────────────────────────

/** All available visualization modes */
export type ViewMode =
  | 'force-graph'     // Existing default
  | 'treemap'         // D3 treemap (US1)
  | 'sunburst'        // Zoomable sunburst (US2)
  | 'chord'           // Chord diagram (US3)
  | 'timeline'        // Activity timeline (US4)
  | 'temporal-force'; // Temporal force graph (US5)

/** Display labels for each view mode */
export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  'force-graph': 'Force Graph',
  'treemap': 'Treemap',
  'sunburst': 'Sunburst',
  'chord': 'Chord',
  'timeline': 'Timeline',
  'temporal-force': 'Temporal',
};

// ─── Hierarchy Views (Treemap & Sunburst) ─────────────────────

/** Metric used to size hierarchy nodes */
export type HierarchySizeMetric =
  | 'members'        // memberCount-based
  | 'activity';      // activityScore-based (uses current activityPeriod)

/** Node datum for d3.hierarchy — used by Treemap and Sunburst */
export interface HierarchyDatum {
  /** Original GraphNode ID */
  id: string;
  /** Display name shown in the tile/arc */
  name: string;
  /** Node type for styling */
  type: NodeType;
  /** Sizing value (depends on HierarchySizeMetric) */
  value: number;
  /** Activity tier for color mapping */
  activityTier?: ActivityTier;
  /** Tags for label display */
  tags?: string[];
  /** Whether this space is private */
  isPrivate: boolean;
  /** Children for branching nodes */
  children?: HierarchyDatum[];
  /** Avatar image URL (proxied) */
  avatarUrl?: string | null;
  /** Banner image URL (proxied) — preferred for spaces */
  bannerUrl?: string | null;
  /** Short tagline / description */
  tagline?: string | null;
  /** Number of direct members (USER+ORG edges) */
  memberCount?: number;
  /** Raw activity count for the current period */
  activityCount?: number;
  /** External URL */
  url?: string | null;
}

// ─── Chord Diagram ────────────────────────────────────────────

/** What chord ribbons represent */
export type ChordMode =
  | 'shared-members'  // Shared members between spaces
  | 'shared-tags';    // Shared tags between spaces

/** Per-space metadata for chord diagram rendering */
export interface ChordSpaceMeta {
  avatarUrl: string | null;
  bannerUrl: string | null;
  privacyMode: 'PUBLIC' | 'PRIVATE' | null;
  activityTier?: string;
  tagline: string | null;
  memberCount: number;
}

/** Result of computing a chord matrix from graph data */
export interface ChordMatrixResult {
  /** NxN matrix where [i][j] = shared member count between space i and j */
  matrix: number[][];
  /** Ordered space names, indices align with matrix rows/columns */
  spaceNames: string[];
  /** Ordered space IDs, indices align with matrix rows/columns */
  spaceIds: string[];
  /** Per-space metadata for richer rendering (avatars, privacy, activity) */
  spaceMeta: ChordSpaceMeta[];
}

// ─── View State ───────────────────────────────────────────────

/** Complete view state for all visualization modes */
export interface ViewState {
  /** Active visualization mode */
  activeView: ViewMode;

  /** Currently selected/focused node ID (shared across views) */
  selectedNodeId: string | null;

  /** Currently zoomed-into space ID for hierarchy views */
  focusedSpaceId: string | null;

  /** Sizing metric for treemap/sunburst */
  sizeMetric: HierarchySizeMetric;

  /** Chord diagram mode */
  chordMode: ChordMode;

  /** Chord diagram grouping level */
  chordGroupLevel: 'L0' | 'L1';

  /** Whether to show member leaf nodes in sunburst */
  showMembers: boolean;

  /** Timeline chart type */
  timelineChartType: 'stacked' | 'stream';

  /** Timeline brushed date range */
  timelineBrush: [Date, Date] | null;

  /** Temporal mode: current date position */
  temporalDate: Date | null;

  /** Temporal mode: playing state */
  temporalPlaying: boolean;

  /** Temporal mode: playback speed multiplier */
  temporalSpeed: number;
}

/** Default initial view state */
export const INITIAL_VIEW_STATE: ViewState = {
  activeView: 'force-graph',
  selectedNodeId: null,
  focusedSpaceId: null,
  sizeMetric: 'activity',
  chordMode: 'shared-members',
  chordGroupLevel: 'L0',
  showMembers: false,
  timelineChartType: 'stacked',
  timelineBrush: null,
  temporalDate: null,
  temporalPlaying: false,
  temporalSpeed: 1,
};
