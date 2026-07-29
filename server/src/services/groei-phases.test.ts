import { describe, it, expect } from 'vitest';
import { countGroeiPhases, GROEI_PHASES } from './groei-phases.js';
import type { DashboardCountable } from '../types/api.js';

const space = (label: string, ...tags: string[]): DashboardCountable => ({
  id: label,
  label,
  tags,
  source: 'spaces',
});

describe('countGroeiPhases', () => {
  it('counts initiatives into their tagged phase, keeping pipeline order', () => {
    const result = countGroeiPhases([
      space('Atlas', 'VNG Groei', 'pre-intake'),
      space('Kiss', 'pre-intake'),
      space('Dook', 'intake'),
      space('Signalen', 'initiatief'),
      space('Vakantieverhuur', 'formalisatie'),
    ])!;

    expect(result.phases.map((p) => p.key)).toEqual(GROEI_PHASES.map((p) => p.key));
    expect(result.phases.map((p) => [p.key, p.nr, p.count])).toEqual([
      ['pre-intake', -1, 2],
      ['intake', 0, 1],
      ['initiatief', 1, 1],
      ['formalisatie', 2, 1],
      ['beheer', 3, 0],
    ]);
    expect(result.total).toBe(5);
  });

  it('lists the initiative names per phase, sorted', () => {
    const result = countGroeiPhases([space('Kiss', 'pre-intake'), space('Atlas', 'pre-intake')])!;
    expect(result.phases[0].items).toEqual(['Atlas', 'Kiss']);
  });

  it('matches phase tags case-insensitively and ignores surrounding whitespace', () => {
    const result = countGroeiPhases([space('A', ' Pre-Intake '), space('B', 'INTAKE')])!;
    expect(result.phases[0].count).toBe(1);
    expect(result.phases[1].count).toBe(1);
  });

  it('never counts GemeenteDelers initiatives — they have no phase', () => {
    const result = countGroeiPhases([
      space('Groei one', 'intake'),
      { id: 'gd', label: 'GD one', tags: ['intake'], source: 'gd' },
    ])!;
    expect(result.total).toBe(1);
    expect(result.phases[1].items).toEqual(['Groei one']);
  });

  it('collects initiatives with no phase tag into a trailing unknown bucket', () => {
    const result = countGroeiPhases([space('Tagged', 'intake'), space('Untagged', 'cloud')])!;
    const last = result.phases[result.phases.length - 1];
    expect(last).toMatchObject({ key: 'unknown', nr: null, count: 1, items: ['Untagged'] });
    expect(result.total).toBe(2);
  });

  it('omits the unknown bucket when every initiative has a phase', () => {
    const result = countGroeiPhases([space('Tagged', 'intake')])!;
    expect(result.phases.map((p) => p.key)).not.toContain('unknown');
  });

  it('takes the furthest-along phase when an initiative carries several phase tags', () => {
    const result = countGroeiPhases([space('Moved on', 'intake', 'formalisatie')])!;
    expect(result.phases.find((p) => p.key === 'formalisatie')!.count).toBe(1);
    expect(result.phases.find((p) => p.key === 'intake')!.count).toBe(0);
  });

  it('returns undefined when no initiative carries a phase tag at all', () => {
    expect(countGroeiPhases([space('A', 'cloud'), space('B', 'data')])).toBeUndefined();
    expect(countGroeiPhases([])).toBeUndefined();
  });
});
