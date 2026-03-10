# Data Model: Map Location Filtering & Readability

**Feature**: 012-map-location-filtering
**Date**: 2026-03-09

## Overview

This feature introduces no new persisted data. All changes are computed display states derived from existing data at render time. This document captures the conceptual model and computed state structures.

## Existing Entities (Unchanged)

### GraphNode
Source: `server/src/types/graph.ts`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Unique identifier |
| `type` | `'SPACE_L0' \| 'SPACE_L1' \| 'SPACE_L2' \| 'ORGANIZATION' \| 'USER'` | Node category |
| `displayName` | `string` | Label text |
| `weight` | `number` | Activity/importance weight |
| `location` | `GraphLocation \| null` | Optional geographic data |

### GraphLocation
Source: `server/src/types/graph.ts`

| Field | Type | Notes |
|-------|------|-------|
| `country` | `string` | Country name (not used for pinning) |
| `city` | `string` | City name (not used for pinning) |
| `latitude` | `number \| null` | Latitude coordinate |
| `longitude` | `number \| null` | Longitude coordinate |

**Validation rule**: A location is "valid for pinning" only when both `latitude` and `longitude` are non-null numbers. Presence of `country`/`city` alone is insufficient (FR-011).

## Computed State (New — Runtime Only)

### NodeDisplayState

Per-node state computed on each map region change. Not persisted.

```typescript
type NodeDisplayState = 'pinned' | 'free-floating';
```

| State | Condition | D3 Behavior |
|-------|-----------|-------------|
| `pinned` | Node has valid lat/lon AND `geoContains(regionGeoJSON, [lon, lat])` returns `true` | `fx`/`fy` set to projected coordinates |
| `free-floating` | No valid lat/lon, OR location is outside selected region | `fx = null`, `fy = null`; force simulation governs position |

### MapRegionConfig

Existing configuration, extended with GeoJSON data reference for boundary checking.

```typescript
interface MapRegionConfig {
  center: [number, number];     // MAP_CENTERS — existing
  scale: number;                // MAP_SCALES — existing  
  url: string;                  // MAP_URLS — existing
  geojson?: FeatureCollection;  // Cached parsed GeoJSON — NEW (runtime cache)
}
```

### NodeSizeState

Computed effective radius per node, accounting for map mode and zoom.

```typescript
function effectiveRadius(
  node: SimNode,
  isGeoMode: boolean,
  zoomScale: number
): number {
  const base = nodeRadius(node); // existing function
  if (!isGeoMode) return base;
  const mapMultiplier = Math.min(1.0, 0.5 + (zoomScale - 1) * 0.15);
  return base * mapMultiplier;
}
```

## State Transitions

```
┌──────────────────────────────────────────────────┐
│             Map Mode Activated                    │
│  ┌────────────────────────────────────────────┐  │
│  │  For each node:                            │  │
│  │  1. Has valid lat/lon?                     │  │
│  │     NO  → free-floating                    │  │
│  │     YES → geoContains(region, [lon,lat])?  │  │
│  │            YES → pinned (fx/fy = projected)│  │
│  │            NO  → free-floating (fx/fy=null)│  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│             Region Switch                         │
│  ┌────────────────────────────────────────────┐  │
│  │  Recompute all nodes (same logic above)    │  │
│  │  Previously pinned → now free-floating:    │  │
│  │    Clear fx/fy, animate drift (~600ms)     │  │
│  │  Previously free → now pinned:             │  │
│  │    Set fx/fy, animate to projected coords  │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│             Map Mode Deactivated                  │
│  ┌────────────────────────────────────────────┐  │
│  │  All nodes: clear fx/fy, restore sizes     │  │
│  │  Force simulation resumes standard layout  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Relationships

```
GraphNode --(has optional)--> GraphLocation
GraphNode --(computed per region)--> NodeDisplayState {pinned | free-floating}
MapRegion --(contains)--> GeoJSON FeatureCollection
NodeDisplayState --(derived from)--> geoContains(MapRegion.geojson, [node.lon, node.lat])
```

## No New Persistence

- No database changes
- No API changes
- No new types exported from server
- All state is computed at render time from existing data + selected map region
