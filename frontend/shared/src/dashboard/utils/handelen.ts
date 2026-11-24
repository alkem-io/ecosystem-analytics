/**
 * "Handelen" — how recently anything happened in an initiative's Space or subspaces, as
 * one ordered status. The one rule behind the Funnel's "colour by handelen" and the phase
 * chart's split, so the two cannot disagree.
 *
 * Recency, not volume: totals never age, so a Space that fell silent keeps a high count.
 * Every recorded handeling counts, new members included (most of them are).
 */
import type { ActivityItem, PhaseDistribution } from '@server/types/api.js';
import type { InitiativeRow } from './initiatives.js';

export type HandelenStatus = 'active' | 'quiet' | 'dormant' | 'none' | 'unknown';

/** Most alive first; also the stacking order (from the axis up) and the legend order. */
export const HANDELEN_ORDER: readonly HandelenStatus[] = ['active', 'quiet', 'dormant', 'none', 'unknown'];

/** Last handeling at most this many days ago. */
export const ACTIVE_DAYS = 30;
export const QUIET_DAYS = 90;

export const HANDELEN_COLOR: Record<HandelenStatus, string> = {
  active: 'var(--handelen-active)',
  quiet: 'var(--handelen-quiet)',
  dormant: 'var(--handelen-dormant)',
  none: 'var(--cat-none)',
  unknown: 'var(--cat-other)',
};

/** Ink that stays legible on each status colour. */
export const HANDELEN_INK: Record<HandelenStatus, string> = {
  active: 'var(--handelen-active-ink)',
  quiet: 'var(--handelen-quiet-ink)',
  dormant: 'var(--handelen-dormant-ink)',
  none: 'var(--foreground)',
  unknown: 'var(--handelen-unknown-ink)',
};

const DEFAULT_LABEL: Record<HandelenStatus, string> = {
  active: 'Active (≤ {{active}} days)',
  quiet: 'Quiet ({{from}}–{{quiet}} days)',
  dormant: 'Dormant (> {{quiet}} days)',
  none: 'No activity recorded',
  unknown: 'Activity not visible',
};

/** The status name, with the limits it stands for (so no legend needs a footnote). */
export const handelenLabel = (
  t: (key: string, options: Record<string, unknown>) => string,
  status: HandelenStatus,
): string =>
  t(`handelen.status.${status}`, {
    defaultValue: DEFAULT_LABEL[status],
    active: ACTIVE_DAYS,
    from: ACTIVE_DAYS + 1,
    quiet: QUIET_DAYS,
  });

/**
 * @param lastAt the last handeling; `null` = the feed was read and held none;
 *   `undefined` = the feed could not be read, so nothing may be claimed.
 * @param now when the feed was read (never the clock, so the view is pure).
 */
export function handelenStatus(lastAt: string | null | undefined, now: string): HandelenStatus {
  if (lastAt === undefined) return 'unknown';
  if (lastAt === null) return 'none';
  const days = (Date.parse(now) - Date.parse(lastAt)) / 86_400_000;
  if (!Number.isFinite(days)) return 'unknown';
  if (days <= ACTIVE_DAYS) return 'active';
  return days <= QUIET_DAYS ? 'quiet' : 'dormant';
}

/** A Groei initiative's handelen, off the loaded activity item. */
export function handelenOf(spaceId: string, activity: ActivityItem): NonNullable<InitiativeRow['handelen']> {
  const lastAt = activity.lastAt?.[spaceId];
  return { status: handelenStatus(lastAt, activity.fetchedAt), lastAt: lastAt ?? null };
}

/** The initiatives' names per status, for one phase. */
export type HandelenSplit = Record<HandelenStatus, string[]>;

const emptySplit = (): HandelenSplit => ({ active: [], quiet: [], dormant: [], none: [], unknown: [] });

/**
 * The phase chart's bars split by handelen: one entry per phase of the distribution, in
 * its order. Initiatives are matched by phase id, never by name; one without a (known)
 * phase goes to the trailing bucket, as in the distribution itself. `null` until every
 * Groei row has its handelen.
 */
export function phaseHandelen(
  phases: PhaseDistribution['phases'],
  rows: readonly InitiativeRow[],
): HandelenSplit[] | null {
  const groei = rows.filter((r) => r.kind === 'groei');
  if (groei.length === 0 || groei.some((r) => !r.handelen)) return null;
  const splits = phases.map(emptySplit);
  const indexOf = new Map(phases.map((p, i) => [p.key, i]));
  const unphased = phases.findIndex((p) => p.label === null);
  for (const r of groei) {
    const i = (r.phase ? indexOf.get(r.phase.key) : undefined) ?? unphased;
    if (i >= 0) splits[i][r.handelen!.status].push(r.name);
  }
  for (const s of splits) for (const k of HANDELEN_ORDER) s[k].sort((a, b) => a.localeCompare(b));
  return splits;
}
