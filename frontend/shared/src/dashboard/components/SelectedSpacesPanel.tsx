import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { cn } from '@ea/shared';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { HubSelector } from './HubSelector.js';
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
    refreshNonce,
    hubs,
    hubsLoading,
    state,
    setActiveHub,
    loadHubSpaces,
    refresh,
    hubResolveError,
  } = useSelectionContext();

  // Brief spinner on the Refresh button while the cache-bypassing reload runs.
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const onRefresh = () => {
    refresh();
    setRefreshing(true);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setRefreshing(false), 1200);
  };

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
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t('selection.title')}</h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={t('panel.refresh')}
          title={t('panel.refresh')}
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground',
            'transition-colors hover:bg-muted disabled:opacity-60',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden />
        </button>
      </div>

      {/* Data-selection controls: hub picker + hub actions + gemeente toggle. */}
      <div className="flex flex-col gap-3 border-b border-border pb-4">
        <HubSelector
          hubs={hubs}
          activeHubNameId={state.activeHubNameId}
          onChange={setActiveHub}
          loading={hubsLoading}
        />
        {state.activeHubNameId && (
          <button
            type="button"
            onClick={loadHubSpaces}
            disabled={resolvingHub}
            className={cn(
              'self-start rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground',
              'transition-colors hover:bg-muted disabled:opacity-60',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            )}
          >
            {t('controls.loadHubSpaces')}
          </button>
        )}
        {resolvingHub && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t('states.loadingHubSpaces')}
          </span>
        )}
        {!resolvingHub && hubResolveError && (
          <span className="text-xs text-destructive" role="alert">
            {hubResolveError}
          </span>
        )}
      </div>

      <SpacePicker excludeNameIds={effectiveSpaceIds} onAdd={addSpace} refreshNonce={refreshNonce} />

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
