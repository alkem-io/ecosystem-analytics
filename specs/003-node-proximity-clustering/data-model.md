# Data Model: Node Proximity Clustering

**Feature**: 003-node-proximity-clustering
**Date**: 2026-02-23

## Overview

No backend data model changes required. This feature introduces two frontend-only data structures for the proximity clustering algorithm and the visual fan-out state.

## New Data Structures

### ProximityCluster

Represents a group of 2+ nodes that are within the proximity threshold of each other.

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | Stable identifier for the cluster (sorted member IDs joined) |
| `centroidX` | `number` | Average x-position of all members (data space) |
| `centroidY` | `number` | Average y-position of all members (data space) |
| `memberIds` | `string[]` | IDs of all nodes in this cluster |
| `count` | `number` | Number of members (convenience — same as `memberIds.length`) |

### ProximityNode (input to algorithm)

Minimal node representation passed to the pure clustering function.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Node ID |
| `x` | `number` | Current x-position (from simulation) |
| `y` | `number` | Current y-position (from simulation) |

### Fan-Out State (in ForceGraph.tsx)

Tracked as component-level state (refs) in the render callback.

| State | Type | Description |
|-------|------|-------------|
| `expandedClusterKey` | `string \| null` | Key of the currently expanded cluster, or null |
| `fannedNodeIds` | `Set<string>` | IDs of nodes currently fanned out (excluded from re-clustering) |
| `fanOrigin` | `{ x: number, y: number }` | Center point of the fan-out circle |

## Existing Types (unchanged)

### SimNode (ForceGraph.tsx)

| Field | Type | Relevance |
|-------|------|-----------|
| `data` | `GraphNode` | Contains id, type, avatarUrl etc. |
| `x` | `number` | Current simulation x |
| `y` | `number` | Current simulation y |
| `fx` | `number \| null` | Fixed x (used for geo-pin + fan-out) |
| `fy` | `number \| null` | Fixed y (used for geo-pin + fan-out) |

### GraphNode (server/src/types/graph.ts) — no changes

Used as-is. The `id` field is the key for cluster membership tracking.

## Algorithm Flow

```
simNodes[] (each tick)
  │
  ├─ Filter out fannedNodeIds
  ├─ Map to ProximityNode[] (id, x, y)
  │
  ▼
computeProximityGroups(nodes, threshold)
  │
  ▼
ProximityCluster[] → D3 join on badge layer
                   → Hide clustered node <g> elements
                   → Badge: circle + "+N" text at centroid
```
