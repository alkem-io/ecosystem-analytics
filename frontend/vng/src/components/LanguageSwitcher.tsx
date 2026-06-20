import { useTranslation } from 'react-i18next';
import { cn } from '@ea/shared';
import { setLanguage, SUPPORTED_LANGUAGES, type Language } from '../i18n/index.js';

interface LanguageSwitcherProps {
  /** Renders the switcher to fill its container (used inside the user dropdown). */
  block?: boolean;
  className?: string;
}

/**
 * Dutch/English language switcher (FR-037), styled as a compact segmented
 * control. Persists the choice for the session. Used inside the user menu.
 */
export function LanguageSwitcher({ block = false, className }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const active = i18n.language as Language;

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5',
        block && 'flex w-full',
        className,
      )}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          aria-pressed={active === lang}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition-colors',
            block && 'flex-1',
            active === lang
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
