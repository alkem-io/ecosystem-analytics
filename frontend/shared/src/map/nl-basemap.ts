import * as d3 from 'd3';
import { geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { resolveMapConfig, type GraphMapRegion } from './mapConfig.js';
import { createBasemap, type BasemapHandle } from './basemap.js';
import { toSvgTransform, type OverlayTransform } from './overlay-transform.js';

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
 * Verification, and what each layer of it does and does NOT cover:
 *   • tests/vng-map-nl-only.spec.mjs, tests/govtech-map-nl-only.spec.mjs — prove by real
 *     pixels that a given complement path hides everything outside the region. They
 *     rebuild the layering inside the test, so they never load this module.
 *   • frontend/vng/src/dashboard/nl-basemap.test.ts — proves the path string THIS module
 *     produces is exactly the one those specs verified. (Note the path: it lives under
 *     frontend/vng, not next to this file.)
 *   • tests/nl-only-composited.spec.mjs — the only check that looks at the finished
 *     picture: it screenshots the real component's container, so it sees every layer
 *     composited. The three above read the SVG alone and would not notice imagery
 *     rendered in a layer beneath it.
 */

export interface NlBasemapOptions {
  /**
   * The zoom group. The mask, borders and consumer content live here, and its transform
   * is what keeps them locked to the basemap beneath (feature 021).
   */
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
  /**
   * Positioned element hosting the basemap canvas BENEATH the SVG (feature 021). Null
   * only while a ref has not attached; a genuinely absent basemap is the fallback path,
   * not a caller option.
   */
  container: HTMLElement | null;
  /** Called when the basemap cannot draw, so the consumer can show the outline fallback. */
  onBasemapFallback?: (reason: string) => void;
  /**
   * Called whenever the camera changes, with the FULL overlay transform.
   *
   * This is the notification d3-zoom used to provide. Everything that was zoom-driven —
   * level-of-detail, label culling, marker counter-scaling — hangs off this, so it keeps
   * working whichever camera is in charge.
   *
   * The translation is part of it, not just `k`, because MapLibre owns the camera and
   * `d3.zoomTransform(svg)` therefore reports the identity forever: any consumer that
   * needs to know WHERE the camera is (rather than only how far it is zoomed) has no
   * other source for it.
   */
  onCameraChange?: (transform: OverlayTransform) => void;
  /**
   * Override the region's configured projection scale.
   *
   * The scales in `mapConfig` are fixed constants tuned for a map roughly 520px tall, so
   * in a much taller viewport the region floats in empty space. A consumer that knows its
   * own viewport can fit the region to it — see `fitScaleForViewport`. Province framing
   * is unaffected: it is a RATIO to the configured scale, so it tracks any base.
   */
  scale?: number;
}

export interface NlBasemap {
  /** Mercator projection for the region — lon/lat → SVG coordinates. */
  projection: d3.GeoProjection;
  /** The layer group, for consumers that need to append beneath their own content. */
  mapGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  /**
   * Tear down the basemap's WebGL context. A canvas needs this where the old <image>
   * tiles did not; skipping it leaks a context per region change until the tab dies.
   */
  destroy: () => void;
  /**
   * Move the camera. Consumers MUST use this rather than writing the group transform —
   * MapLibre owns the camera and overwrites that attribute on its next painted frame.
   */
  zoomTo: (target: { k: number; tx: number; ty: number }, durationMs?: number) => void;
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
  group,
  region,
  width,
  height,
  onGeoJson,
  onError,
  container,
  onBasemapFallback,
  onCameraChange,
  scale,
}: NlBasemapOptions): NlBasemap {
  const mapCfg = resolveMapConfig(region);
  // The caller's fitted scale wins over the region's constant when supplied.
  const effectiveScale = scale ?? mapCfg.scale;
  const projection = geoMercator()
    .center(mapCfg.center)
    .scale(effectiveScale)
    .translate([width / 2, height / 2]);

  const mapGroup = group.append('g').attr('class', 'map-layer');
  const path = geoPath().projection(projection);


  // The basemap is drawn by MapLibre into a canvas BENEATH this SVG (feature 021). It
  // owns pan and zoom; on every camera change the zoom group is given the matching affine
  // so the mask, borders and nodes stay locked to the imagery, and `onCameraChange` fires
  // so everything that used to hang off d3-zoom keeps working. Started here and left to
  // resolve — the mask and borders below do not wait on it, so a slow or failed basemap
  // degrades to "no imagery, still masked" rather than to a blank component.
  let handle: BasemapHandle | null = null;
  let destroyed = false;
  if (container) {
    void createBasemap({
      container,
      projection,
      center: mapCfg.center,
      scale: effectiveScale,
      width,
      height,
      onSync: (t) => {
        group.attr('transform', toSvgTransform(t));
        onCameraChange?.(t);
      },
      onFallback: (reason) => onBasemapFallback?.(reason),
    }).then((created) => {
      // Unmounting before this resolves would otherwise orphan the map: its render
      // listener keeps painting into a detached container and retains the whole graph
      // scope for the lifetime of the tab.
      if (destroyed) created.destroy();
      else handle = created;
    });
  } else {
    onBasemapFallback?.('no container element for the basemap canvas');
  }

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
      }
      // Unmasked regions (the Explorer's world/europe) simply show the basemap with the
      // region outline drawn over it. There is no clip: the imagery is a canvas outside
      // this SVG, so an SVG clipPath cannot reach it.

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
      // FAIL CLOSED (constitution §VII): with no region geometry there is no mask, so
      // showing the basemap would show everything outside the region. Tear the imagery
      // down rather than render it unmasked — an outline-less blank map is a degraded
      // map; an unmasked one is a constitutional violation.
      destroyed = true;
      handle?.destroy();
      handle = null;
      if (container) container.style.display = 'none';
      onBasemapFallback?.('region geometry unavailable — imagery withheld to stay masked');
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

  return {
    projection,
    mapGroup,
    destroy: () => {
      destroyed = true;
      handle?.destroy();
      handle = null;
    },
    zoomTo: (target, durationMs) => handle?.zoomTo(target, durationMs),
  };
}
