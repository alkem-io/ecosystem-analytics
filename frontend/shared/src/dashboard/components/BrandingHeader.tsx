import { useTranslation } from 'react-i18next';
import { useAppConfig } from '@ea/shared';
import { UserMenu } from './UserMenu.js';

/**
 * Persistent header (FR-025). Shows the app logo plus the title/subtitle on the
 * left, and the signed-in user's avatar menu (language switch + logout) right.
 */
export function BrandingHeader() {
  const { t } = useTranslation();
  const { Logo } = useAppConfig();
  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
      <div className="flex items-center gap-3">
        <Logo className="h-8 w-auto shrink-0" />
        <div className="flex items-baseline gap-3 border-l border-border pl-3">
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
