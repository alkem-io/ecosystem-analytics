/**
 * The funnel's contract, as executable invariants.
 *
 * These correspond one-to-one with the numbered invariants in
 * specs/022-vng-funnel-view/contracts/funnel-layout.md. Dot POSITIONS are settled by
 * collision relaxation and are not reproducible (spec A-012), so nothing here asserts a
 * coordinate — only structural properties, containment and sizing. If you ever feel the
 * urge to write `expect(dot.x).toBe(...)`, the contract says you are testing the wrong
 * thing.
 */
import { describe, expect, it } from 'vitest';
import type { PhaseDistribution } from '@server/types/api.js';
import {
  GD_STAGE_KEY,
  MIN_R,
  envelope,
  layoutFunnel,
  radiusFor,
} from '@ea/shared/dashboard/utils/funnel.js';
import type { InitiativeRow } from '@ea/shared/dashboard/utils/initiatives.js';

const W = 1200;
const H = 620;

/** The VNG pipeline as authored in Alkemio, in order. */
const PHASES: PhaseDistribution['phases'] = [
  { key: 'p1', label: 'Pre-intake', nr: 0, count: 0, items: [] },
  { key: 'p2', label: 'Intake', nr: 1, count: 0, items: [] },
  { key: 'p3', label: 'Initiatief', nr: 2, count: 0, items: [] },
  { key: 'p4', label: 'Formalisatie', nr: 3, count: 0, items: [] },
  { key: 'p5', label: 'Beheer', nr: 4, count: 0, items: [] },
];

function row(
  id: string,
  kind: 'groei' | 'gd',
  gemeentes: number,
  phaseKey?: string,
): InitiativeRow {
  const phase = phaseKey ? { key: phaseKey, label: phaseKey, nr: 0 } : null;
  return {
    id,
    name: id,
    kind,
    gemeentes: Array.from({ length: gemeentes }, (_, i) => `gemeente-${i}`),
    provinces: [],
    members: null,
    leads: null,
    themes: [],
    nds: [],
    vng2030: [],
    sdg: [],
    awards: [],
    commonGround: false,
    activity: null,
    tier: null,
    phase: kind === 'gd' ? null : phase,
    classifications: [],
  };
}

/** A realistic corpus: ~305 GD in the mouth, ~25 Groei spread over the phases. */
function workingScaleRows(): InitiativeRow[] {
  const rows: InitiativeRow[] = [];
  for (let i = 0; i < 305; i++) rows.push(row(`gd-${i}`, 'gd', i % 17));
  for (let i = 0; i < 25; i++) rows.push(row(`groei-${i}`, 'groei', i % 40, PHASES[i % 5].key));
  return rows;
}

const layout = (rows: InitiativeRow[], phases = PHASES, gdIncluded = true) =>
  layoutFunnel({ rows, phases, width: W, height: H, gdIncluded });

describe('I-1 — every row is placed exactly once', () => {
  it('places every row in a stage or the holding area', () => {
    const rows = workingScaleRows();
    const l = layout(rows);
    const placed =
      l.stages.reduce((n, s) => n + s.dots.length, 0) + (l.holding?.dots.length ?? 0);
    expect(placed).toBe(rows.length);
  });

  it('never duplicates a row', () => {
    const l = layout(workingScaleRows());
    const ids = [...l.stages.flatMap((s) => s.dots.map((d) => d.id)), ...(l.holding?.dots ?? []).map((d) => d.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('holds a Groei row whose phase is not in the vocabulary rather than dropping it', () => {
    const rows = [row('drifted', 'groei', 3, 'a-phase-that-was-renamed')];
    const l = layout(rows);
    expect(l.holding?.dots.map((d) => d.id)).toEqual(['drifted']);
    expect(l.stages.every((s) => s.dots.length === 0)).toBe(true);
  });
});

describe('I-2 — dots are contained by the CURVE, not a bounding box', () => {
  it('keeps every dot inside the envelope evaluated at its own x', () => {
    const l = layout(workingScaleRows());
    const { upper, lower } = envelope(l.width, l.height);
    for (const stage of l.stages) {
      for (const d of stage.dots) {
        // Evaluated at the dot's own x — a rectangle check on the stage would pass
        // dots that actually sit outside the curve near a narrowing stage's edge.
        expect(d.y - d.r).toBeGreaterThanOrEqual(upper(d.x) - 0.5);
        expect(d.y + d.r).toBeLessThanOrEqual(lower(d.x) + 0.5);
      }
    }
  });

  it('is strictly stronger than a stage-rectangle check', () => {
    // Guard against a regression to rectangle containment: within a stage the aperture
    // at its narrow edge is smaller than at its wide edge, so the two differ.
    const l = layout(workingScaleRows());
    const { aperture } = envelope(l.width, l.height);
    const stage = l.stages[1];
    expect(aperture(stage.x1)).toBeLessThan(aperture(stage.x0));
  });
});

describe('I-3 — dots stay within their stage band', () => {
  it('never lets a dot cross a stage boundary', () => {
    const l = layout(workingScaleRows());
    for (const stage of l.stages) {
      for (const d of stage.dots) {
        expect(d.x - d.r).toBeGreaterThanOrEqual(stage.x0 - 0.5);
        expect(d.x + d.r).toBeLessThanOrEqual(stage.x1 + 0.5);
      }
    }
  });
});

describe('I-4 — no dot is fully occluded', () => {
  it('keeps centres far enough apart that no dot vanishes inside another', () => {
    const l = layout(workingScaleRows());
    for (const container of [...l.stages.map((s) => s.dots), l.holding?.dots ?? []]) {
      for (let i = 0; i < container.length; i++) {
        for (let j = i + 1; j < container.length; j++) {
          const a = container[i];
          const b = container[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          expect(dist).toBeGreaterThanOrEqual(Math.abs(a.r - b.r) - 0.5);
        }
      }
    }
  });
});

describe('I-5 — one global size scale across the whole funnel', () => {
  it('draws equal participation at equal size in different stages', () => {
    const rows = [
      ...workingScaleRows(),
      row('a', 'groei', 7, PHASES[0].key),
      row('b', 'groei', 7, PHASES[4].key),
    ];
    const l = layout(rows);
    const find = (id: string) => l.stages.flatMap((s) => s.dots).find((d) => d.id === id)!;
    expect(find('a').r).toBe(find('b').r);
  });

  it('sizes holding-area dots on the same scale as funnel dots', () => {
    const rows = [row('in', 'groei', 9, PHASES[1].key), row('out', 'groei', 9)];
    const l = layout(rows);
    const inFunnel = l.stages.flatMap((s) => s.dots).find((d) => d.id === 'in')!;
    const held = l.holding!.dots.find((d) => d.id === 'out')!;
    expect(held.r).toBe(inFunnel.r);
  });
});

describe('I-6 — radius is strictly increasing in participation, with a legible floor', () => {
  it('draws a larger dot for more participating gemeentes', () => {
    const l = layout([
      row('small', 'groei', 3, PHASES[0].key),
      row('large', 'groei', 60, PHASES[0].key),
    ]);
    const dots = l.stages.flatMap((s) => s.dots);
    const small = dots.find((d) => d.id === 'small')!;
    const large = dots.find((d) => d.id === 'large')!;
    expect(large.r).toBeGreaterThan(small.r);
  });

  it('still draws a zero-participation initiative legibly', () => {
    const l = layout([row('lonely', 'groei', 0, PHASES[0].key)]);
    const dot = l.stages.flatMap((s) => s.dots)[0];
    expect(dot.g).toBe(0);
    expect(dot.r).toBeGreaterThanOrEqual(MIN_R);
  });

  it('is monotone across the whole participation range at a fixed scale', () => {
    for (let g = 0; g < 80; g++) {
      expect(radiusFor(g + 1, 8)).toBeGreaterThan(radiusFor(g, 8));
    }
  });
});

describe('I-7 — the funnel narrows and the cost ramp grows', () => {
  it('has a non-increasing aperture from mouth to outlet', () => {
    const { aperture } = envelope(W, H);
    for (let x = 0; x < W; x += 10) {
      expect(aperture(x + 10)).toBeLessThanOrEqual(aperture(x) + 1e-9);
    }
    expect(aperture(W)).toBeLessThan(aperture(0));
  });

  it('has non-decreasing money and effort across stages', () => {
    const l = layout(workingScaleRows());
    for (let i = 1; i < l.stages.length; i++) {
      expect(l.stages[i].money).toBeGreaterThanOrEqual(l.stages[i - 1].money);
      expect(l.stages[i].effort).toBeGreaterThanOrEqual(l.stages[i - 1].effort);
    }
  });

  it('orders stages left to right with no gaps or overlaps', () => {
    const l = layout(workingScaleRows());
    expect(l.stages[0].x0).toBe(0);
    for (let i = 1; i < l.stages.length; i++) {
      expect(l.stages[i].x0).toBeCloseTo(l.stages[i - 1].x1, 6);
    }
    expect(l.stages.at(-1)!.x1).toBeCloseTo(W, 6);
  });
});

describe('I-8 — the holding area sits outside the curves', () => {
  it('places every held dot below the funnel envelope', () => {
    const rows = [...workingScaleRows(), row('unphased', 'groei', 4)];
    const l = layout(rows);
    const { lower } = envelope(l.width, l.height);
    for (const d of l.holding!.dots) {
      expect(d.y - d.r).toBeGreaterThan(lower(d.x));
    }
  });
});

describe('I-9 — the GemeenteDelers mouth always leads', () => {
  it('leads with the GD stage when the toggle is on', () => {
    const l = layout(workingScaleRows(), PHASES, true);
    expect(l.stages[0].kind).toBe('gd');
    expect(l.stages[0].key).toBe(GD_STAGE_KEY);
    expect(l.stages[0].dots.length).toBe(305);
  });

  it('still draws the GD stage, empty, when the toggle is off', () => {
    const groeiOnly = workingScaleRows().filter((r) => r.kind === 'groei');
    const l = layout(groeiOnly, PHASES, false);
    expect(l.stages[0].kind).toBe('gd');
    expect(l.stages[0].dots).toEqual([]);
  });
});

describe('I-10 — the holding area appears only when it holds something', () => {
  it('is null when every initiative has a phase', () => {
    const l = layout([row('a', 'groei', 2, PHASES[0].key)]);
    expect(l.holding).toBeNull();
  });

  it('is non-empty whenever it exists', () => {
    const l = layout([row('a', 'groei', 2)]);
    expect(l.holding!.dots.length).toBeGreaterThan(0);
  });
});

describe('degenerate inputs', () => {
  it('reports no phase vocabulary rather than drawing a one-stage funnel', () => {
    const l = layoutFunnel({ rows: [], phases: [], width: W, height: H, gdIncluded: true });
    expect(l.noPhaseVocabulary).toBe(true);
    expect(l.stages.filter((s) => s.kind === 'phase')).toHaveLength(0);
  });

  it('draws the full frame with no rows at all', () => {
    const l = layout([]);
    expect(l.stages).toHaveLength(PHASES.length + 1);
    expect(l.stages.every((s) => s.dots.length === 0)).toBe(true);
    expect(l.holding).toBeNull();
    expect(l.upper.length).toBeGreaterThan(1);
  });

  it('returns an empty layout for a zero-sized container instead of throwing', () => {
    const l = layoutFunnel({ rows: workingScaleRows(), phases: PHASES, width: 0, height: 0, gdIncluded: true });
    expect(l.stages).toEqual([]);
    expect(l.upper).toEqual([]);
  });

  it('ignores the synthetic `unknown` bucket as a stage', () => {
    const l = layout([], [...PHASES, { key: 'unknown', label: null, nr: null, count: 3, items: [] }]);
    expect(l.stages.map((s) => s.key)).not.toContain('unknown');
    expect(l.stages).toHaveLength(PHASES.length + 1);
  });
});

describe('FR-023 — the funnel agrees with the phase distribution', () => {
  it('matches per-phase counts for the same rows', () => {
    const rows = workingScaleRows();
    const l = layout(rows);
    for (const phase of PHASES) {
      const expected = rows.filter((r) => r.kind === 'groei' && r.phase?.key === phase.key).length;
      const stage = l.stages.find((s) => s.key === phase.key)!;
      expect(stage.dots.length).toBe(expected);
    }
  });
});
