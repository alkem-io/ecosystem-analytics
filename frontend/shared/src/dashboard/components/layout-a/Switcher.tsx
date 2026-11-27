import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn, useIsCompact } from '@ea/shared';

export interface SwitcherItem {
  key: string;
  name: string;
  sub?: string;
  avatar: ReactNode;
}
export interface SwitcherGroup {
  label: string;
  items: SwitcherItem[];
  /** Show only the first N until the viewer searches (long groups). */
  previewLimit?: number;
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = fold(text).indexOf(q);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[2px] bg-[#fff1c7] px-px text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * The page-level switcher on the Initiatief / Gemeente information pages: a breadcrumb
 * back to the list, a button showing the current item, a searchable listbox (keyboard:
 * ↑ ↓ Enter Esc), and previous/next stepping. A bottom sheet on phones.
 */
export function Switcher({
  crumb,
  onCrumb,
  groups,
  current,
  onPick,
  placeholder,
  noun,
}: {
  crumb: string;
  onCrumb: () => void;
  groups: SwitcherGroup[];
  current: string | null;
  onPick: (key: string) => void;
  placeholder: string;
  /** "initiatieven" / "gemeenten" — used in the counter and the footer. */
  noun: string;
}) {
  const { t } = useTranslation();
  const compact = useIsCompact();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const idx = Math.max(0, flat.findIndex((x) => x.key === current));
  const cur = flat[idx];
  const fq = fold(q.trim());

  const visible = useMemo(
    () =>
      groups
        .map((g) => {
          const all = g.items.filter((x) => !fq || fold(x.name).includes(fq));
          const cap = fq ? 60 : (g.previewLimit ?? 500);
          return { label: g.label, items: all.slice(0, cap), total: all.length };
        })
        .filter((g) => g.total > 0),
    [groups, fq],
  );
  const visFlat = useMemo(() => visible.flatMap((g) => g.items), [visible]);

  // Opening: focus the search, start at the current item and bring it into view.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(Math.max(0, flat.findIndex((x) => x.key === current)));
    requestAnimationFrame(() => {
      if (!compact) inputRef.current?.focus();
      scrollActive('center');
    });
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scrollActive = (mode: 'center' | 'nearest') => {
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[data-active="true"]');
    if (!box || !el) return;
    const top = el.offsetTop;
    const head = 34;
    if (mode === 'center') box.scrollTop = Math.max(0, top - box.clientHeight / 2 + el.offsetHeight / 2);
    else if (top < box.scrollTop + head) box.scrollTop = top - head;
    else if (top + el.offsetHeight > box.scrollTop + box.clientHeight - 4) box.scrollTop = top + el.offsetHeight - box.clientHeight + 4;
  };
  useEffect(() => scrollActive('nearest'), [active]);

  const pick = (key: string) => {
    setOpen(false);
    onPick(key);
  };
  const step = (d: number) => {
    if (!flat.length) return;
    onPick(flat[(idx + d + flat.length) % flat.length].key);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false);
    if (!visFlat.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + visFlat.length) % visFlat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const x = visFlat[Math.min(active, visFlat.length - 1)];
      if (x) pick(x.key);
    }
  };

  let k = -1;
  const panel = (
    <div className="flex flex-col">
      <label className={cn('relative block', compact ? 'sticky top-0 z-10 bg-card px-4 pt-1.5 pb-2' : 'px-2.5 pt-2.5 pb-1.5')}>
        <Search className={cn('pointer-events-none absolute h-4 w-4 text-muted-foreground', compact ? 'top-[18px] left-7' : 'top-[22px] left-[22px]')} aria-hidden />
        <span className="sr-only">{placeholder}</span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder={placeholder}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={visFlat[active] ? `${listId}-${active}` : undefined}
          className={cn(
            'w-full rounded-lg border border-border bg-muted pr-3 pl-[38px] text-foreground focus:border-transparent focus:bg-card focus:outline-2 focus:outline-[var(--primary)]',
            compact ? 'h-[46px] text-base' : 'h-10 text-[14.5px]',
          )}
        />
      </label>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        className={cn('relative overflow-y-auto px-1.5 pb-2', compact ? 'max-h-[60vh] px-2.5' : 'max-h-[min(420px,56vh)]')}
      >
        {visible.length === 0 && (
          <p className="px-2.5 py-2 text-[12.5px] text-muted-foreground">
            {t('switcher.none', { defaultValue: 'Niets gevonden voor “{{q}}”.', q })}
          </p>
        )}
        {visible.map((g) => (
          <div key={g.label} role="group" aria-label={g.label}>
            <div className="sticky top-0 z-[1] flex items-center justify-between bg-card px-2 pt-2.5 pb-1 text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              <span>{g.label}</span>
              <em className="font-medium tracking-normal not-italic">{g.total}</em>
            </div>
            {g.items.map((x) => {
              k++;
              const i = k;
              const on = x.key === current;
              return (
                <button
                  key={x.key}
                  id={`${listId}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={on}
                  data-active={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(x.key)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2 text-left',
                    compact ? 'min-h-[54px] py-1.5' : 'py-[7px]',
                    i === active && 'bg-muted shadow-[inset_0_0_0_1px_var(--border)]',
                  )}
                >
                  <span className="grid h-[30px] w-[30px] shrink-0 place-items-center overflow-hidden">{x.avatar}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-semibold text-foreground">
                      <Highlight text={x.name} q={fq} />
                    </b>
                    {x.sub && <small className="block text-xs text-muted-foreground">{x.sub}</small>}
                  </span>
                  {on && <Check className="h-4 w-4 shrink-0 text-[#1b6ea8]" aria-hidden />}
                </button>
              );
            })}
            {g.items.length < g.total && (
              <p className="px-2.5 py-2 text-[12.5px] text-muted-foreground">
                {fq
                  ? t('switcher.more', { defaultValue: 'Nog {{n}} resultaten. Typ verder om te verfijnen.', n: g.total - g.items.length })
                  : t('switcher.typeToSearch', { defaultValue: 'Typ om alle {{n}} te doorzoeken', n: g.total })}
              </p>
            )}
          </div>
        ))}
      </div>
      {!compact && (
        <div className="flex items-center gap-3 border-t border-border bg-[#fafbfc] px-3.5 py-2 text-[11.5px] text-muted-foreground">
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t('switcher.choose', { defaultValue: 'kiezen' })}
          </span>
          <span>
            <Kbd>↵</Kbd> {t('switcher.open', { defaultValue: 'openen' })}
          </span>
          <span>
            <Kbd>esc</Kbd> {t('switcher.close', { defaultValue: 'sluiten' })}
          </span>
          <span className="flex-1" />
          <span>
            {flat.length} {noun}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="mb-4 flex min-h-11 flex-wrap items-center gap-2.5" ref={rootRef}>
      {!compact && (
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label={t('switcher.breadcrumb', { defaultValue: 'Kruimelpad' })}>
          <button type="button" onClick={onCrumb} className="-mx-1.5 rounded-md px-1.5 py-1 font-medium hover:bg-[#e8eef5] hover:text-foreground">
            {crumb}
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-[#cbd5e1]" aria-hidden />
        </nav>
      )}
      <div className={cn('relative min-w-0', compact && 'flex-1')}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            'inline-flex max-w-full min-w-0 items-center gap-2.5 rounded-[10px] border border-border bg-card pr-3 pl-[7px] shadow-[0_1px_2px_rgba(29,56,74,.05)] transition-shadow hover:border-[#cbd5e1]',
            compact ? 'h-12 w-full' : 'h-11',
            open && 'border-[var(--sel-line,#9ad3ef)] shadow-[0_0_0_3px_#e8f5fc]',
          )}
        >
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center overflow-hidden">{cur?.avatar}</span>
          <span className={cn('min-w-0 truncate text-[15.5px] font-semibold tracking-[-0.01em] text-foreground', compact && 'flex-1 text-left')}>
            {cur?.name}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {open && !compact && (
          <div className="absolute top-[calc(100%+8px)] left-0 z-[60] w-[460px] max-w-[calc(100vw-40px)] overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_12px_32px_rgba(29,56,74,.16),0_2px_6px_rgba(29,56,74,.06)]">
            {panel}
          </div>
        )}
      </div>
      {!compact && <span className="flex-1" />}
      <div className="flex items-center gap-1.5">
        {!compact && (
          <span className="mr-1 text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
            {idx + 1} {t('switcher.of', { defaultValue: 'van' })} {flat.length}
          </span>
        )}
        {[
          [-1, ChevronLeft, t('switcher.prev', { defaultValue: 'Vorige' })],
          [1, ChevronRight, t('switcher.next', { defaultValue: 'Volgende' })],
        ].map(([d, Icon, label]) => {
          const I = Icon as typeof ChevronLeft;
          return (
            <button
              key={String(d)}
              type="button"
              onClick={() => step(d as number)}
              aria-label={label as string}
              title={label as string}
              className={cn('grid place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground', compact ? 'h-12 w-12' : 'h-9 w-9')}
            >
              <I className="h-[17px] w-[17px]" aria-hidden />
            </button>
          );
        })}
      </div>
      {open && compact && (
        <div className="fixed inset-0 z-50 flex items-end bg-foreground/40" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={placeholder} className="max-h-[82%] w-full overflow-hidden rounded-t-2xl bg-card pb-[max(1rem,var(--safe-bottom))]" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
            <i className="mx-auto mt-2.5 mb-1 block h-1 w-10 rounded bg-[#cbd5e1]" />
            {panel}
          </div>
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mr-0.5 rounded border border-b-2 border-[#cbd5e1] bg-card px-1 font-sans text-[10.5px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
