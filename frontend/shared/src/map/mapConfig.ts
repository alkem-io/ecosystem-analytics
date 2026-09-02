import { PROVINCE_BASEMAPS, type ProvinceRegion } from './province-basemaps.generated.js';

export type { ProvinceRegion };

/**
 * The built-in basemaps used by the Explorer region selector. Kept as a narrow
 * union so existing `Record<MapRegion, …>` tables in the Explorer app stay exact.
 */
export type MapRegion = 'world' | 'europe' | 'netherlands';

/**
 * Every region the graph/map layer can render: the built-ins plus the 12 Dutch
 * provinces (province basemaps are generated — see province-basemaps.generated.ts).
 */
export type GraphMapRegion = MapRegion | ProvinceRegion;

export interface ResolvedMapConfig {
  url: string;
  center: [number, number];
  scale: number;
  kind: 'world' | 'europe' | 'netherlands' | 'province';
  /** Base tile zoom level (combined with the live d3-zoom factor at render time). */
  baseZoom: number;
  /**
   * When true, everything outside the region is masked so ONLY the region shows
   * (the Netherlands and each province). World/Europe instead clip to the region.
   */
  masked: boolean;
}

const BUILTINS: Record<MapRegion, ResolvedMapConfig> = {
  world: { url: '/maps/world.geojson', center: [0, 20], scale: 180, kind: 'world', baseZoom: 2, masked: false },
  europe: { url: '/maps/europe.geojson', center: [15, 50], scale: 900, kind: 'europe', baseZoom: 4, masked: false },
  netherlands: { url: '/maps/netherlands.geojson', center: [5.3, 52.2], scale: 7000, kind: 'netherlands', baseZoom: 8, masked: true },
};

// Whole-NL scale reference; province base zoom scales up from NL's zoom 8 by how
// much more the province is magnified (see generate-nl-geo.mts scale derivation).
const NL_SCALE = 7000;

/**
 * The Netherlands' projected size, in pixels per unit of projection scale.
 *
 * Measured once, offline, with `geoPath().projection(geoMercator().center([5.3, 52.2]))`
 * over `public/maps/netherlands.geojson`: at scale 7000 the country projects to
 * 472.67 × 558.84 px. Both dimensions are linear in the scale, so dividing by 7000 gives
 * a constant that converts a desired pixel size back into the scale that produces it.
 *
 * Baked in rather than derived at runtime because the projection has to exist before the
 * GeoJSON is fetched — markers are projected against it immediately — so there is no
 * point at which a measured bounding box would be available in time.
 */
const NL_PX_PER_SCALE = { width: 0.06752373, height: 0.07983454 };

/**
 * The projection scale that makes the Netherlands fill `width` × `height`.
 *
 * Fits the tighter axis so the country is contained rather than cropped, and never
 * returns less than the configured constant — a small viewport keeps today's behaviour
 * (the country slightly overflowing) instead of shrinking to a postage stamp.
 */
export function fitScaleForViewport(width: number, height: number, padding = 24): number {
  const usableWidth = Math.max(width - padding * 2, 1);
  const usableHeight = Math.max(height - padding * 2, 1);
  const fitted = Math.min(
    usableWidth / NL_PX_PER_SCALE.width,
    usableHeight / NL_PX_PER_SCALE.height,
  );
  return Math.max(NL_SCALE, Math.round(fitted));
}

export function isProvinceRegion(region: GraphMapRegion): region is ProvinceRegion {
  return region in PROVINCE_BASEMAPS;
}

export function resolveMapConfig(region: GraphMapRegion): ResolvedMapConfig {
  if (region in BUILTINS) return BUILTINS[region as MapRegion];
  const p = PROVINCE_BASEMAPS[region as ProvinceRegion];
  return {
    url: p.url,
    center: p.center,
    scale: p.scale,
    kind: 'province',
    baseZoom: Math.round(8 + Math.log2(p.scale / NL_SCALE)),
    masked: true,
  };
}

/** The 12 provinces as `{ region, name }`, ordered by CBS code — for region pickers. */
export const PROVINCE_REGION_OPTIONS: { region: ProvinceRegion; name: string }[] = (
  Object.entries(PROVINCE_BASEMAPS) as [ProvinceRegion, { name: string }][]
).map(([region, basemap]) => ({ region, name: basemap.name }));
