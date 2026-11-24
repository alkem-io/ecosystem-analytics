import { describe, expect, it } from 'vitest';
import type { ActivityItem, PhaseDistribution } from '@server/types/api.js';
import type { InitiativeRow } from '@ea/shared/dashboard/utils/initiatives.js';
import {
  handelenOf,
  handelenStatus,
  phaseHandelen,
  type HandelenStatus,
} from '@ea/shared/dashboard/utils/handelen.js';

const NOW = '2026-11-24T09:00:00.000Z';
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

describe('handelen status', () => {
  it('goes by the last handeling, with inclusive limits', () => {
    expect([0, 30, 31, 90, 91, 400].map((d) => handelenStatus(daysAgo(d), NOW))).toEqual([
      'active', 'active', 'quiet', 'quiet', 'dormant', 'dormant',
    ]);
  });

  it('never claims "none" for a Space whose feed could not be read', () => {
    const activity: ActivityItem = { bySpace: {}, lastAt: { read: null, busy: daysAgo(5) }, fetchedAt: NOW, unavailable: ['x'] };
    expect(handelenOf('read', activity)).toEqual({ status: 'none', lastAt: null });
    expect(handelenOf('busy', activity)).toEqual({ status: 'active', lastAt: daysAgo(5) });
    expect(handelenOf('missing', activity)).toEqual({ status: 'unknown', lastAt: null });
  });
});

describe('phase chart split', () => {
  const phases = [
    { key: 'p1', label: 'Idee', nr: 0, count: 2, items: [] },
    { key: 'p2', label: 'Pilot', nr: 1, count: 0, items: [] },
    { key: 'unknown', label: null, nr: null, count: 1, items: [] },
  ] as PhaseDistribution['phases'];
  const row = (name: string, phase: string | null, status: HandelenStatus | null, kind: 'groei' | 'gd' = 'groei') =>
    ({
      id: name,
      name,
      kind,
      phase: phase ? { key: phase, label: phase, nr: 0 } : null,
      handelen: status ? { status, lastAt: null } : null,
    }) as unknown as InitiativeRow;

  it('splits each phase by status, in phase order, without GemeenteDelers', () => {
    const split = phaseHandelen(phases, [
      row('B', 'p1', 'active'),
      row('A', 'p1', 'active'),
      row('C', null, 'none'),
      row('GD', null, null, 'gd'),
    ])!;
    expect(split[0].active).toEqual(['A', 'B']);
    expect(Object.values(split[1]).flat()).toEqual([]);
    expect(split[2].none).toEqual(['C']);
    expect(split.map((s) => Object.values(s).flat().length)).toEqual(phases.map((p) => p.count));
  });

  it('is absent until every Groei initiative has its handelen', () => {
    expect(phaseHandelen(phases, [row('A', 'p1', 'active'), row('B', 'p1', null)])).toBeNull();
    expect(phaseHandelen(phases, [])).toBeNull();
  });
});
