import { describe, it, expect } from 'vitest';
import {
  normaliseLabel,
  presentClassifications,
  resolveByLabel,
  resolveDesignated,
  selectionOf,
  unionVocabularies,
  vocabularyOf,
  type ClassificationEntryInput,
} from './classifications.js';

/** Build an entry with sensible defaults; every field overridable per case. */
function entry(over: Partial<ClassificationEntryInput> = {}): ClassificationEntryInput {
  return {
    displayLabel: 'NDS',
    cardinality: 'MULTI_SELECT',
    display: true,
    sortOrder: 0,
    values: [
      { id: 'v-cloud', label: 'Cloud' },
      { id: 'v-data', label: 'Data' },
      { id: 'v-ai', label: 'Artificiële Intelligentie' },
    ],
    selectedValues: [],
    ...over,
  };
}

describe('normaliseLabel', () => {
  it('trims, collapses internal whitespace and lower-cases', () => {
    expect(normaliseLabel('  VNG   2030 ')).toBe('vng 2030');
  });
});

describe('resolveDesignated', () => {
  it('matches a designation to its classification case- and whitespace-insensitively', () => {
    const entries = [entry({ displayLabel: 'VNG  2030' })];
    expect(resolveDesignated(entries, ' vng 2030 ')?.displayLabel).toBe('VNG  2030');
  });

  it('returns null for an empty designation, an empty list, or no match', () => {
    expect(resolveDesignated([entry()], '')).toBeNull();
    expect(resolveDesignated([entry()], '   ')).toBeNull();
    expect(resolveDesignated([], 'NDS')).toBeNull();
    expect(resolveDesignated(undefined, 'NDS')).toBeNull();
    expect(resolveDesignated([entry()], 'Groeifase')).toBeNull();
  });

  it('breaks a duplicate displayLabel tie on the lowest sortOrder', () => {
    const entries = [
      entry({ sortOrder: 5, values: [{ id: 'late', label: 'Late' }] }),
      entry({ sortOrder: 1, values: [{ id: 'early', label: 'Early' }] }),
    ];
    expect(vocabularyOf(resolveDesignated(entries, 'NDS'))).toEqual([
      { key: 'early', label: 'Early' },
    ]);
  });
});

describe('vocabularyOf — degradation matrix', () => {
  it('returns the snapshot vocabulary in authored order, never re-sorted', () => {
    expect(vocabularyOf(entry())).toEqual([
      { key: 'v-cloud', label: 'Cloud' },
      { key: 'v-data', label: 'Data' },
      { key: 'v-ai', label: 'Artificiële Intelligentie' },
    ]);
  });

  it('is empty for a null entry, an absent vocabulary, or an empty vocabulary', () => {
    expect(vocabularyOf(null)).toEqual([]);
    expect(vocabularyOf(undefined)).toEqual([]);
    expect(vocabularyOf(entry({ values: undefined }))).toEqual([]);
    expect(vocabularyOf(entry({ values: [] }))).toEqual([]);
  });

  it('keeps a value with a blank label so its bar still renders, but drops a blank id', () => {
    const v = vocabularyOf(
      entry({ values: [{ id: 'v-1', label: '' }, { id: '', label: 'orphan' }] }),
    );
    expect(v).toEqual([{ key: 'v-1', label: '' }]);
  });
});

describe('selectionOf — degradation matrix', () => {
  it('returns the selected value ids', () => {
    expect(selectionOf(entry({ selectedValues: [{ id: 'v-data', label: 'Data' }] }))).toEqual([
      'v-data',
    ]);
  });

  it('is empty for a null entry, no selection, or an empty selection', () => {
    expect(selectionOf(null)).toEqual([]);
    expect(selectionOf(entry({ selectedValues: undefined }))).toEqual([]);
    expect(selectionOf(entry({ selectedValues: [] }))).toEqual([]);
  });

  it('drops a selected id absent from its own snapshot vocabulary (invariant I-4)', () => {
    const e = entry({
      selectedValues: [
        { id: 'v-data', label: 'Data' },
        { id: 'v-gone', label: 'Removed from the snapshot' },
      ],
    });
    expect(selectionOf(e)).toEqual(['v-data']);
  });

  it('never truncates a SINGLE_SELECT group carrying several selections', () => {
    const e = entry({
      cardinality: 'SINGLE_SELECT',
      selectedValues: [
        { id: 'v-cloud', label: 'Cloud' },
        { id: 'v-data', label: 'Data' },
      ],
    });
    expect(selectionOf(e)).toEqual(['v-cloud', 'v-data']);
  });

  it('de-duplicates a repeated selection so it is counted once', () => {
    const e = entry({
      selectedValues: [
        { id: 'v-data', label: 'Data' },
        { id: 'v-data', label: 'Data' },
      ],
    });
    expect(selectionOf(e)).toEqual(['v-data']);
  });

  it('ignores `display` — a hidden group still yields its selection (invariant I-7)', () => {
    const e = entry({ display: false, selectedValues: [{ id: 'v-ai', label: 'AI' }] });
    expect(selectionOf(e)).toEqual(['v-ai']);
  });
});

describe('unionVocabularies', () => {
  it('merges differing snapshots, de-duplicated, in first-appearance order', () => {
    const a = [
      { key: 'v-cloud', label: 'Cloud' },
      { key: 'v-data', label: 'Data' },
    ];
    const b = [
      { key: 'v-data', label: 'Data' },
      { key: 'v-new', label: 'Nieuw' },
    ];
    expect(unionVocabularies([a, b])).toEqual([
      { key: 'v-cloud', label: 'Cloud' },
      { key: 'v-data', label: 'Data' },
      { key: 'v-new', label: 'Nieuw' },
    ]);
  });

  it('keeps the first label when two snapshots disagree, so output is deterministic', () => {
    const a = [{ key: 'v-1', label: 'Oude naam' }];
    const b = [{ key: 'v-1', label: 'Nieuwe naam' }];
    expect(unionVocabularies([a, b])).toEqual([{ key: 'v-1', label: 'Oude naam' }]);
  });

  it('is empty when there is nothing to merge', () => {
    expect(unionVocabularies([])).toEqual([]);
    expect(unionVocabularies([[], []])).toEqual([]);
  });
});

describe('resolveByLabel (GemeenteDelers layer only)', () => {
  const vocabulary = vocabularyOf(entry());

  it('matches tags to value labels case- and whitespace-insensitively', () => {
    expect(resolveByLabel(['  DATA ', 'artificiële   intelligentie'], vocabulary)).toEqual([
      'v-data',
      'v-ai',
    ]);
  });

  it('returns ids in vocabulary order, not tag order', () => {
    expect(resolveByLabel(['Data', 'Cloud'], vocabulary)).toEqual(['v-cloud', 'v-data']);
  });

  it('is empty when no tag matches, or when there is no vocabulary', () => {
    expect(resolveByLabel(['gd-2024', 'sdg-08'], vocabulary)).toEqual([]);
    expect(resolveByLabel(['Data'], [])).toEqual([]);
    expect(resolveByLabel([], vocabulary)).toEqual([]);
    expect(resolveByLabel(undefined, vocabulary)).toEqual([]);
  });

  it('never matches a blank-labelled value against a blank tag', () => {
    expect(resolveByLabel(['  '], [{ key: 'v-blank', label: '' }])).toEqual([]);
  });
});

describe('presentClassifications', () => {
  it('lists displayable groups in sortOrder with their selected values', () => {
    const entries = [
      entry({
        displayLabel: 'VNG 2030',
        sortOrder: 2,
        values: [{ id: 'w', label: 'Wonen en Ruimte' }],
        selectedValues: [{ id: 'w', label: 'Wonen en Ruimte' }],
      }),
      entry({ sortOrder: 1, selectedValues: [{ id: 'v-data', label: 'Data' }] }),
    ];
    expect(presentClassifications(entries)).toEqual([
      { label: 'NDS', values: [{ id: 'v-data', label: 'Data' }] },
      { label: 'VNG 2030', values: [{ id: 'w', label: 'Wonen en Ruimte' }] },
    ]);
  });

  it('excludes a display:false group from presentation (invariant I-7)', () => {
    const hidden = entry({ display: false, selectedValues: [{ id: 'v-ai', label: 'AI' }] });
    expect(presentClassifications([hidden])).toEqual([]);
    // …while the counting path is untouched by the same flag.
    expect(selectionOf(hidden)).toEqual(['v-ai']);
  });

  it('omits groups with nothing selected, and is empty when there are no classifications', () => {
    expect(presentClassifications([entry({ selectedValues: [] })])).toEqual([]);
    expect(presentClassifications([])).toEqual([]);
    expect(presentClassifications(undefined)).toEqual([]);
  });
});
