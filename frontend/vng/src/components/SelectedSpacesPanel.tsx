import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { SpacePicker } from './SpacePicker.js';

/**
 * Persistent selected-space list, visible regardless of the active tab (FR-008).
 * Shows each space's provenance — from the hub vs added directly (FR-013) — and
 * lets the user remove spaces and add new ones (US2).
 */
export function SelectedSpacesPanel() {
  const { t } = useTranslation();
  const { selectedSpaces, effectiveSpaceIds, removeSpace, addSpace, resolvingHub } =
    useSelectionContext();

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col gap-3 border-r border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{t('selection.title')}</h2>

      <SpacePicker excludeNameIds={effectiveSpaceIds} onAdd={addSpace} />

      <div className="min-h-0 flex-1 overflow-auto">
        {selectedSpaces.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {resolvingHub ? t('states.loading') : t('selection.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {selectedSpaces.map((space) => (
              <li
                key={space.nameId}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{space.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {space.origin === 'hub' ? t('selection.fromHub') : t('selection.added')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeSpace(space.nameId)}
                  aria-label={t('selection.remove')}
                  title={t('selection.remove')}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t('selection.count', { count: selectedSpaces.length })}
      </p>
    </aside>
  );
}
