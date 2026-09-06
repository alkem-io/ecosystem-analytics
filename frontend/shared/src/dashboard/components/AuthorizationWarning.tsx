import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cn, useIsCompact } from '@ea/shared';

/**
 * Prominent, recognisably "warning"-styled notice that the user only sees data
 * they are authorised to access (FR-026/027).
 *
 * On a phone the full sentence wraps to four lines and costs a fifth of the
 * viewport on every tab, so below `lg` it collapses to its title and expands on
 * tap. It stays a `role="alert"` at full text either way — the notice is never
 * removed or hidden from assistive technology, only visually condensed.
 */
export function AuthorizationWarning() {
  const { t } = useTranslation();
  const compact = useIsCompact();
  const [expanded, setExpanded] = useState(false);
  const collapsed = compact && !expanded;

  const body = (
    <p className={cn('min-w-0', collapsed && 'truncate')}>
      <span className="font-semibold">{t('warning.authTitle')}: </span>
      {t('warning.authBody')}
    </p>
  );

  const shell = 'flex w-full items-start gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 text-left text-sm text-foreground sm:px-6';

  if (!compact) {
    return (
      <div role="alert" className={shell}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="alert"
      aria-expanded={expanded}
      onClick={() => setExpanded((v) => !v)}
      className={cn(shell, 'shrink-0 items-center')}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
      {body}
      <ChevronDown
        className={cn('h-4 w-4 shrink-0 text-warning transition-transform', expanded && 'rotate-180')}
        aria-hidden
      />
    </button>
  );
}
