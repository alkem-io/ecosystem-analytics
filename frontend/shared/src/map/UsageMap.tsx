import { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { renderNlBasemap, type NlBasemap } from './nl-basemap.js';
import { MapAttribution } from './MapAttribution.js';
import { MapFallback } from './MapFallback.js';
import { resolveMapConfig, type ProvinceRegion } from './mapConfig.js';
import { PROVINCE_BASEMAPS } from './province-basemaps.generated.js';
import {
  buildUsageMarkers,
  computeVisibleArea,
  type UsageMarker,
  type VisibleArea,
} from '../dashboard/utils/usage.js';
import { pieSlices } from '../dashboard/utils/pie.js';
import type { GemeenteLocation } from '@server/types/api.js';
import type { CityRow } from '../dashboard/utils/cities.js';

/**
 * The Usage Explorer map (feature 019): every Dutch gemeente as a marker sized by how
 * many initiatives it takes part in, over the Netherlands basemap.
 *
 * Why this is not the shared `ForceGraph`:
 *
 *  • ForceGraph's map mode grows markers as √k on zoom (see its `effectiveRadius`). This
 *    map requires CONSTANT on-screen size (FR-015), so the 3× ratio and the size legend
 *    hold at every zoom level. Changing ForceGraph would regress three shipped maps.
 *  • Positions here are static — projected once, never simulated.
 *  • This map must report its viewport, which ForceGraph does not expose.
 *
 * What IS shared is the part that matters constitutionally: the basemap, tiles, and the
 * white complement that keeps everything outside the Netherlands blank, all via
 * `renderNlBasemap`. See constitution §VII.
 *
 * TWO DIFFERENT BOUNDARIES — do not conflate them:
 *  • The NETHERLANDS outer boundary is always masked (§VII).
 *  • PROVINCE selection only reframes; other provinces stay visible and counted, because
 *    a gemeente over a provincial border is exactly the neighbour this feature exists to
 *    reveal (FR-013a). Hence the basemap region is ALWAYS 'netherlands' — province
 *    basemaps would mask their surroundings, which is the wrong behaviour here.
 */

/**
 * The basemap region this map ALWAYS uses.
 *
 * Constitution §VII requires the Netherlands outer boundary be masked. FR-013a requires
 * that province selection NOT mask the neighbouring provinces. Both hold only if the
 * rendered basemap stays the whole country and province selection is expressed purely as
 * a zoom transform. Switching this to a province region would satisfy §VII while
 * silently breaking FR-013a — which is the exact confusion this constant exists to
 * prevent. Pinned by frontend/vng/src/dashboard/usage-map.test.ts.
 */
export const USAGE_MAP_BASEMAP_REGION = 'netherlands' as const;
const NL_REGION = USAGE_MAP_BASEMAP_REGION;

/**
 * The zoom transform that frames `province` on the NATIONAL basemap.
 *
 * Province basemaps are used ONLY as a source of centre + scale here; they are never
 * rendered, because rendering one would mask its surroundings (FR-013a). Pure and
 * exported so the framing maths is testable without a DOM.
 */
export function provinceViewTransform(
  province: ProvinceRegion,
  project: (p: [number, number]) => [number, number] | null,
  width: number,
  height: number,
): { k: number; tx: number; ty: number } | null {
  const basemap = PROVINCE_BASEMAPS[province];
  const nlScale = resolveMapConfig(USAGE_MAP_BASEMAP_REGION).scale;
  // How much more magnified the province basemap is than the whole country.
  const k = basemap.scale / nlScale;
  const centre = project(basemap.center);
  if (!centre) return null;
  return { k, tx: width / 2 - k * centre[0], ty: height / 2 - k * centre[1] };
}

/** Milliseconds of stillness before the ranking recomputes (SC-005 allows 1 s). */
const SETTLE_MS = 150;

export interface UsageMapProps {
  locations: GemeenteLocation[];
  cityRows: CityRow[];
  /** Province to frame, or null for the whole country. Changing this re-frames the map. */
  province: ProvinceRegion | null;
  /** Bumped by the consumer to force a reset to the national view. */
  resetNonce: number;
  focusedNameId: string | null;
  onFocus: (marker: UsageMarker | null) => void;
  /** Fired on settle — not on every frame — with what is currently in view. */
  onVisibleAreaChange: (area: VisibleArea) => void;
  /** Fired once markers are built, so the consumer can disclose unplaced gemeentes. */
  onMarkersBuilt?: (info: { markers: UsageMarker[]; unplaced: number }) => void;
  onHover?: (marker: UsageMarker | null, position?: { x: number; y: number }) => void;
  height?: number;
}

export function UsageMap({
  locations,
  cityRows,
  province,
  resetNonce,
  focusedNameId,
  onFocus,
  onVisibleAreaChange,
  onMarkersBuilt,
  onHover,
  height = 520,
}: UsageMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Where the basemap canvas mounts, beneath the SVG (feature 021). */
  const mapLayerRef = useRef<HTMLDivElement | null>(null);
  /** The live basemap, so the province-framing effect can drive its camera. */
  const basemapRef = useRef<NlBasemap | null>(null);
  /** True once the basemap has reported it cannot draw (FR-021/FR-022). */
  const [basemapFailed, setBasemapFailed] = useState(false);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const projectionRef = useRef<d3.GeoProjection | null>(null);
  const markersRef = useRef<UsageMarker[]>([]);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest callbacks without re-running the D3 setup effect on every parent render.
  const cbRef = useRef({ onFocus, onVisibleAreaChange, onHover, onMarkersBuilt });
  cbRef.current = { onFocus, onVisibleAreaChange, onHover, onMarkersBuilt };

  /** Recompute the visible set from the current transform and report it, debounced. */
  const scheduleVisibleAreaReport = useCallback((width: number, h: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const svg = svgRef.current;
      if (!svg) return;
      const t = d3.zoomTransform(svg);
      const [x0, y0] = t.invert([0, 0]);
      const [x1, y1] = t.invert([width, h]);
      cbRef.current.onVisibleAreaChange(
        computeVisibleArea(markersRef.current, { x0, y0, x1, y1 }),
      );
    }, SETTLE_MS);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl) return;

    const width = container.clientWidth || 800;
    const h = height;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${h}`);

    const g = svg.append('g').attr('class', 'usage-zoom-group');

    // Constitution §VII — always the whole-Netherlands basemap, never a masked province.
    const basemap = renderNlBasemap({
      container: mapLayerRef.current,
      onBasemapFallback: (reason) => {
        console.warn(`[UsageMap] basemap unavailable: ${reason}`);
        setBasemapFailed(true);
      },
      // The notification d3-zoom used to give us. Marker counter-scaling and the
      // visible-area report were zoom-driven; they hang off the camera now instead.
      onCameraChange: (k) => {
        positionMarkers(k);
        scheduleVisibleAreaReport(width, h);
      },
      group: g as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
      region: NL_REGION,
      width,
      height: h,
    });
    projectionRef.current = basemap.projection;
    basemapRef.current = basemap;

    const project = (p: [number, number]) => basemap.projection(p) as [number, number] | null;
    const { markers, unplaced } = buildUsageMarkers(locations, cityRows, project);
    markersRef.current = markers;
    cbRef.current.onMarkersBuilt?.({ markers, unplaced });

    const markerLayer = g.append('g').attr('class', 'usage-markers');

    // Painter's order: LARGEST first so the smallest markers are drawn last and therefore
    // sit on top. Without this, a big Randstad dot would swallow its small neighbours'
    // hover and click targets (FR-011).
    const ordered = [...markers].sort((a, b) => b.diameter - a.diameter);

    const groups = markerLayer
      .selectAll<SVGGElement, UsageMarker>('g.usage-marker')
      .data(ordered, (d) => d.nameId)
      .join('g')
      .attr('class', 'usage-marker')
      .style('cursor', 'pointer');

    groups.each(function (d) {
      const sel = d3.select(this);
      if (d.shape === 'dot') {
        // A participating gemeente is a PIE, split Groei / GemeenteDelers — the same
        // split language the city-population scatter uses (utils/pie.ts). Size still
        // encodes how many initiatives; the slices encode where they come from.
        const r = d.diameter / 2;
        for (const slice of pieSlices(d.groeiCount, d.gdCount, r)) {
          sel.append('path').attr('d', slice.d).attr('fill', slice.fill).attr('fill-opacity', 0.9);
        }
        // One outline over the whole pie, so slice seams don't read as separate markers.
        sel
          .append('circle')
          .attr('r', r)
          .attr('fill', 'none')
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1)
          .attr('class', 'marker-outline');
      } else {
        // Grey square for a gemeente taking part in nothing — distinguishable from the
        // smallest dot by BOTH shape and colour (FR-009).
        sel
          .append('rect')
          .attr('x', -d.diameter / 2)
          .attr('y', -d.diameter / 2)
          .attr('width', d.diameter)
          .attr('height', d.diameter)
          .attr('fill', '#9ca3af')
          .attr('fill-opacity', 0.7)
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 0.75)
          .attr('class', 'marker-outline');
      }
    });

    groups
      // Keyboard and screen-reader access: each marker is a focusable button carrying its
      // name and count, so the map is navigable without a pointer. Enter/Space focuses a
      // gemeente exactly as a click does.
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', (d) => `${d.name}: ${d.initiativeCount}`)
      .on('mouseenter', function (event: MouseEvent, d) {
        cbRef.current.onHover?.(d, { x: event.clientX, y: event.clientY });
      })
      .on('mouseleave', () => cbRef.current.onHover?.(null))
      .on('focus', function (event: FocusEvent, d) {
        const rect = (event.target as SVGGElement).getBoundingClientRect();
        cbRef.current.onHover?.(d, { x: rect.left, y: rect.top });
      })
      .on('blur', () => cbRef.current.onHover?.(null))
      .on('keydown', (event: KeyboardEvent, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          cbRef.current.onFocus(d);
        }
      })
      .on('click', (_event, d) => cbRef.current.onFocus(d));

    /**
     * Position markers and counter-scale them by exactly 1/k, so on-screen size never
     * changes with zoom (FR-015). Zooming spreads the markers apart; it does not inflate
     * them. This is what makes the 3× ratio measurable at any zoom and keeps the legend
     * honest — and it is deliberately NOT ForceGraph's √k behaviour.
     */
    function positionMarkers(k: number) {
      groups.attr('transform', (d) => `translate(${d.x},${d.y}) scale(${1 / k})`);
    }

    // MapLibre owns the camera (feature 021). d3-zoom is deliberately NOT attached: it
    // would write the same `transform` attribute the basemap writes, and — because this
    // SVG sits above the canvas — it would swallow the gesture so MapLibre's camera never
    // moved at all. The behaviour that used to hang off it now hangs off onCameraChange.
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.8, 40]);
    zoomRef.current = zoom;

    positionMarkers(1);
    scheduleVisibleAreaReport(width, h);

    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      // Release the basemap's WebGL context (feature 021).
      basemap.destroy();
    };
  }, [locations, cityRows, height, scheduleVisibleAreaReport]);

  /**
   * Province framing and reset (FR-013, FR-013a, FR-012).
   *
   * Derives a zoom transform from the province's own centre and scale, then applies it to
   * the NATIONAL basemap. The province basemap is used purely as a source of bounds — it
   * is never rendered, because rendering it would mask the neighbouring provinces this
   * feature exists to show.
   */
  useEffect(() => {
    const projection = projectionRef.current;
    const container = containerRef.current;
    const basemap = basemapRef.current;
    if (!projection || !container || !basemap) return;

    const width = container.clientWidth || 800;

    // Framing goes through the basemap's camera, not d3-zoom: MapLibre owns the view and
    // would overwrite a d3-written transform on its next painted frame (feature 021).
    if (!province) {
      basemap.zoomTo({ k: 1, tx: 0, ty: 0 }, 500);
      return;
    }

    const framed = provinceViewTransform(
      province,
      (p) => projection(p) as [number, number] | null,
      width,
      height,
    );
    if (!framed) return;
    basemap.zoomTo(framed, 500);
  }, [province, resetNonce, height]);

  /** Focused-marker treatment, applied without rebuilding the map. */
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    d3.select(svgEl)
      .selectAll<SVGGElement, UsageMarker>('g.usage-marker')
      .each(function (d) {
        const isFocused = d.nameId === focusedNameId;
        // The outline, not the pie slices — a focused marker gets a dark ring while its
        // Groei/GD split stays readable underneath.
        d3.select(this)
          .select('.marker-outline')
          .attr('stroke', isFocused ? '#111827' : '#ffffff')
          .attr('stroke-width', isFocused ? 2.5 : d.shape === 'dot' ? 1 : 0.75);
      });
  }, [focusedNameId]);

  return (
    // Same layer stack as ForceGraph (feature 021, data-model.md §1): the container is
    // the positioning context and carries the background the §VII guard samples; the
    // basemap canvas sits beneath a transparent SVG, so the SVG's opaque complement
    // path masks the canvas exactly as it masked the old <image> tiles.
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-lg bg-white"
      data-testid="map-container"
    >
      <div ref={mapLayerRef} className="absolute inset-0 z-0" aria-hidden="true" />
      {/* pointer-events-none lets pan/zoom reach the basemap canvas beneath; markers opt
          back in so hover and click still work (feature 021). */}
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        role="img"
        aria-label="Netherlands usage map"
        className="relative pointer-events-none [&_.usage-marker]:pointer-events-auto"
      />
      {/* Below the map area, never over it — §VII (feature 021). */}
      {basemapFailed && (
        <MapFallback className="absolute bottom-4 left-0 bg-white/85 pointer-events-auto" />
      )}
      <MapAttribution className="absolute bottom-0 left-0 bg-white/85 pointer-events-auto" />
    </div>
  );
}
