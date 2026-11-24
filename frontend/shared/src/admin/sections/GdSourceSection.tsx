import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink, Pencil } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { adminApi } from '../api.js';
import { ClassificationDialog, toDesignatedValues } from '../ClassificationDialog.js';
import { Section, formatWhen, smallButton, textInput, useSectionData } from '../Section.js';

const chips = (values: string[]) =>
  values.length === 0 ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <span key={v} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
          {v}
        </span>
      ))}
    </span>
  );

/**
 * The GemeenteDelers initiatives, kept apart from the Groei initiatives: where they come
 * from (US6, FR-028–FR-031, from the manager's own GD data — the same counts the dashboard
 * prints as its `[GemeenteDelers]` console group) and each initiative with its NDS /
 * VNG 2030 classifications. A subspace's classifications can be edited on Alkemio; a post
 * has none of its own. LEGACY-GD-POSTS: the posts figures, the post rows and the
 * superseded list go with the posts path.
 */
export function GdSourceSection() {
  const { t, i18n } = useTranslation();
  const { data, setData, error, loading, retry } = useSectionData(() => adminApi.gdSource());
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<{ nameId: string; name: string } | null>(null);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = data?.initiatives ?? [];
    return f ? all.filter((i) => i.displayName.toLowerCase().includes(f)) : all;
  }, [data, filter]);
  const stat = (label: string, value: number, testId: string) => (
    <div className="rounded-lg bg-muted/50 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground" data-testid={testId}>
        {value}
      </p>
    </div>
  );
  return (
    <Section
      id="gd"
      title={t('admin.gd.title', { defaultValue: 'GemeenteDelers initiatives' })}
      description={t('admin.gd.description', {
        defaultValue:
          'The historical initiatives (2021–2025) the monitor adds from the GemeenteDelers Space when a viewer switches them on. Separate from the Groei initiatives.',
      })}
      loading={loading}
      error={error}
      onRetry={retry}
    >
      {data && !data.available && (
        <p role="alert" className="text-sm text-destructive" data-testid="gd-unavailable">
          {data.error === 'GD_SPACE_UNREADABLE'
            ? t('admin.gd.unreadable', { defaultValue: 'You cannot read the GemeenteDelers Space, so there is nothing to show.' })
            : t('admin.gd.loadFailed', { defaultValue: 'The GemeenteDelers source could not be read just now.' })}
        </p>
      )}
      {data && data.available && (
        <div className="space-y-4">
          {data.space && (
            <a href={data.space.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline">
              {data.space.displayName}
              <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            </a>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {stat(t('admin.gd.total', { defaultValue: 'Initiatives' }), data.total, 'gd-total')}
            {stat(t('admin.gd.viaSubspaces', { defaultValue: 'From subspaces' }), data.viaSubspaces, 'gd-subspaces')}
            {stat(t('admin.gd.viaPosts', { defaultValue: 'From posts' }), data.viaPosts, 'gd-posts')}
          </div>
          {data.migrationComplete && (
            <p className="flex items-center gap-2 text-sm text-success" data-testid="gd-migration-complete">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {t('admin.gd.migrationComplete', { defaultValue: 'Migration to subspaces complete: no posts are read any more.' })}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {t('admin.gd.readAt', { defaultValue: 'Last read' })}:{' '}
            {data.readAt ? formatWhen(data.readAt, i18n.language) : t('admin.gd.unknown', { defaultValue: 'unknown' })} ·{' '}
            {t('admin.gd.nextRefresh', { defaultValue: 'next refresh' })}:{' '}
            {data.nextRefreshAt ? formatWhen(data.nextRefreshAt, i18n.language) : t('admin.gd.unknown', { defaultValue: 'unknown' })}
          </p>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                {t('admin.gd.perInitiative', { defaultValue: 'Initiatives ({{count}})', count: data.initiatives.length })}
              </h3>
              <input
                className={cn(textInput, 'max-w-xs')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('admin.included.filter', { defaultValue: 'Filter this list' })}
                aria-label={t('admin.included.filter', { defaultValue: 'Filter this list' })}
              />
            </div>
            <div className="mt-2 max-h-[28rem] overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm" data-testid="gd-initiatives">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 font-medium">{t('admin.gd.colInitiative', { defaultValue: 'Initiative' })}</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">{t('admin.gd.colNds', { defaultValue: 'NDS priority' })}</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">{t('admin.gd.colVng', { defaultValue: 'VNG 2030 theme' })}</th>
                    <th className="px-3 py-2">
                      <span className="sr-only">{t('admin.included.colActions', { defaultValue: 'Actions' })}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map((i) => (
                    <tr key={i.nameId} className="align-top" data-testid="gd-row">
                      <td className="px-3 py-2">
                        {i.url ? (
                          <a href={i.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-primary hover:underline">
                            {i.displayName}
                          </a>
                        ) : (
                          <span className="font-medium text-foreground">{i.displayName}</span>
                        )}
                        {i.source === 'post' && (
                          <span className="ml-2 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {t('admin.gd.sourcePost', { defaultValue: 'post' })}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-3 py-2 md:table-cell">{chips(i.nds ?? [])}</td>
                      <td className="hidden px-3 py-2 md:table-cell">{chips(i.vng2030 ?? [])}</td>
                      <td className="px-3 py-1.5 text-right">
                        {i.source === 'subspace' && (
                          <button
                            type="button"
                            className={smallButton}
                            onClick={() => setOpen({ nameId: i.nameId, name: i.displayName })}
                            aria-label={t('admin.included.openClassificationsNamed', {
                              defaultValue: 'Edit the classifications of {{name}}',
                              name: i.displayName,
                            })}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            {t('admin.included.openClassifications', { defaultValue: 'Edit' })}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.viaPosts > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('admin.gd.postsNote', {
                  defaultValue:
                    'Initiatives that are still a post have no classifications of their own: their NDS and VNG 2030 values are read from their tags, as on the dashboard. They become editable once moved to a subspace.',
                })}
              </p>
            )}
          </div>
          {data.superseded.length > 0 && (
            <details className="rounded-lg border border-border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                {t('admin.gd.superseded', { defaultValue: 'Posts replaced by a subspace ({{count}})', count: data.superseded.length })}
              </summary>
              <ul className="mt-2 divide-y divide-border">
                {data.superseded.map((s) => (
                  <li key={s.postNameId} className="min-w-0 py-1.5 text-sm">
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
            <p className="text-xs text-muted-foreground">
              {t('admin.gd.ambiguous', {
                defaultValue: 'Matched several posts, so nothing was dropped for: {{list}}',
                list: data.ambiguous.join(', '),
              })}
            </p>
          )}
        </div>
      )}
      {open && (
        <ClassificationDialog
          nameId={open.nameId}
          name={open.name}
          onClose={() => setOpen(null)}
          onSaved={(view) => {
            const values = toDesignatedValues(view);
            const of = (key: string) => values.find((v) => v.key === key)?.values ?? [];
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
    </Section>
  );
}
