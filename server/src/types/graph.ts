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
}

/** Activity tier classification based on percentile distribution */
export enum ActivityTier {
  INACTIVE = 'INACTIVE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

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
  [EdgeType.MEMBER]: 1,
};

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
}

/** An edge in the graph dataset */
export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: EdgeType;
  weight: number;
  scopeGroup: string | null;
  /** Raw contribution count for user→space edges */
  activityCount?: number;
  /** Computed tier classification for user→space edges */
  activityTier?: ActivityTier;
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
}
