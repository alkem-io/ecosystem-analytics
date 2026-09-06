import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownUp } from 'lucide-react';
import { cn } from '@ea/shared';

/**
 * The mobile presentation of a wide data table.
 *
 * The Cities and Initiatives tables are 9–13 columns wide. On a phone that is
 * either a horizontal scroll (where the row you are reading loses its name as
 * soon as you scroll to the number you wanted) or a squeeze to unreadable. So
 * below `lg` each row is re-laid as a card: the identifying column becomes the
 * card's heading, and the remaining columns become a two-up label/value grid.
 *
 * The data, the filtering and the sort are unchanged — this is a presentation of
 * the same rows the table renders, so the two views can never disagree.
 */

export interface RecordField {
  label: string;
  value: ReactNode;
  /** Span the full card width — for chip clouds and other wrapping content. */
  full?: boolean;
}

export function RecordCard({
  title,
  onTitleClick,
  fields,
}: {
  title: ReactNode;
  /** When set, the heading is a button (the table's row-opens-details affordance). */
  onTitleClick?: () => void;
  fields: RecordField[];
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-3">
      {onTitleClick ? (
        <button
          type="button"
          onClick={onTitleClick}
          data-touch-target
          className={cn(
            'w-full text-left text-base font-semibold text-foreground underline-offset-2',
            'hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
        >
          {title}
        </button>
      ) : (
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
      )}

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        {fields.map((f, i) => (
          <div key={`${f.label}-${i}`} className={cn('min-w-0', f.full && 'col-span-2')}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {f.label}
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">{f.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/** The scrolling list the cards live in. */
export function RecordCardList({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 p-3 pb-[max(0.75rem,var(--safe-bottom))]">{children}</div>
  );
}

/**
 * Sorting, for the card view. Column headers are where a table hides its sort
 * control, and cards have no headers — so the same sort keys become a select plus
 * a direction toggle. Without this, switching to a phone silently removes the
 * ability to sort at all.
 */
export function RecordSortControl<K extends string>({
  options,
  sortKey,
  sortDir,
  onSortKey,
  onToggleDir,
}: {
  options: { key: K; label: string }[];
  sortKey: K;
  sortDir: 'asc' | 'desc';
  onSortKey: (key: K) => void;
  onToggleDir: () => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground">
      <span className="shrink-0">{t('table.sortBy', { defaultValue: 'Sort' })}</span>
      <select
        value={sortKey}
        onChange={(e) => onSortKey(e.target.value as K)}
        aria-label={t('table.sortBy', { defaultValue: 'Sort' })}
        className={cn(
          'min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onToggleDir}
        data-touch-target
        aria-label={
          sortDir === 'asc'
            ? t('table.sortAsc', { defaultValue: 'Ascending' })
            : t('table.sortDesc', { defaultValue: 'Descending' })
        }
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground',
          'transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <ArrowDownUp className={cn('h-4 w-4', sortDir === 'asc' && 'rotate-180')} aria-hidden />
      </button>
    </label>
  );
}
