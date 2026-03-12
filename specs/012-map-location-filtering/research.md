# Research: Map Location Filtering & Readability

**Date**: 2026-03-09
**Feature**: 012-map-location-filtering

## R1: GeoJSON Point-in-Polygon via d3-geo

### Decision
Use `d3.geoContains(featureCollection, [lon, lat])` from the already-installed `d3-geo` package.

### Rationale
- `geoContains` is a built-in D3 function — no new dependency needed.
- It accepts `FeatureCollection` objects directly; no need to iterate individual features.
- Confirmed experimentally:
  - Netherlands FeatureCollection correctly contains Amsterdam `[4.9, 52.37]` → `true`
  - Netherlands FeatureCollection correctly rejects Paris `[2.35, 48.86]` → `false`
  - Europe FeatureCollection contains Amsterdam → `true`, rejects NYC → `false`
  - World FeatureCollection contains all major cities (NYC, DC, London, Berlin, Tokyo) → `true`, rejects ocean `[0, 0]` → `false`

### Alternatives Considered
- **Turf.js `booleanPointInPolygon`**: Would add a new dependency (~40KB gzipped). Unnecessary since `d3-geo` already provides the capability.
- **Manual ray-casting**: Error-prone and slower. No reason to reimplement what D3 provides.
- **Bounding-box approximation**: Too imprecise — would include ocean/adjacent country points.

### Implementation Notes
- Input format: `[longitude, latitude]` (GeoJSON order: lon first, lat second)
- All 3 GeoJSON files are `FeatureCollection` type with Polygon/MultiPolygon geometries
- Performance: ~500 `geoContains` calls on region change is negligible (sub-millisecond per call)
- The GeoJSON files are already fetched for map rendering; cache the parsed JSON for reuse in boundary checking

## R2: GeoJSON File Structure

### Decision
All three map files use identical `FeatureCollection` structure, suitable for direct use with `geoContains`.

### Findings

| File | Type | Features | Geometry Types | Properties |
|------|------|----------|---------------|------------|
| `netherlands.geojson` | FeatureCollection | 12 (provinces) | MultiPolygon | `name`, `density`, `path` |
| `europe.geojson` | FeatureCollection | 38 (countries) | Polygon, MultiPolygon | `name`, `density`, `path` |
| `world.geojson` | FeatureCollection | 233 (countries) | Polygon, MultiPolygon | `admin`, `name`, various NaturalEarth props |

### Implementation Notes
- The Netherlands file has a custom `path` property (e.g., `/world/Netherlands/Drenthe`) — not needed for boundary checking.
- The world file uses NaturalEarth data with `admin` as the primary name property; continent-level polygons are not present (which is fine — the world map contains all land masses).
- All files are already loaded/fetched in `ForceGraph.tsx` via `MAP_URLS[mapRegion]`. The same fetch result can be cached and passed to the boundary-check utility.

## R3: Soft Repulsion Force Design

### Decision
Implement a custom D3 force function (like the existing `radial-hierarchy` force) that pushes free-floating nodes away from the map's projected bounding box.

### Rationale
- The existing codebase already uses custom force functions (see `radial-hierarchy` at [ForceGraph.tsx lines 1089-1101](../../../frontend/src/components/graph/ForceGraph.tsx#L1089-L1101)).
- D3's `forceSimulation.force()` accepts arbitrary `(alpha: number) => void` functions.
- A repulsion zone creates a visual separation between geo-pinned nodes on the map and free-floating nodes outside it.

### Design

**Force behavior**: On each tick, for each free-floating node (not geo-pinned), compute a force vector that pushes it away from the map's projected center if it's within the repulsion zone.

```
Repulsion zone = projected bounding box of map region + margin (50px)

For each free-floating node:
  if node is inside repulsion zone:
    vector = normalize(node.pos - mapCenter) * repulsionStrength * alpha
    node.vx += vector.x
    node.vy += vector.y
```

**Parameters**:
- `repulsionStrength`: 0.3 (tunable — strong enough to push nodes away, not so strong they fly off screen)
- `margin`: 50px around the projected map bounds
- The map center point is already available from `MAP_CENTERS[mapRegion]` projected through `geoMercator`

**Projected bounding box**: Compute once on region change by projecting the four corners of the GeoJSON extent (or simply use width/height-based percentages since the map is centered).

### Alternatives Considered
- **Hard boundary (clamp)**: Abrupt positioning looks unnatural and prevents user drag into map area.
- **Additional D3 `forceCollide` on a virtual central node**: Clever but harder to control the shape/extent of the repulsion area.
- **CSS/SVG containment**: Not possible with D3 force simulation.

## R4: Zoom-Responsive Node Sizing

### Decision
Apply a `0.5×` base multiplier to all node radii in map mode. Scale responsively with zoom using `clamp(0.5, 0.5 + (zoomScale - 1) * 0.15, 1.0)`.

### Rationale
- The spec requires node sizes reduced by 50% base in map mode (FR-008).
- Zoom-responsive sizing means nodes grow back toward full size as the user zooms in, improving readability at detail level.
- The formula linearly interpolates from 0.5× at zoom=1 toward 1.0× at higher zoom, clamped to never exceed original size.

### Current Sizing Code
```typescript
// BASE_RADIUS: SPACE_L0=18, SPACE_L1=14, SPACE_L2=9, ORG=7, USER=8
// nodeRadius() applies logarithmic degree scaling on top of base
// Returns: base * scale where scale ∈ [1, maxDegreeScale]
```

### Design

Apply a map-mode multiplier **after** the existing `nodeRadius()` calculation:

```typescript
function effectiveRadius(d: SimNode, isGeoMode: boolean, zoomScale: number): number {
  const base = nodeRadius(d);
  if (!isGeoMode) return base;
  const mapMultiplier = Math.min(1.0, 0.5 + (zoomScale - 1) * 0.15);
  return base * mapMultiplier;
}
```

| Zoom level | Multiplier | Effect |
|------------|------------|--------|
| 1× | 0.50 | Half size (overview) |
| 2× | 0.65 | Slightly larger |
| 4× | 0.95 | Nearly full |
| 5×+ | 1.00 | Full size (capped) |

### Alternatives Considered
- **Fixed 50% always**: Misses the zoom-responsive requirement from clarification Q2.
- **Inverse-square scaling**: Too aggressive — nodes become invisibly small at overview.
- **Separate BASE_RADIUS map**: Doubles configuration surface area for no benefit.

## R5: Clustering Bypass Strategy

### Decision
Bypass proximity clustering by skipping the clustering code block when `isGeoMode` is true. Do not delete `proximityClustering.ts`.

### Rationale
- The spec removes clustering only in map mode (clarification Q3: "map mode only").
- Clustering is still useful for non-map (force-only) mode.
- The clustering invocation is a single conditional block at lines ~1149-1157 of ForceGraph.tsx.

### Implementation
Add `!isGeoMode` to the existing condition:
```typescript
// Current: if (showMap && simNodes.length <= MAX_NODES_FOR_CLUSTERING)
// New:     if (showMap && !isGeoMode && simNodes.length <= MAX_NODES_FOR_CLUSTERING)
```

Wait — analyzing the code more carefully: `isGeoMode` is `showMap && geoTargets.size > 0`. When map mode is active AND there are geo targets, clustering runs. The change should be: clustering should NEVER run in map mode. So the condition becomes:

```typescript
if (!showMap && simNodes.length <= MAX_NODES_FOR_CLUSTERING)
```

Actually, re-reading the code: clustering was only active in map mode (`showMap`). The spec says remove clustering from map mode. So the entire clustering block becomes dead code in its current form. For safety, wrap it in `if (false && showMap && ...)` or simply `if (!isGeoMode && showMap && ...)` which is always false (since isGeoMode requires showMap). 

**Simplest approach**: Comment out or guard the proximity clustering block with `if (false)` and add a code comment explaining it was disabled per spec 012. Do not delete the file or function.

## R6: Transition Animation

### Decision
Use D3 transitions with ~600ms duration for position changes when switching map regions.

### Rationale
- The spec requires animated drift transitions (clarification Q4: "~600ms").
- D3's `d3.transition().duration(600)` is the standard approach for smooth position changes.
- When switching regions, nodes with locations in the NEW region get geo-pinned (animated to new fx/fy), while nodes that were pinned but are now OUTSIDE the new region get unpinned (fx/fy → null) and drift away via simulation.

### Implementation
On region change:
1. Recompute `geoTargets` with new projection + boundary check
2. For newly geo-pinned nodes: animate `x,y` toward new `fx,fy` using transition
3. For newly unpinned nodes: set `fx = null, fy = null` and let simulation drift them
4. Restart simulation with `alpha(0.3)` for ~600ms of activity

The existing drag snap-back already shows the pattern for setting/clearing `fx`/`fy` (lines 860-872).

## Summary of Decisions

| # | Topic | Decision | New Dependency? |
|---|-------|----------|-----------------|
| R1 | Point-in-polygon | `d3.geoContains()` | No |
| R2 | GeoJSON structure | All FeatureCollection — direct use | No |
| R3 | Soft repulsion | Custom D3 force function | No |
| R4 | Zoom-responsive sizing | `0.5 + (zoom-1)*0.15` clamped to [0.5, 1.0] | No |
| R5 | Clustering bypass | Guard with `false` condition in map mode | No |
| R6 | Transition animation | D3 transition ~600ms + simulation alpha restart | No |

**All NEEDS CLARIFICATION items from Technical Context are now resolved. Zero new dependencies required.**
