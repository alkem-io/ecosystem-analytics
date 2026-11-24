import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../lib/cn.js';

/**
 * One admin section's data: loads on mount, keeps its own loading / error / retry state,
 * and never affects another section (FR-033).
 */
export function useSectionData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRef
      .current()
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { data, setData, error, loading, retry };
}

export function Section({
  id,
  title,
  description,
  loading,
  error,
  onRetry,
  actions,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby={`admin-${id}-title`}
      data-testid={`admin-section-${id}`}
      className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`admin-${id}-title`} className="text-base font-semibold text-foreground sm:text-lg">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="mt-4 min-w-0">
        {error ? (
          <div
            role="alert"
            data-testid={`admin-section-${id}-error`}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span className="min-w-0 flex-1">
              {t('admin.sectionError', { defaultValue: 'This section could not be loaded.' })}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium',
                'hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive',
              )}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {t('admin.retry', { defaultValue: 'Try again' })}
            </button>
          </div>
        ) : loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t('admin.loading', { defaultValue: 'Loading…' })}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export const smallButton = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground',
  'transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
);

export const primarySmallButton = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground',
  'transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
);

export const textInput = cn(
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground',
  'placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
);

/** Format an ISO timestamp in the reader's language. */
export function formatWhen(iso: string | null, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(lang.startsWith('nl') ? 'nl-NL' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}
