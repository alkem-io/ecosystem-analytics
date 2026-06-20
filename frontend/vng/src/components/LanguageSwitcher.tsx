import { useTranslation } from 'react-i18next';
import { setLanguage, SUPPORTED_LANGUAGES, type Language } from '../i18n/index.js';

/** Dutch/English language switcher (FR-037). Persists choice for the session. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const active = i18n.language as Language;

  return (
    <div className="flex items-center gap-1" aria-label={t('language.label')}>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          aria-pressed={active === lang}
          className={
            'rounded px-2 py-1 text-xs font-medium uppercase transition-colors ' +
            (active === lang
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted')
          }
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
