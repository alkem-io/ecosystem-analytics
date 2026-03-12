# Quickstart: Map Location Filtering & Readability

**Feature**: 012-map-location-filtering
**Branch**: `012-map-location-filtering`

## Prerequisites

- Node.js ≥ 18
- pnpm installed
- Repository cloned, on branch `012-map-location-filtering`

## Setup

```bash
cd frontend && pnpm install
```

No new dependencies needed — all functionality uses existing `d3-geo`.

## Implementation Order

### Step 1: Create `mapBoundary.ts`

Create `frontend/src/components/graph/mapBoundary.ts` with three exports:

1. **`isWithinRegion(geojson, lon, lat)`** — Calls `d3.geoContains(geojson, [lon, lat])`.
2. **`computePinnedNodeIds(nodes, geojson)`** — Iterates nodes, returns `Set<string>` of IDs where location is valid AND within region.
3. **`computeMapBounds(geojson, projection)`** — Projects GeoJSON extent to pixel bounding box for repulsion force.

### Step 2: Cache GeoJSON in ForceGraph.tsx

In the existing GeoJSON `fetch()` block (~line 752), store the parsed GeoJSON in a variable accessible to the boundary-checking logic:

```typescript
// After: .then((geojson) => { ... map rendering ... })
// Add: cache geojson for boundary checking
cachedGeoJSON = geojson;
```

### Step 3: Filter geo-pinned nodes

Replace the existing geo-target computation block (~lines 808-818) to use `computePinnedNodeIds`:

```typescript
const pinnedIds = computePinnedNodeIds(simNodes, cachedGeoJSON);
const geoTargets = new Map<string, { x: number; y: number }>();
for (const node of simNodes) {
  if (pinnedIds.has(node.data.id)) {
    const loc = node.data.location!;
    const projected = projection!([loc.longitude!, loc.latitude!]);
    if (projected) geoTargets.set(node.data.id, { x: projected[0], y: projected[1] });
  }
}
```

### Step 4: Add soft repulsion force

Add a new force to the simulation (~line 1089):

```typescript
.force('map-repulsion', isGeoMode ? mapRepulsionForce(mapBounds, pinnedIds) : null)
```

The `mapRepulsionForce` function pushes free-floating nodes away from the map area on each tick.

### Step 5: Disable proximity clustering

Guard the clustering block (~line 1149) with `false`:

```typescript
// Was: if (showMap && simNodes.length <= MAX_NODES_FOR_CLUSTERING)
// Now: disabled in map mode per spec 012
if (false && showMap && simNodes.length <= MAX_NODES_FOR_CLUSTERING)
```

### Step 6: Add zoom-responsive node sizing

Create `effectiveRadius()` and use it wherever `nodeRadius()` is called for visual sizing:

```typescript
function effectiveRadius(d: SimNode, isGeoMode: boolean, zoomScale: number): number {
  const base = nodeRadius(d);
  if (!isGeoMode) return base;
  return base * Math.min(1.0, 0.5 + (zoomScale - 1) * 0.15);
}
```

Update circle `r` attributes and collision force radius to use `effectiveRadius`.

### Step 7: Animate region transitions

When region changes, use D3 transitions for smooth position changes:
- Restart simulation with `alpha(0.3)` for ~600ms of activity
- Let pinned→free nodes drift naturally via simulation
- Let free→pinned nodes animate via transition to new fx/fy

## Verification

```bash
# Run dev server
cd frontend && pnpm dev

# Run visual regression tests
cd .. && pnpm test
```

### Manual Testing Checklist

1. Select Netherlands map → only NL-located entities pinned
2. Select Europe map → only EU-located entities pinned
3. Select World map → all entities with coords pinned
4. Switch regions → smooth ~600ms transition
5. No cluster badges in any map view
6. Nodes smaller in map mode, grow with zoom
7. Free-floating nodes positioned away from map
8. Toggle map off → normal sizes, clustering restored
9. Drag a pinned node → snaps back to geo position
10. Drag a free-floating node → stays where dropped

## Key Files Modified

| File | Changes |
|------|---------|
| `frontend/src/components/graph/mapBoundary.ts` | **NEW** — boundary checking utilities |
| `frontend/src/components/graph/ForceGraph.tsx` | Filtered pinning, repulsion force, sizing, clustering bypass |
