/**
 * Groei growth phases ("groeifases") — the pipeline a Groei initiative moves through.
 *
 * The phases are a classification like any other (feature 020): an initiative declares
 * its phase by SELECTING a value in the designated phase classification, not by carrying
 * a phase keyword tag. That removes the defect the keyword approach carried — an old
 * `intake` tag left on a profile could pull an initiative into a phase it had left.
 *
 * The pipeline ORDER is the vocabulary's authored order. Alkemio documents
 * `ClassificationEntry.values` as "in authored order. Never re-sorted", and an editor
 * writing down growth phases writes them in pipeline order because no other order makes
 * sense. That means adding or renaming a phase needs no code change here (research
 * R-005, superseding spec assumption A-004).
 *
 * DEPLOYMENT EXPECTATION: whoever authors the phase classification template must author
 * its values in pipeline order (pre-intake → beheer). Nothing in the data can detect an
 * alphabetically-authored vocabulary — the chart would simply show the wrong x-axis.
 */
import type { DashboardCountable, PhaseDistribution } from '../types/api.js';
import type { Vocabulary } from '../transform/classifications.js';

/**
 * Bucket key for initiatives carrying no phase selection. Emitted as a trailing bucket
 * only when non-empty, mirroring the category charts' `uncategorised` bar.
 */
export const UNKNOWN_PHASE_KEY = 'unknown';

/**
 * Count Groei initiatives per growth phase. Only the selected spaces are counted —
 * GemeenteDelers initiatives are a separate, completed programme and carry no phase.
 *
 * Every phase in the vocabulary is present even at count 0 (so a late phase still renders
 * an empty slot in the pipeline, which is the point of the chart: it shows where the
 * pipeline is thin). The trailing `unknown` bucket appears only when some initiative
 * carries no phase selection.
 *
 * Returns `undefined` when NO initiative carries a phase at all — dashboards whose spaces
 * don't use groeifases, and dashboards whose phase designation matched nothing, then omit
 * the chart entirely rather than showing empty slots (FR-013).
 */
export function countGroeiPhases(
  entities: DashboardCountable[],
  vocabulary: Vocabulary,
): PhaseDistribution | undefined {
  if (vocabulary.length === 0) return undefined;

  const byPhase = new Map<string, string[]>(vocabulary.map((v) => [v.key, []]));
  const unknown: string[] = [];
  let matched = 0;

  for (const entity of entities) {
    if ((entity.source ?? 'spaces') !== 'spaces') continue;
    // An initiative should select exactly one phase. If it somehow carries several, the
    // FURTHEST-ALONG one wins — that is the state the initiative has actually reached,
    // and with the vocabulary in pipeline order "furthest along" is simply the highest index.
    let best = -1;
    for (const valueId of entity.selections?.phase ?? []) {
      const index = vocabulary.findIndex((v) => v.key === valueId);
      if (index > best) best = index;
    }
    if (best >= 0) {
      byPhase.get(vocabulary[best].key)!.push(entity.label);
      matched += 1;
    } else {
      unknown.push(entity.label);
    }
  }

  if (matched === 0) return undefined;

  const sortNames = (a: string[]) => a.sort((x, y) => x.localeCompare(y));
  const phases: PhaseDistribution['phases'] = vocabulary.map((value, index) => {
    const items = sortNames(byPhase.get(value.key)!);
    return { key: value.key, label: value.label, nr: index, count: items.length, items };
  });

  if (unknown.length > 0) {
    phases.push({
      key: UNKNOWN_PHASE_KEY,
      label: null,
      nr: null,
      count: unknown.length,
      items: sortNames(unknown),
    });
  }

  return { phases, total: matched + unknown.length };
}
