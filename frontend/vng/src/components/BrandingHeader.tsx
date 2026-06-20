import { useTranslation } from 'react-i18next';
import { UserMenu } from './UserMenu.js';

/**
 * Persistent header (FR-025). Shows the VNG-coloured Alkemio mark plus the app
 * title/subtitle on the left, and the signed-in user's avatar menu (with the
 * language switch + logout) on the right.
 */
export function BrandingHeader() {
  const { t } = useTranslation();
  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
      <div className="flex items-center gap-3">
        <img src="/favicon.svg" alt="" aria-hidden="true" className="h-7 w-7 shrink-0" />
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold text-foreground">{t('app.title')}</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {t('app.subtitle')}
          </span>
        </div>
      </div>
      <UserMenu />
    </header>
  );
}
