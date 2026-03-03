/** Node types in the graph visualization */
export enum NodeType {
  SPACE_L0 = 'SPACE_L0',
  SPACE_L1 = 'SPACE_L1',
  SPACE_L2 = 'SPACE_L2',
  ORGANIZATION = 'ORGANIZATION',
  USER = 'USER',
}

/** Edge types representing relationships */
export enum EdgeType {
  CHILD = 'CHILD',
  MEMBER = 'MEMBER',
  LEAD = 'LEAD',
  ADMIN = 'ADMIN',
}

/** Activity tier classification based on percentile distribution */
export enum ActivityTier {
  INACTIVE = 'INACTIVE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/** Activity counts broken down by time period */
export interface ActivityPeriodCounts {
  day: number;
  week: number;
  month: number;
  allTime: number;
}

/** Valid activity time periods */
export type ActivityPeriod = keyof ActivityPeriodCounts;

/** Per-user per-space activity count with computed tier */
export interface ActivityCount {
  userId: string;
  spaceId: string;
  count: number;
  tier: ActivityTier;
}

/** Visual weight per node type (controls node size in rendering) */
export const NODE_WEIGHT: Record<NodeType, number> = {
  [NodeType.SPACE_L0]: 20,
  [NodeType.SPACE_L1]: 10,
  [NodeType.SPACE_L2]: 8,
  [NodeType.ORGANIZATION]: 5,
  [NodeType.USER]: 3,
};

/** Visual weight per edge type */
export const EDGE_WEIGHT: Record<EdgeType, number> = {
  [EdgeType.CHILD]: 3,
  [EdgeType.LEAD]: 2,
  [EdgeType.ADMIN]: 2,
  [EdgeType.MEMBER]: 1,
};

/** Aggregated tag data from profile tagsets */
export interface TagData {
  keywords?: string[];
  skills?: string[];
  default?: string[];
}

/** A single weekly activity bucket for time-series data */
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

/** Geographic location data */
export interface GraphLocation {
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** A node in the graph dataset */
export interface GraphNode {
  id: string;
  type: NodeType;
  displayName: string;
  weight: number;
  avatarUrl: string | null;
  bannerUrl: string | null;
  url: string | null;
  location: GraphLocation | null;
  scopeGroups: string[];
  nameId: string | null;
  tagline: string | null;
  /** For L1/L2 spaces: the ID of the parent space */
  parentSpaceId: string | null;
  /** Privacy mode for space nodes; null for non-space types (USER, ORGANIZATION) */
  privacyMode: 'PUBLIC' | 'PRIVATE' | null;
  /** ISO 8601 timestamp when the node entity was created on Alkemio */
  createdDate?: string;
  /** Space visibility — ACTIVE, ARCHIVED, or DEMO (spaces only) */
  visibility?: 'ACTIVE' | 'ARCHIVED' | 'DEMO';
  /** Markdown description / bio */
  description?: string | null;
  /** Organization website URL */
  website?: string | null;
  /** Organization contact email */
  contactEmail?: string | null;
  /** External reference links from the profile */
  references?: { name: string; uri: string }[];
  /** Organization owner display name */
  owner?: string | null;
  /** Number of associates in the organization */
  associateCount?: number;
  /** Tags from the profile's tagsets, keyed by reserved name */
  tags?: TagData;
  /** Total direct contribution count for this space (L0/L1/L2 only, undefined for others) */
  totalActivityCount?: number;
  /** Activity tier for the space based on percentile distribution (L0/L1/L2 only) */
  spaceActivityTier?: ActivityTier;
  /** Per-period activity counts for time-based filtering (L0/L1/L2 only) */
  activityByPeriod?: ActivityPeriodCounts;
}

/** An edge in the graph dataset */
export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: EdgeType;
  weight: number;
  scopeGroup: string | null;
  /** Estimated ISO 8601 timestamp when this relationship was established */
  createdDate?: string;
  /** Raw contribution count for user→space edges */
  activityCount?: number;
  /** Computed tier classification for user→space edges */
  activityTier?: ActivityTier;
  /** Per-period activity counts for time-based filtering */
  activityByPeriod?: ActivityPeriodCounts;
}

/** Computed network metrics */
export interface GraphMetrics {
  totalNodes: number;
  totalEdges: number;
  averageDegree: number;
  density: number;
}

/** Per-Space cache timestamp info */
export interface SpaceCacheInfo {
  spaceId: string;
  lastUpdated: string;
  fromCache: boolean;
}

/** Insight results */
export interface GraphInsights {
  superConnectors: string[];
  isolatedNodes: string[];
}

/** Per-space last-updated info for freshness display */
export interface SpaceLastUpdated {
  spaceId: string;
  lastUpdated: string;
}

/** The complete versioned graph dataset */
export interface GraphDataset {
  version: string;
  generatedAt: string;
  spaces: string[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  metrics: GraphMetrics;
  cacheInfo: SpaceCacheInfo[];
  insights?: GraphInsights;
  /** True if activity data was successfully fetched; false otherwise */
  hasActivityData?: boolean;
  /** Weekly activity time series per space (for Timeline view) */
  timeSeries?: SpaceTimeSeries[];
}
