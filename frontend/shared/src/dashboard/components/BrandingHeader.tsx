import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { cn, useAppConfig } from '@ea/shared';
import { UserMenu } from './UserMenu.js';

/**
 * Persistent header (FR-025). Shows the app logo plus the title/subtitle on the
 * left, and the signed-in user's avatar menu (language switch + logout) right.
 *
 * On a compact viewport the shell passes `onMenuClick`, which prepends the button
 * that opens the selection drawer — the only entry point to the selection panel
 * once it is off-canvas, so it leads the header rather than hiding in the user menu.
 */
export function BrandingHeader({
  onMenuClick,
  menuOpen = false,
}: {
  onMenuClick?: () => void;
  menuOpen?: boolean;
}) {
  const { t } = useTranslation();
  const { Logo } = useAppConfig();
  return (
    <header
      className={cn(
        'flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 sm:px-6 sm:py-3',
        // Paint under the notch, then push the content back below it.
        'pt-[max(0.5rem,var(--safe-top))] pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))]',
      )}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={t('panel.openSelection', { defaultValue: t('selection.title') })}
            aria-expanded={menuOpen}
            data-touch-target
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground',
              'transition-colors hover:bg-muted',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            )}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        )}
        <Logo className="h-7 w-auto shrink-0 sm:h-8" />
        {/* The title truncates rather than wrapping: a two-line header on a phone
            costs more vertical space than the tab strip underneath it. */}
        <div className="flex min-w-0 items-baseline gap-3 border-l border-border pl-2 sm:pl-3">
          <span className="truncate text-sm font-semibold text-foreground sm:text-base">
            {t('app.title')}
          </span>
          <span className="hidden text-sm text-muted-foreground lg:inline">
            {t('app.subtitle')}
          </span>
        </div>
      </div>
      <UserMenu />
    </header>
  );
}
