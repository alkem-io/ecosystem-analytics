import { useTranslation } from 'react-i18next';
import { cn } from '@ea/shared';

interface GemeenteToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

/**
 * Show / hide gemeentes toggle (US8, FR-034). Consistently affects the graph and
 * the dashboard via the shared selection state.
 */
export function GemeenteToggle({ checked, onChange }: GemeenteToggleProps) {
  const { t } = useTranslation();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cn('h-4 w-4 rounded border-border accent-[var(--primary)]')}
      />
      <span>{t('toggles.showGemeentes')}</span>
    </label>
  );
}
