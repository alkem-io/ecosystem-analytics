import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { api } from '@ea/shared';
import type { MetaResponse } from '@server/types/api.js';

/** Format an ISO timestamp for display, falling back to a dash when unknown. */
function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * About dialog (deployment verification): shows build provenance — the SPA build
 * time/version baked in at frontend build, plus the server build time/commit and
 * the effective behaviour-tuning settings fetched from /api/meta. No connection
 * or OIDC/secret values are shown.
 */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MetaResponse>('/api/meta')
      .then((res) => {
        if (!cancelled) setMeta(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dismiss on Escape.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const settingsRows: { label: string; value: string | number }[] = meta
    ? [
        { label: t('about.settings.maxSpacesPerQuery'), value: meta.settings.maxSpacesPerQuery },
        {
          label: t('about.settings.activitySpacesPerQuery'),
          value: meta.settings.activitySpacesPerQuery,
        },
        { label: t('about.settings.cacheTtlHours'), value: meta.settings.cacheTtlHours },
        { label: t('about.settings.gdCacheTtlHours'), value: meta.settings.gdCacheTtlHours },
        {
          label: t('about.settings.aiQueryEnabled'),
          value: meta.settings.aiQueryEnabled ? t('about.on') : t('about.off'),
        },
        {
          label: t('about.settings.querySessionTtlMinutes'),
          value: meta.settings.querySessionTtlMinutes,
        },
        { label: t('about.settings.maxQueryLength'), value: meta.settings.maxQueryLength },
        { label: t('about.settings.maxFeedbackLength'), value: meta.settings.maxFeedbackLength },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('about.title')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-foreground">{t('about.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('about.close')}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('about.build')}
            </h3>
            <dl className="space-y-1.5 text-sm">
              <Row label={t('about.appVersion')} value={__APP_VERSION__} />
              <Row label={t('about.spaBuildTime')} value={fmt(__BUILD_TIME__)} />
              <Row label={t('about.serverBuildTime')} value={fmt(meta?.build.time)} />
              <Row label={t('about.commit')} value={meta?.build.commit ?? '—'} mono />
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('about.settingsTitle')}
            </h3>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!error && !meta && <p className="text-sm text-muted-foreground">{t('about.loading')}</p>}
            {meta && (
              <dl className="space-y-1.5 text-sm">
                {settingsRows.map((r) => (
                  <Row key={r.label} label={r.label} value={r.value} mono />
                ))}
              </dl>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`text-right text-foreground ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
