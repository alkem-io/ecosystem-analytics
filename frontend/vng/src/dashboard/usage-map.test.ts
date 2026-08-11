import { describe, expect, it } from 'vitest';
import { geoMercator } from 'd3-geo';
import {
  USAGE_MAP_BASEMAP_REGION,
  provinceViewTransform,
} from '@ea/shared/map/UsageMap.js';
import { PROVINCE_BASEMAPS } from '@ea/shared/map/province-basemaps.generated.js';
import { resolveMapConfig, PROVINCE_REGION_OPTIONS } from '@ea/shared/map/mapConfig.js';

/**
 * The two map boundaries the Usage Explorer must satisfy AT THE SAME TIME:
 *
 *   • Constitution §VII — nothing outside the NETHERLANDS is ever rendered.
 *   • FR-013a — selecting a province must NOT hide the neighbouring provinces, because a
 *     gemeente just over a provincial border is exactly the neighbour the feature exists
 *     to reveal.
 *
 * Both hold only if the rendered basemap stays the whole country and province selection
 * is expressed purely as a zoom transform. Switching to a masked province basemap would
 * satisfy §VII while silently breaking FR-013a — a regression no pixel test of the NL
 * outline would catch, because the result still shows "only the Netherlands".
 */

const W = 1400;
const H = 900;

const nlConfig = resolveMapConfig(USAGE_MAP_BASEMAP_REGION);
const projection = geoMercator()
  .center(nlConfig.center)
  .scale(nlConfig.scale)
  .translate([W / 2, H / 2]);
const project = (p: [number, number]) => projection(p) as [number, number] | null;

describe('Usage Explorer basemap region', () => {
  it('is the whole Netherlands, never a masked province basemap (§VII + FR-013a)', () => {
    expect(USAGE_MAP_BASEMAP_REGION).toBe('netherlands');
    expect(resolveMapConfig(USAGE_MAP_BASEMAP_REGION).masked).toBe(true);
    expect(resolveMapConfig(USAGE_MAP_BASEMAP_REGION).kind).toBe('netherlands');
  });

  it('confirms province basemaps ARE masked — which is why they are not rendered here', () => {
    // If this ever became false the reasoning above would need revisiting; the point is
    // that a province basemap hides its surroundings, and this map must not.
    for (const { region } of PROVINCE_REGION_OPTIONS) {
      expect(resolveMapConfig(region).masked, region).toBe(true);
    }
  });
});

describe('provinceViewTransform', () => {
  it('centres the province in the viewport', () => {
    for (const { region } of PROVINCE_REGION_OPTIONS) {
      const framed = provinceViewTransform(region, project, W, H)!;
      const centre = project(PROVINCE_BASEMAPS[region].center)!;

      // Applying the transform must land the province centre at the viewport centre.
      expect(framed.k * centre[0] + framed.tx, region).toBeCloseTo(W / 2, 6);
      expect(framed.k * centre[1] + framed.ty, region).toBeCloseTo(H / 2, 6);
    }
  });

  it('magnifies by the ratio between the province and national basemap scales', () => {
    for (const { region } of PROVINCE_REGION_OPTIONS) {
      const framed = provinceViewTransform(region, project, W, H)!;
      expect(framed.k, region).toBeCloseTo(
        PROVINCE_BASEMAPS[region].scale / nlConfig.scale,
        10,
      );
      // Every province is more magnified than the whole country, never less.
      expect(framed.k, region).toBeGreaterThan(1);
    }
  });

  it('keeps neighbouring territory in frame rather than cropping to the province (FR-013a)', () => {
    // Utrecht is the most magnified province and therefore the tightest frame. Even so,
    // the visible extent must be a rectangle around it — not a mask — so gemeentes in
    // adjoining provinces that fall inside that rectangle are still drawn and counted.
    const framed = provinceViewTransform('utrecht', project, W, H)!;
    const x0 = (0 - framed.tx) / framed.k;
    const x1 = (W - framed.tx) / framed.k;

    // A point just outside Utrecht (westwards, into Zuid-Holland) still falls in view.
    const neighbour = project([4.6, 52.08])!;
    expect(neighbour[0]).toBeGreaterThan(x0);
    expect(neighbour[0]).toBeLessThan(x1);
  });

  it('returns null rather than throwing when a centre cannot be projected', () => {
    expect(provinceViewTransform('utrecht', () => null, W, H)).toBeNull();
  });
});
