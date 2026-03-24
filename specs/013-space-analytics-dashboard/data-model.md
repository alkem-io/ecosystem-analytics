# Data Model: Space Analytics Dashboard

**Feature**: 013-space-analytics-dashboard
**Date**: 2026-03-17
**Status**: Complete

## Overview

The dashboard data model bridges three layers:
1. **Raw GraphQL types** — Alkemio schema types fetched by the codegen SDK
2. **Intermediate acquisition types** — Structured data collected by `dashboard-service.ts`
3. **DashboardDataset** — Pre-aggregated analytics payload returned to the frontend

## Entity Relationship Diagram

```
Space (L0)
├── community → RoleSet
│   ├── memberUsers[]
│   ├── leadUsers[]
│   ├── adminUsers[]
│   ├── memberOrganizations[]
│   └── leadOrganizations[]
├── collaboration → Collaboration
│   ├── calloutsSet → CalloutsSet (type: COLLABORATION | KNOWLEDGE_BASE)
│   │   └── callouts[] → Callout
│   │       ├── contributions[] → CalloutContribution
│   │       │   ├── post? → Post → comments (Room → messages[])
│   │       │   ├── memo? → Memo
│   │       │   ├── link? → Link
│   │       │   └── whiteboard? → Whiteboard
│   │       ├── contributionsCount → { post, memo, link, whiteboard }
│   │       ├── comments? → Room (callout-level comments)
│   │       ├── createdBy → User
│   │       └── createdDate
│   └── innovationFlow → InnovationFlow
│       └── states[] → InnovationFlowState
└── subspaces[] → Space (L1)
    └── subspaces[] → Space (L2) [same structure recursively]
```

## Server-Side Types (`server/src/types/dashboard.ts`)

### DashboardDataset (BFF → Frontend payload)

```typescript
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
  /** Cache metadata */
  cacheInfo: { lastUpdated: string; fromCache: boolean };
  /** Non-fatal errors encountered during data fetch */
  errors?: string[];
}
```

### HeadlineMetrics

```typescript
/** P1 headline metric card values (FR-003) */
export interface HeadlineMetrics {
  /** Total callouts across space + all subspaces */
  totalCallouts: number;
  /** Total contributions (posts + memos + links + whiteboards) */
  totalContributions: number;
  /** Breakdown by type */
  contributionsByType: {
    post: number;
    memo: number;
    link: number;
    whiteboard: number;
  };
  /** Total comments (messages across all contribution rooms + callout rooms) */
  totalComments: number;
  /** Total unique members */
  totalMembers: number;
  /** Members who contributed at least once */
  totalUniqueContributors: number;
  /** Active contributors / total members */
  engagementRatio: number;
  /** Callouts with zero contributions / total callouts */
  unansweredCalloutPct: number;
  /** Total contributions / total callouts */
  avgContributionsPerCallout: number;
  /** Total comments / total contributions (where contributions > 0) */
  avgCommentsPerContribution: number;
  /** Total whiteboards */
  totalWhiteboards: number;
  /** Total whiteboard content modifications (from activity feed) */
  totalWhiteboardModifications: number;
  /** Modifications / whiteboards (where whiteboards > 0) */
  avgWhiteboardModifications: number;
}
```

### CalloutDetail

```typescript
/** Per-callout analytics for filtering, ranking, and dormancy detection */
export interface CalloutDetail {
  id: string;
  title: string;
  /** Which CalloutsSet (phase) this callout belongs to */
  phaseId: string;
  phaseName: string;
  /** Which subspace (null = L0 root space) */
  subspaceId: string | null;
  subspaceName: string | null;
  /** Contribution counts */
  contributionCount: number;
  contributionsByType: {
    post: number;
    memo: number;
    link: number;
    whiteboard: number;
  };
  /** Comment count */
  commentCount: number;
  /** Total engagement = contributions + comments */
  totalEngagement: number;
  /** ISO 8601 creation date */
  createdDate: string;
  /** ISO 8601 date of most recent contribution (null if none) */
  lastActivityDate: string | null;
  /** Created by user ID */
  createdById: string | null;
}
```

### ContributorDetail

```typescript
/** Per-contributor activity data for ranking and analysis */
export interface ContributorDetail {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Organization affiliation (if known) */
  organizationId: string | null;
  organizationName: string | null;
  /** Role in the space: admin, lead, or member */
  role: 'admin' | 'lead' | 'member';
  /** Total contributions across all callouts */
  totalContributions: number;
  /** Total comments */
  totalComments: number;
  /** Contributions broken down by type */
  contributionsByType: {
    post: number;
    memo: number;
    link: number;
    whiteboard: number;
  };
  /** Number of distinct subspaces the contributor is active in */
  activeSubspaceCount: number;
  /** ISO 8601 date of first contribution */
  firstContributionDate: string | null;
  /** ISO 8601 date of most recent contribution */
  lastContributionDate: string | null;
  /** Per-subspace contribution counts */
  perSubspace: { subspaceId: string; count: number }[];
}
```

### SubspaceMetrics

```typescript
/** Per-subspace aggregated metrics for distribution visualization */
export interface SubspaceMetrics {
  id: string;
  displayName: string;
  level: number; // 1 or 2
  parentId: string | null;
  totalCallouts: number;
  totalContributions: number;
  totalComments: number;
  totalMembers: number;
  uniqueContributors: number;
}
```

### TimelineBucket

```typescript
/** Time-bucketed contribution data for the activity timeline (FR-004) */
export interface TimelineBucket {
  /** ISO week string (e.g., '2026-W09') or month string (e.g., '2026-03') */
  period: string;
  /** Total contributions in this period */
  contributions: number;
  /** Breakdown by type */
  byType: {
    post: number;
    memo: number;
    link: number;
    whiteboard: number;
  };
  /** Number of comments in this period */
  comments: number;
  /** Number of unique contributors in this period */
  uniqueContributors: number;
  /** Number of first-time contributors in this period (FR-018) */
  newContributors: number;
}
```

### PhaseInfo

```typescript
/** Phase/tab metadata for the filter control (FR-016) */
export interface PhaseInfo {
  /** CalloutsSet ID */
  id: string;
  /** Display name (e.g., "Knowledge Base", "Innovation Flow") */
  displayName: string;
  /** COLLABORATION or KNOWLEDGE_BASE */
  type: 'COLLABORATION' | 'KNOWLEDGE_BASE';
  /** Number of callouts in this phase */
  calloutCount: number;
}
```

### MemberInfo

```typescript
/** Member with role — for role-based activity analysis (FR-019) */
export interface MemberInfo {
  userId: string;
  displayName: string;
  role: 'admin' | 'lead' | 'member';
  organizationId: string | null;
  /** Whether this member has any contributions */
  isActive: boolean;
}
```

### OrganizationActivity

```typescript
/** Organization-level activity summary (FR-020) */
export interface OrganizationActivity {
  organizationId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Number of members from this org in the space */
  memberCount: number;
  /** Number of active contributors from this org */
  activeContributorCount: number;
  /** Total contributions from this org's members */
  totalContributions: number;
}
```

### DashboardSpaceInfo

```typescript
/** Basic space info for display */
export interface DashboardSpaceInfo {
  id: string;
  nameId: string;
  displayName: string;
  avatarUrl: string | null;
  tagline: string | null;
  /** Whether the space has subspaces */
  hasSubspaces: boolean;
  /** Total subspace count (L1 + L2) */
  subspaceCount: number;
}
```

## Intermediate Types (server-side only)

### RawAnalyticsSpace

```typescript
/** Raw space data from the analytics GraphQL query — internal to dashboard-service */
export interface RawAnalyticsSpace {
  id: string;
  nameID: string;
  level: number;
  parentId: string | null;
  about: {
    profile: { displayName: string; avatar?: { uri: string } | null; tagline?: string | null };
  };
  community: {
    roleSet: {
      memberUsers: { id: string }[];
      leadUsers: { id: string }[];
      adminUsers: { id: string }[];
      memberOrganizations: { id: string }[];
      leadOrganizations: { id: string }[];
    };
  };
  collaboration: {
    calloutsSet: {
      id: string;
      type: 'COLLABORATION' | 'KNOWLEDGE_BASE';
      callouts: RawCallout[];
    };
    innovationFlow: {
      states: { id: string; displayName: string }[];
    };
  };
  subspaces: RawAnalyticsSpace[];
}
```

### RawCallout

```typescript
/** Raw callout from GraphQL — internal to dashboard-service */
export interface RawCallout {
  id: string;
  nameID: string;
  createdDate: string;
  createdBy?: { id: string } | null;
  framing: { profile: { displayName: string } };
  contributionsCount: { post: number; memo: number; link: number; whiteboard: number };
  contributions: {
    id: string;
    createdDate: string;
    createdBy?: { id: string } | null;
    post?: { comments: { messagesCount: number } } | null;
    link?: {} | null;
    memo?: {} | null;
    whiteboard?: {} | null;
  }[];
  comments?: { messagesCount: number; messages: { sender?: { id: string } | null; timestamp: number }[] } | null;
}
```

## Validation Rules

| Field | Rule |
|-------|------|
| `engagementRatio` | Clamped to [0, 1]; 0 if totalMembers = 0 |
| `unansweredCalloutPct` | Clamped to [0, 1]; 0 if totalCallouts = 0 |
| `avgContributionsPerCallout` | 0 if totalCallouts = 0 |
| `avgCommentsPerContribution` | 0 if totalContributions = 0 |
| `avgWhiteboardModifications` | 0 if totalWhiteboards = 0 |
| `contributorDetail.role` | Derived from community roleSet membership; admin > lead > member precedence |
| `timeline.period` | Monthly buckets formatted as ISO month (YYYY-MM) |
| `calloutDetail.lastActivityDate` | Max of contribution dates; null if no contributions |

## State Transitions

Not applicable — the dashboard is a read-only view with no entity state mutations. The only state is the client-side filter state (time range, selected phase), managed in React component state.

## Cache Key Strategy

| Data | Cache Key | TTL |
|------|-----------|-----|
| Dashboard dataset | `(userId, "dashboard:{spaceNameId}")` | 24 hours (config.cacheTtlHours) |
| Spaces list | `(userId, "__spaces__")` | 24 hours (existing) |
| Graph dataset | `(userId, spaceNameId)` | 24 hours (existing, unchanged) |
