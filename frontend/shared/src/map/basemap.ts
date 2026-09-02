/**
 * The MapLibre basemap layer (feature 021).
 *
 * Draws OpenFreeMap's `positron` vector style into a canvas BENEATH the map SVG, and
 * owns pan and zoom. Everything above it keeps being drawn by d3 in base projection
 * space; `onSync` hands the caller the affine transform that maps that space onto the
 * current screen, once per painted frame.
 *
 * The style is the same one client-web ships (`ContributorMap.tsx`) — one basemap across
 * both products, no API key, no registration, no request quota. The licence requires
 * attribution, which is rendered by the consumer BELOW the map area (research R-009), not
 * by MapLibre's in-canvas control: everything outside the Dutch border must stay plain
 * background (constitution §VII).
 *
 * `maplibre-gl` is imported dynamically so it never enters the bundle of a surface that
 * renders no map.
 */
import {
  solveOverlayTransform,
  type OverlayTransform,
  type Point,
} from './overlay-transform.js';

/** Shared with client-web — see client-web/src/crd/components/map/ContributorMap.tsx. */
export const POSITRON_STYLE = 'https://tiles.openfreemap.org/styles/positron';

/** MapLibre's world width at zoom 0, in CSS pixels. */
const TILE_SIZE = 512;

/**
 * Opacity of the whole basemap canvas.
 *
 * The overlay above it is dense with contributor avatars and cluster bubbles, and at full
 * strength positron's road network and place labels compete with them for attention. Fading
 * the imagery keeps it doing its actual job — geographic context — while the markers stay
 * the figure rather than the ground.
 *
 * Applied to the MapLibre container, not to individual style layers: it is one composite
 * over the finished frame, so the basemap's internal layering is untouched and there is no
 * per-layer paint property to keep in step with a style update.
 */
const BASEMAP_OPACITY = 0.55;


export interface BasemapOptions {
  /** Positioned element the canvas mounts into, beneath the SVG. */
  container: HTMLElement;
  /** The region's d3 projection — the base projection space everything above is drawn in. */
  projection: { (p: Point): Point | null; invert?: (p: Point) => Point | null };
  center: [number, number];
  /** The d3 `geoMercator` scale for this region. */
  scale: number;
  width: number;
  height: number;
  /** Called when the transform for the overlay group CHANGES. */
  onSync: (transform: OverlayTransform) => void;
  /** Called when the basemap cannot draw, so the consumer can show the outline fallback. */
  onFallback: (reason: string) => void;
}

export interface BasemapHandle {
  destroy: () => void;
  /**
   * Move the camera so the overlay would sit at `target`.
   *
   * The camera is MapLibre's now, so a consumer must never drive a zoom by writing the
   * group transform — MapLibre overwrites it on the next painted frame. This is the one
   * way to zoom programmatically, and it is why cluster fan-out and province framing keep
   * working after the handover.
   */
  zoomTo: (target: OverlayTransform, durationMs?: number) => void;
}

/**
 * The MapLibre zoom whose world scale matches a d3 `geoMercator` scale.
 *
 * d3 spreads the world over `2π · scale` units; MapLibre over `TILE_SIZE · 2^zoom`.
 * Equating them aligns the two projections everywhere, given they already share a centre.
 * This only seeds the camera — the overlay transform is solved from `map.project()`, so a
 * change to MapLibre's tile-size convention cannot silently skew the overlay.
 */
export function zoomForScale(scale: number): number {
  return Math.log2((2 * Math.PI * scale) / TILE_SIZE);
}

/**
 * True when the browser can give us a WebGL context.
 *
 * Probed BEFORE constructing MapLibre, because MapLibre throws on a missing context and an
 * uncaught throw inside the render effect would take the surrounding dashboard down with it.
 */
let webglSupport: boolean | undefined;

function hasWebGL(): boolean {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    // Release immediately: browsers cap live WebGL contexts (~8-16), and a probe that
    // holds one means every map creation burns a context before drawing anything.
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
    webglSupport = !!gl;
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/**
 * Two reference points for the overlay solve, a quarter and three-quarters across the
 * viewport. Well separated (so the scale is well conditioned) and on screen at the
 * reference camera. Returned as the base-projection-space pair plus their geographic
 * equivalents, which is what `map.project()` needs.
 */
function referencePoints(
  projection: BasemapOptions['projection'],
  width: number,
  height: number,
): { a: [Point, Point]; geo: [Point, Point] } | null {
  if (!projection.invert) return null;
  const a1: Point = [width * 0.25, height * 0.5];
  const a2: Point = [width * 0.75, height * 0.5];
  const g1 = projection.invert(a1);
  const g2 = projection.invert(a2);
  if (!g1 || !g2) return null;
  return { a: [a1, a2], geo: [g1, g2] };
}

export async function createBasemap(options: BasemapOptions): Promise<BasemapHandle> {
  const { container, projection, center, scale, width, height, onSync, onFallback } = options;

  const fallback = (reason: string): BasemapHandle => {
    onFallback(reason);
    return { destroy: () => {}, zoomTo: () => {} };
  };

  const refs = referencePoints(projection, width, height);
  if (!refs) return fallback('projection is not invertible');
  if (!hasWebGL()) return fallback('no WebGL context available');

  let maplibre: typeof import('maplibre-gl');
  try {
    maplibre = await import('maplibre-gl');
  } catch (err) {
    return fallback(`maplibre-gl failed to load: ${(err as Error).message}`);
  }

  let map: import('maplibre-gl').Map;
  try {
    map = new maplibre.Map({
      container,
      style: POSITRON_STYLE,
      center,
      zoom: zoomForScale(scale),
      // Rotation and pitch are DISABLED, and must stay that way: the overlay transform is
      // a similarity, valid only for a north-up unpitched camera. A rotated camera would
      // shear the markers away from the imagery, and the flat §VII mask would no longer
      // cover what it is shaped to cover.
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: false,
      // Attribution is rendered by the consumer BELOW the map, outside the map area, so
      // nothing is drawn over the plain background outside the region (§VII, R-009).
      attributionControl: false,
    });
  } catch (err) {
    return fallback(`map construction failed: ${(err as Error).message}`);
  }

  // Fade the imagery so the overlay markers read as the foreground. Set on the container
  // rather than in the style so it survives a style swap and stays one composite.
  container.style.opacity = String(BASEMAP_OPACITY);

  const handle: BasemapHandle = {
    destroy: () => {
      try {
        map.remove();
      } catch {
        /* already torn down */
      }
    },
    zoomTo: (target, durationMs = 0) => {
      // Invert the desired overlay transform back into a camera: the base-projection
      // point that would land at the viewport centre becomes the camera centre, and the
      // overlay scale multiplies the region's reference scale.
      const centreBase: Point = [
        (width / 2 - target.tx) / target.k,
        (height / 2 - target.ty) / target.k,
      ];
      const centreGeo = projection.invert?.(centreBase);
      if (!centreGeo) return;
      map.easeTo({
        center: centreGeo as [number, number],
        zoom: zoomForScale(scale * target.k),
        duration: durationMs,
      });
    },
  };

  /**
   * Sync on `render` — the frame MapLibre has PAINTED — not on `move`, which fires before
   * the paint and would leave the overlay one frame ahead of the imagery. That is the
   * FR-017e failure in its least obvious direction.
   */
  // `render` fires on every frame MapLibre paints — tile fade-in, glyph arrival and
  // symbol placement keep it firing at 60fps with a stationary camera. Writing the group
  // transform on each of those would invalidate and re-rasterise the whole SVG subtree
  // (thousands of nodes) for an identical value, so only an actual change is forwarded.
  let last: OverlayTransform | null = null;
  const sync = () => {
    const b1 = map.project(refs.geo[0] as [number, number]);
    const b2 = map.project(refs.geo[1] as [number, number]);
    const t = solveOverlayTransform(refs.a[0], refs.a[1], [b1.x, b1.y], [b2.x, b2.y]);
    if (!t) return;
    if (last && t.k === last.k && t.tx === last.tx && t.ty === last.ty) return;
    last = t;
    onSync(t);
  };
  map.on('render', sync);

  // Latched: MapLibre emits an error per failed tile request, and an unlatched handler
  // would fire the consumer's fallback path once per tile on a flaky network.
  let reportedFailure = false;
  map.on('error', (e) => {
    if (reportedFailure) return;
    reportedFailure = true;
    onFallback(`basemap error: ${e?.error?.message ?? 'unknown'}`);
  });

  return handle;
}
