import { describe, it, expect } from 'vitest';
import { zoomForScale } from '@ea/shared/map/basemap.js';

/**
 * R-005: the MapLibre camera must be seeded to the same world scale as the region's d3
 * `geoMercator`, so the two projections agree everywhere given they share a centre.
 *
 * d3 spreads the world over `2π · scale`; MapLibre over `512 · 2^zoom`.
 */
describe('zoomForScale', () => {
  it('matches d3 world width to MapLibre world width', () => {
    for (const scale of [180, 900, 7000, 24000]) {
      const worldFromD3 = 2 * Math.PI * scale;
      const worldFromMapLibre = 512 * Math.pow(2, zoomForScale(scale));
      expect(worldFromMapLibre).toBeCloseTo(worldFromD3, 6);
    }
  });

  it('gives the Netherlands a sane zoom for its reference scale', () => {
    // mapConfig.ts: netherlands scale 7000. Roughly a country-filling view.
    const z = zoomForScale(7000);
    expect(z).toBeGreaterThan(6);
    expect(z).toBeLessThan(8);
  });

  it('is monotonic — a larger d3 scale is a closer camera', () => {
    expect(zoomForScale(24000)).toBeGreaterThan(zoomForScale(7000));
    expect(zoomForScale(7000)).toBeGreaterThan(zoomForScale(180));
  });

  it('doubling the d3 scale is exactly one zoom level', () => {
    expect(zoomForScale(14000) - zoomForScale(7000)).toBeCloseTo(1, 12);
  });
});
