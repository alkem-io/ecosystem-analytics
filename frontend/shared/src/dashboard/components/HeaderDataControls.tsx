import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Info, Layers, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { cn, useAppConfig } from '@ea/shared';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useAccessReport } from '../hooks/AccessLevelContext.js';
import { useLoadedData, useLoadPlan } from '../data/hooks.js';

/**
 * Feature 027 — what a managed-scope dashboard (VNG) shows and lets a viewer change about
 * its data. Not in the header (which is the same on every screen, settings included) but
 * in the bar under it, next to the tabs:
 * - "In deze monitor": which Spaces the monitor reports on, which of them the viewer's own
 *   data lacks (usually: no read rights), and who has access to the monitor;
 * - "GemeenteDelers": everything about the historical initiatives in one place — what the
 *   programme was, whether they are included (the switch) and how many were loaded;
 * - a cache-bypassing refresh.
 * There is no Space selection: the monitor reports on the Spaces its managers chose.
 */
export function HeaderDataControls({ className }: { className?: string }) {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center gap-2', className)} data-testid="data-controls">
      <MonitorScopeButton />
      <GdControl />
      <RefreshButton />
    </div>
  );
}

const chip = cn(
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground',
  'transition-colors hover:bg-muted disabled:opacity-60',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
);

/** A chip that opens a small panel: outside click and Escape close it, focus moves in. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (open && rootRef.current) setTop(Math.round(rootRef.current.getBoundingClientRect().bottom + 8));
  }, [open]);
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
  return { open, setOpen, rootRef, panelRef, top };
}

function Panel({
  title,
  description,
  testId,
  panelRef,
  top,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  testId: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  /** Below `lg`: where the sheet starts — just under the control that opened it. */
  top: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      data-testid={testId}
      style={{ '--panel-top': `${top}px` } as React.CSSProperties}
      className={cn(
        'z-50 overflow-hidden rounded-lg border border-border bg-card text-left shadow-lg focus:outline-none',
        // The controls sit at the left of their own row. A phone gets a full-width sheet
        // just under the control; wider screens a dropdown under the chip's left edge.
        'fixed inset-x-3 top-[var(--panel-top)]',
        'sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-96',
      )}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('scope.close', { defaultValue: 'Close' })}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}

function MonitorScopeButton() {
  const { t } = useTranslation();
  const { selectedSpaces, effectiveSpaceIds } = useSelectionContext();
  const access = useAccessReport();
  const loaded = useLoadedData();
  const { open, setOpen, rootRef, panelRef, top } = usePopover();

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

  const title = t('scope.title', { defaultValue: 'In this monitor' });
  // Same shape as the GemeenteDelers control: the chip (here: the list) plus an ⓘ that
  // says what the Groei initiatives are.
  return (
    <div className="flex items-center">
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-touch-target
        data-testid="scope-button"
        className={cn(chip, 'rounded-r-none')}
      >
        <Layers className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{title}:</span>
        <span>
          {effectiveSpaceIds.length}
          <span className="sr-only sm:not-sr-only"> {t('scope.spaces', { defaultValue: 'Spaces' })}</span>
        </span>
        {missing > 0 && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />}
      </button>

      {open && (
        <Panel
          title={title}
          description={t('scope.description', {
            defaultValue: 'The monitor reports on these Spaces. Its managers choose them.',
          })}
          testId="scope-panel"
          panelRef={panelRef}
          top={top}
          onClose={() => setOpen(false)}
        >
          {missing > 0 && (
            <p className="mx-4 mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-foreground" data-testid="scope-missing">
              {t('scope.missing', {
                defaultValue:
                  '{{count}} of these Spaces are not in your data. Usually you have no read rights on them, so the figures you see are incomplete.',
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
        </Panel>
      )}
    </div>
    <GroeiInfo missing={missing} />
    </div>
  );
}

/** What the Groei initiatives are, who chooses them, and where to read more. */
function GroeiInfo({ missing }: { missing: number }) {
  const { t } = useTranslation();
  const { prototypeInfoUrl } = useAppConfig();
  const { open, setOpen, rootRef, panelRef, top } = usePopover();
  const title = t('scope.infoTitle', { defaultValue: 'Groei initiatives' });
  return (
    <div ref={rootRef} className="relative -ml-px">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('scope.info', { defaultValue: 'About the Groei initiatives' })}
        title={t('scope.info', { defaultValue: 'About the Groei initiatives' })}
        data-touch-target
        data-testid="scope-info"
        className={cn(chip, 'w-9 rounded-l-none px-0 text-muted-foreground hover:text-foreground')}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <Panel title={title} testId="scope-info-panel" panelRef={panelRef} top={top} onClose={() => setOpen(false)}>
          <div className="space-y-3 px-4 pb-4 pt-2 text-sm text-muted-foreground">
            <p>
              {t('scope.infoBody', {
                defaultValue:
                  'The Groei initiatives are the Spaces this monitor reports on: initiatives of the Groei programme of Kenniscentrum Innovatie. The managers of the monitor choose which Spaces count, in the monitor settings.',
              })}
            </p>
            <p className="text-xs">
              {missing > 0
                ? t('scope.missing', {
                    defaultValue:
                      '{{count}} of these Spaces are not in your data. Usually you have no read rights on them, so the figures you see are incomplete.',
                    count: missing,
                  })
                : t('scope.infoOwnData', {
                    defaultValue: 'The figures are built from what you yourself may see.',
                  })}
            </p>
            {prototypeInfoUrl && (
              <p className="text-xs">
                {t('scope.infoMore', { defaultValue: 'More information:' })}{' '}
                <a
                  href={prototypeInfoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {t('warning.prototypeLink', { defaultValue: 'the Innovation monitor Space' })}
                  <ExternalLink className="ml-1 inline h-3 w-3 align-[-1px]" aria-hidden />
                </a>
              </p>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

/** The on/off track, drawn; the button around it carries the semantics. */
function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      data-testid="gd-track"
      className={cn(
        'relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors',
        on ? 'bg-primary' : 'bg-muted-foreground/40',
      )}
    >
      {/* 12px knob, 2px inset: left edge at 2px (off) or 14px (on) — always inside the 28px track. */}
      <span
        data-testid="gd-knob"
        className={cn(
          'absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
          on ? 'translate-x-3' : 'translate-x-0',
        )}
      />
    </span>
  );
}

/**
 * GemeenteDelers in one place: a switch chip (on/off) with an
 * info button beside it whose panel says what the programme was, where the initiatives
 * came from, and whether they loaded.
 */
function GdControl() {
  const { t } = useTranslation();
  const { state, setIncludeInitiatives } = useSelectionContext();
  const loaded = useLoadedData();
  const { open, setOpen, rootRef, panelRef, top } = usePopover();
  const on = state.includeInitiatives;
  const layer = loaded?.dataset.gdLayer;
  const title = t('header.gdTitle', { defaultValue: 'GemeenteDelers' });

  // Switch and info button share one border. Nothing in it changes size with the state
  // (no count, no bolder text), so turning it on or off never moves the row; how many
  // initiatives loaded is in the info panel.
  return (
    <div ref={rootRef} className="relative flex items-center">
      {/* The chip IS the switch: one click turns the historical initiatives on or off. */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setIncludeInitiatives(!on)}
        title={t('header.gdHint', {
          defaultValue: 'Include the historical GemeenteDelers initiatives (2021–2025) in every view',
        })}
        data-touch-target
        data-testid="gd-switch"
        className={cn(chip, 'gap-2 rounded-r-none')}
      >
        <SwitchTrack on={on} />
        <span>{title}</span>
      </button>
      {/* What GemeenteDelers is, where it came from, and how much is loaded. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('header.gdInfo', { defaultValue: 'About GemeenteDelers' })}
        title={t('header.gdInfo', { defaultValue: 'About GemeenteDelers' })}
        data-touch-target
        data-testid="gd-info"
        className={cn(chip, '-ml-px w-9 rounded-l-none px-0 text-muted-foreground hover:text-foreground')}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <Panel title={title} testId="gd-panel" panelRef={panelRef} top={top} onClose={() => setOpen(false)}>
          <div className="space-y-3 px-4 pb-4 pt-2 text-sm">
            <p className="text-muted-foreground">
              {t('provenance.gd')}{' '}
              <a
                href={layer?.source.url || 'https://vng.nl/praktijkvoorbeelden'}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                vng.nl/praktijkvoorbeelden
                <ExternalLink className="ml-1 inline h-3 w-3 align-[-1px]" aria-hidden />
              </a>
            </p>
            <p className="text-xs text-muted-foreground">
              {on
                ? t('header.gdIncludedNote', {
                    defaultValue: 'They are now included in every view. Turn them off with the GemeenteDelers switch.',
                  })
                : t('header.gdExcludedNote', {
                    defaultValue: 'They are now left out. Turn them on with the GemeenteDelers switch.',
                  })}
            </p>
            {on && layer && (
              <p className="text-xs text-muted-foreground" data-testid="gd-status">
                {layer.available
                  ? t('header.gdLoaded', {
                      defaultValue: '{{count}} initiatives loaded from the GemeenteDelers Space.',
                      count: layer.initiativeCount,
                    })
                  : t('header.gdUnavailable', {
                      defaultValue: 'The GemeenteDelers initiatives could not be loaded for you.',
                    })}
              </p>
            )}
          </div>
        </Panel>
      )}
    </div>
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
      data-touch-target
      data-testid="header-refresh"
      className={cn(chip, 'w-9 px-0')}
    >
      <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
    </button>
  );
}
