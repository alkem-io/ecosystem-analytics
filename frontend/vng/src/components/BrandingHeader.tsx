import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher.js';

/**
 * Persistent header (FR-025). For this release it uses the existing Alkemio
 * branding/tokens and labels the app in text as "VNG Kenniscentrum Innovatie";
 * a VNG-specific visual identity is a deferred enhancement.
 */
export function BrandingHeader() {
  const { t } = useTranslation();
  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
      <div className="flex items-baseline gap-3">
        <span className="text-base font-semibold text-foreground">{t('app.title')}</span>
        <span className="text-sm text-muted-foreground">{t('app.subtitle')}</span>
      </div>
      <LanguageSwitcher />
    </header>
  );
}
