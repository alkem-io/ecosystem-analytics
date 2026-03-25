# Data Model: Ecosystem Metrics

**Feature**: 014-ecosystem-metrics  
**Date**: 2026-03-24

## Overview

No backend data model changes required. This feature introduces frontend-only data structures for the ecosystem metrics computation hook and the panel UI. All types are defined in a new file `frontend/src/hooks/useEcosystemMetrics.ts` and consumed by the panel components.

## New Data Structures

### EcosystemMetrics (hook return type)

The top-level return type from the `useEcosystemMetrics` hook. Contains all computed data needed by the collapsed bar and expanded panel.

| Field | Type | Description |
|-------|------|-------------|
| `aggregates` | `AggregateMetrics` | Total counts by node type |
| `bridgeConnectors` | `BridgeConnector[]` | Users connected to 2+ L0 ecosystems |
| `multiSpaceUsers` | `MultiSpaceUser[]` | Users in 2+ subspaces within the same L0 |
| `spaceRankings` | `SpaceRanking[]` | L1/L2 subspaces ranked by member count (descending) |
| `topConnectors` | `TopConnector[]` | Users/orgs ranked by distinct space count (descending) |
| `orgDistribution` | `OrgDistribution[]` | Org count per L0 ecosystem |
| `headlineInsights` | `HeadlineInsight[]` | 0–4 threshold-based insight messages |
| `hasRestrictedNodes` | `boolean` | Whether any restricted nodes were excluded |

### AggregateMetrics

| Field | Type | Description |
|-------|------|-------------|
| `totalUsers` | `number` | Count of visible USER nodes (restricted excluded) |
| `totalOrganizations` | `number` | Count of visible ORGANIZATION nodes |
| `totalSubspaces` | `number` | Count of visible SPACE_L1 + SPACE_L2 nodes |
| `totalL0Spaces` | `number` | Count of visible SPACE_L0 nodes |
| `totalEdges` | `number` | Count of visible edges (both endpoints visible) |
| `bridgeConnectorCount` | `number` | Count of bridge connectors (convenience) |

### BridgeConnector

Represents a user who belongs to 2+ distinct L0 ecosystems.

| Field | Type | Description |
|-------|------|-------------|
| `nodeId` | `string` | The user node ID |
| `displayName` | `string` | User display name (for UI rendering) |
| `l0SpaceCount` | `number` | Number of distinct L0 ecosystems they belong to |
| `l0SpaceNames` | `string[]` | Display names of the L0 spaces they bridge |

### MultiSpaceUser

Represents a user who participates in 2+ L1/L2 subspaces within the same L0.

| Field | Type | Description |
|-------|------|-------------|
| `nodeId` | `string` | The user node ID |
| `displayName` | `string` | User display name |
| `l0SpaceId` | `string` | The L0 space where multi-space participation occurs |
| `l0SpaceName` | `string` | L0 space display name |
| `subspaceCount` | `number` | Number of distinct L1/L2 subspaces within this L0 |

### SpaceRanking

A subspace (L1/L2) with its engagement metrics.

| Field | Type | Description |
|-------|------|-------------|
| `nodeId` | `string` | The space node ID |
| `displayName` | `string` | Space display name |
| `type` | `'SPACE_L1' \| 'SPACE_L2'` | Space level |
| `memberCount` | `number` | Count of distinct users + orgs connected to this space |
| `parentSpaceName` | `string \| null` | Parent L0 space display name (for context) |

### TopConnector

A user or organisation ranked by cross-space connectivity.

| Field | Type | Description |
|-------|------|-------------|
| `nodeId` | `string` | The node ID (user or org) |
| `displayName` | `string` | Display name |
| `type` | `'USER' \| 'ORGANIZATION'` | Node type |
| `spaceCount` | `number` | Number of distinct spaces connected to |
| `avatarUrl` | `string \| null` | Avatar URL for UI rendering |

### OrgDistribution

Organisation count per L0 ecosystem.

| Field | Type | Description |
|-------|------|-------------|
| `l0SpaceId` | `string` | The L0 space node ID |
| `l0SpaceName` | `string` | L0 space display name |
| `orgCount` | `number` | Number of distinct organisations connected |

### HeadlineInsight

A generated insight message with an associated graph action.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Stable identifier (e.g., `'bridge-connectors'`, `'busiest-subspace'`) |
| `message` | `string` | Human-readable insight text |
| `priority` | `number` | Display priority (1 = highest) |
| `action` | `InsightAction` | What happens when the user clicks the insight |

### InsightAction

Describes what graph interaction to trigger when an insight is clicked.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'highlight' \| 'select' \| 'focus'` | Interaction type |
| `nodeIds` | `string[]` | Node IDs to highlight, select, or focus on |

### NudgeData (P3)

Data for a floating nudge card on the graph canvas.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Stable identifier |
| `message` | `string` | Short insight text for the card |
| `cta` | `string` | Call-to-action label (e.g., "Explore →") |
| `action` | `InsightAction` | Graph interaction on click |
| `dismissed` | `boolean` | Whether the user has dismissed this nudge |

## Existing Types (unchanged)

### GraphDataset (server/src/types/graph.ts)

Used as the primary input to the metrics hook. Key fields consumed:

| Field | Relevance |
|-------|-----------|
| `nodes: GraphNode[]` | Iterated to count by type, filter by restricted, extract displayName |
| `edges: GraphEdge[]` | Iterated to compute connectivity, scopeGroup analysis, role deduplication |
| `metrics: GraphMetrics` | Original server-side metrics (totalNodes, totalEdges, avgDegree, density) — retained for reference but ecosystem metrics replace the display |
| `insights?: GraphInsights` | Server-side superConnectors/isolatedNodes — not duplicated; remains available for other features |

### GraphNode (server/src/types/graph.ts) — no changes

Key fields used by ecosystem metrics:

| Field | Usage |
|-------|-------|
| `id` | Primary key for all lookups |
| `type` | NodeType enum — used for filtering and categorisation |
| `displayName` | Shown in rankings and insights |
| `restricted` | Boolean — if true, node is excluded from all metrics |

### GraphEdge (server/src/types/graph.ts) — no changes

Key fields used by ecosystem metrics:

| Field | Usage |
|-------|-------|
| `sourceId` | Edge source — used for connectivity analysis |
| `targetId` | Edge target — used for connectivity analysis |
| `type` | EdgeType enum — used for role deduplication (MEMBER, LEAD, ADMIN) |
| `scopeGroup` | L0 space ID — used for bridge connector identification (distinct L0 count per user) |
| `parentSpaceId` | For L1/L2 spaces: identifies parent (used for context in rankings) |
| `avatarUrl` | Shown in top connectors leaderboard |

### GraphEdge (server/src/types/graph.ts) — no changes

Key fields used by ecosystem metrics:

| Field | Usage |
|-------|-------|
| `sourceId` / `targetId` | Connectivity traversal |
| `type` | EdgeType enum — MEMBER/LEAD/ADMIN edges connect people to spaces |
| `scopeGroup` | L0 ecosystem identifier — used for bridge connector computation |

### Filter State (Explorer.tsx)

The hook accepts filter state as input:

| State | Type | Effect on Metrics |
|-------|------|-------------------|
| `showPeople` | `boolean` | When false, USER nodes and their edges excluded from all metrics |
| `showOrganizations` | `boolean` | When false, ORGANIZATION nodes and their edges excluded |
| `showSpaces` | `boolean` | When false, space nodes excluded — rankings become empty |

## Computation Flow

```
Input: GraphDataset + { showPeople, showOrganizations, showSpaces }
  │
  ├─ Step 1: Build node lookup Map<id, GraphNode>
  │
  ├─ Step 2: Filter nodes
  │     ├── Exclude node.restricted === true
  │     └── Exclude based on visibility toggles
  │
  ├─ Step 3: Build visible node ID Set
  │
  ├─ Step 4: Filter edges (both endpoints in visible set)
  │
  ├─ Step 5: Compute all metrics from filtered nodes + edges
  │     ├── Aggregates (simple counts)
  │     ├── Bridge connectors (scopeGroup analysis)
  │     ├── Multi-space users (scopeGroup grouping)
  │     ├── Space rankings (edge counting per space)
  │     ├── Top connectors (distinct space counting)
  │     ├── Org distribution (org→L0 mapping)
  │     └── Headline insights (threshold evaluation)
  │
  └─ Output: EcosystemMetrics
```

## Relationship to Existing Server-Side Metrics

The existing `GraphMetrics` type (`totalNodes`, `totalEdges`, `averageDegree`, `density`) computed by `server/src/transform/metrics.ts` is **not modified**. The ecosystem metrics are a complementary, richer set computed client-side. The `MetricsBar` collapsed state will display the ecosystem-level counts (users, orgs, subspaces) instead of the raw graph-theory metrics (nodes, edges, average degree, density) but the original `GraphMetrics` remain on the `GraphDataset` for backward compatibility.

The existing `GraphInsights` type (`superConnectors`, `isolatedNodes`) computed by `server/src/transform/insights.ts` is also **not modified**. The `superConnectors` insight uses a statistical threshold (degree > mean + 2σ) which differs from the ecosystem metrics' "top connectors" ranking (by distinct space count). Both can coexist — `superConnectors` is used for badge highlighting on the graph, while `topConnectors` is used in the leaderboard panel.
