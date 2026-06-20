import { geoContains, geoBounds, type GeoPermissibleObjects } from 'd3-geo';

/**
 * Check whether a geographic point falls within a GeoJSON region.
 */
export function isWithinRegion(
  geojson: GeoPermissibleObjects,
  longitude: number,
  latitude: number,
): boolean {
  return geoContains(geojson, [longitude, latitude]);
}

/**
 * Compute the set of node IDs that should be geo-pinned for the given region.
 * Nodes are pinned only if they have valid lat/lon AND fall within the region.
 */
export function computePinnedNodeIds(
  nodes: Array<{ data: { id: string; location: { latitude: number | null; longitude: number | null } | null } }>,
  geojson: GeoPermissibleObjects,
): Set<string> {
  const pinned = new Set<string>();
  for (const node of nodes) {
    const loc = node.data.location;
    if (loc && loc.longitude != null && loc.latitude != null) {
      if (isWithinRegion(geojson, loc.longitude, loc.latitude)) {
        pinned.add(node.data.id);
      }
    }
  }
  return pinned;
}

/**
 * Compute the projected bounding box of a map region for use in repulsion force.
 */
export function computeMapBounds(
  geojson: GeoPermissibleObjects,
  projection: (point: [number, number]) => [number, number] | null,
): { x: number; y: number; width: number; height: number } {
  const [[minLon, minLat], [maxLon, maxLat]] = geoBounds(geojson);

  // Project the four corners and find pixel extent
  const corners: Array<[number, number]> = [
    [minLon, minLat],
    [minLon, maxLat],
    [maxLon, minLat],
    [maxLon, maxLat],
  ];

  let pxMinX = Infinity;
  let pxMinY = Infinity;
  let pxMaxX = -Infinity;
  let pxMaxY = -Infinity;

  for (const corner of corners) {
    const projected = projection(corner);
    if (projected) {
      pxMinX = Math.min(pxMinX, projected[0]);
      pxMinY = Math.min(pxMinY, projected[1]);
      pxMaxX = Math.max(pxMaxX, projected[0]);
      pxMaxY = Math.max(pxMaxY, projected[1]);
    }
  }

  return {
    x: pxMinX,
    y: pxMinY,
    width: pxMaxX - pxMinX,
    height: pxMaxY - pxMinY,
  };
}
