# Data Model: Ecosystem Analytics — Portfolio Network Explorer

**Date**: 2026-02-21 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Overview

The data model covers three domains: (1) the graph dataset produced by the acquire/transform pipeline, (2) the server-side cache layer, and (3) the auth session state. All types are defined in TypeScript.

---

## 1. Graph Dataset (Core Domain)

### Node Types

```typescript
enum NodeType {
  SPACE_L0 = "SPACE_L0",
  SPACE_L1 = "SPACE_L1",
  SPACE_L2 = "SPACE_L2",
  ORGANIZATION = "ORGANIZATION",
  USER = "USER",
}
```

### Edge Types

```typescript
enum EdgeType {
  CHILD = "CHILD",       // Space hierarchy (parent → child)
  MEMBER = "MEMBER",     // Person/Org participates in Space
  LEAD = "LEAD",         // Person/Org leads Space
}
```

### Node Weights (for visualization sizing)

```typescript
const NODE_WEIGHT: Record<NodeType, number> = {
  SPACE_L0: 20,
  SPACE_L1: 10,
  SPACE_L2: 8,
  ORGANIZATION: 5,
  USER: 3,
};
```

### Edge Weights

```typescript
const EDGE_WEIGHT: Record<EdgeType, number> = {
  CHILD: 3,
  LEAD: 2,
  MEMBER: 1,
};
```

### GraphNode

Represents any entity in the visualization. All node types share a common base.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Stable Alkemio UUID |
| `type` | `NodeType` | Yes | Discriminator for node type |
| `displayName` | `string` | Yes | Human-readable label |
| `weight` | `number` | Yes | Visual weight (from NODE_WEIGHT) |
| `avatarUrl` | `string \| null` | No | Avatar/logo image URL |
| `url` | `string \| null` | No | Link to entity in Alkemio |
| `location` | `GraphLocation \| null` | No | Geographic location |
| `scopeGroups` | `string[]` | Yes | L0 Space IDs this node belongs to (for filtering/clustering) |
| `nameId` | `string \| null` | No | Alkemio nameID (Spaces only) |
| `tagline` | `string \| null` | No | Short description |

### GraphLocation

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `country` | `string \| null` | No | Country name |
| `city` | `string \| null` | No | City name |
| `latitude` | `number \| null` | No | GPS latitude |
| `longitude` | `number \| null` | No | GPS longitude |

### GraphEdge

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sourceId` | `string` | Yes | Source node ID |
| `targetId` | `string` | Yes | Target node ID |
| `type` | `EdgeType` | Yes | Relationship type |
| `weight` | `number` | Yes | Visual weight (from EDGE_WEIGHT) |
| `scopeGroup` | `string \| null` | No | L0 Space ID context |

### GraphDataset

The complete, versioned payload served to the frontend.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `string` | Yes | Schema version (semver, e.g., `"1.0.0"`) |
| `generatedAt` | `string` | Yes | ISO 8601 timestamp |
| `spaces` | `string[]` | Yes | L0 Space IDs included |
| `nodes` | `GraphNode[]` | Yes | All nodes |
| `edges` | `GraphEdge[]` | Yes | All edges |
| `metrics` | `GraphMetrics` | Yes | Computed network metrics |

### GraphMetrics

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `totalNodes` | `number` | Yes | Count of nodes |
| `totalEdges` | `number` | Yes | Count of edges |
| `averageDegree` | `number` | Yes | Mean connections per node |
| `density` | `number` | Yes | Edge count / max possible edges |

---

## 2. Cache Layer

### CacheEntry

Stored in SQLite. One entry per user per Space.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | `string` | Yes | Authenticated user's Alkemio ID |
| `spaceId` | `string` | Yes | L0 Space ID |
| `datasetJson` | `string` | Yes | Serialized partial graph dataset (nodes + edges for this Space) |
| `createdAt` | `number` | Yes | Unix timestamp (ms) of acquisition |
| `expiresAt` | `number` | Yes | Unix timestamp (ms) = createdAt + 24h TTL |

**Primary key**: `(userId, spaceId)`

**Cache logic**:
- On graph generation, for each selected Space: check if a non-expired CacheEntry exists.
- Reuse cached data; fetch only missing/stale Spaces.
- On manual refresh: delete matching entries, re-fetch all.
- Merge per-Space partial datasets into a single GraphDataset for the frontend.

---

## 3. Auth / Session State

### AuthSession (server-side, in-memory or session store)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | `string` | Yes | Alkemio user ID |
| `displayName` | `string` | Yes | User's display name |
| `bearerToken` | `string` | Yes | JWT for Alkemio GraphQL API |
| `tokenExpiresAt` | `number` | Yes | Token expiry (Unix ms) |

The BFF uses the bearer token to forward authenticated GraphQL requests. The frontend receives a session token from the BFF (not the raw Alkemio JWT) and sends it on each request.

---

## 4. API Request/Response Types

### SpaceSelectionItem (BFF → Frontend)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | L0 Space UUID |
| `nameId` | `string` | Yes | Space nameID |
| `displayName` | `string` | Yes | Space display name |
| `role` | `"MEMBER" \| "LEAD"` | Yes | User's highest role |
| `visibility` | `"PUBLIC" \| "PRIVATE"` | Yes | Space visibility |

### GraphGenerationRequest (Frontend → BFF)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spaceIds` | `string[]` | Yes | Selected L0 Space IDs |
| `forceRefresh` | `boolean` | No | If true, bypass cache |

### GraphGenerationProgress (BFF → Frontend, via SSE or polling)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `step` | `"acquiring" \| "transforming" \| "ready"` | Yes | Current pipeline step |
| `spacesTotal` | `number` | Yes | Total Spaces to process |
| `spacesCompleted` | `number` | Yes | Spaces processed so far |

---

## Entity Relationship Diagram

```
┌──────────────┐     CHILD      ┌──────────────┐     CHILD      ┌──────────────┐
│  Space (L0)  │───────────────▶│  Space (L1)  │───────────────▶│  Space (L2)  │
└──────┬───────┘                └──────┬───────┘                └──────┬───────┘
       │                               │                               │
       │ MEMBER/LEAD                   │ MEMBER/LEAD                   │ MEMBER/LEAD
       │                               │                               │
       ▼                               ▼                               ▼
┌──────────────┐                ┌──────────────┐
│     User     │                │ Organization │
└──────────────┘                └──────────────┘

Cache:
┌─────────────────────────────────────────┐
│ CacheEntry                              │
│  PK: (userId, spaceId)                  │
│  datasetJson, createdAt, expiresAt      │
└─────────────────────────────────────────┘
```

---

## Validation Rules

1. **Node IDs**: Must be valid Alkemio UUIDs; no duplicates within a dataset.
2. **Edge references**: `sourceId` and `targetId` must reference existing nodes in the dataset.
3. **Scope groups**: Every node must have at least one scope group (the L0 Space it belongs to). L0 Space nodes list themselves as a scope group.
4. **Cache TTL**: Entries with `expiresAt < now` are treated as stale and not reused.
5. **Max Spaces**: Server-configurable limit on `spaceIds.length` in GraphGenerationRequest (FR-003a).
