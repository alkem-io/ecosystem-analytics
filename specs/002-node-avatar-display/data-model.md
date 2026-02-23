# Data Model: Node Avatar Display

**Feature**: 002-node-avatar-display
**Date**: 2026-02-23

## Overview

No data model changes are required. The `avatarUrl` field already exists on the `GraphNode` interface and is populated by the server-side transformer for both users and organizations.

## Existing Data Flow

```
Alkemio GraphQL API
  └─ profile.visual(type: AVATAR).uri
       │
       ▼
Server Transformer (transformer.ts)
  └─ Maps to GraphNode.avatarUrl (string | null)
       │
       ▼
BFF REST API (/api/spaces/:id/generate)
  └─ Returns GraphDataset { nodes: GraphNode[], edges: GraphEdge[] }
       │
       ▼
Frontend ForceGraph.tsx
  └─ d.data.avatarUrl → SVG <image> element (NEW)
```

## Relevant Types (no changes)

### GraphNode (server/src/types/graph.ts)

| Field | Type | Relevance |
|-------|------|-----------|
| `id` | `string` | Used to generate unique `<clipPath>` IDs |
| `type` | `NodeType` | Determines which nodes get avatars (USER, ORGANIZATION) |
| `displayName` | `string` | Unchanged — still used for labels |
| `weight` | `number` | Determines node radius via `Math.sqrt(weight) * 3` |
| `avatarUrl` | `string \| null` | **Primary field** — the image URL to display |

### NodeType (server/src/types/graph.ts)

| Value | Gets Avatar? | Fallback |
|-------|-------------|----------|
| `USER` | Yes (P1) | `--node-user` (#6b7280) |
| `ORGANIZATION` | Yes (P3) | `--node-organization` (#8b5cf6) |
| `SPACE_L0` | No | `--node-space-l0` (#2563eb) |
| `SPACE_L1` | No | `--node-space-l1` (#3b82f6) |
| `SPACE_L2` | No | `--node-space-l2` (#60a5fa) |

### Node Sizes

| Type | Weight | Radius (px) | Avatar Viable? |
|------|--------|-------------|----------------|
| SPACE_L0 | 20 | ~13.4 | N/A |
| SPACE_L1 | 10 | ~9.5 | N/A |
| SPACE_L2 | 8 | ~8.5 | N/A |
| ORGANIZATION | 5 | ~6.7 | Yes (small but recognizable) |
| USER | 3 | ~5.2 | Yes (small but recognizable) |

## Avatar URL Sources

| Entity | GraphQL Field | Transformer Location |
|--------|--------------|---------------------|
| Users | `user.profile.visual(type: AVATAR).uri` | transformer.ts L191 |
| Organizations | `org.profile.visual(type: AVATAR).uri` | transformer.ts L224 |
| Spaces | Not fetched | Hardcoded to `null` |
