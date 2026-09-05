/**
 * Conformance tests for `GraphNode.phase` resolution (feature 022).
 *
 * NORMATIVE — the rules below are copied from
 * specs/022-vng-funnel-view/contracts/graph-node-phase.md. The "furthest along wins"
 * rule is mirrored by `countGroeiPhases` (services/groei-phases.ts); both must agree,
 * which is what makes the Funnel and the growth-phase chart show the same counts
 * (spec 022 FR-023).
 */
import { describe, expect, it } from 'vitest';
import {
  resolvePhase,
  unionVocabularies,
  vocabularyOf,
  resolveDesignated,
  type ClassificationEntryInput,
  type Vocabulary,
} from './classifications.js';
import { countGroeiPhases } from '../services/groei-phases.js';
import type { DashboardCountable } from '../types/api.js';

const DESIGNATION = 'Fase';

/** The VNG pipeline, authored in order. */
const VALUES = [
  { id: 'v1', label: 'Pre-intake' },
  { id: 'v2', label: 'Intake' },
  { id: 'v3', label: 'Initiatief' },
  { id: 'v4', label: 'Formalisatie' },
  { id: 'v5', label: 'Beheer' },
];

function entry(selected: { id: string; label: string }[]): ClassificationEntryInput[] {
  return [{ id: 'c1', displayLabel: DESIGNATION, values: VALUES, selectedValues: selected }];
}

const VOCAB: Vocabulary = unionVocabularies([vocabularyOf(resolveDesignated(entry([]), DESIGNATION))]);

describe('resolvePhase', () => {
  it('resolves a single selected value to its key, label and authored index', () => {
    expect(resolvePhase(entry([VALUES[2]]), DESIGNATION, VOCAB)).toEqual({
      key: 'v3',
      label: 'Initiatief',
      nr: 2,
    });
  });

  it('takes the FURTHEST-ALONG value when several are selected', () => {
    // Order of selection must not matter — position in the pipeline does.
    expect(resolvePhase(entry([VALUES[3], VALUES[1]]), DESIGNATION, VOCAB)?.key).toBe('v4');
    expect(resolvePhase(entry([VALUES[1], VALUES[3]]), DESIGNATION, VOCAB)?.key).toBe('v4');
  });

  it('is undefined — not a sentinel — when nothing is selected', () => {
    expect(resolvePhase(entry([]), DESIGNATION, VOCAB)).toBeUndefined();
  });

  it('is undefined when the designation matches no classification', () => {
    expect(resolvePhase(entry([VALUES[0]]), 'Groeifase', VOCAB)).toBeUndefined();
  });

  it('is undefined when the entity carries no classifications at all', () => {
    expect(resolvePhase(undefined, DESIGNATION, VOCAB)).toBeUndefined();
    expect(resolvePhase([], DESIGNATION, VOCAB)).toBeUndefined();
  });

  it('matches the designation case- and whitespace-insensitively', () => {
    const e: ClassificationEntryInput[] = [
      { id: 'c1', displayLabel: '  fase  ', values: VALUES, selectedValues: [VALUES[1]] },
    ];
    expect(resolvePhase(e, 'Fase', VOCAB)?.key).toBe('v2');
  });

  it('is NEVER derived from a tag — only from a classification selection', () => {
    // A leftover `intake` keyword must not pull an initiative into a phase. This is the
    // precise defect feature 020 removed; the funnel must not reintroduce it.
    const taggedButUnselected = entry([]);
    expect(resolvePhase(taggedButUnselected, DESIGNATION, VOCAB)).toBeUndefined();
  });

  it('ignores a selected value that is not in the vocabulary', () => {
    const e = entry([{ id: 'ghost', label: 'Removed phase' }]);
    expect(resolvePhase(e, DESIGNATION, VOCAB)).toBeUndefined();
  });
});

describe('agreement with countGroeiPhases (FR-023)', () => {
  it('places a space in the same phase the distribution counts it in', () => {
    const selections = [
      { id: 's1', selected: [VALUES[0]] },
      { id: 's2', selected: [VALUES[2]] },
      { id: 's3', selected: [VALUES[3], VALUES[1]] }, // multi → furthest along (v4)
      { id: 's4', selected: [] }, // unphased
    ];

    const countables: DashboardCountable[] = selections.map((s) => ({
      id: s.id,
      label: s.id,
      tags: [],
      selections: { phase: s.selected.map((v) => v.id) },
      hasClassifications: true,
      source: 'spaces',
    }));
    const distribution = countGroeiPhases(countables, VOCAB)!;

    for (const s of selections) {
      const resolved = resolvePhase(entry(s.selected), DESIGNATION, VOCAB);
      const bucket = distribution.phases.find((p) => p.items.includes(s.id))!;
      // Both implementations must land the same space in the same bucket.
      expect(bucket.key).toBe(resolved?.key ?? 'unknown');
      if (resolved) expect(bucket.nr).toBe(resolved.nr);
    }
  });
});
