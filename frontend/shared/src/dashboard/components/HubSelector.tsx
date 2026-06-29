import { useTranslation } from 'react-i18next';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@ea/shared';
import type { HubSummary } from '../hooks/useHubs.js';

interface HubSelectorProps {
  hubs: HubSummary[];
  activeHubNameId: string | null;
  onChange: (nameId: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

/**
 * Dropdown of all innovation hubs available to the user (US1, FR-009/010).
 * The active hub is preselected from the configured default by useSelectedSpaces.
 */
export function HubSelector({
  hubs,
  activeHubNameId,
  onChange,
  loading,
  disabled,
}: HubSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted-foreground">{t('hub.label')}</span>
      <Select.Root
        value={activeHubNameId ?? undefined}
        onValueChange={onChange}
        disabled={disabled || loading || hubs.length === 0}
      >
        <Select.Trigger
          className={cn(
            'inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          )}
          aria-label={t('hub.label')}
        >
          <Select.Value placeholder={t('hub.placeholder')} />
          <Select.Icon>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-card text-foreground shadow-md"
          >
            <Select.Viewport className="p-1">
              {hubs.map((hub) => (
                <Select.Item
                  key={hub.nameId}
                  value={hub.nameId}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center gap-2 rounded px-7 py-1.5 text-sm outline-none',
                    'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                  )}
                >
                  <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                    <Check className="h-4 w-4" aria-hidden />
                  </Select.ItemIndicator>
                  <Select.ItemText>{hub.displayName}</Select.ItemText>
                  {hub.spaceCount > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">{hub.spaceCount}</span>
                  )}
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
