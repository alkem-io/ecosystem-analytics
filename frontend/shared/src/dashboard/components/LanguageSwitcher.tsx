import { useTranslation } from 'react-i18next';
import { cn, useAppConfig } from '@ea/shared';

/** Languages offered by every dashboard frontend (Dutch default, FR-036/037). */
export const SUPPORTED_LANGUAGES = ['nl', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

interface LanguageSwitcherProps {
  /** Renders the switcher to fill its container (used inside the user dropdown). */
  block?: boolean;
  className?: string;
}

/**
 * Dutch/English language switcher (FR-037), styled as a compact segmented
 * control. Persists the choice under `<storagePrefix>_lang` for the session.
 * Used inside the user menu.
 */
export function LanguageSwitcher({ block = false, className }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const { storagePrefix } = useAppConfig();
  const active = i18n.language as Language;

  const setLanguage = (lang: Language) => {
    void i18n.changeLanguage(lang);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${storagePrefix}_lang`, lang);
    }
  };

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
