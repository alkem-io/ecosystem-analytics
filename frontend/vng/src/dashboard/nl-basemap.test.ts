import { describe, it, expect } from 'vitest';
import { geoMercator, geoPath } from 'd3-geo';
import { buildComplementPath } from '@ea/shared/map/nl-basemap.js';
// The very GeoJSON the app ships and the Playwright specs sample pixels from.
import netherlandsGeoJson from '../../public/maps/netherlands.geojson?raw';

/**
 * CONSTITUTION §VII GATE — guards the SHIPPED masking code.
 *
 * The Playwright specs (tests/vng-map-nl-only.spec.mjs, tests/govtech-map-nl-only.spec.mjs)
 * prove *by sampling real pixels* that a particular complement path hides everything
 * outside the Netherlands and nothing inside it. But they build that path with their own
 * local copy of the algorithm — they never load the application code, so on their own they
 * cannot catch a regression in the component that actually ships.
 *
 * This test closes that gap. It asserts the shipped `buildComplementPath` produces exactly
 * the path string those pixel-verified specs use. The chain is then complete:
 *
 *     pixels verified  →  reference path string  →  shipped function
 *
 * If someone changes the masking geometry in nl-basemap.ts, this fails. Do not "fix" it by
 * updating the expectation — the reference is what was proven correct against real pixels.
 */

// The exact projection the pixel-verified Playwright specs use.
const W = 1400;
const H = 900;

/**
 * The reference implementation, character for character as it appears in
 * tests/vng-map-nl-only.spec.mjs. Deliberately duplicated rather than imported: this test
 * exists to detect the shipped code drifting away from it.
 */
function referenceComplementPath(geoPathFn: ReturnType<typeof geoPath>, projection: ReturnType<typeof geoMercator>, features: unknown[]) {
  return features
    .map((f) => geoPathFn.projection(projection)(f as never))
    .filter(Boolean)
    .join(' ');
}

describe('constitution §VII — the shipped NL complement mask', () => {
  const geo = JSON.parse(netherlandsGeoJson) as { features: unknown[] };
  const projection = geoMercator().center([5.3, 52.2]).scale(7000).translate([W / 2, H / 2]);

  it('produces exactly the path the pixel-verified Playwright specs prove correct', () => {
    const reference = referenceComplementPath(geoPath(), projection, geo.features);
    const shipped = buildComplementPath(geo.features, geoPath().projection(projection));

    expect(shipped).toBe(reference);
  });

  it('produces a non-trivial path (a silently empty mask would render the whole world)', () => {
    const shipped = buildComplementPath(geo.features, geoPath().projection(projection));

    expect(shipped.length).toBeGreaterThan(1000);
    expect(shipped.startsWith('M')).toBe(true);
  });

  it('covers every feature of the region, so no ring is silently dropped', () => {
    const shipped = buildComplementPath(geo.features, geoPath().projection(projection));
    // Each feature contributes at least one subpath; subpaths begin with 'M'.
    const subpaths = shipped.split('M').length - 1;

    expect(subpaths).toBeGreaterThanOrEqual(geo.features.length);
  });
});
