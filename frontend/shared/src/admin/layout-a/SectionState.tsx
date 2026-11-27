import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';

/** A section card in the layout-A style, with its own loading and error state. */
export function SectionState({
  id,
  title,
  subtitle,
  tools,
  loading,
  error,
  onRetry,
  children,
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  tools?: ReactNode;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby={`admin-${id}-title`}
      data-testid={`admin-section-${id}`}
      className="min-w-0 rounded-[10px] border border-border bg-card"
    >
      <div className="flex flex-wrap items-center gap-3 px-5 pt-[18px] pb-3.5 max-lg:px-4">
        <div className="min-w-0 flex-1 basis-[220px]">
          <h2 id={`admin-${id}-title`} className="text-[14.5px] font-semibold text-foreground">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{subtitle}</p>}
        </div>
        {tools && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{tools}</div>}
      </div>
      {error ? (
        <div role="alert" data-testid={`admin-section-${id}-error`} className="mx-5 mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="min-w-0 flex-1">{t('admin.sectionError', { defaultValue: 'This section could not be loaded.' })}</span>
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium hover:bg-destructive/10">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t('admin.retry', { defaultValue: 'Try again' })}
          </button>
        </div>
      ) : loading ? (
        <p className="inline-flex items-center gap-2 px-5 pb-5 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('admin.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

