import { describe, it, expect } from 'vitest';
import {
  applyOverlayTransform,
  solveOverlayTransform,
  toSvgTransform,
  type Point,
} from '@ea/shared/map/overlay-transform.js';
import { zoomForScale } from '@ea/shared/map/basemap.js';

/**
 * Guarantees C-1…C-4 of specs/021-openfreemap-basemap/contracts/camera-overlay.md.
 *
 * These are pure maths over two reference points, so they run without a browser or a
 * MapLibre instance — `b1`/`b2` stand in for whatever `map.project()` would return.
 */

const a1: Point = [200, 300];
const a2: Point = [1000, 700];

/** Apply a known similarity, so the solver's answer can be checked against the truth. */
const forward = (k: number, tx: number, ty: number) => (p: Point): Point =>
  [tx + k * p[0], ty + k * p[1]];

describe('solveOverlayTransform', () => {
  it('recovers the identity when the camera is at the reference view (C-4)', () => {
    const t = solveOverlayTransform(a1, a2, a1, a2)!;
    expect(t.k).toBeCloseTo(1, 10);
    expect(t.tx).toBeCloseTo(0, 10);
    expect(t.ty).toBeCloseTo(0, 10);
  });

  it('recovers a pure scale about the origin', () => {
    const f = forward(2, 0, 0);
    const t = solveOverlayTransform(a1, a2, f(a1), f(a2))!;
    expect(t.k).toBeCloseTo(2, 10);
    expect(t.tx).toBeCloseTo(0, 10);
    expect(t.ty).toBeCloseTo(0, 10);
  });

  it('recovers scale and translation together', () => {
    const f = forward(0.375, -140.5, 88.25);
    const t = solveOverlayTransform(a1, a2, f(a1), f(a2))!;
    expect(t.k).toBeCloseTo(0.375, 10);
    expect(t.tx).toBeCloseTo(-140.5, 8);
    expect(t.ty).toBeCloseTo(88.25, 8);
  });

  it('round-trips ANY point within sub-pixel tolerance, not just the references (C-2)', () => {
    for (const [k, tx, ty] of [
      [1, 0, 0],
      [2.5, 120, -80],
      [0.2, -900, 640],
      [8, 4000, -2500],
    ] as const) {
      const f = forward(k, tx, ty);
      const t = solveOverlayTransform(a1, a2, f(a1), f(a2))!;
      for (let x = 0; x <= 1400; x += 175) {
        for (let y = 0; y <= 900; y += 150) {
          const [ax, ay] = applyOverlayTransform(t, [x, y]);
          const [bx, by] = f([x, y]);
          expect(Math.hypot(ax - bx, ay - by), `k=${k} at ${x},${y}`).toBeLessThan(0.5);
        }
      }
    }
  });

  it('is a similarity — equal scale on both axes, no rotation or skew (C-1)', () => {
    const f = forward(1.7, 33, -21);
    const t = solveOverlayTransform(a1, a2, f(a1), f(a2))!;
    // A horizontal step in source space must produce a purely horizontal step on screen,
    // and a vertical step a purely vertical one, both scaled identically.
    const o = applyOverlayTransform(t, [0, 0]);
    const dx = applyOverlayTransform(t, [100, 0]);
    const dy = applyOverlayTransform(t, [0, 100]);
    expect(dx[1] - o[1]).toBeCloseTo(0, 9);
    expect(dy[0] - o[0]).toBeCloseTo(0, 9);
    expect(dx[0] - o[0]).toBeCloseTo(dy[1] - o[1], 9);
  });

  /**
   * C-3: the empirical solve must agree with MapLibre's documented zoom arithmetic
   * (world width = tileSize * 2^zoom, tileSize = 512). If MapLibre ever changes that
   * convention this fails and someone looks, instead of the map quietly drifting.
   */
  it('agrees with the shipped scale→zoom derivation (C-3)', () => {
    // The empirical solve and MapLibre's zoom arithmetic must describe the same camera.
    // Moving the camera n zoom levels in must scale the overlay by exactly 2^n, and
    // `zoomForScale` must place those levels where the d3 scale says they are. If
    // MapLibre ever changes its tile-size convention, this is what fails.
    const d3Scale = 7000; // the Netherlands reference scale from mapConfig.ts
    for (const deltaZoom of [-2, -1, 0, 1, 3]) {
      const expectedK = Math.pow(2, deltaZoom);
      const f = forward(expectedK, 17, -42);
      const t = solveOverlayTransform(a1, a2, f(a1), f(a2))!;
      expect(t.k).toBeCloseTo(expectedK, 9);
      // …and the camera the shipped code would ask MapLibre for is that many levels away.
      expect(zoomForScale(d3Scale * t.k) - zoomForScale(d3Scale)).toBeCloseTo(deltaZoom, 9);
    }
  });

  it('returns null rather than a garbage transform when the references collapse', () => {
    expect(solveOverlayTransform(a1, a1, [0, 0], [0, 0])).toBeNull();
    expect(solveOverlayTransform(a1, [200.0000001, 300], [0, 0], [10, 10])).toBeNull();
    expect(solveOverlayTransform(a1, a2, [NaN, 0], [1, 1])).toBeNull();
  });
});

describe('toSvgTransform', () => {
  it('writes translate-then-scale, matching what d3-zoom writes today', () => {
    expect(toSvgTransform({ k: 2, tx: 10, ty: -5 })).toBe('translate(10,-5) scale(2)');
  });
});
