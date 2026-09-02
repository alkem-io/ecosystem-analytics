import { describe, expect, it } from 'vitest';
import {
  EXPECTED_VOCABULARIES,
  checkVocabulary,
  collectVocabularyDrift,
  isNoClassificationValue,
  orderByExpectation,
  stripNoClassificationValues,
} from './expected-vocabularies.js';
import type { Vocabulary } from './classifications.js';

const vocab = (...labels: string[]): Vocabulary =>
  labels.map((label, i) => ({ key: `id-${i}`, label }));

const expected = (dimension: 'nds' | 'vng2030' | 'phase') =>
  vocab(...EXPECTED_VOCABULARIES[dimension]);

describe('checkVocabulary', () => {
  it('reports nothing when the live vocabulary matches the expectation', () => {
    expect(checkVocabulary('nds', expected('nds'))).toBeNull();
    expect(checkVocabulary('vng2030', expected('vng2030'))).toBeNull();
  });

  it('ignores case and surrounding whitespace, so a cosmetic edit is not drift', () => {
    expect(checkVocabulary('vng2030', vocab('  bestaanszekerheid ', 'KANSENGELIJKHEID/JEUGD',
      'Klimaat en energie', 'Vergrijzing/gezond leven', 'Wonen en Ruimte',
      'Bedrijfsvoering & gemeentediensten'))).toBeNull();
  });

  it('flags a value Alkemio has that this build does not expect', () => {
    const drift = checkVocabulary('vng2030', vocab(...EXPECTED_VOCABULARIES.vng2030, 'Eén sterke bestuurslaag'));
    expect(drift).toEqual({ dimension: 'vng2030', unexpected: ['Eén sterke bestuurslaag'], missing: [] });
  });

  it('flags a value this build expects that Alkemio no longer has', () => {
    const drift = checkVocabulary('nds', vocab(...EXPECTED_VOCABULARIES.nds.slice(1)));
    expect(drift).toEqual({ dimension: 'nds', unexpected: [], missing: [EXPECTED_VOCABULARIES.nds[0]] });
  });

  it('reports a rename in both directions at once', () => {
    const drift = checkVocabulary('phase', vocab('Pre-intake', 'Intake', 'Initiatie', 'Formalisatie', 'beheerfase'));
    expect(drift?.unexpected).toEqual(['beheerfase']);
    expect(drift?.missing).toEqual(['Beheer']);
  });

  it('stays silent for an EMPTY vocabulary — that is an unmatched designation, not drift', () => {
    expect(checkVocabulary('nds', [])).toBeNull();
  });

  it('reports unexpected labels verbatim, not normalised', () => {
    const drift = checkVocabulary('nds', vocab(...EXPECTED_VOCABULARIES.nds, '  Quantum  Computing '));
    expect(drift?.unexpected).toEqual(['  Quantum  Computing ']);
  });
});

describe('collectVocabularyDrift', () => {
  it('omits the dimensions that agree', () => {
    const drift = collectVocabularyDrift({
      nds: expected('nds'),
      vng2030: vocab(...EXPECTED_VOCABULARIES.vng2030, 'Knooppunt van netwerken'),
      phase: [],
    });
    expect(drift.map((d) => d.dimension)).toEqual(['vng2030']);
  });

  it('is empty when every vocabulary matches', () => {
    expect(collectVocabularyDrift({
      nds: expected('nds'), vng2030: expected('vng2030'), phase: expected('phase'),
    })).toEqual([]);
  });
});

describe('orderByExpectation', () => {
  it('puts the expected values in this build’s presentation order, not the authored one', () => {
    // Alkemio authors VNG-2030 alphabetically-ish; production presents it differently.
    const authored = vocab(
      'Bestaanszekerheid', 'Kansengelijkheid/jeugd', 'Klimaat en energie',
      'Vergrijzing/gezond leven', 'Wonen en Ruimte', 'Bedrijfsvoering & gemeentediensten',
    );
    expect(orderByExpectation('vng2030', authored).map((v) => v.label)).toEqual([
      ...EXPECTED_VOCABULARIES.vng2030,
    ]);
  });

  it('appends unexpected values after the known ones, keeping their authored order', () => {
    const live = vocab('Wonen en Ruimte', 'Knooppunt van netwerken', 'Eén sterke bestuurslaag',
      'Bedrijfsvoering & gemeentediensten');
    expect(orderByExpectation('vng2030', live).map((v) => v.label)).toEqual([
      'Bedrijfsvoering & gemeentediensten',
      'Wonen en Ruimte',
      'Knooppunt van netwerken',
      'Eén sterke bestuurslaag',
    ]);
  });

  it('preserves the value objects, so ids survive the reorder', () => {
    const live = vocab('Wonen en Ruimte', 'Bedrijfsvoering & gemeentediensten');
    expect(orderByExpectation('vng2030', live).map((v) => v.key)).toEqual(['id-1', 'id-0']);
  });

  it('leaves an already-correct order untouched', () => {
    expect(orderByExpectation('nds', expected('nds'))).toEqual(expected('nds'));
  });
});

describe('stripNoClassificationValues', () => {
  it('removes an explicit "Geen classificatie" value from the vocabulary', () => {
    const live = vocab('Geen classificatie', 'Cloud', 'Data');
    expect(stripNoClassificationValues(live).map((v) => v.label)).toEqual(['Cloud', 'Data']);
  });

  it('matches case- and whitespace-insensitively, and the English spelling too', () => {
    expect(isNoClassificationValue('  GEEN   CLASSIFICATIE ')).toBe(true);
    expect(isNoClassificationValue('No classification')).toBe(true);
    expect(isNoClassificationValue('Klimaat en energie')).toBe(false);
  });

  it('leaves a vocabulary without such a value untouched', () => {
    expect(stripNoClassificationValues(expected('nds'))).toEqual(expected('nds'));
  });

  it('stops the stripped value being reported as unexpected drift', () => {
    const live = vocab('Geen classificatie', ...EXPECTED_VOCABULARIES.nds);
    expect(checkVocabulary('nds', live)?.unexpected).toEqual(['Geen classificatie']);
    expect(checkVocabulary('nds', stripNoClassificationValues(live))).toBeNull();
  });
});

describe('the live acceptance vocabularies', () => {
  it('matches the expectation once the explicit no-classification value is stripped', () => {
    // Exactly what Alkemio returns for the 22-space vnginnovationhub selection.
    const liveNds = vocab('Geen classificatie', 'Cloud', 'Data', 'Artificiële Intelligentie',
      'Centrale (digitale) dienstverlening', 'Digitale weerbaarheid en autonomie',
      'Digitaal vakmanschap en moderne werkomgeving');
    const liveVng = vocab('Geen classificatie', 'Bestaanszekerheid', 'Kansengelijkheid/jeugd',
      'Klimaat en energie', 'Vergrijzing/gezond leven', 'Wonen en Ruimte',
      'Bedrijfsvoering & gemeentediensten');
    const livePhase = vocab('Pre-intake', 'Intake', 'Initiatie', 'Formalisatie', 'Beheer');
    expect(collectVocabularyDrift({
      nds: stripNoClassificationValues(liveNds),
      vng2030: stripNoClassificationValues(liveVng),
      phase: stripNoClassificationValues(livePhase),
    })).toEqual([]);
  });

  it('presents VNG-2030 in production order, not Alkemio authored order', () => {
    const liveVng = vocab('Bestaanszekerheid', 'Kansengelijkheid/jeugd', 'Klimaat en energie',
      'Vergrijzing/gezond leven', 'Wonen en Ruimte', 'Bedrijfsvoering & gemeentediensten');
    expect(orderByExpectation('vng2030', liveVng).map((v) => v.label)[0])
      .toBe('Bedrijfsvoering & gemeentediensten');
  });
});
