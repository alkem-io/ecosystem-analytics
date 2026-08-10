import * as d3 from 'd3';
import { geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { resolveMapConfig, type GraphMapRegion } from './mapConfig.js';

/**
 * The shared basemap layer: CARTO tiles, region boundary, and — for the Netherlands and
 * the twelve provinces — the opaque white complement that hides everything outside the
 * region.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONSTITUTION §VII — HARD REQUIREMENT. Read before changing anything below.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Every Dutch dashboard map MUST render ONLY the Netherlands: real tile detail inside
 * the boundary, plain white outside — not greyed, not faint, not a silhouette. This
 * module is the SINGLE implementation of that behaviour, shared by the force-directed
 * graph map and the Usage Explorer map, precisely so the two cannot drift apart.
 *
 * The masking is subtler than it looks, and the reason is worth stating because it has
 * been re-broken more than once:
 *
 *   An SVG `clipPath` does NOT track the d3-zoom transform, so tiles escape it the
 *   moment the user zooms. Instead we draw an opaque WHITE "complement" path INSIDE the
 *   zoom group — it pans and zooms with the tiles and therefore can never leak. The
 *   complement is built from the raw region rings filled with the EVEN-ODD rule: the
 *   source GeoJSON is wound backwards for d3-geo, so even-odd fills the complement of
 *   the Netherlands rather than the Netherlands itself.
 *
 * Verified pixel-by-pixel by tests/vng-map-nl-only.spec.mjs and
 * tests/govtech-map-nl-only.spec.mjs, and on the real component by
 * frontend/shared/src/map/nl-basemap.test.ts.
 */

/** Tile subdomains — spreading requests keeps the browser's per-host limit out of the way. */
const TILE_SUBDOMAINS = ['a', 'b', 'c', 'd'];

/** Cap on tiles rendered in one pass, so a wild zoom can't flood the DOM. */
const MAX_TILES = 200;

export interface NlBasemapOptions {
  /**
   * The SVG root — used only for reading the current zoom transform and hosting the
   * clipPath def. Typed to allow a nullable element so it accepts both `d3.select(ref)`
   * (which yields `SVGSVGElement | null`) and an already-narrowed selection.
   */
  svg: d3.Selection<SVGSVGElement | null, unknown, null, undefined>;
  /** The zoom group. The basemap is appended here so it pans/zooms with everything else. */
  group: d3.Selection<SVGGElement, unknown, null, undefined>;
  region: GraphMapRegion;
  width: number;
  height: number;
  /**
   * Called once the region GeoJSON has loaded, before borders are drawn. Lets a consumer
   * do region-dependent work (the force graph pins nodes and rebuilds its repulsion
   * force here) without this module knowing anything about simulations.
   */
  onGeoJson?: (geojson: GeoPermissibleObjects) => void;
  /** Called when the GeoJSON cannot be loaded, so the consumer can show a fallback. */
  onError?: () => void;
}

export interface NlBasemap {
  /** Mercator projection for the region — lon/lat → SVG coordinates. */
  projection: d3.GeoProjection;
  /** Re-render tiles for the given d3-zoom scale. Call on every zoom event. */
  renderTiles: (zoomK: number) => void;
  /** The layer group, for consumers that need to append beneath their own content. */
  mapGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
}

/** Web Mercator: lon/lat → fractional tile coordinates at zoom z, and back. */
function lon2tile(lon: number, z: number) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}
function lat2tile(lat: number, z: number) {
  const latRad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z);
}
function tile2lon(x: number, z: number) {
  return (x / Math.pow(2, z)) * 360 - 180;
}
function tile2lat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Build the complement path for a masked region.
 *
 * Exported for the unit test: this single expression is what keeps everything outside
 * the Netherlands white, so it is asserted directly rather than only through rendering.
 * The even-odd fill rule is applied by the caller via both `attr` and `style` — see
 * {@link renderNlBasemap} — because some engines honour only one of the two.
 */
export function buildComplementPath(
  features: unknown[],
  path: d3.GeoPath<unknown, d3.GeoPermissibleObjects>,
): string {
  return features
    .map((f) => path(f as d3.GeoPermissibleObjects))
    .filter(Boolean)
    .join(' ');
}

/**
 * Render the basemap into `group` and return the projection plus a tile refresher.
 *
 * Layering, bottom to top: tiles → white complement (masked regions only) → region
 * borders. Consumers append their own content above all of it.
 */
export function renderNlBasemap({
  svg,
  group,
  region,
  width,
  height,
  onGeoJson,
  onError,
}: NlBasemapOptions): NlBasemap {
  const mapCfg = resolveMapConfig(region);
  const projection = geoMercator()
    .center(mapCfg.center)
    .scale(mapCfg.scale)
    .translate([width / 2, height / 2]);

  const mapGroup = group.append('g').attr('class', 'map-layer');
  const path = geoPath().projection(projection);

  // Clip definition: used only by the Explorer's world/europe basemaps, which are not
  // masked. The Netherlands and the provinces use the white complement instead.
  const clipId = 'map-region-clip';
  const mapClipDef = svg.append('defs').append('clipPath').attr('id', clipId);

  const tileGroup = mapGroup.append('g').attr('class', 'tile-layer');

  const baseZoom = mapCfg.baseZoom;

  function renderTiles(zoomK: number) {
    // The effective tile zoom considers both base projection scale and D3 zoom.
    const tileZ = Math.max(0, Math.min(18, Math.round(baseZoom + Math.log2(Math.max(zoomK, 0.1)))));
    // Compute SVG-space bounds visible in the viewport. When zoomed, the g-transform is
    // "translate(tx,ty) scale(k)"; the inverse maps viewport corners to coordinate space.
    const currentTransform = d3.zoomTransform(svg.node()!);
    const topLeft = currentTransform.invert([0, 0]);
    const bottomRight = currentTransform.invert([width, height]);
    const inv = projection.invert!;
    const geoTL = inv(topLeft as [number, number]);
    const geoBR = inv(bottomRight as [number, number]);
    if (!geoTL || !geoBR) return;

    const xMin = Math.max(0, Math.floor(lon2tile(geoTL[0], tileZ)));
    const xMax = Math.min(Math.pow(2, tileZ) - 1, Math.floor(lon2tile(geoBR[0], tileZ)));
    const yMin = Math.max(0, Math.floor(lat2tile(geoTL[1], tileZ)));
    const yMax = Math.min(Math.pow(2, tileZ) - 1, Math.floor(lat2tile(geoBR[1], tileZ)));

    const tiles: { tx: number; ty: number; z: number; key: string }[] = [];
    for (let tx = xMin; tx <= xMax; tx++) {
      for (let ty = yMin; ty <= yMax; ty++) {
        tiles.push({ tx, ty, z: tileZ, key: `${tileZ}/${tx}/${ty}` });
      }
    }

    if (tiles.length > MAX_TILES) return;

    const images = tileGroup
      .selectAll<SVGImageElement, (typeof tiles)[0]>('image')
      .data(tiles, (d) => d.key);

    images.exit().remove();

    images
      .enter()
      .append('image')
      .attr('preserveAspectRatio', 'none')
      .attr('pointer-events', 'none')
      .merge(images as never)
      .attr('href', (d) => {
        const s = TILE_SUBDOMAINS[(d.tx + d.ty) % TILE_SUBDOMAINS.length];
        return `https://${s}.basemaps.cartocdn.com/light_nolabels/${d.z}/${d.tx}/${d.ty}.png`;
      })
      .each(function (d) {
        const pTL = projection([tile2lon(d.tx, d.z), tile2lat(d.ty, d.z)]);
        const pBR = projection([tile2lon(d.tx + 1, d.z), tile2lat(d.ty + 1, d.z)]);
        if (pTL && pBR) {
          d3.select(this)
            .attr('x', pTL[0])
            .attr('y', pTL[1])
            .attr('width', pBR[0] - pTL[0])
            .attr('height', pBR[1] - pTL[1]);
        }
      });
  }

  // CARTO tiles are rendered for every region (including the Netherlands, which MUST
  // show real map-tile detail per constitution §VII).
  renderTiles(1);

  fetch(mapCfg.url)
    .then((res) => {
      if (!res.ok) throw new Error('Map not found');
      return res.json();
    })
    .then((geojson) => {
      onGeoJson?.(geojson as GeoPermissibleObjects);

      const features = geojson.features || [geojson];
      const isWorldMap = mapCfg.kind === 'world';

      if (mapCfg.masked) {
        // HARD REQUIREMENT (constitution §VII): show ONLY the region — the whole
        // Netherlands, or a single province. See the module header for why this is an
        // opaque white complement inside the zoom group rather than a clipPath.
        mapGroup
          .selectAll('path.nl-complement')
          .data([0])
          .join('path')
          .attr('class', 'nl-complement')
          .attr('d', buildComplementPath(features as unknown[], path))
          .attr('fill', '#ffffff')
          .attr('fill-rule', 'evenodd')
          .style('fill-rule', 'evenodd')
          .style('pointer-events', 'none');
      } else {
        // Explorer world/europe: clip tiles to the region.
        mapClipDef
          .selectAll('path')
          .data(features)
          .join('path')
          .attr('d', path as never);
        tileGroup.attr('clip-path', `url(#${clipId})`);
      }

      // Subtle province/region borders on top.
      mapGroup
        .selectAll('path.region-border')
        .data(features)
        .join('path')
        .attr('class', 'region-border')
        .attr('d', path as never)
        .attr('fill', 'none')
        .attr('stroke', isWorldMap ? 'rgba(150,150,150,0.3)' : 'rgba(120, 135, 150, 0.55)')
        .attr('stroke-width', isWorldMap ? 0.5 : 0.8)
        .style('pointer-events', 'none');
    })
    .catch(() => {
      if (onError) {
        onError();
        return;
      }
      // Constitution §V — a failed basemap shows a meaningful fallback, never a blank.
      mapGroup
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-muted)')
        .attr('font-size', 14)
        .text('Map unavailable');
    });

  return { projection, renderTiles, mapGroup };
}
