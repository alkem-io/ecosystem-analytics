import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { cn, useIsCompact } from '@ea/shared';

/**
 * The "no filter selected" sentinel. Exported (rather than redeclared per tab) so
 * the value the bar writes and the value a tab tests against cannot drift apart.
 */
export const FILTER_ALL = '__all__';

/** One dropdown filter. Shape shared by the Cities and Initiatives tables. */
export interface FilterDef {
  key: string;
  /** i18n key for the filter's label. */
  labelKey: string;
  options: { value: string; label: string; count?: number }[];
}

/**
 * The toolbar above a data table: free-text search, a dropdown per categorical
 * column, and the row count.
 *
 * Two presentations, because a row of nine dropdowns does not survive a 390px
 * viewport — laid side by side they collapse to slivers with their labels printed
 * over each other. So on a compact viewport the search takes the full width and
 * the dropdowns move behind a "Filters" disclosure that reports how many are
 * active, opening into a two-column grid. Nothing is removed: every filter the
 * desktop offers is one tap away, and the count keeps a narrowed table from
 * looking like a broken one.
 */
export function TableFilterBar({
  query,
  onQueryChange,
  searchPlaceholder,
  filters,
  values,
  onFilterChange,
  allLabel,
  countLabel,
  sortControl,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder: string;
  filters: FilterDef[];
  values: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  /** Label of each dropdown's "no filter" option. */
  allLabel: string;
  /** Already-formatted "N gemeentes" / "N initiatives" string. */
  countLabel: string;
  /** The card view's sort control; only rendered on a compact viewport. */
  sortControl?: ReactNode;
}) {
  const { t } = useTranslation();
  const compact = useIsCompact();
  const [open, setOpen] = useState(false);

  const shown = filters.filter((f) => f.options.length > 0);
  const activeCount = shown.filter((f) => values[f.key] && values[f.key] !== FILTER_ALL).length;

  const select = (f: FilterDef, extra?: string) => (
    <select
      value={values[f.key] ?? FILTER_ALL}
      onChange={(e) => onFilterChange(f.key, e.target.value)}
      // Explicit, not inherited from the wrapping <label>: a <select>'s accessible name
      // otherwise absorbs its option text, so every filter ends up named after the union
      // of its values and no two are distinguishable.
      aria-label={t(f.labelKey)}
      className={cn(
        'min-w-0 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        extra,
      )}
    >
      <option value={FILTER_ALL}>{allLabel}</option>
      {f.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.count == null ? o.label : `${o.label} (${o.count})`}
        </option>
      ))}
    </select>
  );

  const search = (
    <div className={cn('relative', compact ? 'w-full' : 'w-auto')}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={searchPlaceholder}
        className={cn(
          'rounded-md border border-border bg-card py-1.5 pl-8 pr-3 text-sm text-foreground',
          'placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          compact ? 'w-full' : 'w-56',
        )}
      />
    </div>
  );

  if (!compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-6 py-3">
        {search}
        {shown.map((f) => (
          <label key={f.key} className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {t(f.labelKey)}
            {select(f, 'max-w-44')}
          </label>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{countLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
      {search}

      <div className="flex items-center gap-2">
        {shown.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            data-touch-target
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground',
              'transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              activeCount > 0 && 'border-primary text-primary',
            )}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t('table.filters', { defaultValue: 'Filters' })}
            {activeCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                {activeCount}
              </span>
            )}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          </button>
        )}
        {sortControl}
      </div>

      {open && shown.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 pb-1">
          {shown.map((f) => (
            <label key={f.key} className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
              {t(f.labelKey)}
              {select(f)}
            </label>
          ))}
        </div>
      )}

      <span className="text-xs text-muted-foreground">{countLabel}</span>
    </div>
  );
}


