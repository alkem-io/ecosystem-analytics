/**
 * Build an SVG path `d` for a filled region silhouette (e.g. the Netherlands),
 * used to render the VNG dashboard map as Netherlands-ONLY per constitution §VII /
 * spec FR-048 (nothing outside the Netherlands may be rendered).
 *
 * WHY REVERSED RINGS: the source GeoJSON (cartomap NL provinces) has rings wound
 * BACKWARDS for d3-geo's spherical interpretation. A plain `geoPath` fill of those
 * rings therefore covers the COMPLEMENT of the Netherlands (i.e. everything else),
 * which is exactly the "tiles/fill bleeding outside NL" bug. Reversing each ring's
 * point order before building the path makes a normal `nonzero` fill cover ONLY the
 * Netherlands. (This was verified pixel-by-pixel in a headless browser; see
 * vng-map-nl-only.spec.) The geoContains-based boundary checks elsewhere keep using
 * the original winding, so they are unaffected.
 */

export type GeoFeatureLike = {
  geometry: { type: string; coordinates: unknown };
};

/** A function projecting a `[lon, lat]` to screen `[x, y]` (or null if unprojectable). */
export type Project = (point: [number, number]) => [number, number] | null;

/**
 * Produce the SVG `d` for the region silhouette: each polygon's exterior ring,
 * projected, point-order reversed, as a closed subpath. Filled with the default
 * nonzero rule this covers only the region (the Netherlands).
 */
export function buildRegionFillPath(features: GeoFeatureLike[], project: Project): string {
  return features
    .flatMap((f) => {
      const geom = f.geometry;
      const polys =
        geom.type === 'Polygon'
          ? [geom.coordinates as number[][][]]
          : (geom.coordinates as number[][][][]);
      return polys.map((poly) => {
        const pts = (poly[0] as [number, number][])
          .map((c) => project(c))
          .filter((p): p is [number, number] => !!p);
        pts.reverse();
        return pts.length > 2
          ? 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z'
          : '';
      });
    })
    .filter(Boolean)
    .join(' ');
}
