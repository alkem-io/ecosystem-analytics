import { describe, it, expect } from 'vitest';
import {
  isSubspaceInitiative,
  mergeGdSources,
  normaliseForMatch,
  submissionYearOf,
} from './gd-initiative-sources.js';
import type { GdInitiativeInput } from '../types/api.js';

const post = (nameId: string, displayName: string, tags: string[]): GdInitiativeInput => ({
  id: `post:${nameId}`,
  nameId,
  source: 'post',
  displayName,
  description: '',
  tags,
});

const subspace = (nameId: string, displayName: string, tags: string[]): GdInitiativeInput => ({
  id: `sub:${nameId}`,
  nameId,
  source: 'subspace',
  displayName,
  description: '',
  tags,
});

const ids = (list: GdInitiativeInput[]) => list.map((i) => i.id);

describe('submissionYearOf / isSubspaceInitiative', () => {
  it('reads plain and gd- prefixed year tags', () => {
    expect(submissionYearOf(['Data', '2021'])).toBe(2021);
    expect(submissionYearOf(['gd-2024'])).toBe(2024);
    expect(submissionYearOf([' 2025 '])).toBe(2025);
    expect(submissionYearOf(['sdg-08', '20211', 'training'])).toBeUndefined();
  });

  // The two non-initiative subspaces on production.
  it('treats a subspace without a submission year as not an initiative', () => {
    expect(isSubspaceInitiative(subspace('template', 'Template', []))).toBe(false);
    expect(
      isSubspaceInitiative(
        subspace('alkemioplatformtrainingnl', 'Alkemio Platform Training (NL)', ['training', 'alkemio']),
      ),
    ).toBe(false);
    expect(isSubspaceInitiative(subspace('beheren', 'Beheren', ['2021', 'Standaarden']))).toBe(true);
  });

  it('normalises case, diacritics and punctuation for matching', () => {
    expect(normaliseForMatch('Iédereen doet mee!')).toBe('iedereendoetmee');
    expect(normaliseForMatch('masterclass-klooien')).toBe('masterclassklooien');
  });
});

describe('mergeGdSources', () => {
  it('reports every initiative subspace and every post no subspace supersedes', () => {
    const merge = mergeGdSources(
      [subspace('buurt-in-bloei', 'Buurt in bloei', ['2021'])],
      [post('buurt-in-bloei', 'Buurt in bloei', ['2021']), post('maex-amsterdam', 'MAEX Amsterdam', ['2022'])],
    );
    expect(ids(merge.initiatives)).toEqual(['sub:buurt-in-bloei', 'post:maex-amsterdam']);
    expect(merge.superseded).toEqual([
      { subspaceNameId: 'buurt-in-bloei', postNameId: 'buurt-in-bloei', rule: 'nameId' },
    ]);
  });

  it('skips non-initiative subspaces and untagged posts', () => {
    const merge = mergeGdSources(
      [subspace('template', 'Template', []), subspace('alkemioplatformtrainingnl', 'Training', ['training'])],
      [post('welkom', '👋 Welkom bij GemeenteDelers!', []), post('a', 'A', ['2023'])],
    );
    expect(ids(merge.initiatives)).toEqual(['post:a']);
    expect(merge.skippedSubspaceNameIds).toEqual(['template', 'alkemioplatformtrainingnl']);
  });

  // Production: subspace `masterclassklooienenpruts` ← post `masterclass-klooien`.
  it('matches a renamed nameID by identical title and year', () => {
    const merge = mergeGdSources(
      [subspace('masterclassklooienenpruts', 'Masterclass Klooien en Prutsen', ['2020'])],
      [post('masterclass-klooien', 'Masterclass Klooien en Prutsen', ['2020', 'Bouwregelgeving'])],
    );
    expect(ids(merge.initiatives)).toEqual(['sub:masterclassklooienenpruts']);
    expect(merge.superseded[0].rule).toBe('title');
  });

  // Production: subspace `privacyvriendelijkeauthen` ← post `privacyvriendelijke`, whose
  // title the subspace shortened.
  it('matches a shortened title by prefix and year', () => {
    const merge = mergeGdSources(
      [subspace('privacyvriendelijkeauthen', 'Privacyvriendelijke authenticatie', ['2020'])],
      [
        post(
          'privacyvriendelijke',
          'Privacyvriendelijke authenticatie door regie op eigen BRP-gegevens',
          ['2020'],
        ),
      ],
    );
    expect(ids(merge.initiatives)).toEqual(['sub:privacyvriendelijkeauthen']);
    expect(merge.superseded[0].rule).toBe('title-prefix');
  });

  // Production: two DIFFERENT initiatives are titled "Antwoord op maat" (2021 and 2023);
  // only the 2021 one has a subspace.
  it('never takes a same-titled post from another year', () => {
    const merge = mergeGdSources(
      [subspace('antwoord-op-maat', 'Antwoord op maat', ['2021'])],
      [post('antwoord-op-maat', 'Antwoord op maat', ['2021']), post('antwoord-op-maat-0', 'Antwoord op maat', ['2023'])],
    );
    expect(ids(merge.initiatives)).toEqual(['sub:antwoord-op-maat', 'post:antwoord-op-maat-0']);

    // Same story when the subspace's nameID does NOT match: the year still decides.
    const renamed = mergeGdSources(
      [subspace('antwoordopmaat2021', 'Antwoord op maat', ['2021'])],
      [post('antwoord-op-maat', 'Antwoord op maat', ['2021']), post('antwoord-op-maat-0', 'Antwoord op maat', ['2023'])],
    );
    expect(ids(renamed.initiatives)).toEqual(['sub:antwoordopmaat2021', 'post:antwoord-op-maat-0']);
  });

  it('lets an exact nameID win over another subspace’s title match', () => {
    // `b` is processed first and would title-match post `a` — but subspace `a` names it.
    const merge = mergeGdSources(
      [subspace('b', 'Same title', ['2021']), subspace('a', 'Same title', ['2021'])],
      [post('a', 'Same title', ['2021'])],
    );
    expect(merge.superseded).toEqual([{ subspaceNameId: 'a', postNameId: 'a', rule: 'nameId' }]);
    expect(ids(merge.initiatives)).toEqual(['sub:b', 'sub:a']);
  });

  it('drops nothing when a title matches several same-year posts, and reports it', () => {
    const merge = mergeGdSources(
      [subspace('dup-sub', 'Dubbel', ['2022'])],
      [post('dubbel-1', 'Dubbel', ['2022']), post('dubbel-2', 'Dubbel', ['2022'])],
    );
    expect(ids(merge.initiatives)).toEqual(['sub:dup-sub', 'post:dubbel-1', 'post:dubbel-2']);
    expect(merge.ambiguous).toEqual([
      { subspaceNameId: 'dup-sub', candidatePostNameIds: ['dubbel-1', 'dubbel-2'] },
    ]);
  });

  it('does not prefix-match a short, generic title', () => {
    const merge = mergeGdSources(
      [subspace('data', 'Data', ['2022'])],
      [post('data-gedreven-werken', 'Data gedreven werken', ['2022'])],
    );
    expect(merge.superseded).toEqual([]);
    expect(merge.initiatives).toHaveLength(2);
  });

  it('supersedes each post at most once', () => {
    const merge = mergeGdSources(
      [subspace('x', 'Initiatief X', ['2021']), subspace('x2', 'Initiatief X', ['2021'])],
      [post('x', 'Initiatief X', ['2021'])],
    );
    expect(merge.superseded).toHaveLength(1);
    expect(ids(merge.initiatives)).toEqual(['sub:x', 'sub:x2']);
  });
});
