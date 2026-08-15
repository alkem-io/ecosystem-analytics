import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MapPin, RotateCcw } from 'lucide-react';
import { cn, useAppConfig } from '../../index.js';
import { UsageMap } from '../../map/UsageMap.js';
import { PROVINCE_REGION_OPTIONS, type ProvinceRegion } from '../../map/mapConfig.js';
import {
  MIN_DIAMETER,
  MAX_DIAMETER,
  buildAreaRanking,
  markerDiameter,
  maxInitiativeCount,
  type UsageMarker,
  type VisibleArea,
} from '../utils/usage.js';
import { buildCityRows, type CityRow } from '../utils/cities.js';
import { GROEI_COLOR, GD_COLOR } from '../utils/pie.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useVngGraph } from '../hooks/useVngGraph.js';
import { useGraphProgress } from '../hooks/useGraphProgress.js';
import { useGemeenteLocations } from '../hooks/useGemeenteLocations.js';

const ALL_PROVINCES = '__all__';

/**
 * Usage Explorer (feature 019) — the geographic lens on initiative adoption.
 *
 * The map answers "where", the ranked list answers "what": zoom into a region and the
 * list re-computes to show exactly which initiatives the gemeentes now on screen use, and
 * how many of them do.
 *
 * Two data sources meet here and keep separate jobs:
 *  • POSITIONS come from the cached, selection-independent gemeente location set.
 *  • COUNTS come from `buildCityRows` — the feature-018 rule the Cities view uses, so the
 *    two views can never disagree (FR-029). Nothing here recounts initiatives.
 */
export function UsageExplorerTab() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const { effectiveSpaceIds, selectedSpaces, state, refreshNonce } = useSelectionContext();

  const { dataset, loading, error } = useVngGraph(effectiveSpaceIds, {
    includeInitiatives: state.includeInitiatives,
    refreshNonce,
  });
  const { data: locationSet, loading: locationsLoading, error: locationsError } =
    useGemeenteLocations();

  const progress = useGraphProgress(loading && !dataset);
  const currentSpaceLabel = (() => {
    const nameId = progress?.currentSpace;
    if (!nameId) return null;
    return selectedSpaces.find((s) => s.nameId === nameId)?.displayName ?? nameId;
  })();

  const cityRows = useMemo<CityRow[]>(() => buildCityRows(dataset), [dataset]);

  const [province, setProvince] = useState<ProvinceRegion | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [visibleArea, setVisibleArea] = useState<VisibleArea | null>(null);
  const [focused, setFocused] = useState<UsageMarker | null>(null);
  const [unplaced, setUnplaced] = useState(0);
  const [allMarkers, setAllMarkers] = useState<UsageMarker[]>([]);
  const [hover, setHover] = useState<{ marker: UsageMarker; x: number; y: number } | null>(null);

  const ranking = useMemo(
    () => (visibleArea ? buildAreaRanking(visibleArea, focused) : null),
    [visibleArea, focused],
  );

  const scaleMax = useMemo(() => maxInitiativeCount(allMarkers), [allMarkers]);

  // Focus is dropped silently when the gemeente leaves the data after a selection change.
  const focusedStillPresent =
    focused && allMarkers.some((m) => m.nameId === focused.nameId) ? focused : null;
  if (focused && !focusedStillPresent) setFocused(null);

  const handleMarkersBuilt = useCallback(
    (info: { markers: UsageMarker[]; unplaced: number }) => {
      setAllMarkers(info.markers);
      setUnplaced(info.unplaced);
    },
    [],
  );

  const openInitiative = (spaceId: string) =>
    window.dispatchEvent(new CustomEvent(`${cfg.eventPrefix}:openSpace`, { detail: { spaceId } }));
  const openCity = (cityId: string) =>
    window.dispatchEvent(new CustomEvent(`${cfg.eventPrefix}:openCity`, { detail: { cityId } }));

  // ── Loading / empty / error states, reusing the dashboard's existing treatments ──

  if (effectiveSpaceIds.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">{t('usageExplorer.noSelection')}</div>;
  }

  if (locationsError && !locationSet) {
    // No positions at all — say so plainly rather than showing an empty country (FR-030a).
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="font-medium">{t('usageExplorer.mapUnavailable')}</p>
        <p className="mt-1 text-sm">{t('usageExplorer.mapUnavailableHint')}</p>
      </div>
    );
  }

  if ((loading && !dataset) || (locationsLoading && !locationSet)) {
    return (
      <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>
          {currentSpaceLabel
            ? t('usageExplorer.loadingSpace', { name: currentSpaceLabel })
            : t('usageExplorer.loading')}
        </span>
      </div>
    );
  }

  if (error && !dataset) {
    return <div className="p-8 text-center text-destructive">{error}</div>;
  }

  const locations = locationSet?.locations ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ── Controls ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium" htmlFor="usage-province">
          {t('usageExplorer.province')}
        </label>
        <select
          id="usage-province"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={province ?? ALL_PROVINCES}
          onChange={(e) =>
            setProvince(e.target.value === ALL_PROVINCES ? null : (e.target.value as ProvinceRegion))
          }
        >
          <option value={ALL_PROVINCES}>{t('usageExplorer.allProvinces')}</option>
          {PROVINCE_REGION_OPTIONS.map((p) => (
            <option key={p.region} value={p.region}>
              {p.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent"
          onClick={() => {
            setProvince(null);
            setResetNonce((n) => n + 1);
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('usageExplorer.reset')}
        </button>

        {visibleArea && (
          <span className="ml-auto text-sm text-muted-foreground">
            {t('usageExplorer.inView', {
              total: visibleArea.total,
              participating: visibleArea.participating,
            })}
          </span>
        )}
      </div>

      {/* ── Map ──────────────────────────────────────────────────────────────── */}
      <div className="relative">
        <UsageMap
          locations={locations}
          cityRows={cityRows}
          province={province}
          resetNonce={resetNonce}
          focusedNameId={focused?.nameId ?? null}
          onFocus={(m) => setFocused((cur) => (cur?.nameId === m?.nameId ? null : m))}
          onVisibleAreaChange={setVisibleArea}
          onMarkersBuilt={handleMarkersBuilt}
          onHover={(marker, position) =>
            setHover(marker && position ? { marker, x: position.x, y: position.y } : null)
          }
        />

        {hover && <MarkerHoverCard marker={hover.marker} x={hover.x} y={hover.y} />}
      </div>

      {/* ── Size legend (FR-015a) ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
        <span className="font-medium">{t('usageExplorer.legend')}</span>
        <LegendItem shape="square" size={MIN_DIAMETER} label={t('usageExplorer.legendNone')} />
        <LegendItem shape="dot" size={MIN_DIAMETER} label={t('usageExplorer.legendOne')} />
        {scaleMax > 2 && (
          <LegendItem
            shape="dot"
            size={markerDiameter(Math.round((scaleMax + 1) / 2), scaleMax)}
            label={String(Math.round((scaleMax + 1) / 2))}
          />
        )}
        {scaleMax > 1 && <LegendItem shape="dot" size={MAX_DIAMETER} label={String(scaleMax)} />}
        {/* The slice colours mean the same here as on the population scatter. */}
        <span className="inline-flex items-center gap-1.5 border-l pl-5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: GROEI_COLOR }}
          />
          Groei
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GD_COLOR }} />
          GemeenteDelers
        </span>

        {unplaced > 0 && (
          <span className="ml-auto">{t('usageExplorer.unplaced', { count: unplaced })}</span>
        )}
        {locationSet?.stale && <span>{t('usageExplorer.staleLocations')}</span>}
      </div>

      {/* ── Focused gemeente (US4) ───────────────────────────────────────────── */}
      {focusedStillPresent && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 font-medium">
              <MapPin className="h-4 w-4" />
              {focusedStillPresent.name}
            </h3>
            <div className="flex items-center gap-2">
              {focusedStillPresent.cityRow && (
                <button
                  type="button"
                  className="text-sm text-primary underline-offset-2 hover:underline"
                  onClick={() => openCity(focusedStillPresent.cityRow!.id)}
                >
                  {t('usageExplorer.openCity')}
                </button>
              )}
              <button
                type="button"
                className="text-sm text-muted-foreground hover:underline"
                onClick={() => setFocused(null)}
              >
                {t('usageExplorer.clearFocus')}
              </button>
            </div>
          </div>
          {focusedStillPresent.initiativeCount === 0 ? (
            <p className="text-sm text-muted-foreground">{t('usageExplorer.focusNoInitiatives')}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {focusedStillPresent.cityRow?.initiatives.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
                    onClick={() => openInitiative(i.id)}
                  >
                    {i.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Ranked list (US2) ────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="font-medium">{t('usageExplorer.ranking')}</h3>
          <p className="text-xs text-muted-foreground">{t('usageExplorer.rankingHint')}</p>
        </div>

        {!ranking || ranking.entries.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground" role="status">
            {t('usageExplorer.rankingEmpty')}
          </p>
        ) : (
          // aria-live so a screen reader announces the new ranking after a zoom or pan,
          // rather than leaving the change silent.
          <ol className="divide-y" aria-live="polite">
            {ranking.entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm hover:bg-accent',
                    // Initiatives the focused gemeente already uses are set apart from
                    // those only its neighbours use (FR-026).
                    e.usedByFocused && 'bg-primary/5 font-medium',
                  )}
                  onClick={() => openInitiative(e.id)}
                >
                  <span className="flex items-center gap-2">
                    {e.usedByFocused && <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    {e.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {t('usageExplorer.ofInView', {
                      count: e.cityCount,
                      total: ranking.denominator,
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/**
 * How many initiatives the hover card names before collapsing the rest into "+N more".
 *
 * Deliberately small. Den Haag is in 35 initiatives with names like "De begrijpelijkheid,
 * inclusiviteit en toegankelijkheid van brieven verhogen door brieven te laten voorlezen
 * en vertalen" — at a dozen entries the card covered half the country. The card is for a
 * quick read on hover; the focus panel below the map carries the full list.
 */
const HOVER_INITIATIVE_LIMIT = 7;

/** Card geometry, in px. Fixed so position can be clamped without measuring. */
const HOVER_CARD_WIDTH = 264;
const HOVER_CARD_GAP = 16;

/**
 * Hover card for a gemeente marker: name, the Groei/GD split, and the initiatives it
 * takes part in, each colour-coded by source.
 *
 * Three things this has to get right, all of which it got wrong first time round:
 *  • OPAQUE. `bg-popover` is not a token this app defines, so it rendered transparent and
 *    the map showed straight through the text. The background is set explicitly here, the
 *    same way the graph's HoverCard does it.
 *  • SHORT. One line per initiative, ellipsised — Dutch initiative names run long enough
 *    to wrap three times each, which is what made the card enormous.
 *  • IN VIEW. Position is clamped to the viewport rather than flipped, so the card never
 *    rides up over the tab bar or off the right edge.
 */
function MarkerHoverCard({ marker, x, y }: { marker: UsageMarker; x: number; y: number }) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [clamped, setClamped] = useState<{ left: number; top: number } | null>(null);

  const initiatives = marker.cityRow?.initiatives ?? [];
  const shown = initiatives.slice(0, HOVER_INITIATIVE_LIMIT);
  const overflow = initiatives.length - shown.length;
  const showSplit = marker.groeiCount > 0 && marker.gdCount > 0;

  // Measure once rendered, then clamp inside the viewport. Measuring beats estimating:
  // the card's height depends on how many initiatives this particular gemeente has.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(HOVER_CARD_GAP, x + HOVER_CARD_GAP),
      window.innerWidth - width - HOVER_CARD_GAP,
    );
    const top = Math.min(
      Math.max(HOVER_CARD_GAP, y + HOVER_CARD_GAP),
      window.innerHeight - height - HOVER_CARD_GAP,
    );
    setClamped({ left, top });
  }, [x, y, marker.nameId]);

  return (
    <div
      ref={cardRef}
      className="pointer-events-none fixed z-50 rounded-lg px-3 py-2 text-xs"
      style={{
        width: HOVER_CARD_WIDTH,
        // Explicit, not a Tailwind token — see the note above about `bg-popover`.
        background: 'rgba(255, 255, 255, 0.97)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        color: '#111827',
        // Render off-screen for the first paint so the unclamped position is never seen.
        left: clamped?.left ?? -9999,
        top: clamped?.top ?? -9999,
      }}
    >
      <div className="truncate font-semibold">{marker.name}</div>

      <div className="mt-0.5" style={{ color: '#6b7280' }}>
        {t('usageExplorer.initiativeCount', { count: marker.initiativeCount })}
        {showSplit && (
          <>
            {' · '}
            {/* Labelled, not just "5 / 30" — the bare ratio reads as cryptic even with
                the colours to go on. "GD" keeps it on one line at this width. */}
            <span style={{ color: GROEI_COLOR }}>{marker.groeiCount} Groei</span>
            {' · '}
            <span style={{ color: GD_COLOR }}>{marker.gdCount} GD</span>
          </>
        )}
      </div>

      {shown.length > 0 && (
        <ul className="mt-1.5 space-y-1 pt-1.5" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          {shown.map((i) => (
            <li key={i.id} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: i.kind === 'groei' ? GROEI_COLOR : GD_COLOR }}
              />
              {/* One line each — long Dutch names ellipsise rather than wrap. min-w-0 is
                  required: without it a flex item won't shrink below its content width
                  and `truncate` silently does nothing. */}
              <span className="min-w-0 truncate">{i.name}</span>
            </li>
          ))}
          {overflow > 0 && (
            <li className="pt-0.5" style={{ color: '#6b7280' }}>
              {t('usageExplorer.moreInitiatives', { count: overflow })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** One entry in the size legend, drawn at the same geometry the map uses. */
function LegendItem({ shape, size, label }: { shape: 'dot' | 'square'; size: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={MAX_DIAMETER} height={MAX_DIAMETER} aria-hidden>
        {shape === 'dot' ? (
          <circle
            cx={MAX_DIAMETER / 2}
            cy={MAX_DIAMETER / 2}
            r={size / 2}
            fill={GROEI_COLOR}
            fillOpacity={0.9}
          />
        ) : (
          <rect
            x={(MAX_DIAMETER - size) / 2}
            y={(MAX_DIAMETER - size) / 2}
            width={size}
            height={size}
            fill="#9ca3af"
            fillOpacity={0.7}
          />
        )}
      </svg>
      {label}
    </span>
  );
}
