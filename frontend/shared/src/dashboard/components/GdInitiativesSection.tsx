import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@ea/shared';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useGdInitiatives, type GdInitiative } from '../hooks/useGdInitiatives.js';

interface HoverState {
  initiative: GdInitiative;
  x: number;
  y: number;
}

const CARD_W = 256; // w-64
const CARD_MAXH = 320; // matches the maxHeight on the card

/**
 * Selection-panel section (below the spaces): toggle to include the GemeenteDelers
 * initiative layer, plus a "show all" expander that lists every GD initiative. Each
 * initiative shows its associated gemeentes in a hover card (rendered via a portal
 * with fixed positioning, so it is NOT clipped by the scrollable list).
 */
export function GdInitiativesSection() {
  const { t } = useTranslation();
  const { state, setIncludeInitiatives } = useSelectionContext();
  const [showAll, setShowAll] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const { initiatives, loading, error } = useGdInitiatives(showAll);

  const onEnter = (initiative: GdInitiative) => (e: React.MouseEvent<HTMLLIElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const M = 8;
    // Prefer to the right; flip left if it would overflow the right edge.
    let x = r.right + M;
    if (x + CARD_W > window.innerWidth) x = Math.max(M, r.left - CARD_W - M);
    // Align to the row top, but never let the (max-height) card run off the bottom.
    let y = r.top;
    if (y + CARD_MAXH > window.innerHeight) y = Math.max(M, window.innerHeight - CARD_MAXH - M);
    setHover({ initiative, x, y });
  };

  return (
    <div className="border-t border-border pt-3">
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={state.includeInitiatives}
          onChange={(e) => setIncludeInitiatives(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--primary)]"
        />
        <span>
          <span className="block text-sm font-medium text-foreground">
            {t('panel.includeGd', { defaultValue: 'Include GD initiatives' })}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t('panel.includeGdHint', { defaultValue: 'GemeenteDelers (2021–2025)' })}
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className={cn(
          'mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary',
          'hover:underline focus:outline-none',
        )}
      >
        {showAll ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {t('panel.showAllGd', { defaultValue: 'Show all initiatives' })}
        {showAll && initiatives.length > 0 && ` (${initiatives.length})`}
      </button>

      {showAll && (
        <div className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-background p-2">
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t('states.loadingSpaces')}
            </div>
          )}
          {error && <div className="text-xs text-destructive">{error}</div>}
          {!loading && !error && (
            <ul className="space-y-0.5" onMouseLeave={() => setHover(null)}>
              {initiatives.map((i) => (
                <li
                  key={i.id}
                  className="cursor-default truncate text-xs text-foreground hover:text-primary"
                  onMouseEnter={onEnter(i)}
                >
                  {i.displayName}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Hover card — portal + fixed position so the scrollable list never clips it. */}
      {hover &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 w-64 overflow-auto rounded-md border border-border bg-card p-2.5 text-xs shadow-lg"
            style={{ left: hover.x, top: hover.y, maxHeight: CARD_MAXH }}
          >
            <div className="font-semibold text-foreground">{hover.initiative.displayName}</div>

            <div className="mt-1.5 font-medium text-muted-foreground">
              {t('panel.gemeentesCount', {
                count: (hover.initiative.gemeentes ?? []).length,
                defaultValue: 'Gemeentes ({{count}})',
              })}
              :
            </div>
            {(hover.initiative.gemeentes ?? []).length > 0 ? (
              <div className="mt-0.5 text-foreground">
                {(hover.initiative.gemeentes ?? []).join(', ')}
              </div>
            ) : (
              <div className="mt-0.5 text-muted-foreground">{t('details.noGemeentes')}</div>
            )}

            <div className="mt-2 font-medium text-muted-foreground">
              {t('panel.themesCount', {
                count: (hover.initiative.themes ?? []).length,
                defaultValue: 'Themes ({{count}})',
              })}
              :
            </div>
            {(hover.initiative.themes ?? []).length > 0 ? (
              <div className="mt-0.5 text-foreground">
                {(hover.initiative.themes ?? []).join(', ')}
              </div>
            ) : (
              <div className="mt-0.5 text-muted-foreground">—</div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
