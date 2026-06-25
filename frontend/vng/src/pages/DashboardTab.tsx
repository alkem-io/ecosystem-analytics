import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
import { cn } from '@ea/shared';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useDashboard } from '../hooks/useDashboard.js';
import { NdsChart } from '../components/charts/NdsChart.js';
import { Vng2030Chart } from '../components/charts/Vng2030Chart.js';
import { GemeenteDistributionChart } from '../components/charts/GemeenteDistributionChart.js';
import { GdProvenanceNote } from '../components/GdProvenanceNote.js';
import { exportDashboardXlsx } from '../utils/exportDashboard.js';

/**
 * Dashboard tab — NDS and VNG-2030 bar charts derived from the effective space
 * set (US3). Data-source aware: the backend counts GD initiatives when that layer
 * is active, otherwise selected spaces; each chart shows the active source (FR-021/022).
 */
export function DashboardTab() {
  const { t } = useTranslation();
  const { effectiveSpaceIds, state, refreshNonce } = useSelectionContext();

  // The dashboard always counts the selected spaces (VNG Groei initiatives) by their
  // NDS / VNG-2030 profile tags. When the GD ("include GemeenteDelers initiatives")
  // checkbox is on, GD initiatives are additionally stacked into every chart — they
  // carry GemeenteDelers themes rather than NDS/VNG-2030 tags, so most land in the
  // "Overig" (no classification) bar.
  const request = useMemo(
    () => ({
      spaceIds: effectiveSpaceIds,
      includeGemeentes: state.showGemeentes,
      // Stack GD initiatives into the NDS / VNG-2030 category charts…
      includeInitiatives: state.includeInitiatives,
      // …and into the gemeente-distribution chart.
      includeGemeenteDelers: state.includeInitiatives,
    }),
    [effectiveSpaceIds, state.showGemeentes, state.includeInitiatives],
  );

  const { data, loading, error } = useDashboard(request, { refreshNonce });

  const ndsDimension = data?.dimensions.find((d) => d.key === 'nds');
  const vng2030Dimension = data?.dimensions.find((d) => d.key === 'vng2030');
  const gdIncluded = data?.gdIncluded ?? false;

  const ndsRef = useRef<HTMLDivElement>(null);
  const vngRef = useRef<HTMLDivElement>(null);
  const distRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportDashboardXlsx({
        data,
        charts: [
          { title: t('dashboard.nds'), node: ndsRef.current },
          { title: t('dashboard.vng2030'), node: vngRef.current },
          {
            title: t('dashboard.gemeenteDistribution', { defaultValue: 'Initiatives by gemeentes' }),
            node: distRef.current,
          },
        ],
        labelOf: (ns, key) => t(`${ns}.${key}`, { defaultValue: key }),
        filename: `vng-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`,
        text: {
          sheetData: t('export.sheetData', { defaultValue: 'Gegevens' }),
          sheetCharts: t('export.sheetCharts', { defaultValue: 'Grafieken' }),
          category: t('export.category', { defaultValue: 'Categorie' }),
          count: t('export.count', { defaultValue: 'Aantal' }),
          initiatives: t('export.initiatives', { defaultValue: 'Initiatieven' }),
          nds: t('dashboard.nds'),
          vng2030: t('dashboard.vng2030'),
          gemeenteDistribution: t('dashboard.gemeenteDistribution', {
            defaultValue: 'Initiatieven per aantal gemeenten',
          }),
          bucket: t('export.bucket', { defaultValue: 'Aantal gemeenten' }),
          groei: t('dashboard.groei', { defaultValue: 'Groei' }),
          gd: t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' }),
          total: t('dashboard.total', { defaultValue: 'Totaal' }),
        },
      });
    } finally {
      setExporting(false);
    }
  };

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

      <div className="mb-4 flex items-center justify-between gap-3">
        {data ? (
          <p className="text-xs text-muted-foreground">
            {t('dashboard.totalCounted', { count: data.totalCounted })}
            {data.uncategorisedCount > 0 &&
              ` · ${t('dashboard.uncategorisedCount', { count: data.uncategorisedCount })}`}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onExport}
          disabled={!data || exporting}
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground',
            'transition-colors hover:bg-muted disabled:opacity-60',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {t('export.downloadXlsx', { defaultValue: 'Download XLSX' })}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div ref={ndsRef}>
          <NdsChart dimension={ndsDimension} gdIncluded={gdIncluded} />
        </div>
        <div ref={vngRef}>
          <Vng2030Chart dimension={vng2030Dimension} gdIncluded={gdIncluded} />
        </div>
        <div className="lg:col-span-2" ref={distRef}>
          <GemeenteDistributionChart
            distribution={data?.gemeenteDistribution}
            emptyLabel={t('dashboard.noData')}
          />
        </div>
      </div>
    </div>
  );
}
