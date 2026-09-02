/**
 * Camera → overlay transform (feature 021, contracts/camera-overlay.md).
 *
 * The basemap is drawn by MapLibre into a canvas that owns pan and zoom. Everything
 * above it — the §VII mask, the region borders, the nodes and edges — is drawn in
 * BASE PROJECTION SPACE by d3 and never moves. This module is the bridge: it produces
 * the single affine transform that maps base projection space onto the current screen,
 * which the caller writes onto the zoom group once per frame.
 *
 * Why an affine rather than re-projecting each node: pan/zoom has always been one
 * transform on one group, so a graph of any size costs one attribute write. Node pinning
 * (`fx`/`fy`) and the force simulation keep operating in base projection space, exactly
 * as before. Re-projecting per frame would be O(nodes) AND would drag the simulation's
 * pinned coordinates into the render loop.
 *
 * Why two reference points rather than MapLibre's zoom arithmetic: `worldPx = tileSize *
 * 2^zoom` requires knowing MapLibre's tile-size convention, which is MapLibre's to change.
 * Asking the map where two known points actually are makes the result correct by
 * construction. The arithmetic is kept only as a cross-check in the tests.
 *
 * This is valid ONLY for a north-up, unpitched camera (research R-004). With rotation or
 * pitch the screen mapping stops being a similarity and the overlay would shear away from
 * the imagery — which is why rotation and pitch are disabled when the map is constructed.
 */

export interface OverlayTransform {
  /** Uniform scale. */
  k: number;
  tx: number;
  ty: number;
}

export type Point = [number, number];

/** Squared distance — avoids a sqrt when we only need to reject a degenerate pair. */
function dist2(a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return dx * dx + dy * dy;
}

/**
 * Solve the similarity transform taking `a1 → b1` and `a2 → b2`.
 *
 * Returns `null` when the reference points are too close together to determine a scale —
 * the caller should keep the previous transform rather than write a garbage one. That
 * happens at extreme zoom, when both references project to nearly the same pixel.
 */
export function solveOverlayTransform(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): OverlayTransform | null {
  const da = dist2(a1, a2);
  const db = dist2(b1, b2);
  if (!Number.isFinite(da) || !Number.isFinite(db) || da <= 1e-12) return null;

  const k = Math.sqrt(db / da);
  if (!Number.isFinite(k) || k <= 0) return null;

  return { k, tx: b1[0] - k * a1[0], ty: b1[1] - k * a1[1] };
}

/**
 * Map a point from base projection space to screen space.
 *
 * Not used in production — the overlay moves as one group, so no per-point mapping is
 * needed. Exported because it is how the round-trip property in the contract tests is
 * expressed, and that property is the reason to trust the solve.
 */
export function applyOverlayTransform(t: OverlayTransform, p: Point): Point {
  return [t.tx + t.k * p[0], t.ty + t.k * p[1]];
}

/**
 * The SVG attribute value. Order matters: `translate` then `scale` matches what d3-zoom
 * writes today, so the group's existing content needs no change.
 */
export function toSvgTransform(t: OverlayTransform): string {
  return `translate(${t.tx},${t.ty}) scale(${t.k})`;
}
