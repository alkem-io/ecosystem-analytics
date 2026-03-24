/** The complete analytics dataset for a single space */
export interface DashboardDataset {
  /** ISO 8601 timestamp when this dataset was generated */
  generatedAt: string;
  /** The space being analyzed */
  space: DashboardSpaceInfo;
  /** Headline metrics (P1) */
  headline: HeadlineMetrics;
  /** Per-callout detail for filtering and drill-down */
  callouts: CalloutDetail[];
  /** Per-contributor activity data */
  contributors: ContributorDetail[];
  /** Per-subspace aggregated metrics */
  subspaces: SubspaceMetrics[];
  /** Time-bucketed contribution data for timeline chart */
  timeline: TimelineBucket[];
  /** Phases/tabs available for filtering */
  phases: PhaseInfo[];
  /** Members with role information (for role-based analysis) */
  members: MemberInfo[];
  /** Organization activity summary */
  organizations: OrganizationActivity[];
  /** Hierarchical subspace tree for cascading filter dropdowns */
  subspaceTree: SubspaceNode[];
  /** Cache metadata */
  cacheInfo: { lastUpdated: string; fromCache: boolean };
  /** Non-fatal errors encountered during data fetch */
  errors?: string[];
}

/** P1 headline metric card values (FR-003) */
export interface HeadlineMetrics {
  totalCallouts: number;
  totalContributions: number;
  contributionsByType: {
    post: number;
    memo: number;
    link: number;
    whiteboard: number;
  };
  totalComments: number;
  totalMembers: number;
  totalUniqueContributors: number;
  engagementRatio: number;
  unansweredCalloutPct: number;
  avgContributionsPerCallout: number;
  avgCommentsPerContribution: number;
  totalWhiteboards: number;
  totalWhiteboardModifications: number;
  avgWhiteboardModifications: number;
}

/** Per-callout analytics for filtering, ranking, and dormancy detection */
export interface CalloutDetail {
  id: string;
  title: string;
  /** The type of post: text-only, memo, whiteboard, link, or media gallery */
  postType: 'text' | 'memo' | 'whiteboard' | 'link' | 'media_gallery';
  phaseId: string;
  phaseName: string;
  spaceLevel: number;
  subspaceId: string | null;
  subspaceName: string | null;
  contributionCount: number;
  contributionsByType: {
    post: number;
    memo: number;
    link: number;
    whiteboard: number;
  };
  commentCount: number;
  totalEngagement: number;
  createdDate: string;
  lastActivityDate: string | null;
  createdById: string | null;
}

/** Per-contributor activity data for ranking and analysis */
export interface ContributorDetail {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  organizationId: string | null;
  organizationName: string | null;
  role: 'admin' | 'lead' | 'member';
  totalContributions: number;
  totalComments: number;
  contributionsByType: {
    post: number;
    memo: number;
    link: number;
    whiteboard: number;
  };
  activeSubspaceCount: number;
  firstContributionDate: string | null;
  lastContributionDate: string | null;
  perSubspace: { subspaceId: string; count: number }[];
  /** Monthly contribution counts for time-range filtering */
  perMonth: { month: string; count: number }[];
}

/** Per-subspace aggregated metrics for distribution visualization */
export interface SubspaceMetrics {
  id: string;
  displayName: string;
  level: number;
  parentId: string | null;
  totalCallouts: number;
  totalContributions: number;
  totalComments: number;
  totalMembers: number;
  uniqueContributors: number;
}

/** Time-bucketed contribution data for the activity timeline (FR-004) */
export interface TimelineBucket {
  period: string;
  /** The subspace this bucket belongs to (null = L0 root space) */
  subspaceId: string | null;
  contributions: number;
  byType: {
    post: number;
    memo: number;
    link: number;
    whiteboard: number;
  };
  comments: number;
  uniqueContributors: number;
  newContributors: number;
}

/** Phase/tab metadata for the filter control (FR-016) */
export interface PhaseInfo {
  id: string;
  displayName: string;
  sortOrder: number;
  calloutCount: number;
}

/** Member with role — for role-based activity analysis (FR-019) */
export interface MemberInfo {
  userId: string;
  displayName: string;
  role: 'admin' | 'lead' | 'member';
  organizationId: string | null;
  isActive: boolean;
}

/** Organization-level activity summary (FR-020) */
export interface OrganizationActivity {
  organizationId: string;
  displayName: string;
  avatarUrl: string | null;
  memberCount: number;
  activeContributorCount: number;
  totalContributions: number;
}

/** Lightweight subspace hierarchy node for cascading filter dropdowns */
export interface SubspaceNode {
  id: string;
  displayName: string;
  level: number;
  children: SubspaceNode[];
}

/** Basic space info for display */
export interface DashboardSpaceInfo {
  id: string;
  nameId: string;
  displayName: string;
  avatarUrl: string | null;
  tagline: string | null;
  hasSubspaces: boolean;
  subspaceCount: number;
}

/** Raw space data from the analytics GraphQL query — internal to dashboard-service */
export interface RawAnalyticsSpace {
  id: string;
  nameID: string;
  level: number;
  parentId: string | null;
  displayName: string;
  avatarUrl: string | null;
  tagline: string | null;
  community: {
    memberUsers: { id: string; displayName: string; avatarUrl: string | null }[];
    leadUsers: { id: string; displayName: string; avatarUrl: string | null }[];
    adminUsers: { id: string; displayName: string; avatarUrl: string | null }[];
    memberOrganizations: { id: string; displayName: string; avatarUrl: string | null }[];
    leadOrganizations: { id: string; displayName: string; avatarUrl: string | null }[];
  };
  calloutsSet: {
    id: string;
    type: 'COLLABORATION' | 'KNOWLEDGE_BASE';
    callouts: RawCallout[];
  };
  innovationFlow: {
    states: { displayName: string; sortOrder: number }[];
  };
  subspaces: RawAnalyticsSpace[];
}

/** Raw callout from GraphQL — internal to dashboard-service */
export interface RawCallout {
  id: string;
  nameID: string;
  createdDate: string;
  createdBy: string | null;
  title: string;
  /** The framing type of the callout (what kind of post it is) */
  framingType: 'NONE' | 'MEMO' | 'WHITEBOARD' | 'LINK' | 'MEDIA_GALLERY';
  flowStateName: string | null;
  contributionsCount: { post: number; memo: number; link: number; whiteboard: number };
  contributions: {
    id: string;
    createdDate: string;
    createdBy: string | null;
    type: 'post' | 'memo' | 'link' | 'whiteboard';
  }[];
  commentsCount: number;
  commentSenders: { senderId: string; timestamp: number }[];
}
