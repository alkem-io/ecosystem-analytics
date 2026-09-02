import { describe, it, expect } from 'vitest';
import { countGroeiPhases, UNKNOWN_PHASE_KEY } from './groei-phases.js';
import type { Vocabulary } from '../transform/classifications.js';
import type { DashboardCountable } from '../types/api.js';

/** The phase vocabulary as an editor authors it: in pipeline order (research R-005). */
const PHASES: Vocabulary = [
  { key: 'p-pre', label: 'Pre-intake' },
  { key: 'p-intake', label: 'Intake' },
  { key: 'p-initiatief', label: 'Initiatief' },
  { key: 'p-formalisatie', label: 'Formalisatie' },
  { key: 'p-beheer', label: 'Beheer' },
];

function space(
  label: string,
  phase: string[],
  over: Partial<DashboardCountable> = {},
): DashboardCountable {
  return {
    id: label,
    label,
    tags: [],
    selections: { phase },
    hasClassifications: true,
    source: 'spaces',
    ...over,
  };
}

describe('countGroeiPhases', () => {
  it('places each initiative at its selected phase, in the vocabulary’s authored order', () => {
    const result = countGroeiPhases(
      [space('A', ['p-intake']), space('B', ['p-beheer']), space('C', ['p-intake'])],
      PHASES,
    )!;

    expect(result.phases.map((p) => p.key)).toEqual([
      'p-pre',
      'p-intake',
      'p-initiatief',
      'p-formalisatie',
      'p-beheer',
    ]);
    expect(result.phases.map((p) => p.nr)).toEqual([0, 1, 2, 3, 4]);
    expect(result.phases.find((p) => p.key === 'p-intake')).toMatchObject({
      count: 2,
      label: 'Intake',
      items: ['A', 'C'],
    });
    expect(result.total).toBe(3);
  });

  it('renders every phase, including empty ones — that is the point of the pipeline', () => {
    const result = countGroeiPhases([space('A', ['p-intake'])], PHASES)!;
    expect(result.phases.find((p) => p.key === 'p-beheer')).toMatchObject({ count: 0, items: [] });
  });

  it('ignores an obsolete phase KEYWORD tag — the classification decides (US3 scenario 2)', () => {
    const result = countGroeiPhases(
      [space('Stale', ['p-beheer'], { tags: ['intake', 'pre-intake'] })],
      PHASES,
    )!;
    expect(result.phases.find((p) => p.key === 'p-beheer')!.items).toEqual(['Stale']);
    expect(result.phases.find((p) => p.key === 'p-intake')!.count).toBe(0);
  });

  it('places an initiative that somehow selected several phases at the furthest along', () => {
    const result = countGroeiPhases([space('A', ['p-intake', 'p-formalisatie'])], PHASES)!;
    expect(result.phases.find((p) => p.key === 'p-formalisatie')!.items).toEqual(['A']);
    expect(result.phases.find((p) => p.key === 'p-intake')!.count).toBe(0);
  });

  it('adds the trailing unknown bucket only when some initiative has no phase', () => {
    const withUnknown = countGroeiPhases([space('A', ['p-intake']), space('B', [])], PHASES)!;
    const last = withUnknown.phases[withUnknown.phases.length - 1];
    expect(last).toMatchObject({ key: UNKNOWN_PHASE_KEY, label: null, nr: null, items: ['B'] });
    expect(withUnknown.total).toBe(2);

    const noUnknown = countGroeiPhases([space('A', ['p-intake'])], PHASES)!;
    expect(noUnknown.phases.map((p) => p.key)).not.toContain(UNKNOWN_PHASE_KEY);
  });

  it('never counts a GD initiative — it is a completed programme with no phase', () => {
    const result = countGroeiPhases(
      [space('A', ['p-intake']), space('GD', ['p-beheer'], { source: 'gd' })],
      PHASES,
    )!;
    expect(result.total).toBe(1);
    expect(result.phases.find((p) => p.key === 'p-beheer')!.count).toBe(0);
  });

  it('omits the chart entirely when nothing carries a phase (FR-013)', () => {
    expect(countGroeiPhases([space('A', []), space('B', [])], PHASES)).toBeUndefined();
  });

  it('omits the chart when the phase designation matched no classification', () => {
    expect(countGroeiPhases([space('A', ['p-intake'])], [])).toBeUndefined();
  });

  it('ignores a selected id that is not in the vocabulary', () => {
    expect(countGroeiPhases([space('A', ['p-ghost'])], PHASES)).toBeUndefined();
  });
});
