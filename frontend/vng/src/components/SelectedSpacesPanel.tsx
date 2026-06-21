import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, X } from 'lucide-react';
import { cn } from '@ea/shared';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { SpacePicker } from './SpacePicker.js';
import { GdInitiativesSection } from './GdInitiativesSection.js';

/**
 * Persistent selected-space list, visible regardless of the active tab (FR-008).
 * Shows each space's provenance — from the hub vs added directly (FR-013) — and
 * lets the user remove spaces and add new ones (US2).
 *
 * Bulk management: a checkbox per row plus a master "select all" checkbox drive a
 * LOCAL selection-for-deletion (independent of the graph's effective set); the
 * "Remove selected" button bulk-removes them and "Clear all" empties the whole
 * selection.
 */
export function SelectedSpacesPanel() {
  const { t } = useTranslation();
  const {
    selectedSpaces,
    effectiveSpaceIds,
    removeSpace,
    removeSpaces,
    clearSelection,
    addSpace,
    resolvingHub,
  } = useSelectionContext();

  // Local checkbox selection-for-deletion (NOT the graph selection).
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Keep the local checked set in sync with the spaces that still exist.
  useEffect(() => {
    setChecked((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(effectiveSpaceIds);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (present.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [effectiveSpaceIds]);

  const allChecked = selectedSpaces.length > 0 && checked.size === selectedSpaces.length;
  const someChecked = checked.size > 0 && !allChecked;

  // Reflect the indeterminate "some but not all" state on the master checkbox.
  const masterRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = someChecked;
  }, [someChecked]);

  const toggleRow = (nameId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(nameId)) next.delete(nameId);
      else next.add(nameId);
      return next;
    });
  };

  const toggleAll = () => {
    setChecked((prev) =>
      prev.size === selectedSpaces.length
        ? new Set()
        : new Set(selectedSpaces.map((s) => s.nameId)),
    );
  };

  const onRemoveSelected = () => {
    removeSpaces([...checked]);
    setChecked(new Set());
  };

  const onClearAll = () => {
    clearSelection();
    setChecked(new Set());
  };

  const checkboxClass = useMemo(
    () =>
      cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      ),
    [],
  );

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col gap-4 border-r border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{t('selection.title')}</h2>

      <SpacePicker excludeNameIds={effectiveSpaceIds} onAdd={addSpace} />

      {selectedSpaces.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              ref={masterRef}
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              aria-label={t('panel.selectAllRows')}
              className={checkboxClass}
            />
            {t('panel.selectAllRows')}
          </label>
          <button
            type="button"
            onClick={onClearAll}
            className={cn(
              'rounded p-1 text-xs text-muted-foreground hover:text-foreground',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            )}
          >
            {t('panel.clearAll')}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {selectedSpaces.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {resolvingHub ? t('states.loading') : t('selection.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {selectedSpaces.map((space) => (
              <li
                key={space.nameId}
                className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2"
              >
                <input
                  type="checkbox"
                  checked={checked.has(space.nameId)}
                  onChange={() => toggleRow(space.nameId)}
                  aria-label={t('panel.selectRow', { name: space.displayName })}
                  className={checkboxClass}
                />
                <div className="min-w-0 flex-1">
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

      {checked.size > 0 && (
        <button
          type="button"
          onClick={onRemoveSelected}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive',
            'transition-colors hover:bg-destructive/20',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive',
          )}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {t('panel.removeSelected')}
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        {t('selection.count', { count: selectedSpaces.length })}
      </p>

      {/* GemeenteDelers: include the GD initiative layer + list them all. */}
      <GdInitiativesSection />
    </aside>
  );
}
