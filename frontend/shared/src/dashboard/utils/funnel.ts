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
import { forceCollide, forceSimulation, forceX, type SimulationNodeDatum } from 'd3';
import type { PhaseDistribution } from '@server/types/api.js';
import type { InitiativeRow } from './initiatives.js';

// ── Tunables ────────────────────────────────────────────────────────────────────
// Every constant that shapes the funnel lives here, so the visual can be adjusted
// without touching the layout logic.

/**
 * Shares of the funnel's horizontal extent, as fixed design ratios — NOT data-derived:
 * the shape must not change when the corpus does (FR-012b forbids stretching the
 * geometry to make room).
 *
 * `FORMATION` is the leading stage that precedes the authored vocabulary. `ENTRY` is the
 * FIRST authored phase, which gets the mouth's old generosity because it is where the
 * volume structurally is: the whole GemeenteDelers programme lands there, so it is the
 * container that decides the global dot scale (research R-002/R-003). Whatever is left
 * is split evenly between the remaining phases.
 */
const FORMATION_LENGTH_SHARE = 0.13;
const ENTRY_LENGTH_SHARE = 0.27;

/**
 * Aperture at the mouth and at the outlet, as a share of the available height.
 *
 * The mouth is pinned near the top of whatever vertical room the tab has — it cannot
 * grow further without the funnel scrolling, which FR-006 forbids — so the mouth:outlet
 * RATIO is set by the outlet. At 0.94 : 0.11 the mouth is roughly 8.5× the neck, twice
 * the ratio the first cut drew, which is what gives the silhouette a real neck rather
 * than a tapering wedge.
 */
const APERTURE_START = 0.94;
const APERTURE_END = 0.11;

/**
 * How hard the walls bend, as the exponent of the ease-out taper below. Higher = more
 * concave: the bend concentrates further toward the mouth and the neck runs longer.
 */
const TAPER_EXPONENT = 2.6;

/**
 * Vertical share reserved below the funnel for the "no phase" holding area — reserved
 * ONLY when something is actually held. An empty holding band is a sixth of the height
 * spent on nothing, and the mouth is the part of a funnel that wants that height.
 */
const HOLDING_HEIGHT_SHARE = 0.16;
/** Gap between the funnel's lowest point and the holding area (keeps I-8 comfortable). */
const HOLDING_GAP = 14;

/** Packing efficiency assumed when fitting the global scale (research R-003). */
const PACKING_EFFICIENCY = 0.6;
/**
 * Most of a container's narrowest aperture that its largest dot may occupy. Below 1 so a
 * dot in the neck is visibly INSIDE the funnel rather than wedged between the two bars
 * and touching both.
 */
const NECK_FILL = 0.78;
/** Padding added to each dot's radius during collision relaxation. */
const COLLIDE_PADDING = 1.2;
/**
 * Pull toward a dot's rank-derived target x during relaxation. Weak on purpose:
 * collision still decides who sits where when a band is crowded, so the result is a
 * left-to-right GRADIENT by participation rather than a rigid queue.
 */
const ORDER_STRENGTH = 0.22;
/**
 * Narrowest share of a mixed stage's band either source may be squeezed into. The
 * GemeenteDelers block and the Groei block are laid out side by side and sized by how
 * much dot area each needs, but neither is allowed to become a sliver.
 */
const MIN_GROUP_SHARE = 0.12;
/** Fixed tick budget — the simulation is run synchronously to rest, never animated. */
const TICKS = 260;

/** Bounds on the fitted global scale factor `s`. MIN keeps the smallest dot hoverable. */
const MIN_SCALE = 3.4;
const MAX_SCALE = 11;
/** Absolute floor on a drawn radius, whatever the fit produces (FR-013, SC-010). */
export const MIN_R = 3.4;

/**
 * Synthetic key of the leading "Formation" stage. Never a ClassificationValue.id.
 *
 * Formation is not (yet) an authored phase in Alkemio — it is drawn by the funnel so the
 * pipeline shows the step that precedes pre-intake, and it is therefore always empty: no
 * initiative can carry a phase value that does not exist. When the vocabulary gains a
 * real formation value, delete this stage and it will appear like any other phase.
 */
export const FORMATION_STAGE_KEY = '__formation__';
/** The `unknown` bucket key emitted by the server's phase distribution. */
const UNKNOWN_PHASE_KEY = 'unknown';

// ── Types ───────────────────────────────────────────────────────────────────────

export type StageKind = 'formation' | 'phase';

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
  /** `FORMATION_STAGE_KEY` for the leading stage, else the phase's `ClassificationValue.id`. */
  key: string;
  kind: StageKind;
  /** Authored phase label, rendered verbatim. Null for Formation (the caller localises). */
  label: string | null;
  /** 0-based position, Formation first. */
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
  /**
   * Vertical share held back below the curves for the holding area — 0 when nothing is
   * held. Pass it to {@link envelope} to reconstruct the geometry these dots sit in.
   */
  holdingShare: number;
  /** True when no phase stage could be derived; the caller renders FR-025's empty state. */
  noPhaseVocabulary: boolean;
}

export interface FunnelInput {
  rows: InitiativeRow[];
  /** Phase vocabulary in AUTHORED order. Empty when the dashboard designates none. */
  phases: PhaseDistribution['phases'];
  width: number;
  height: number;
}

// ── Envelope geometry ───────────────────────────────────────────────────────────

/**
 * Wall taper: 0 at the mouth, 1 at the outlet, strictly increasing.
 *
 * This is what makes the silhouette read as a FUNNEL rather than a wedge. A funnel —
 * kitchen or conceptual — has a broad head whose walls fall away steeply and then
 * flatten into a long, near-parallel neck; the canonical innovation funnel is described
 * in exactly those terms ("widen the mouth, narrow the neck"), and funnel charts draw
 * those walls as inward-bowing bezier curves.
 *
 * The previous easing was smoothstep, `t²(3−2t)`. That is an S: flat at BOTH ends and
 * steep in the middle, which draws a straight-sided cone with no pinch at all. An
 * ease-out puts the entire bend at the mouth end, so the aperture collapses early and
 * then holds — a concave wall and a real neck.
 */
function taper(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, TAPER_EXPONENT);
}

/**
 * Geometry closure for one funnel size. `aperture` is strictly non-increasing (I-7).
 *
 * `holdingShare` is the vertical fraction kept below the curves for unphased
 * initiatives; pass 0 when there are none. Callers checking a laid-out funnel should
 * pass `layout.holdingShare` rather than assuming the default, or their envelope will
 * not be the one the dots were placed in.
 */
export function envelope(width: number, height: number, holdingShare = HOLDING_HEIGHT_SHARE) {
  const usable = height * (1 - holdingShare);
  const a0 = usable * APERTURE_START;
  const a1 = usable * APERTURE_END;
  const t = (x: number) => taper(width > 0 ? x / width : 0);
  const aperture = (x: number) => a0 + (a1 - a0) * t(x);
  // The midline drifts down slightly so the two bars converge asymmetrically, as drawn
  // on the reference whiteboard: the upper curve falls faster than the lower one rises.
  const midline = (x: number) => usable / 2 + usable * 0.06 * t(x);
  const upper = (x: number) => midline(x) - aperture(x) / 2;
  const lower = (x: number) => midline(x) + aperture(x) / 2;
  return { aperture, midline, upper, lower, usable };
}

// 96 samples, not 64: the curvature is concentrated in the first fifth of the span, and
// at 64 the bend visibly facets there.
function samplePolyline(f: (x: number) => number, width: number, steps = 96): [number, number][] {
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
  targetX?: (dot: FunnelDot) => number,
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
  // The ordering force, when the caller asked for one. Collision alone would scatter the
  // dots; this holds the left-to-right gradient while collision keeps them from overlapping.
  if (targetX) {
    sim.force('order', forceX<SimNode>((n) => targetX(n.dot)).strength(ORDER_STRENGTH));
  }

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

/**
 * Left-to-right reading order inside a band: fewest participating gemeentes on the left,
 * most on the right, so a stage's own dots carry the same "further right = further on"
 * grammar the funnel's stages do. Ties break on id so the order is deterministic.
 */
function byParticipation(a: FunnelDot, b: FunnelDot): number {
  return a.g - b.g || a.id.localeCompare(b.id);
}

/**
 * Place one group of dots into a sub-band, ordered by participation.
 *
 * Returns the target-x function; the caller hands it to `relax`. Rank is spread across
 * the band inset by each dot's own radius so the first and last dots are not asked to
 * sit half outside it.
 */
function targetXByRank(dots: FunnelDot[], x0: number, x1: number): (dot: FunnelDot) => number {
  const order = [...dots].sort(byParticipation);
  const targets = new Map<string, number>();
  order.forEach((dot, i) => {
    const u = order.length > 1 ? i / (order.length - 1) : 0.5;
    targets.set(dot.id, x0 + dot.r + (x1 - x0 - 2 * dot.r) * u);
  });
  return (dot) => targets.get(dot.id) ?? (x0 + x1) / 2;
}

/** Build the funnel layout. See contracts/funnel-layout.md for the invariants. */
export function layoutFunnel(input: FunnelInput): FunnelLayout {
  const { rows, phases, width, height } = input;

  const phaseValues = (phases ?? []).filter((p) => p.key !== UNKNOWN_PHASE_KEY);
  const empty: FunnelLayout = {
    width: Math.max(0, width),
    height: Math.max(0, height),
    upper: [],
    lower: [],
    stages: [],
    holding: null,
    scale: MIN_SCALE,
    holdingShare: 0,
    noPhaseVocabulary: phaseValues.length === 0,
  };
  // React measures 0×0 on first paint — return an empty layout rather than throwing.
  if (!(width > 0) || !(height > 0)) return empty;

  // ── Stages: Formation, then the phase vocabulary in authored order ──
  const phaseCount = phaseValues.length;
  const formationLength = phaseCount > 0 ? width * FORMATION_LENGTH_SHARE : width;
  // The first authored phase is the ENTRY band and gets its own generous share; the rest
  // split what remains. With a single authored phase there is no "rest", so entry takes
  // everything after Formation.
  const entryLength =
    phaseCount === 0 ? 0 : phaseCount === 1 ? width - formationLength : width * ENTRY_LENGTH_SHARE;
  const restLength = phaseCount > 1 ? (width - formationLength - entryLength) / (phaseCount - 1) : 0;
  const stageCount = phaseCount + 1;

  const stages: FunnelStage[] = [];
  const ramp = (i: number) => (stageCount > 1 ? i / (stageCount - 1) : 0);
  stages.push({
    key: FORMATION_STAGE_KEY,
    kind: 'formation',
    label: null,
    index: 0,
    x0: 0,
    x1: formationLength,
    money: ramp(0),
    effort: ramp(0),
    dots: [],
  });
  let cursor = formationLength;
  phaseValues.forEach((p, i) => {
    const length = i === 0 ? entryLength : restLength;
    const x0 = cursor;
    cursor += length;
    stages.push({
      key: p.key,
      kind: 'phase',
      label: p.label,
      index: i + 1,
      x0,
      // Pin the last stage to the full width so float drift cannot leave a sliver.
      x1: i === phaseCount - 1 ? width : cursor,
      money: ramp(i + 1),
      effort: ramp(i + 1),
      dots: [],
    });
  });
  /** The first authored phase — pre-intake in the VNG vocabulary. Undefined if none. */
  const entryStage = stages.find((s) => s.kind === 'phase');

  // ── Assign every row to a stage or to the holding area (I-1) ──
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const holdingRows: InitiativeRow[] = [];
  const assigned = new Map<FunnelStage, InitiativeRow[]>(stages.map((s) => [s, []]));
  for (const row of rows) {
    if (row.kind === 'gd') {
      // GemeenteDelers initiatives are Callouts and carry no phase classification of
      // their own, but they are all at the same point in the pipeline — the entry phase.
      // Keyed on POSITION (the first authored value), not on a label or id: the
      // vocabulary lives in Alkemio and this module never restates its values.
      if (entryStage) assigned.get(entryStage)!.push(row);
      // No phase vocabulary at all — the caller renders the FR-025 empty state, but the
      // row is still held rather than dropped (I-1 outranks tidiness).
      else holdingRows.push(row);
      continue;
    }
    const stage = row.phase ? byKey.get(row.phase.key) : undefined;
    // No phase, or a phase whose value is not in this vocabulary (it drifted mid-session):
    // held, never dropped. I-1 outranks tidiness.
    if (stage && stage.kind === 'phase') assigned.get(stage)!.push(row);
    else holdingRows.push(row);
  }

  // ── Geometry, now that we know whether the holding band is needed ──
  // Built here and not earlier: an unused holding band would otherwise cost the mouth a
  // sixth of its height, and only the row assignment above can say whether it is used.
  const holdingShare = holdingRows.length > 0 ? HOLDING_HEIGHT_SHARE : 0;
  const { aperture, upper, lower } = envelope(width, height, holdingShare);

  // ── Fit ONE global scale to the binding container (FR-012a/FR-012b, R-003) ──
  const holdingBox = {
    x0: 0,
    y0: height * (1 - holdingShare) + HOLDING_GAP,
    x1: width,
    y1: height,
  };
  const containers: { area: number; rows: InitiativeRow[]; narrowest: number }[] = stages.map(
    (s) => ({
      area: bandArea(s.x0, s.x1, aperture),
      rows: assigned.get(s)!,
      // The aperture is non-increasing (I-7), so a stage's narrowest point is its right
      // edge. A dot that fits there fits anywhere in the band.
      narrowest: aperture(s.x1),
    }),
  );
  if (holdingRows.length > 0) {
    containers.push({
      area: Math.max(0, (holdingBox.x1 - holdingBox.x0) * (holdingBox.y1 - holdingBox.y0)),
      rows: holdingRows,
      narrowest: holdingBox.y1 - holdingBox.y0,
    });
  }
  let scale = MAX_SCALE;
  for (const c of containers) {
    if (c.rows.length === 0) continue;
    const demand = c.rows.reduce((sum, r) => sum + areaUnit(r.gemeentes.length), 0);
    if (demand > 0) {
      scale = Math.min(scale, Math.sqrt((PACKING_EFFICIENCY * c.area) / (Math.PI * demand)));
    }
    // The area fit above reasons about TOTALS, which says nothing about whether any one
    // dot fits. A late stage holding a single well-connected initiative has area to spare
    // and an aperture narrower than that initiative's disc — and the dot then draws
    // straight through the bounding bar. Cap the scale so the largest dot in each
    // container fits across that container's narrowest aperture.
    const widest = Math.max(...c.rows.map((r) => areaUnit(r.gemeentes.length)));
    if (widest > 0 && c.narrowest > 0) {
      scale = Math.min(scale, (NECK_FILL * c.narrowest) / (2 * Math.sqrt(widest)));
    }
  }
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

  const toDot = (row: InitiativeRow): FunnelDot => {
    const g = row.gemeentes.length;
    return { id: row.id, row, g, r: radiusFor(g, scale), x: 0, y: 0 };
  };

  // ── Place the dots ──
  for (const stage of stages) {
    const dots = assigned.get(stage)!.map(toDot);
    stage.dots = dots;

    // A stage that mixes the two sources splits its band: GemeenteDelers on the left,
    // Groei on the right. Only the entry stage ever does, and there the split says
    // something true — the GD programme entered the pipeline ahead of the Groei
    // initiatives now sitting in the same phase. The split is a hard partition (each
    // group is clamped to its own sub-band), not a preference, so no Groei dot can
    // drift left of the GD block.
    const gd = dots.filter((d) => d.row.kind === 'gd');
    const groei = dots.filter((d) => d.row.kind !== 'gd');
    const bands: { dots: FunnelDot[]; x0: number; x1: number }[] = [];
    if (gd.length > 0 && groei.length > 0) {
      // Sized by how much dot area each side needs, so 300 GD dots and 5 Groei dots do
      // not each get half the band. Clamped so neither side becomes a sliver.
      const demand = (ds: FunnelDot[]) => ds.reduce((sum, d) => sum + areaUnit(d.g), 0);
      const gdDemand = demand(gd);
      const share = Math.min(
        1 - MIN_GROUP_SHARE,
        Math.max(MIN_GROUP_SHARE, gdDemand / (gdDemand + demand(groei))),
      );
      const split = stage.x0 + (stage.x1 - stage.x0) * share;
      bands.push({ dots: gd, x0: stage.x0, x1: split }, { dots: groei, x0: split, x1: stage.x1 });
    } else {
      bands.push({ dots, x0: stage.x0, x1: stage.x1 });
    }

    for (const band of bands) {
      const clampX = (dot: FunnelDot) => Math.min(band.x1 - dot.r, Math.max(band.x0 + dot.r, dot.x));
      relax(
        band.dots,
        seedIn(band.x0, band.x1, (x) => ({ top: upper(x) + 1, bottom: lower(x) - 1 })),
        (dot) => {
          // Horizontal band first, then the curve evaluated at the dot's OWN x (FR-016c).
          dot.x = clampX(dot);
          const top = upper(dot.x) + dot.r;
          const bottom = lower(dot.x) - dot.r;
          dot.y = bottom < top ? (top + bottom) / 2 : Math.min(bottom, Math.max(top, dot.y));
        },
        targetXByRank(band.dots, band.x0, band.x1),
      );
    }
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
      targetXByRank(dots, holdingBox.x0, holdingBox.x1),
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
    holdingShare,
    noPhaseVocabulary: phaseCount === 0,
  };
}
