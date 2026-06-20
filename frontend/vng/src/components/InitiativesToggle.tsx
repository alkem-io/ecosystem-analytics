import { useTranslation } from 'react-i18next';
import { cn } from '@ea/shared';

interface InitiativesToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

/**
 * "Include GemeenteDelers initiatives" toggle (US10, FR-039). When on, the graph
 * folds in the GD initiative layer and the dashboard counts GD initiatives.
 */
export function InitiativesToggle({ checked, onChange }: InitiativesToggleProps) {
  const { t } = useTranslation();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cn('h-4 w-4 rounded border-border accent-[var(--primary)]')}
      />
      <span>{t('toggles.includeInitiatives')}</span>
    </label>
  );
}
