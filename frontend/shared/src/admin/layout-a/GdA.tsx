import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, Pencil, Search } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { useIsCompact } from '../../hooks/useMediaQuery.js';
import { adminApi } from '../api.js';
import { ClassificationDialog, toDesignatedValues } from '../ClassificationDialog.js';
import { formatWhen, useSectionData } from '../Section.js';
import { sortRows, valuesSortValue, type TableSort } from '../tableSort.js';
import { SectionState } from './SectionState.js';

/**
 * Layout A — the GemeenteDelers initiatives. Same data and behaviour as
 * `GdSourceSection` (source summary, the initiatives with their NDS / VNG 2030 values, a
 * subspace editable on Alkemio through its window, posts read-only); drawn as two cards in
 * the dashboard's style. LEGACY-GD-POSTS: the posts figures, the "bericht" tag and the
 * superseded list go with the posts path.
 */

type Col = 'space' | 'nds' | 'vng2030';
const PAGE = 60;

export function GdA() {
  const { t, i18n } = useTranslation();
  const compact = useIsCompact();
  const { data, setData, error, loading, retry } = useSectionData(() => adminApi.gdSource());
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<TableSort<Col>>({ key: 'space', dir: 'asc' });
  const [open, setOpen] = useState<{ nameId: string; name: string } | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data?.initiatives ?? [];
    return sortRows(
      q ? all.filter((i) => i.displayName.toLowerCase().includes(q)) : all,
      (i) => (sort.key === 'space' ? i.displayName : valuesSortValue(i[sort.key] ?? [])),
      (i) => i.displayName,
      sort.dir,
      i18n.language,
    );
  }, [data, query, sort, i18n.language]);

  const when = (iso: string | null) =>
    iso ? formatWhen(iso, i18n.language) : t('admin.gd.unknown', { defaultValue: 'unknown' });
  const values = (v: string[] | undefined) =>
    v && v.length ? (
      <span className="text-[13px] text-foreground">{v.join(', ')}</span>
    ) : (
      <span className="text-[13px] text-muted-foreground">—</span>
    );
  const th = (key: Col, label: string, className?: string) => {
    const on = sort.key === key;
    const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={cn('px-2 py-2 font-medium', className)} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
          className={cn('inline-flex items-center gap-1 hover:text-foreground', on && 'text-foreground')}
        >
          {label}
          {on && <Arrow className="h-3 w-3" aria-hidden />}
        </button>
      </th>
    );
  };
  const editBtn = (nameId: string, name: string) => (
    <button
      type="button"
      onClick={() => setOpen({ nameId, name })}
      aria-label={t('admin.included.openClassificationsNamed', { defaultValue: 'Edit the classifications of {{name}}', name })}
      title={t('admin.included.openClassifications', { defaultValue: 'Edit' })}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-lg:h-10 max-lg:w-10"
    >
      <Pencil className="h-4 w-4" aria-hidden />
    </button>
  );
  const postTag = (
    <span className="ml-2 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {t('admin.gd.sourcePost', { defaultValue: 'post' })}
    </span>
  );

  const kpi = (label: string, value: number, testId: string) => (
    <div className="min-w-0 rounded-[10px] border border-border bg-background px-4 py-3">
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground tabular-nums" data-testid={testId}>
        {value.toLocaleString(i18n.language)}
      </p>
    </div>
  );

  return (
    <>
      <SectionState
        id="gd"
        title={t('admin.gd.title', { defaultValue: 'GemeenteDelers initiatives' })}
        subtitle={t('admin.gd.description', {
          defaultValue:
            'The historical initiatives (2021–2025) the monitor adds from the GemeenteDelers Space when a viewer switches them on. Separate from the Groei initiatives.',
        })}
        loading={loading}
        error={error}
        onRetry={retry}
        tools={
          data?.space && (
            <a
              href={data.space.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted max-lg:h-11"
            >
              {data.space.displayName}
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )
        }
      >
        {data && !data.available && (
          <p role="alert" className="px-5 pb-5 text-sm text-destructive" data-testid="gd-unavailable">
            {data.error === 'GD_SPACE_UNREADABLE'
              ? t('admin.gd.unreadable', { defaultValue: 'You cannot read the GemeenteDelers Space, so there is nothing to show.' })
              : t('admin.gd.loadFailed', { defaultValue: 'The GemeenteDelers source could not be read just now.' })}
          </p>
        )}
        {data && data.available && (
          <div className="flex flex-col gap-3 px-5 pb-5 max-lg:px-4">
            <div className="grid grid-cols-3 gap-3 max-sm:gap-2">
              {kpi(t('admin.gd.total', { defaultValue: 'Initiatives' }), data.total, 'gd-total')}
              {kpi(t('admin.gd.viaSubspaces', { defaultValue: 'From subspaces' }), data.viaSubspaces, 'gd-subspaces')}
              {kpi(t('admin.gd.viaPosts', { defaultValue: 'From posts' }), data.viaPosts, 'gd-posts')}
            </div>
            {data.total > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-[var(--series-gd)]" style={{ width: `${(data.viaSubspaces / data.total) * 100}%` }} />
                </div>
                <span className="shrink-0 text-[13px] text-muted-foreground">
                  {t('admin.a.migrated', {
                    defaultValue: '{{pct}}% omgezet naar subspaces',
                    pct: Math.round((data.viaSubspaces / data.total) * 100),
                  })}
                </span>
              </div>
            )}
            {data.migrationComplete && (
              <p className="flex items-center gap-2 text-sm text-success" data-testid="gd-migration-complete">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {t('admin.gd.migrationComplete', { defaultValue: 'Migration to subspaces complete: no posts are read any more.' })}
              </p>
            )}
            <p className="text-[13px] text-muted-foreground">
              {t('admin.gd.readAt', { defaultValue: 'Last read' })}: {when(data.readAt)} ·{' '}
              {t('admin.gd.nextRefresh', { defaultValue: 'next refresh' })}: {when(data.nextRefreshAt)}
            </p>
          </div>
        )}
      </SectionState>

      {data && data.available && (
        <SectionState
          id="gd-initiatives"
          title={t('admin.gd.perInitiative', { defaultValue: 'Initiatives ({{count}})', count: data.initiatives.length })}
          subtitle={
            data.viaPosts > 0
              ? t('admin.gd.postsNote', {
                  defaultValue:
                    'Initiatives that are still a post have no classifications of their own: their NDS and VNG 2030 values are read from their tags, as on the dashboard. They become editable once moved to a subspace.',
                })
              : undefined
          }
          loading={false}
          error={null}
          onRetry={retry}
          tools={
            <label className="relative block w-full min-w-0 sm:w-[240px] lg:w-[300px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                placeholder={t('admin.a.search', { defaultValue: 'Zoek initiatief' })}
                aria-label={t('admin.a.search', { defaultValue: 'Zoek initiatief' })}
                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-lg:h-11"
              />
            </label>
          }
        >
          {compact ? (
            <ul className="divide-y divide-border border-t border-border" data-testid="gd-initiatives">
              {rows.slice(0, limit).map((i) => (
                <li key={i.nameId} className="flex items-start gap-2 px-4 py-3" data-testid="gd-row">
                  <span className="min-w-0 flex-1">
                    <b className="font-semibold text-foreground">{i.displayName}</b>
                    {i.source === 'post' && postTag}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {[...(i.nds ?? []), ...(i.vng2030 ?? [])].join(' · ') || '—'}
                    </span>
                  </span>
                  {i.source === 'subspace' && editBtn(i.nameId, i.displayName)}
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full border-collapse text-sm" data-testid="gd-initiatives">
              <thead>
                <tr className="border-y border-border text-left text-[12.5px] text-muted-foreground">
                  {th('space', t('admin.gd.colInitiative', { defaultValue: 'Initiative' }), 'pl-5')}
                  {th('nds', t('admin.gd.colNds', { defaultValue: 'NDS priority' }))}
                  {th('vng2030', t('admin.gd.colVng', { defaultValue: 'VNG 2030 theme' }))}
                  <th className="py-2 pl-2 pr-5">
                    <span className="sr-only">{t('admin.a.colActions', { defaultValue: 'Acties' })}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((i) => (
                  <tr key={i.nameId} className="border-b border-border last:border-b-0" data-testid="gd-row">
                    <td className="py-2.5 pl-5 pr-2">
                      {i.url ? (
                        <a href={i.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:text-primary hover:underline">
                          {i.displayName}
                        </a>
                      ) : (
                        <span className="font-semibold text-foreground">{i.displayName}</span>
                      )}
                      {i.source === 'post' && postTag}
                    </td>
                    <td className="px-2 py-2.5">{values(i.nds)}</td>
                    <td className="px-2 py-2.5">{values(i.vng2030)}</td>
                    <td className="py-1.5 pl-2 pr-5 text-right">{i.source === 'subspace' && editBtn(i.nameId, i.displayName)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows.length > limit && (
            <div className="flex justify-center border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE)}
                className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted max-lg:h-11"
              >
                {t('admin.a.showMore', { defaultValue: 'Toon {{count}} meer', count: Math.min(PAGE, rows.length - limit) })}
              </button>
            </div>
          )}
          {(data.superseded.length > 0 || (data.ambiguous?.length ?? 0) > 0) && (
            <div className="border-t border-border px-5 py-3 max-lg:px-4">
              {data.superseded.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    {t('admin.gd.superseded', { defaultValue: 'Posts replaced by a subspace ({{count}})', count: data.superseded.length })}
                  </summary>
                  <ul className="mt-2 divide-y divide-border">
                    {data.superseded.map((s) => (
                      <li key={s.postNameId} className="min-w-0 py-1.5 text-[13px]">
                        <code className="break-all">{s.postNameId}</code> →{' '}
                        {s.subspaceUrl ? (
                          <a href={s.subspaceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {s.subspaceDisplayName ?? s.subspaceNameId}
                          </a>
                        ) : (
                          <span>{s.subspaceDisplayName ?? s.subspaceNameId}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {data.ambiguous && data.ambiguous.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('admin.gd.ambiguous', {
                    defaultValue: 'Matched several posts, so nothing was dropped for: {{list}}',
                    list: data.ambiguous.join(', '),
                  })}
                </p>
              )}
            </div>
          )}
        </SectionState>
      )}

      {open && (
        <ClassificationDialog
          nameId={open.nameId}
          name={open.name}
          onClose={() => setOpen(null)}
          onSaved={(view) => {
            const v = toDesignatedValues(view);
            const of = (key: string) => v.find((x) => x.key === key)?.values ?? [];
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    initiatives: prev.initiatives.map((i) =>
                      i.nameId === open.nameId ? { ...i, nds: of('nds'), vng2030: of('vng2030') } : i,
                    ),
                  }
                : prev,
            );
          }}
        />
      )}
    </>
  );
}
