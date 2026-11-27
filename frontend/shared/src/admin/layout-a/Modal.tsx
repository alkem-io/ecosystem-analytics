import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { containTab } from '../../lib/focus.js';

/**
 * Layout A's window: the same frame as the classification window (sheet from the bottom
 * on a phone, centred card from `sm` up), focus kept inside, Escape and the backdrop close
 * it unless `busy`.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  busy = false,
  children,
  footer,
  testId,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      containTab(e, ref.current);
      if (e.key === 'Escape' && !busyRef.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        role="presentation"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]"
        onClick={() => !busy && onClose()}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="a-modal-title"
        tabIndex={-1}
        data-testid={testId}
        className="relative flex max-h-[90dvh] w-full flex-col rounded-t-xl border border-border bg-card shadow-xl focus:outline-none sm:max-w-2xl sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="a-modal-title" className="text-base font-semibold text-foreground">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('admin.included.edit.close', { defaultValue: 'Close' })}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
