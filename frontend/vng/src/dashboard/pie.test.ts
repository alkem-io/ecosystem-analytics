import { describe, expect, it } from 'vitest';
import { pieSlices, slicePath, GROEI_COLOR, GD_COLOR } from '@ea/shared/dashboard/utils/pie.js';

/**
 * The Groei / GemeenteDelers split mark, shared by the city-population scatter and the
 * Usage Explorer map. Two failure modes are worth pinning because both render as
 * "nothing visible" rather than as an error:
 *
 *   • A single-source marker drawn as a 360° arc degenerates — start and end points
 *     coincide, and some engines draw an empty path. Hence the full-circle special case.
 *   • A zero-count marker must produce no slices at all, so the caller decides what a
 *     non-participating gemeente looks like rather than getting a silently empty circle.
 */

describe('pieSlices', () => {
  it('returns a single full circle when every initiative is Groei', () => {
    const slices = pieSlices(4, 0, 10);
    expect(slices).toHaveLength(1);
    expect(slices[0].kind).toBe('groei');
    expect(slices[0].fill).toBe(GROEI_COLOR);
    // Two half-arcs, not one 360° arc — the degenerate case this guards against.
    expect(slices[0].d.match(/A /g)).toHaveLength(2);
  });

  it('returns a single full circle when every initiative is GemeenteDelers', () => {
    const slices = pieSlices(0, 3, 10);
    expect(slices).toHaveLength(1);
    expect(slices[0].kind).toBe('gd');
    expect(slices[0].fill).toBe(GD_COLOR);
  });

  it('splits into two wedges when both sources are present', () => {
    const slices = pieSlices(3, 1, 10);
    expect(slices.map((s) => s.kind)).toEqual(['groei', 'gd']);
    expect(slices[0].fill).toBe(GROEI_COLOR);
    expect(slices[1].fill).toBe(GD_COLOR);
  });

  it('gives the Groei wedge an arc proportional to its share', () => {
    // 3 of 4 → 270°, which crosses the half-turn mark and needs the large-arc flag.
    const [groei, gd] = pieSlices(3, 1, 10);
    expect(groei.d).toContain('A 10 10 0 1 1'); // large-arc = 1
    expect(gd.d).toContain('A 10 10 0 0 1'); // remaining 90°, large-arc = 0
  });

  it('draws nothing for a gemeente with no initiatives', () => {
    expect(pieSlices(0, 0, 10)).toEqual([]);
  });

  it('scales with the radius, so the split reads the same on any marker size', () => {
    for (const r of [3.5, 7, 10.5]) {
      const [groei] = pieSlices(1, 1, r);
      expect(groei.d).toContain(`A ${r} ${r}`);
    }
  });
});

describe('slicePath', () => {
  it('starts at twelve o’clock and runs clockwise', () => {
    // A quarter turn from 0° should end at the three o'clock position. Coordinates come
    // from trig, so compare numerically — cos(90°) is 6.1e-17, not a clean zero.
    const d = slicePath(0, 0, 10, 0, 90);
    const [, lineX, lineY, arcX, arcY] = d
      .match(/^M 0 0 L (\S+) (\S+) A 10 10 0 0 1 (\S+) (\S+) Z$/)!
      .map(Number);

    expect(lineX).toBeCloseTo(0, 10); // starts straight up…
    expect(lineY).toBeCloseTo(-10, 10);
    expect(arcX).toBeCloseTo(10, 10); // …and arcs round to the right
    expect(arcY).toBeCloseTo(0, 10);
  });

  it('sets the large-arc flag only beyond a half turn', () => {
    expect(slicePath(0, 0, 10, 0, 179)).toContain('A 10 10 0 0 1');
    expect(slicePath(0, 0, 10, 0, 181)).toContain('A 10 10 0 1 1');
  });
});
