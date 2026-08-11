/**
 * Groei / GemeenteDelers split marks.
 *
 * The dashboard shows the same two-way split in several places — the city-population
 * scatter (feature 018) and the Usage Explorer map (feature 019) — and they must speak the
 * same visual language: Groei in the brand hue, GemeenteDelers in green, one slice each,
 * starting at twelve o'clock and going clockwise. The geometry and the colours live here so
 * a change lands in every pie at once.
 */

/** Groei = brand hue, GemeenteDelers = green — the split language shared by all charts. */
export const GROEI_COLOR = 'var(--primary)';
export const GD_COLOR = '#16a34a';

/** SVG path for a pie slice (angles in degrees, 0° at the top, clockwise). */
export function slicePath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const rad = (deg: number) => (Math.PI / 180) * (deg - 90);
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy + r * Math.sin(rad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

/** One wedge of a Groei/GD split mark. */
export interface PieSlice {
  d: string;
  fill: string;
  kind: 'groei' | 'gd';
}

/**
 * The slices for a Groei/GD split at the given radius.
 *
 * A single-source marker returns ONE full-circle slice rather than a 360° wedge: an arc
 * spanning a full turn degenerates (start and end points coincide) and renders as nothing
 * in some engines. Callers can therefore draw the returned slices unconditionally.
 *
 * Returns an empty array when there is nothing to draw, so a zero-count marker is the
 * caller's decision to make, not a silently empty circle.
 */
export function pieSlices(groeiCount: number, gdCount: number, r: number): PieSlice[] {
  const total = groeiCount + gdCount;
  if (total <= 0) return [];

  const fullCircle = (fill: string, kind: 'groei' | 'gd'): PieSlice[] => [
    {
      // Two half-arcs, because a single 360° arc collapses to a point.
      d: `M ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 Z`,
      fill,
      kind,
    },
  ];

  if (gdCount === 0) return fullCircle(GROEI_COLOR, 'groei');
  if (groeiCount === 0) return fullCircle(GD_COLOR, 'gd');

  const groeiDeg = (groeiCount / total) * 360;
  return [
    { d: slicePath(0, 0, r, 0, groeiDeg), fill: GROEI_COLOR, kind: 'groei' },
    { d: slicePath(0, 0, r, groeiDeg, 360), fill: GD_COLOR, kind: 'gd' },
  ];
}
