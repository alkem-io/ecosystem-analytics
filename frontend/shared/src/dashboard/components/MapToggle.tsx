import { useTranslation } from 'react-i18next';
import { cn } from '@ea/shared';

interface MapToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

/**
 * "Show map" toggle for the graph view. Internal GraphTab state — off by default.
 * When off the force graph uses a free force layout (no Netherlands underlay /
 * geo-pinning); when on it pins nodes onto the Netherlands basemap.
 */
export function MapToggle({ checked, onChange }: MapToggleProps) {
  const { t } = useTranslation();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cn('h-4 w-4 rounded border-border accent-[var(--primary)]')}
      />
      <span>{t('graph.showMap', { defaultValue: 'Show map' })}</span>
    </label>
  );
}
