import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { nextSort, type TableSort } from './tableSort.js';

/** A column header that sorts its table; the arrow and `aria-sort` say how it is sorted. */
export function SortableTh<K extends string>({
  column,
  label,
  sort,
  onSort,
  className,
}: {
  column: K;
  label: string;
  sort: TableSort<K>;
  onSort: (next: TableSort<K>) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn('py-2 font-medium', className)}
      data-testid={`sort-${column}`}
    >
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, column))}
        className={cn(
          'inline-flex items-center gap-1 rounded text-left hover:text-foreground',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5 shrink-0', !active && 'opacity-40')} aria-hidden />
      </button>
    </th>
  );
}
