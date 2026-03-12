# Contracts: Map Location Filtering & Readability

**Feature**: 012-map-location-filtering
**Date**: 2026-03-09

## Overview

This feature has no API (REST/GraphQL) changes. All contracts are internal TypeScript interfaces for the new `mapBoundary.ts` utility module and changes to `ForceGraph.tsx`.

## New Module: `mapBoundary.ts`

File: `frontend/src/components/graph/mapBoundary.ts`

### Exports

```typescript
import type { FeatureCollection } from 'geojson';

/**
 * Check whether a geographic point falls within a GeoJSON region.
 * Uses d3.geoContains() internally.
 *
 * @param geojson - Parsed GeoJSON FeatureCollection for the map region
 * @param longitude - WGS84 longitude
 * @param latitude - WGS84 latitude
 * @returns true if the point is within the region's polygons
 */
export function isWithinRegion(
  geojson: FeatureCollection,
  longitude: number,
  latitude: number,
): boolean;

/**
 * Compute the set of node IDs that should be geo-pinned for the given region.
 * Nodes are pinned if they have valid lat/lon AND fall within the region.
 *
 * @param nodes - Array of simulation nodes
 * @param geojson - Parsed GeoJSON FeatureCollection for the selected region
 * @returns Set of node IDs to pin
 */
export function computePinnedNodeIds(
  nodes: Array<{ data: { id: string; location: { latitude: number | null; longitude: number | null } | null } }>,
  geojson: FeatureCollection,
): Set<string>;

/**
 * Compute the projected bounding box of a map region for use in repulsion force.
 *
 * @param geojson - Parsed GeoJSON FeatureCollection
 * @param projection - D3 geoMercator projection instance
 * @returns Bounding rectangle in projected (pixel) coordinates
 */
export function computeMapBounds(
  geojson: FeatureCollection,
  projection: d3.GeoProjection,
): { x: number; y: number; width: number; height: number };
```

## Modified Module: `ForceGraph.tsx`

### New Internal Functions

```typescript
/**
 * Custom D3 force: pushes free-floating nodes away from the map's projected bounds.
 * Applied only in geo mode.
 *
 * @param mapBounds - Projected bounding box of the map region
 * @param pinnedIds - Set of geo-pinned node IDs (excluded from repulsion)
 * @param strength - Repulsion strength (default: 0.3)
 * @returns D3-compatible force function (alpha: number) => void
 */
function mapRepulsionForce(
  mapBounds: { x: number; y: number; width: number; height: number },
  pinnedIds: Set<string>,
  strength?: number,
): (alpha: number) => void;

/**
 * Compute effective node radius accounting for map mode and zoom.
 *
 * @param node - Simulation node
 * @param isGeoMode - Whether map mode is active with geo targets
 * @param zoomScale - Current zoom transform scale
 * @returns Effective radius in pixels
 */
function effectiveRadius(
  node: SimNode,
  isGeoMode: boolean,
  zoomScale: number,
): number;
```

### Modified Behavior Summary

| Function/Block | Current Behavior | New Behavior |
|---------------|------------------|--------------|
| Geo target computation | Pins ALL nodes with lat/lon | Pins only nodes within selected region (via `computePinnedNodeIds`) |
| Proximity clustering block | Runs when `showMap && nodes <= 500` | Disabled in map mode (guard condition) |
| `nodeRadius()` usage | Used directly for circle `r` attribute | Wrapped in `effectiveRadius()` when `isGeoMode` |
| Force: `radial-hierarchy` | Inactive in geo mode | Unchanged |
| Force: new `map-repulsion` | N/A | Active in geo mode — pushes free-floating nodes away from map bounds |
| Drag `end` handler | Snaps back to geo-target if exists | Snaps back only if node is in `pinnedIds` set |
| GeoJSON fetch | Used only for map rendering | Also cached for boundary checking in `mapBoundary.ts` |

## No External API Changes

- No GraphQL schema changes
- No REST endpoint changes
- No server-side modifications
- No new npm packages
