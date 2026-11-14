import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, History, Layers, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { cn } from '@ea/shared';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useAccessReport } from '../hooks/AccessLevelContext.js';
import { useLoadedData, useLoadPlan } from '../data/hooks.js';

/**
 * Feature 027 — what a managed-scope dashboard (VNG) shows and lets a viewer change about
 * its data, in the header:
 * - "In deze monitor": which Spaces the monitor reports on, which of them the viewer's own
 *   data lacks (usually: no read rights), and who has access to the monitor;
 * - whether the historical GemeenteDelers initiatives (2021–2025) are included;
 * - a cache-bypassing refresh.
 * There is no Space selection: the monitor reports on the Spaces its managers chose.
 */
export function HeaderDataControls() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <MonitorScopeButton />
      <GdSwitch />
      <RefreshButton />
    </div>
  );
}

const iconButton = cn(
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground',
  'transition-colors hover:bg-muted disabled:opacity-60',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
);

function MonitorScopeButton() {
  const { t } = useTranslation();
  const { selectedSpaces, effectiveSpaceIds } = useSelectionContext();
  const access = useAccessReport();
  const loaded = useLoadedData();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // What the viewer's own loaded data holds: name and link per top-level Space.
  const inData = useMemo(() => {
    const map = new Map<string, { name: string; url: string | null }>();
    for (const node of loaded?.dataset.nodes ?? []) {
      if (node.type === 'SPACE_L0' && node.nameId) {
        map.set(node.nameId, { name: node.displayName, url: node.url });
      }
    }
    return map;
  }, [loaded]);
  const dataReady = !!loaded;
  const missing = dataReady ? effectiveSpaceIds.filter((id) => !inData.has(id)).length : 0;

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const title = t('scope.title', { defaultValue: 'In this monitor' });
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-touch-target
        data-testid="scope-button"
        className={iconButton}
      >
        <Layers className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden lg:inline">{title}:</span>
        <span>
          {effectiveSpaceIds.length}
          <span className="sr-only lg:not-sr-only"> {t('scope.spaces', { defaultValue: 'Spaces' })}</span>
        </span>
        {missing > 0 && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={title}
          tabIndex={-1}
          data-testid="scope-panel"
          className={cn(
            'z-50 overflow-hidden rounded-lg border border-border bg-card text-left shadow-lg focus:outline-none',
            // A phone gets the full width under the header; wider screens a dropdown.
            'fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96',
          )}
        >
          <div className="flex items-start justify-between gap-2 px-4 pt-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('scope.description', {
                  defaultValue: 'The monitor reports on these Spaces. Its managers choose them.',
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('scope.close', { defaultValue: 'Close' })}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {missing > 0 && (
            <p className="mx-4 mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-foreground" data-testid="scope-missing">
              {t('scope.missing', {
                defaultValue:
                  '{{count}} of these Spaces are not in your data. Usually you have no read rights on them on Alkemio, so the figures you see are incomplete.',
                count: missing,
              })}
            </p>
          )}

          <ul className="mt-2 max-h-[50vh] divide-y divide-border overflow-auto px-4" data-testid="scope-list">
            {selectedSpaces.map((space) => {
              const hit = inData.get(space.nameId);
              const name = hit?.name ?? space.displayName;
              return (
                <li key={space.nameId} className="flex min-w-0 items-center justify-between gap-2 py-2 text-sm">
                  {hit?.url ? (
                    <a
                      href={hit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 truncate text-foreground hover:text-primary hover:underline"
                    >
                      {name}
                      <ExternalLink className="ml-1 inline h-3 w-3 align-[-1px]" aria-hidden />
                    </a>
                  ) : (
                    <span className="min-w-0 truncate text-foreground">{name}</span>
                  )}
                  {dataReady && !hit && (
                    <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-foreground">
                      {t('scope.notInData', { defaultValue: 'not in your data' })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {access?.gated && access.viewerSpaces.length > 0 && (
            <div className="mt-1 border-t border-border px-4 py-3 text-xs text-muted-foreground" data-testid="scope-access">
              {t('user.accessVia', { defaultValue: 'Members of these Spaces have access:' })}{' '}
              {access.viewerSpaces.map((s, i) => (
                <span key={s.key}>
                  {i > 0 && ', '}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                    {s.displayName}
                  </a>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GdSwitch() {
  const { t } = useTranslation();
  const { state, setIncludeInitiatives } = useSelectionContext();
  const loaded = useLoadedData();
  const on = state.includeInitiatives;
  const count = on && loaded?.dataset.gdLayer?.available ? loaded.dataset.gdLayer.initiativeCount : null;

  const label = t('header.gdLabel', { defaultValue: 'Include GemeenteDelers' });
  const hint = t('header.gdHint', {
    defaultValue: 'Include the historical GemeenteDelers initiatives (2021–2025) in every view',
  });

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-describedby="gd-switch-hint"
      title={hint}
      data-testid="gd-switch"
      data-touch-target
      onClick={() => setIncludeInitiatives(!on)}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-2.5 text-xs font-medium transition-colors sm:px-3',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        on
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-card text-muted-foreground hover:bg-muted',
      )}
    >
      <History className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden md:inline">{label}</span>
      {/* The visible text starts the accessible name (WCAG 2.5.3, voice control). */}
      <span className="md:hidden">
        {t('header.gdShort', { defaultValue: 'GD' })}
        <span className="sr-only"> – {label}</span>
      </span>
      {count !== null && (
        <span className="rounded-full bg-primary px-1.5 text-[0.7rem] leading-4 text-primary-foreground" data-testid="gd-count">
          {count}
          <span className="sr-only"> {t('header.gdCountSuffix', { defaultValue: 'initiatives' })}</span>
        </span>
      )}
      <span id="gd-switch-hint" className="sr-only">
        {hint}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors',
          on ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full bg-card shadow transition-transform',
            on ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

function RefreshButton() {
  const { t } = useTranslation();
  const { refresh } = useSelectionContext();
  // The spinner follows the real load, not a timer.
  const loading = useLoadPlan().active;
  return (
    <button
      type="button"
      onClick={refresh}
      disabled={loading}
      aria-label={t('panel.refresh')}
      title={t('panel.refresh')}
      data-testid="header-refresh"
      className={cn(iconButton, 'hidden w-9 px-0 sm:inline-flex')}
    >
      <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
    </button>
  );
}
