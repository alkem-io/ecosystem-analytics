import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { cn } from '@ea/shared';
import { FunnelChart, FUNNEL_CHROME } from '../components/FunnelChart.js';
import { VocabularyDriftNotice } from '../components/charts/VocabularyDriftNotice.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useCoreLoadState, useCounts, useGraphDataset, useInitiativeRows } from '../data/derive/index.js';
import { layoutFunnel } from '../utils/funnel.js';
import { FILTER_ALL } from '../components/TableFilterBar.js';

/** Vertical space the funnel gets, clamped so it stays whole on short windows. */
const MIN_FUNNEL_HEIGHT = 220;
const MAX_FUNNEL_HEIGHT = 1200;

/**
 * How much taller than its measured box the funnel is drawn.
 *
 * The mouth's aperture is a SHARE of the funnel's height (`APERTURE_START` in funnel.ts)
 * and that share is already 0.94 — there is no room left inside the box, so "make the
 * mouth wider" can only mean "make the funnel taller". At 1.7 the mouth opens 70% wider
 * than the box alone would allow and the panel scrolls vertically for the remainder.
 *
 * This is a deliberate departure from FR-006 ("the whole funnel fits without
 * scrolling"): at the requested mouth width the two cannot both hold, and the mouth is
 * what carries the picture. The PAGE still never scrolls — only this panel does.
 */
const MOUTH_BOOST = 1.7;

/**
 * Horizontal floor for the layout, in px.
 *
 * FR-006 asks for a funnel that fits without scrolling, and at desktop widths it does.
 * A phone cannot honour that and stay legible at the same time: six stages across 366px
 * is 61px each, and stage names ("GemeenteDelers", "Formalisatie") overprint into a
 * single smear. So below this width the funnel keeps its readable geometry and the frame
 * scrolls sideways instead — the picture stays true, the labels stay readable, and the
 * legend below it does not scroll at all.
 */
const MIN_FUNNEL_WIDTH = 640;

/**
 * The innovation funnel (feature 022).
 *
 * Composes two things the dashboard already fetches: the growth-phase vocabulary (from
 * the dashboard payload, which carries every phase in authored order including the empty
 * ones) and the initiative rows (from the cached graph, via the same builder the
 * Initiatives table uses). It adds no request of its own.
 */
export function FunnelTab() {
  const { t } = useTranslation();
  const { effectiveSpaceIds, state } = useSelectionContext();

  // Feature 025: both the phase vocabulary (counts bundle) and the initiative rows come
  // off the ONE loaded dataset — this tab adds no request of its own (FR-002).
  const { data } = useCounts();
  const dataset = useGraphDataset();
  const { error } = useCoreLoadState();
  const allRows = useInitiativeRows();

  // Measure the container so the layout is computed against real pixels — the funnel is
  // laid out to fit, never scaled after the fact, so dot sizes stay honest on every size.
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(MIN_FUNNEL_WIDTH, Math.floor(entry.contentRect.width));
      // The measured box is the chart's own area; the chart then adds label, ramp and
      // legend bands around the funnel, so those come off before we ask for a height —
      // and the remainder is scaled up by MOUTH_BOOST, which the panel absorbs by
      // scrolling.
      const box = Math.max(MIN_FUNNEL_HEIGHT, Math.floor(entry.contentRect.height) - FUNNEL_CHROME);
      const height = Math.round(Math.min(MAX_FUNNEL_HEIGHT, box * MOUTH_BOOST));
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Classification filters (NDS / VNG-2030). Single-select with an "all" default: the
  // funnel answers "where is the pipeline", and the useful question on top of that is
  // "…for ONE strategic theme", not "for this arbitrary subset".
  const [ndsFilter, setNdsFilter] = useState(FILTER_ALL);
  const [vngFilter, setVngFilter] = useState(FILTER_ALL);
  // Names beside the dots. Off by default — see the prop's note in FunnelChart — but the
  // natural next move after narrowing with the filters above, so it sits beside them.
  const [showLabels, setShowLabels] = useState(false);

  /** Distinct values actually present on the rows, so no option can select nothing. */
  const optionsFor = (pick: (r: (typeof allRows)[number]) => string[]): string[] => {
    const set = new Set<string>();
    for (const r of allRows) for (const v of pick(r)) set.add(v);
    return [...set].sort((a, b) => a.localeCompare(b));
  };
  const ndsOptions = useMemo(() => optionsFor((r) => r.nds), [allRows]);
  const vngOptions = useMemo(() => optionsFor((r) => r.vng2030), [allRows]);

  // A value can vanish when the selection changes (that classification is no longer
  // carried by anything). Leaving the filter set would then show an empty funnel with no
  // hint as to why, so it falls back to "all".
  useEffect(() => {
    if (ndsFilter !== FILTER_ALL && !ndsOptions.includes(ndsFilter)) setNdsFilter(FILTER_ALL);
    if (vngFilter !== FILTER_ALL && !vngOptions.includes(vngFilter)) setVngFilter(FILTER_ALL);
  }, [ndsOptions, vngOptions, ndsFilter, vngFilter]);

  // A filtered-out initiative leaves the funnel entirely — including the stage counts in
  // the header boxes, which is the point: the funnel re-reads as that theme's pipeline.
  const rows = useMemo(
    () =>
      allRows.filter(
        (r) =>
          (ndsFilter === FILTER_ALL || r.nds.includes(ndsFilter)) &&
          (vngFilter === FILTER_ALL || r.vng2030.includes(vngFilter)),
      ),
    [allRows, ndsFilter, vngFilter],
  );

  const phases = data?.phaseDistribution?.phases ?? [];
  const layout = useMemo(
    () =>
      layoutFunnel({
        rows,
        phases,
        width: size.width,
        height: size.height,
      }),
    // `phases` is derived from `data` each render; key on the payload instead. The GD
    // toggle needs no dep of its own — it changes `rows`, which is already one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, data, size.width, size.height],
  );

  const phaseDrift = data?.vocabularyDrift?.find((d) => d.dimension === 'phase');

  const body = () => {
    if (effectiveSpaceIds.length === 0) {
      return (
        <Centered>{t('funnel.empty', { defaultValue: 'Select one or more initiatives to show the funnel.' })}</Centered>
      );
    }
    if (error) return <Centered>{error}</Centered>;
    // TWO independent sources feed the funnel and they land in either order: the graph
    // supplies the initiatives, the dashboard payload supplies the phase vocabulary.
    // Both must be in before anything below can be said truthfully — and the graph is
    // usually the CACHED one, so it lands first. Guarding on the graph alone (which this
    // did) meant that between the two responses `phases` was still empty and the
    // no-vocabulary state below fired: a dashboard mid-load told the user its phase
    // classification was not configured.
    if (!dataset || !data) {
      return (
        <Centered>
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          {t('funnel.loading', { defaultValue: 'Building the funnel…' })}
        </Centered>
      );
    }
    // No designated phase classification — the funnel has no stages to draw, so say why
    // rather than showing a one-stage frame that looks broken (FR-025).
    if (phases.length === 0) {
      return (
        <Centered>
          <div className="max-w-md text-center">
            <div className="font-medium text-foreground">
              {t('funnel.noVocabulary', { defaultValue: 'No phase classification configured' })}
            </div>
            <p className="mt-1">
              {t('funnel.noVocabularyHint', {
                defaultValue:
                  'The funnel uses the phases authored in Alkemio. Designate a phase classification to show the funnel.',
              })}
            </p>
          </div>
        </Centered>
      );
    }
    return <FunnelChart layout={layout} showLabels={showLabels} />;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-hidden p-3 sm:p-6">
      <h2 className="text-base font-semibold text-foreground">
        {t('funnel.title', { defaultValue: 'Innovation funnel' })}
      </h2>
      <p className="text-xs text-muted-foreground">
        {t('funnel.subtitle', { defaultValue: 'Where are the initiatives in the funnel?' })}
      </p>

      {/* Classification filters. Rendered only once there is something to filter — an
          empty pair of dropdowns above a loading funnel is chrome, not a control. */}
      {(ndsOptions.length > 0 || vngOptions.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {[
            {
              key: 'nds',
              label: t('citiesTab.filterNds'),
              options: ndsOptions,
              value: ndsFilter,
              onChange: setNdsFilter,
            },
            {
              key: 'vng2030',
              label: t('citiesTab.filterVng2030'),
              options: vngOptions,
              value: vngFilter,
              onChange: setVngFilter,
            },
          ]
            .filter((f) => f.options.length > 0)
            .map((f) => (
              <label
                key={f.key}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground sm:flex-none"
              >
                {f.label}
                <select
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  aria-label={f.label}
                  className={cn(
                    'min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground',
                    'sm:max-w-56 sm:flex-none',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  )}
                >
                  <option value={FILTER_ALL}>{t('citiesTab.filterAll')}</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className={cn(
                'h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              )}
            />
            {t('funnel.showNames', { defaultValue: 'Show names' })}
          </label>
        </div>
      )}
      {/* Measured here, not on the page: this is the box the funnel actually gets. */}
      <div ref={hostRef} className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {body()}
      </div>
      {/* The stage set and its order come from Alkemio's authored vocabulary, so a drift
          means the funnel's own stages may not be the pipeline this build expects. */}
      <VocabularyDriftNotice drift={phaseDrift} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
