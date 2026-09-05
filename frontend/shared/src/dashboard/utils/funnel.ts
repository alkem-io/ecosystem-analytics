/**
 * The innovation funnel's layout (feature 022) — pure geometry over initiative rows.
 *
 * The funnel runs LEFT → RIGHT. Stages are vertical bands. The dimension that narrows is
 * the APERTURE (the vertical distance between the upper and lower bounding curve at a
 * given x); a stage's horizontal extent is its LENGTH. Those two words are used
 * consistently here and in the spec artefacts; "width" is deliberately avoided because
 * the spec uses it for the aperture.
 *
 * Everything in this module is pure and side-effect free: no DOM, no clock, no I/O. Same
 * input yields the same STRUCTURE and the same RADII. Dot COORDINATES are settled by
 * collision relaxation and are not guaranteed identical between calls — see
 * specs/022-vng-funnel-view/contracts/funnel-layout.md, whose ten invariants are the
 * contract this module is tested against. Never assert a dot coordinate.
 */
import { forceCollide, forceSimulation, type SimulationNodeDatum } from 'd3';
import type { PhaseDistribution } from '@server/types/api.js';
import type { InitiativeRow } from './initiatives.js';

// ── Tunables ────────────────────────────────────────────────────────────────────
// Every constant that shapes the funnel lives here, so the visual can be adjusted
// without touching the layout logic.

/**
 * Share of the funnel's horizontal extent given to the GemeenteDelers mouth. A fixed
 * design ratio, NOT data-derived: the shape must not change when the corpus does
 * (FR-012b forbids stretching the geometry to make room). The mouth gets more length
 * because it is where the global dot scale is decided (research R-002/R-003).
 */
const MOUTH_LENGTH_SHARE = 0.28;

/** Aperture at the mouth and at the outlet, as a share of the available height. */
const APERTURE_START = 0.94;
const APERTURE_END = 0.24;

/** Vertical share reserved below the funnel for the "no phase" holding area. */
const HOLDING_HEIGHT_SHARE = 0.16;
/** Gap between the funnel's lowest point and the holding area (keeps I-8 comfortable). */
const HOLDING_GAP = 14;

/** Packing efficiency assumed when fitting the global scale (research R-003). */
const PACKING_EFFICIENCY = 0.6;
/** Padding added to each dot's radius during collision relaxation. */
const COLLIDE_PADDING = 1.2;
/** Fixed tick budget — the simulation is run synchronously to rest, never animated. */
const TICKS = 260;

/** Bounds on the fitted global scale factor `s`. MIN keeps the smallest dot hoverable. */
const MIN_SCALE = 3.4;
const MAX_SCALE = 11;
/** Absolute floor on a drawn radius, whatever the fit produces (FR-013, SC-010). */
export const MIN_R = 3.4;

/** Synthetic key of the GemeenteDelers mouth stage. Never a ClassificationValue.id. */
export const GD_STAGE_KEY = '__gd__';
/** The `unknown` bucket key emitted by the server's phase distribution. */
const UNKNOWN_PHASE_KEY = 'unknown';

// ── Types ───────────────────────────────────────────────────────────────────────

export type StageKind = 'gd' | 'phase';

export interface FunnelDot {
  /** GraphNode id. */
  id: string;
  /** The initiative behind this dot, carried for the hover card (FR-018). */
  row: InitiativeRow;
  /** Participating gemeente count — `row.gemeentes.length`. Drives the radius. */
  g: number;
  /** Drawn radius, from the funnel-wide global scale (FR-012a). */
  r: number;
  /** Settled centre. NOT reproducible between calls — never assert these. */
  x: number;
  y: number;
}

export interface FunnelStage {
  /** `GD_STAGE_KEY` for the mouth, else the phase's `ClassificationValue.id`. */
  key: string;
  kind: StageKind;
  /** Authored phase label, rendered verbatim. Null for the GD mouth (caller localises). */
  label: string | null;
  /** 0-based position, mouth first. */
  index: number;
  /** Horizontal band, px. */
  x0: number;
  x1: number;
  /** Relative investment / effort, 0..1. Non-decreasing across stages (FR-009). */
  money: number;
  effort: number;
  dots: FunnelDot[];
}

export interface HoldingArea {
  box: { x0: number; y0: number; x1: number; y1: number };
  dots: FunnelDot[];
}

export interface FunnelLayout {
  width: number;
  height: number;
  /** Sampled polylines for the two curved bounding bars. */
  upper: [number, number][];
  lower: [number, number][];
  stages: FunnelStage[];
  /** Unphased initiatives, held OUTSIDE the curves. Null when there are none (I-10). */
  holding: HoldingArea | null;
  /** The fitted global scale factor `s` — exposed for tests and the legend. */
  scale: number;
  /** True when no phase stage could be derived; the caller renders FR-025's empty state. */
  noPhaseVocabulary: boolean;
}

export interface FunnelInput {
  rows: InitiativeRow[];
  /** Phase vocabulary in AUTHORED order. Empty when the dashboard designates none. */
  phases: PhaseDistribution['phases'];
  width: number;
  height: number;
  /** The GemeenteDelers toggle. */
  gdIncluded: boolean;
}

// ── Envelope geometry ───────────────────────────────────────────────────────────

/** Smooth, monotone-decreasing easing — the bounding bars bow rather than run straight. */
function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Geometry closure for one funnel size. `aperture` is strictly non-increasing (I-7). */
export function envelope(width: number, height: number) {
  const usable = height * (1 - HOLDING_HEIGHT_SHARE);
  const a0 = usable * APERTURE_START;
  const a1 = usable * APERTURE_END;
  const aperture = (x: number) => a0 + (a1 - a0) * ease(width > 0 ? x / width : 0);
  // The midline drifts down slightly so the two bars converge asymmetrically, as drawn
  // on the reference whiteboard: the upper curve falls faster than the lower one rises.
  const midline = (x: number) => usable / 2 + usable * 0.06 * ease(width > 0 ? x / width : 0);
  const upper = (x: number) => midline(x) - aperture(x) / 2;
  const lower = (x: number) => midline(x) + aperture(x) / 2;
  return { aperture, midline, upper, lower, usable };
}

function samplePolyline(f: (x: number) => number, width: number, steps = 64): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (width * i) / steps;
    pts.push([x, f(x)]);
  }
  return pts;
}

// ── Scale fitting ───────────────────────────────────────────────────────────────

/** Dot AREA is affine in log participation; radius follows. See research R-003. */
function areaUnit(g: number): number {
  return 1 + Math.log(1 + Math.max(0, g));
}

/** Radius for a participation count at a given global scale. */
export function radiusFor(g: number, scale: number): number {
  return Math.max(MIN_R, scale * Math.sqrt(areaUnit(g)));
}

/** Area under the curves within a horizontal band, by trapezoidal integration. */
function bandArea(x0: number, x1: number, aperture: (x: number) => number): number {
  const steps = 24;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const xa = x0 + ((x1 - x0) * i) / steps;
    const xb = x0 + ((x1 - x0) * (i + 1)) / steps;
    sum += ((aperture(xa) + aperture(xb)) / 2) * (xb - xa);
  }
  return sum;
}

// ── Layout ──────────────────────────────────────────────────────────────────────

interface SimNode extends SimulationNodeDatum {
  dot: FunnelDot;
}

/**
 * Relax a set of dots inside a container until they no longer overlap, then stop.
 *
 * Run synchronously to a fixed tick budget — there is no animation loop, so the funnel
 * has no perpetual motion in its resting state (FR-016b) and cannot be observed
 * mid-settle. `contain` is applied after every tick and evaluates the boundary at the
 * node's OWN x, which is what makes containment follow the curve rather than a bounding
 * rectangle (FR-016c).
 */
function relax(
  dots: FunnelDot[],
  seed: (dot: FunnelDot, i: number, n: number) => { x: number; y: number },
  contain: (dot: FunnelDot) => void,
): void {
  if (dots.length === 0) return;
  const nodes: SimNode[] = dots.map((dot, i) => {
    const p = seed(dot, i, dots.length);
    dot.x = p.x;
    dot.y = p.y;
    return { dot, x: p.x, y: p.y };
  });

  const sim = forceSimulation(nodes)
    .force('collide', forceCollide<SimNode>((n) => n.dot.r + COLLIDE_PADDING).iterations(3))
    .stop();

  for (let i = 0; i < TICKS; i++) {
    sim.tick();
    for (const n of nodes) {
      n.dot.x = n.x ?? n.dot.x;
      n.dot.y = n.y ?? n.dot.y;
      contain(n.dot);
      n.x = n.dot.x;
      n.y = n.dot.y;
      // Kill residual velocity so containment cannot be undone on the next tick.
      n.vx = 0;
      n.vy = 0;
    }
  }
}

/**
 * Deterministic seed positions: a spread across the container that does not use
 * Math.random, so a given dataset always starts from the same arrangement.
 */
function seedIn(x0: number, x1: number, yAt: (x: number) => { top: number; bottom: number }) {
  return (dot: FunnelDot, i: number, n: number) => {
    // Golden-ratio stride gives an even, non-clumped spread without randomness.
    const t = n > 1 ? ((i * 0.6180339887) % 1) : 0.5;
    const u = n > 1 ? (i + 0.5) / n : 0.5;
    const x = x0 + (x1 - x0) * u;
    const { top, bottom } = yAt(x);
    return { x, y: top + (bottom - top) * t };
  };
}

/** Build the funnel layout. See contracts/funnel-layout.md for the invariants. */
export function layoutFunnel(input: FunnelInput): FunnelLayout {
  const { rows, phases, width, height, gdIncluded } = input;

  const phaseValues = (phases ?? []).filter((p) => p.key !== UNKNOWN_PHASE_KEY);
  const empty: FunnelLayout = {
    width: Math.max(0, width),
    height: Math.max(0, height),
    upper: [],
    lower: [],
    stages: [],
    holding: null,
    scale: MIN_SCALE,
    noPhaseVocabulary: phaseValues.length === 0,
  };
  // React measures 0×0 on first paint — return an empty layout rather than throwing.
  if (!(width > 0) || !(height > 0)) return empty;

  const { aperture, upper, lower } = envelope(width, height);

  // ── Stages: the GD mouth, then the phase vocabulary in authored order ──
  const phaseCount = phaseValues.length;
  const mouthLength = phaseCount > 0 ? width * MOUTH_LENGTH_SHARE : width;
  const phaseLength = phaseCount > 0 ? (width - mouthLength) / phaseCount : 0;
  const stageCount = phaseCount + 1;

  const stages: FunnelStage[] = [];
  const ramp = (i: number) => (stageCount > 1 ? i / (stageCount - 1) : 0);
  stages.push({
    key: GD_STAGE_KEY,
    kind: 'gd',
    label: null,
    index: 0,
    x0: 0,
    x1: mouthLength,
    money: ramp(0),
    effort: ramp(0),
    dots: [],
  });
  phaseValues.forEach((p, i) => {
    const x0 = mouthLength + phaseLength * i;
    stages.push({
      key: p.key,
      kind: 'phase',
      label: p.label,
      index: i + 1,
      x0,
      x1: x0 + phaseLength,
      money: ramp(i + 1),
      effort: ramp(i + 1),
      dots: [],
    });
  });

  // ── Assign every row to a stage or to the holding area (I-1) ──
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const holdingRows: InitiativeRow[] = [];
  const assigned = new Map<FunnelStage, InitiativeRow[]>(stages.map((s) => [s, []]));
  for (const row of rows) {
    if (row.kind === 'gd') {
      // With the toggle off the caller passes no GD rows; if any arrive anyway they
      // still belong to the mouth rather than being dropped.
      assigned.get(stages[0])!.push(row);
      continue;
    }
    const stage = row.phase ? byKey.get(row.phase.key) : undefined;
    // No phase, or a phase whose value is not in this vocabulary (it drifted mid-session):
    // held, never dropped. I-1 outranks tidiness.
    if (stage && stage.kind === 'phase') assigned.get(stage)!.push(row);
    else holdingRows.push(row);
  }

  // ── Fit ONE global scale to the binding container (FR-012a/FR-012b, R-003) ──
  const holdingBox = {
    x0: 0,
    y0: height * (1 - HOLDING_HEIGHT_SHARE) + HOLDING_GAP,
    x1: width,
    y1: height,
  };
  const containers: { area: number; rows: InitiativeRow[] }[] = stages.map((s) => ({
    area: bandArea(s.x0, s.x1, aperture),
    rows: assigned.get(s)!,
  }));
  if (holdingRows.length > 0) {
    containers.push({
      area: Math.max(0, (holdingBox.x1 - holdingBox.x0) * (holdingBox.y1 - holdingBox.y0)),
      rows: holdingRows,
    });
  }
  let scale = MAX_SCALE;
  for (const c of containers) {
    if (c.rows.length === 0) continue;
    const demand = c.rows.reduce((sum, r) => sum + areaUnit(r.gemeentes.length), 0);
    if (demand <= 0) continue;
    scale = Math.min(scale, Math.sqrt((PACKING_EFFICIENCY * c.area) / (Math.PI * demand)));
  }
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

  const toDot = (row: InitiativeRow): FunnelDot => {
    const g = row.gemeentes.length;
    return { id: row.id, row, g, r: radiusFor(g, scale), x: 0, y: 0 };
  };

  // ── Place the dots ──
  for (const stage of stages) {
    stage.dots = assigned.get(stage)!.map(toDot);
    const clampX = (dot: FunnelDot) =>
      Math.min(stage.x1 - dot.r, Math.max(stage.x0 + dot.r, dot.x));
    relax(
      stage.dots,
      seedIn(stage.x0, stage.x1, (x) => ({ top: upper(x) + 1, bottom: lower(x) - 1 })),
      (dot) => {
        // Horizontal band first, then the curve evaluated at the dot's OWN x (FR-016c).
        dot.x = clampX(dot);
        const top = upper(dot.x) + dot.r;
        const bottom = lower(dot.x) - dot.r;
        dot.y = bottom < top ? (top + bottom) / 2 : Math.min(bottom, Math.max(top, dot.y));
      },
    );
  }

  let holding: HoldingArea | null = null;
  if (holdingRows.length > 0) {
    const dots = holdingRows.map(toDot);
    relax(
      dots,
      seedIn(holdingBox.x0, holdingBox.x1, () => ({ top: holdingBox.y0, bottom: holdingBox.y1 })),
      (dot) => {
        dot.x = Math.min(holdingBox.x1 - dot.r, Math.max(holdingBox.x0 + dot.r, dot.x));
        const top = holdingBox.y0 + dot.r;
        const bottom = holdingBox.y1 - dot.r;
        dot.y = bottom < top ? (top + bottom) / 2 : Math.min(bottom, Math.max(top, dot.y));
      },
    );
    holding = { box: holdingBox, dots };
  }

  return {
    width,
    height,
    upper: samplePolyline(upper, width),
    lower: samplePolyline(lower, width),
    stages,
    holding,
    scale,
    noPhaseVocabulary: phaseCount === 0,
  };
}
