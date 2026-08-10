import { useCallback, useMemo, useState } from 'react';
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

        {hover && (
          <div
            className="pointer-events-none fixed z-50 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            <div className="font-medium">{hover.marker.name}</div>
            <div className="text-muted-foreground">
              {t('usageExplorer.initiativeCount', { count: hover.marker.initiativeCount })}
            </div>
          </div>
        )}
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
            fill="var(--vng-marker-fill, #2563eb)"
            fillOpacity={0.85}
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
