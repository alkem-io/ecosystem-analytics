/**
 * Groei growth phases ("groeifases") — the pipeline a Groei initiative moves through.
 *
 * The phase list is FIXED in this application (it is not operator-configurable like the
 * NDS / VNG-2030 taxonomies in analytics.yml). An initiative declares its phase with a
 * profile tag matching a phase key, e.g. a space tagged `intake` is in the intake phase.
 */
import type { DashboardCountable, PhaseDistribution } from '../types/api.js';

/** A growth phase: its tag key and its ordinal position (`fase_nr`). */
export interface GroeiPhase {
  /** Tag key as it appears on the space profile (lowercase). */
  key: string;
  /** Ordinal phase number — pre-intake is -1, beheer is 3. */
  nr: number;
}

/**
 * The five growth phases, in pipeline order. This ordering IS the chart's x-axis order,
 * so entries must stay sorted by `nr`.
 */
export const GROEI_PHASES: readonly GroeiPhase[] = [
  { key: 'pre-intake', nr: -1 },
  { key: 'intake', nr: 0 },
  { key: 'initiatief', nr: 1 },
  { key: 'formalisatie', nr: 2 },
  { key: 'beheer', nr: 3 },
];

/**
 * Bucket key for initiatives carrying no recognised phase tag. Emitted as a trailing
 * bucket only when non-empty, mirroring the category charts' `uncategorised` bar.
 */
export const UNKNOWN_PHASE_KEY = 'unknown';

/** Resolve an entity's phase from its tags, or null when it carries no phase tag. */
function resolvePhase(tags: string[]): GroeiPhase | null {
  const normalised = new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
  // An initiative should carry exactly one phase tag; if it carries several (e.g. an old
  // phase tag was never removed) the furthest-along phase wins, since that is the state
  // the initiative has actually reached.
  let best: GroeiPhase | null = null;
  for (const phase of GROEI_PHASES) {
    if (normalised.has(phase.key) && (best === null || phase.nr > best.nr)) best = phase;
  }
  return best;
}

/**
 * Count Groei initiatives per growth phase. Only the selected spaces are counted —
 * GemeenteDelers initiatives are a separate, completed programme and carry no phase.
 *
 * Every phase is present in the result even at count 0 (so `beheer` still renders an
 * empty slot in the pipeline); the trailing `unknown` bucket appears only when some
 * initiative carries no phase tag. Returns `undefined` when NO initiative carries a
 * phase tag at all — dashboards whose spaces don't use groeifases then omit the chart
 * entirely rather than showing five empty bars.
 */
export function countGroeiPhases(entities: DashboardCountable[]): PhaseDistribution | undefined {
  const byPhase = new Map<string, string[]>(GROEI_PHASES.map((p) => [p.key, []]));
  const unknown: string[] = [];
  let matched = 0;

  for (const entity of entities) {
    if ((entity.source ?? 'spaces') !== 'spaces') continue;
    const phase = resolvePhase(entity.tags);
    if (phase) {
      byPhase.get(phase.key)!.push(entity.label);
      matched += 1;
    } else {
      unknown.push(entity.label);
    }
  }

  if (matched === 0) return undefined;

  const sortNames = (a: string[]) => a.sort((x, y) => x.localeCompare(y));
  const phases: PhaseDistribution['phases'] = GROEI_PHASES.map((p) => {
    const items = sortNames(byPhase.get(p.key)!);
    return { key: p.key, nr: p.nr, count: items.length, items };
  });
  if (unknown.length > 0) {
    phases.push({ key: UNKNOWN_PHASE_KEY, nr: null, count: unknown.length, items: sortNames(unknown) });
  }

  return { phases, total: matched + unknown.length };
}
