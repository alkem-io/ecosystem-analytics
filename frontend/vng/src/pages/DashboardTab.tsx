import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useDashboard } from '../hooks/useDashboard.js';
import { NdsChart } from '../components/charts/NdsChart.js';
import { Vng2030Chart } from '../components/charts/Vng2030Chart.js';
import { GdProvenanceNote } from '../components/GdProvenanceNote.js';

/**
 * Dashboard tab — NDS and VNG-2030 bar charts derived from the effective space
 * set (US3). Data-source aware: the backend counts GD initiatives when that layer
 * is active, otherwise selected spaces; each chart shows the active source (FR-021/022).
 */
export function DashboardTab() {
  const { t } = useTranslation();
  const { effectiveSpaceIds, state, refreshNonce } = useSelectionContext();

  // The dashboard ALWAYS counts the selected spaces (VNG Groei initiatives) by
  // their NDS / VNG-2030 profile tags — it is decoupled from the graph's
  // "include GD initiatives" toggle (GD callouts use the 92 GemeenteDelers themes,
  // not NDS/VNG-2030, so counting them here would be all-uncategorised).
  const request = useMemo(
    () => ({
      spaceIds: effectiveSpaceIds,
      includeGemeentes: state.showGemeentes,
      includeInitiatives: false,
    }),
    [effectiveSpaceIds, state.showGemeentes],
  );

  const { data, loading, error } = useDashboard(request, { refreshNonce });

  const ndsDimension = data?.dimensions.find((d) => d.key === 'nds');
  const vng2030Dimension = data?.dimensions.find((d) => d.key === 'vng2030');
  const source = data?.source ?? 'spaces';

  if (effectiveSpaceIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t('selection.empty')}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      {state.includeInitiatives && (
        <div className="mb-4">
          <GdProvenanceNote />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('states.error')}: {error}
        </div>
      )}

      {loading && !data && (
        <div className="mb-4 text-sm text-muted-foreground">{t('states.loading')}</div>
      )}

      {data && (
        <p className="mb-4 text-xs text-muted-foreground">
          {t('dashboard.totalCounted', { count: data.totalCounted })}
          {data.uncategorisedCount > 0 &&
            ` · ${t('dashboard.uncategorisedCount', { count: data.uncategorisedCount })}`}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NdsChart dimension={ndsDimension} source={source} />
        <Vng2030Chart dimension={vng2030Dimension} source={source} />
      </div>
    </div>
  );
}
