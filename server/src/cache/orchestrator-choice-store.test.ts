process.env.DB_PATH = ':memory:';
import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from './db.js';
import {
  clearChoice,
  getCommunityCandidates,
  getOwnChoice,
  setChoice,
} from './orchestrator-choice-store.js';

beforeEach(() => initDatabase());

const HUB = 'vih-test';

describe('a viewer’s own choice', () => {
  it('is stored and read back for that viewer and hub', () => {
    setChoice('user-a', HUB, 'programmagroei', 1000);
    expect(getOwnChoice('user-a', HUB)).toBe('programmagroei');
  });

  it('is absent before anything is stored', () => {
    expect(getOwnChoice('user-a', HUB)).toBeNull();
  });

  it('is overwritten in place, not duplicated', () => {
    setChoice('user-a', HUB, 'programmagroei', 1000);
    setChoice('user-a', HUB, 'signalen', 2000);
    expect(getOwnChoice('user-a', HUB)).toBe('signalen');
    expect(getCommunityCandidates(HUB)).toHaveLength(1);
  });

  it('is invisible to another viewer', () => {
    setChoice('user-a', HUB, 'programmagroei', 1000);
    expect(getOwnChoice('user-b', HUB)).toBeNull();
  });

  it('is per hub', () => {
    setChoice('user-a', HUB, 'programmagroei', 1000);
    expect(getOwnChoice('user-a', 'other-hub')).toBeNull();
  });

  it('is removed by clear, and clearing twice is harmless', () => {
    setChoice('user-a', HUB, 'programmagroei', 1000);
    clearChoice('user-a', HUB);
    clearChoice('user-a', HUB);
    expect(getOwnChoice('user-a', HUB)).toBeNull();
  });
});

describe('community candidates', () => {
  it('are empty when nobody has chosen', () => {
    expect(getCommunityCandidates(HUB)).toEqual([]);
  });

  it('rank by how many viewers chose each space', () => {
    setChoice('user-a', HUB, 'signalen', 1000);
    setChoice('user-b', HUB, 'programmagroei', 1000);
    setChoice('user-c', HUB, 'programmagroei', 1000);

    const ranked = getCommunityCandidates(HUB);
    expect(ranked[0]).toEqual({ spaceNameId: 'programmagroei', count: 2 });
    expect(ranked[1]).toEqual({ spaceNameId: 'signalen', count: 1 });
  });

  it('break a tie on the most recent choice', () => {
    setChoice('user-a', HUB, 'signalen', 1000);
    setChoice('user-b', HUB, 'programmagroei', 5000);
    expect(getCommunityCandidates(HUB)[0].spaceNameId).toBe('programmagroei');
  });

  it('offer at most three, so the readability filter has alternatives without a long walk', () => {
    ['a', 'b', 'c', 'd', 'e'].forEach((u, i) => setChoice(`user-${u}`, HUB, `space-${i}`, 1000 + i));
    expect(getCommunityCandidates(HUB)).toHaveLength(3);
  });

  it('drop a space once its last chooser clears', () => {
    setChoice('user-a', HUB, 'signalen', 1000);
    setChoice('user-b', HUB, 'programmagroei', 1000);
    clearChoice('user-a', HUB);

    const ranked = getCommunityCandidates(HUB);
    expect(ranked.map((r) => r.spaceNameId)).toEqual(['programmagroei']);
  });

  it('recount when a viewer changes their mind', () => {
    setChoice('user-a', HUB, 'signalen', 1000);
    setChoice('user-b', HUB, 'signalen', 1000);
    setChoice('user-a', HUB, 'programmagroei', 3000);

    const ranked = getCommunityCandidates(HUB);
    expect(ranked.find((r) => r.spaceNameId === 'signalen')?.count).toBe(1);
    expect(ranked.find((r) => r.spaceNameId === 'programmagroei')?.count).toBe(1);
  });

  it('are scoped to the hub asked about', () => {
    setChoice('user-a', HUB, 'programmagroei', 1000);
    expect(getCommunityCandidates('other-hub')).toEqual([]);
  });
});
