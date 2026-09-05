import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { FunnelChart, FUNNEL_CHROME } from '../components/FunnelChart.js';
import { VocabularyDriftNotice } from '../components/charts/VocabularyDriftNotice.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useDashboard } from '../hooks/useDashboard.js';
import { useVngGraph } from '../hooks/useVngGraph.js';
import { buildInitiativeRows } from '../utils/initiatives.js';
import { layoutFunnel } from '../utils/funnel.js';

/** Vertical space the funnel gets, clamped so it stays whole on short windows (FR-006). */
const MIN_FUNNEL_HEIGHT = 220;
const MAX_FUNNEL_HEIGHT = 720;

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
  const { effectiveSpaceIds, state, refreshNonce } = useSelectionContext();

  const { data, loading: dashboardLoading, error: dashboardError } = useDashboard(
    {
      spaceIds: effectiveSpaceIds,
      includeGemeentes: state.showGemeentes,
      includeInitiatives: state.includeInitiatives,
      includeGemeenteDelers: state.includeInitiatives,
    },
    { refreshNonce },
  );
  const { dataset, loading: graphLoading, error: graphError } = useVngGraph(effectiveSpaceIds, {
    includeInitiatives: state.includeInitiatives,
    refreshNonce,
  });

  // Measure the container so the layout is computed against real pixels — the funnel is
  // laid out to fit, never scaled after the fact, so dot sizes stay honest on every size.
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      // The measured box is the chart's own area; the chart then adds label, ramp and
      // legend bands around the funnel, so those come off before we ask for a height.
      const height = Math.min(
        MAX_FUNNEL_HEIGHT,
        Math.max(MIN_FUNNEL_HEIGHT, Math.floor(entry.contentRect.height) - FUNNEL_CHROME),
      );
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => buildInitiativeRows(dataset), [dataset]);
  const phases = data?.phaseDistribution?.phases ?? [];
  const layout = useMemo(
    () =>
      layoutFunnel({
        rows,
        phases,
        width: size.width,
        height: size.height,
        gdIncluded: state.includeInitiatives,
      }),
    // `phases` is derived from `data` each render; key on the payload instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, data, size.width, size.height, state.includeInitiatives],
  );

  const loading = dashboardLoading || graphLoading;
  const error = dashboardError ?? graphError;
  const phaseDrift = data?.vocabularyDrift?.find((d) => d.dimension === 'phase');

  const body = () => {
    if (effectiveSpaceIds.length === 0) {
      return (
        <Centered>{t('funnel.empty', { defaultValue: 'Select one or more initiatives to show the funnel.' })}</Centered>
      );
    }
    if (loading && !dataset) {
      return (
        <Centered>
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          {t('funnel.loading', { defaultValue: 'Building the funnel…' })}
        </Centered>
      );
    }
    if (error) return <Centered>{error}</Centered>;
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
    return <FunnelChart layout={layout} />;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-hidden p-6">
      <h2 className="text-base font-semibold text-foreground">
        {t('funnel.title', { defaultValue: 'Innovation funnel' })}
      </h2>
      <p className="text-xs text-muted-foreground">
        {t('funnel.subtitle', { defaultValue: 'Where are the initiatives in the funnel?' })}
      </p>
      {/* Measured here, not on the page: this is the box the funnel actually gets. */}
      <div ref={hostRef} className="mt-2 min-h-0 flex-1">
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
