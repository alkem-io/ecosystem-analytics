import type { DesignatedValues, IncludedSpaceView } from '@server/types/admin.js';

/** Sorting for the admin tables. Pure: what each column sorts on, and the comparison. */
export type SortDir = 'asc' | 'desc';
export interface TableSort<K extends string> {
  key: K;
  dir: SortDir;
}
/** `null` = nothing to sort on: such rows come last in BOTH directions. */
export type SortValue = string | number | null;

/** Clicking another column sorts it ascending; clicking the active one reverses it. */
export function nextSort<K extends string>(current: TableSort<K>, key: K): TableSort<K> {
  if (current.key !== key) return { key, dir: 'asc' };
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
}

/**
 * A sorted copy. Text compares by the reader's language with numbers in order ("TRL 2"
 * before "TRL 10"). Ties keep the rows by name, A→Z, whatever the direction.
 */
export function sortRows<R>(
  rows: readonly R[],
  valueOf: (row: R) => SortValue,
  nameOf: (row: R) => string,
  dir: SortDir,
  lang: string,
): R[] {
  const collator = new Intl.Collator(lang, { numeric: true, sensitivity: 'base' });
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row) => ({ row, value: valueOf(row), name: nameOf(row) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value !== b.value) return a.value === null ? 1 : -1;
      } else {
        const order =
          typeof a.value === 'number' && typeof b.value === 'number'
            ? a.value - b.value
            : collator.compare(String(a.value), String(b.value));
        if (order !== 0) return order * sign;
      }
      return collator.compare(a.name, b.name);
    })
    .map((r) => r.row);
}

/** Values as one sortable text, as they are shown; none → last. */
export const valuesSortValue = (values: readonly string[]): SortValue =>
  values.length === 0 ? null : values.join(', ');

/**
 * Phase and TRL are ordered levels: they sort in the order Alkemio gives them (Idee before
 * Pilot), not by letter. The other classifications are names, so A→Z.
 */
export function classificationSortValue(value: DesignatedValues | undefined): SortValue {
  if (!value || value.values.length === 0) return null;
  if ((value.key === 'phase' || value.key === 'trl') && typeof value.rank === 'number') return value.rank;
  return valuesSortValue(value.values);
}

/** Public before private; within each, active Spaces before archived/demo/inactive ones. */
export function visibilitySortValue(space: IncludedSpaceView): SortValue {
  const v = space.visibility;
  if (!v || v.contentPublic === null) return null;
  return (v.contentPublic ? 0 : 2) + (v.status && v.status !== 'ACTIVE' ? 1 : 0);
}
