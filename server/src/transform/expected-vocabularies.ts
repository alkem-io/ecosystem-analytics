/**
 * The vocabularies this application EXPECTS each dashboard dimension to have.
 *
 * Feature 020 deliberately takes chart categories from Alkemio's classification
 * vocabulary rather than from a list in code, so a value added in Alkemio appears on the
 * chart with no config change (FR-007). That property is kept: nothing here filters or
 * renames a category, and a value absent from this file still renders and still counts.
 * The one thing this file does impose is ORDER — see `orderByExpectation` — because the
 * same chart has to read left-to-right identically on acceptance and production, and the
 * two environments author their vocabularies in different orders.
 *
 * What this module adds is a SECOND, non-authoritative opinion — what the vocabulary
 * looked like when the dashboard was built — so that drift becomes visible instead of
 * silent. The failure it exists to catch actually happened: the VNG-2030 vocabulary
 * carried five governance themes nobody expected, and the only symptom was five extra
 * empty bars that read as a rendering bug rather than as data.
 *
 * TRADE-OFF, stated plainly: a legitimate new value in Alkemio now raises a warning under
 * its chart until someone adds it below. That is the point — the warning is the review
 * step. Adding the value here is a one-line change and needs no redeploy of anything else.
 *
 * Matching is on LABEL, normalised (trimmed, whitespace-collapsed, case-folded) by
 * `normaliseLabel`. Labels — not `ClassificationValue.id`s — because ids are per-template
 * GUIDs that differ between acceptance and production, so an id list would false-alarm on
 * every environment but the one it was captured in. Labels are portable and are what a
 * reader of this file can actually check against Alkemio.
 */
import type { VocabularyDrift } from '../types/api.js';
import { normaliseLabel, type Vocabulary } from './classifications.js';

/** The dimensions that carry a hard-coded expectation. */
export type ExpectedDimensionKey = 'nds' | 'vng2030' | 'phase';

/**
 * Expected value labels per dimension, in PRESENTATION order.
 *
 * This array's order is load-bearing: `orderByExpectation` sorts each chart's categories
 * by it, so editing it moves bars. It is deliberately NOT Alkemio's authored order —
 * production has always presented VNG-2030 with 'Bedrijfsvoering & gemeentediensten'
 * first, and the two charts must agree across environments.
 *
 * Sourced as follows — keep this provenance current when editing:
 *
 *  • `nds` — the six NDS-prioriteit values as authored in Alkemio, verified against the
 *    22-space vnginnovationhub selection.
 *  • `vng2030` — the six VNG-2030 *maatschappelijke opgaven*. This is the set the
 *    production dashboard has always shown. Acceptance additionally carries five
 *    governance themes ("Eén sterke bestuurslaag", "Samenwerken in regio's", "Knooppunt
 *    van netwerken", "Bestuurskracht en kwaliteit van uitvoering", "Kwalitatieve
 *    besluitvorming en mandaat"). They are deliberately NOT listed here: whether they
 *    belong on this chart is a programme decision, and until it is made the dashboard
 *    should say so out loud. Add them to this array to accept them.
 *  • `phase` — the five values of the 'Fase' classification, in pipeline order, verified
 *    on all 22 spaces of the selection. Note two naming quirks, both confirmed as
 *    intended rather than typos: the CLASSIFICATION is named 'Fase' while the programme
 *    calls the concept a "groeifase" (the designation lives in analytics.yml), and the
 *    third value is 'Initiatie', not the 'initiatief' spec 020 A-004 and the retired
 *    `GROEI_PHASES` constant both used.
 */
export const EXPECTED_VOCABULARIES: Record<ExpectedDimensionKey, readonly string[]> = {
  nds: [
    'Cloud',
    'Data',
    'Artificiële Intelligentie',
    'Centrale (digitale) dienstverlening',
    'Digitale weerbaarheid en autonomie',
    'Digitaal vakmanschap en moderne werkomgeving',
  ],
  vng2030: [
    'Bedrijfsvoering & gemeentediensten',
    'Wonen en Ruimte',
    'Bestaanszekerheid',
    'Klimaat en energie',
    'Kansengelijkheid/jeugd',
    'Vergrijzing/gezond leven',
  ],
  phase: ['Pre-intake', 'Intake', 'Initiatie', 'Formalisatie', 'Beheer'],
};

/**
 * Labels that mean "this has not been classified", authored as a real vocabulary VALUE.
 *
 * Alkemio's NDS-prioriteit and VNG 2030 thema vocabularies both open with an explicit
 * "Geen classificatie" option, so an editor can positively record that a Space has not
 * been placed yet. That is the same statement as selecting nothing at all, and the
 * dashboard must not present it as a third thing: left alone it rendered a bar sitting
 * beside the synthetic no-selection bar, identically labelled and impossible to tell
 * apart.
 *
 * Values matching this list are stripped from the vocabulary before anything counts. A
 * Space that selected only such a value then hits no category and lands in the
 * uncategorised bucket — which is exactly where a Space that selected nothing lands, and
 * which the charts list by name underneath rather than drawing as a bar. No entity is
 * lost, so the "counts account for every entity" identity (invariant I-5) still holds.
 */
const NO_CLASSIFICATION_LABELS: readonly string[] = [
  'Geen classificatie',
  'No classification',
];

const NO_CLASSIFICATION_KEYS = new Set(NO_CLASSIFICATION_LABELS.map(normaliseLabel));

/** True when a vocabulary value is an explicit "not classified" option. */
export function isNoClassificationValue(label: string): boolean {
  return NO_CLASSIFICATION_KEYS.has(normaliseLabel(label));
}

/**
 * Drop the explicit "not classified" values from a vocabulary.
 *
 * Applied once, at the point the per-Space snapshots are unioned, so counting, the
 * cross-tab axes, the phase pipeline and the drift check all see the same clean list and
 * cannot disagree about it.
 */
export function stripNoClassificationValues(vocabulary: Vocabulary): Vocabulary {
  return vocabulary.filter((value) => !isNoClassificationValue(value.label));
}

/**
 * Compare one dimension's live vocabulary against its expectation.
 *
 * Returns null when the two agree, and null for an EMPTY vocabulary: an empty vocabulary
 * means the designation matched no classification at all, which is a different fault with
 * its own diagnostic (`warnOnUnmatchedDesignations`). Reporting every expected label as
 * "missing" there would bury the real cause under a wall of text.
 *
 * Both directions are reported, because both are drift a reader needs to see:
 *   • `unexpected` — Alkemio has a value this build does not know about. It IS rendered
 *     and IS counted; the warning only says nobody has vouched for it.
 *   • `missing` — this build expects a value Alkemio's vocabulary no longer has. Usually
 *     a rename, which silently splits a category's history in two.
 *
 * Labels are reported as Alkemio authored them (for `unexpected`) or as this file spells
 * them (for `missing`), never normalised — the normalised form is a matching detail and
 * would be confusing to read on screen.
 */
export function checkVocabulary(
  dimension: ExpectedDimensionKey,
  vocabulary: Vocabulary,
): VocabularyDrift | null {
  if (vocabulary.length === 0) return null;

  const expected = EXPECTED_VOCABULARIES[dimension];
  const expectedKeys = new Set(expected.map(normaliseLabel));
  const actualKeys = new Set(vocabulary.map((v) => normaliseLabel(v.label)));

  const unexpected = vocabulary
    .filter((v) => !expectedKeys.has(normaliseLabel(v.label)))
    .map((v) => v.label);
  const missing = expected.filter((label) => !actualKeys.has(normaliseLabel(label)));

  if (unexpected.length === 0 && missing.length === 0) return null;
  return { dimension, unexpected, missing };
}

/**
 * Check every dimension at once, dropping the ones that agree. The result is attached to
 * the dashboard response so each chart can render its own notice; an empty array means
 * every vocabulary matched and no chart shows anything.
 */
export function collectVocabularyDrift(vocabularies: {
  nds: Vocabulary;
  vng2030: Vocabulary;
  phase: Vocabulary;
}): VocabularyDrift[] {
  return (['nds', 'vng2030', 'phase'] as const)
    .map((dimension) => checkVocabulary(dimension, vocabularies[dimension]))
    .filter((drift): drift is VocabularyDrift => drift !== null);
}

/**
 * Reorder a live vocabulary into this build's presentation order.
 *
 * Values named in `EXPECTED_VOCABULARIES` come first, in the order they appear there;
 * anything else keeps its authored order and follows. That gives the same left-to-right
 * reading across environments — the reason this exists — while still rendering a value
 * nobody has vouched for, rather than dropping it (it is reported by `checkVocabulary`
 * and shown under the chart instead).
 *
 * Matching is on normalised label, exactly as `checkVocabulary` matches, so the two can
 * never disagree about whether a value is known.
 */
export function orderByExpectation(
  dimension: ExpectedDimensionKey,
  vocabulary: Vocabulary,
): Vocabulary {
  const rank = new Map(EXPECTED_VOCABULARIES[dimension].map((label, i) => [normaliseLabel(label), i]));
  const positionOf = (item: Vocabulary[number]) => rank.get(normaliseLabel(item.label)) ?? Infinity;
  return vocabulary
    .map((item, index) => ({ item, index }))
    .sort((a, b) => positionOf(a.item) - positionOf(b.item) || a.index - b.index)
    .map((entry) => entry.item);
}
