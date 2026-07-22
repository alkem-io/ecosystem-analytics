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
