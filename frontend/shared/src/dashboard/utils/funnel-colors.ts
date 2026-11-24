/**
 * What the funnel's dots are coloured by: their source (Groei / GemeenteDelers — the
 * default, matching every other dashboard chart), their handelen (utils/handelen.ts), or
 * one classification (NDS priority or VNG 2030 theme).
 *
 * A classification value's colour follows the VALUE, never its rank: slot n goes to the
 * n-th value of the authored Alkemio vocabulary, so filtering the funnel never repaints
 * what stays (dataviz: "color follows the entity"). Hues come from the validated `--cat-*`
 * tokens (tokens.css) in fixed order and are never cycled — a ninth value and beyond fold
 * into one "other" colour. An initiative with several values is drawn as a split dot; one
 * with none is the neutral "no classification" grey.
 */
import type { InitiativeRow } from './initiatives.js';

/** The classifications the dots can be coloured by. */
export type FunnelCategory = 'nds' | 'vng2030';
export type FunnelColorBy = 'source' | 'handelen' | FunnelCategory;

export const CATEGORY_SLOTS = 8;
export const OTHER_COLOR = 'var(--cat-other)';
export const NONE_COLOR = 'var(--cat-none)';
/** Sentinel legend keys — never a vocabulary label. */
export const OTHER_KEY = '\u0000other';
export const NONE_KEY = '\u0000none';

export interface CategoryLegendEntry {
  /** The value label, or OTHER_KEY / NONE_KEY. */
  key: string;
  /** Null for the sentinels (the caller localises them). */
  label: string | null;
  color: string;
  /** Initiatives in the funnel carrying it. */
  count: number;
}

export interface CategoryScale {
  /** The colour for one value label. */
  colorOf(label: string): string;
  /** The legend key a value belongs to (its label, or OTHER_KEY past the eighth slot). */
  keyOf(label: string): string;
}

/**
 * The scale for a vocabulary in authored order. Labels the vocabulary does not know
 * (a value removed in Alkemio but still on a cached row) fold into "other" too.
 */
export function categoryScale(vocabulary: readonly string[]): CategoryScale {
  const slot = new Map<string, number>();
  vocabulary.forEach((label, i) => slot.set(label, i));
  const keyOf = (label: string) => {
    const i = slot.get(label);
    return i !== undefined && i < CATEGORY_SLOTS ? label : OTHER_KEY;
  };
  return {
    keyOf,
    colorOf: (label) => {
      const i = slot.get(label);
      return i !== undefined && i < CATEGORY_SLOTS ? `var(--cat-${i + 1})` : OTHER_COLOR;
    },
  };
}

/** The values of a row in the chosen classification. */
export function valuesOf(row: InitiativeRow, by: FunnelCategory): string[] {
  return by === 'nds' ? row.nds : row.vng2030;
}

/**
 * The legend keys a row belongs to, in vocabulary order, deduplicated (two values past the
 * eighth slot are one "other"). `[NONE_KEY]` when the row has no value.
 */
export function rowKeys(
  row: InitiativeRow,
  by: FunnelCategory,
  scale: CategoryScale,
  vocabulary: readonly string[],
): string[] {
  const values = valuesOf(row, by);
  if (values.length === 0) return [NONE_KEY];
  const order = (label: string) => {
    const i = vocabulary.indexOf(label);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const keys: string[] = [];
  for (const v of [...values].sort((a, b) => order(a) - order(b))) {
    const k = scale.keyOf(v);
    if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

/** The colour for a legend key. */
export function colorOfKey(key: string, scale: CategoryScale): string {
  if (key === NONE_KEY) return NONE_COLOR;
  if (key === OTHER_KEY) return OTHER_COLOR;
  return scale.colorOf(key);
}

/**
 * The legend for the rows in the funnel: every vocabulary value that occurs, in vocabulary
 * order, then "other", then "no classification" — each with how many initiatives carry it.
 */
export function categoryLegend(
  rows: readonly InitiativeRow[],
  by: FunnelCategory,
  vocabulary: readonly string[],
): CategoryLegendEntry[] {
  const scale = categoryScale(vocabulary);
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const k of rowKeys(row, by, scale, vocabulary)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const entries: CategoryLegendEntry[] = [];
  for (const label of vocabulary.slice(0, CATEGORY_SLOTS)) {
    const count = counts.get(label);
    if (count) entries.push({ key: label, label, color: scale.colorOf(label), count });
  }
  for (const key of [OTHER_KEY, NONE_KEY]) {
    const count = counts.get(key);
    if (count) entries.push({ key, label: null, color: colorOfKey(key, scale), count });
  }
  return entries;
}
