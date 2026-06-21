import { useState, useEffect } from 'react';
import type { GeoPermissibleObjects } from 'd3-geo';
import type { MapRegion } from '@ea/shared';

// GeoJSON basemaps are static public-domain files served from /maps (see MapOverlay).
const MAP_URLS: Record<MapRegion, string> = {
  world: '/maps/world.geojson',
  europe: '/maps/europe.geojson',
  netherlands: '/maps/netherlands.geojson',
};

// Module-level cache so the region polygon is fetched at most once per region,
// shared across every component that needs it (hits the HTTP cache regardless).
const cache: Partial<Record<MapRegion, GeoPermissibleObjects>> = {};

/**
 * Loads (and memoizes) the GeoJSON polygon for a map region so callers can run
 * point-in-region containment checks. Returns null until the polygon is loaded.
 */
export function useRegionGeoJson(region: MapRegion, enabled: boolean): GeoPermissibleObjects | null {
  const [geo, setGeo] = useState<GeoPermissibleObjects | null>(cache[region] ?? null);

  useEffect(() => {
    if (!enabled) return;
    if (cache[region]) {
      setGeo(cache[region] ?? null);
      return;
    }
    let cancelled = false;
    fetch(MAP_URLS[region])
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        cache[region] = json as GeoPermissibleObjects;
        setGeo(json as GeoPermissibleObjects);
      })
      .catch(() => {
        // Graceful degradation — caller treats null as "region unknown".
      });
    return () => {
      cancelled = true;
    };
  }, [region, enabled]);

  return geo;
}
