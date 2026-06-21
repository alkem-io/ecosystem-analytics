import { describe, it, expect } from 'vitest';
import { buildRegionFillPath, type GeoFeatureLike } from '@ea/shared/graph/regionFill.js';

/**
 * Unit coverage for the Netherlands-only fill-path builder (constitution §VII /
 * FR-048). The pixel-level mandate is enforced by tests/vng-map-nl-only.spec.mjs;
 * this checks the path construction is sound (reversed rings, closed subpaths).
 */
describe('buildRegionFillPath', () => {
  const identity = (c: [number, number]): [number, number] => c;

  it('reverses each ring and emits a closed subpath per polygon', () => {
    const square: GeoFeatureLike = {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      },
    };
    const d = buildRegionFillPath([square], identity);
    // Reversed point order: first point after M is the original LAST point (0,0),
    // then (0,10), (10,10), (10,0), back to (0,0).
    expect(d.startsWith('M0.0,0.0L0.0,10.0L10.0,10.0L10.0,0.0L0.0,0.0Z')).toBe(true);
  });

  it('handles MultiPolygon (one subpath per polygon) and skips degenerate rings', () => {
    const multi: GeoFeatureLike = {
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 0]]],
          [[[5, 5], [6, 5]]], // degenerate (<3 pts) → skipped
        ],
      },
    };
    const d = buildRegionFillPath([multi], identity);
    expect((d.match(/M/g) ?? []).length).toBe(1);
    expect(d.endsWith('Z')).toBe(true);
  });
});
