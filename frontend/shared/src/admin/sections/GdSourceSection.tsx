import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { adminApi } from '../api.js';
import { Section, formatWhen, useSectionData } from '../Section.js';

/**
 * Where the GemeenteDelers initiatives come from (US6, FR-028–FR-031), from the manager's
 * own GD data — the same counts the dashboard prints as its `[GemeenteDelers]` console
 * group. LEGACY-GD-POSTS: the posts figures and the superseded list go with the posts path.
 */
export function GdSourceSection() {
  const { t, i18n } = useTranslation();
  const { data, error, loading, retry } = useSectionData(() => adminApi.gdSource());
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
      title={t('admin.gd.title', { defaultValue: 'GemeenteDelers source' })}
      description={t('admin.gd.description', {
        defaultValue: 'The initiatives the monitor adds from the GemeenteDelers Space.',
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
          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              {t('admin.gd.perInitiative', { defaultValue: 'Each initiative and its source ({{count}})', count: data.initiatives.length })}
            </summary>
            <ul className="mt-2 divide-y divide-border">
              {data.initiatives.map((i) => (
                <li key={i.nameId} className="flex min-w-0 items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0 truncate">{i.displayName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {i.source === 'subspace'
                      ? t('admin.gd.sourceSubspace', { defaultValue: 'subspace' })
                      : t('admin.gd.sourcePost', { defaultValue: 'post' })}
                  </span>
                </li>
              ))}
            </ul>
          </details>
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
    </Section>
  );
}
