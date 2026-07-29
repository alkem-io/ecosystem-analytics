import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
import { cn, useAppConfig } from '@ea/shared';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useDashboard } from '../hooks/useDashboard.js';
import { useGraphProgress } from '../hooks/useGraphProgress.js';
import { NdsChart } from '../components/charts/NdsChart.js';
import { Vng2030Chart } from '../components/charts/Vng2030Chart.js';
import { GemeenteDistributionChart } from '../components/charts/GemeenteDistributionChart.js';
import { CategoryMatrixChart } from '../components/charts/CategoryMatrixChart.js';
import { CityPopulationChart } from '../components/charts/CityPopulationChart.js';
import { PhaseDistributionChart } from '../components/charts/PhaseDistributionChart.js';
import { GdProvenanceNote } from '../components/GdProvenanceNote.js';
import { LoadingOverlay } from '../components/LoadingOverlay.js';
import { exportDashboardXlsx, exportSingleChartXlsx, type ChartTable } from '../utils/exportDashboard.js';
import { buildCityRows } from '../utils/cities.js';
import { useVngGraph } from '../hooks/useVngGraph.js';

/**
 * Dashboard tab — NDS and VNG-2030 bar charts derived from the effective space
 * set (US3). Data-source aware: the backend counts GD initiatives when that layer
 * is active, otherwise selected spaces; each chart shows the active source (FR-021/022).
 */
export function DashboardTab() {
  const { t } = useTranslation();
  const { exportCreator, exportFilenameStem } = useAppConfig();
  const { effectiveSpaceIds, selectedSpaces, state, refreshNonce } = useSelectionContext();

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

  // Same cached graph the Cities/Graph tabs use — only needed to build the city
  // chart's per-initiative export (one row per initiative with its connected cities).
  const { dataset } = useVngGraph(effectiveSpaceIds, {
    includeInitiatives: state.includeInitiatives,
    refreshNonce,
  });

  // Live server-side generation progress (the dashboard fetch runs the same graph
  // acquisition under the hood), so the loading card can show which space is being
  // fetched and a real progress bar instead of empty charts.
  const progress = useGraphProgress(loading);
  const currentSpaceLabel = useMemo(() => {
    const nameId = progress?.currentSpace;
    if (!nameId) return null;
    const match = selectedSpaces.find((s) => s.nameId === nameId);
    return match?.displayName ?? nameId;
  }, [progress?.currentSpace, selectedSpaces]);

  const ndsDimension = data?.dimensions.find((d) => d.key === 'nds');
  const vng2030Dimension = data?.dimensions.find((d) => d.key === 'vng2030');
  const gdIncluded = data?.gdIncluded ?? false;

  const phaseRef = useRef<HTMLDivElement>(null);
  const ndsRef = useRef<HTMLDivElement>(null);
  const vngRef = useRef<HTMLDivElement>(null);
  const distRef = useRef<HTMLDivElement>(null);
  const matrixRef = useRef<HTMLDivElement>(null);
  const cityPopRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [busyChart, setBusyChart] = useState<string | null>(null);

  const catLabel = (ns: string, key: string) =>
    key === 'uncategorised'
      ? t('dashboard.uncategorised', { defaultValue: 'No classification' })
      : t(`${ns}.${key}`, { defaultValue: key });

  // ---- Per-chart raw-data builders (each returns one sheet, or null when empty) ----
  const dimTable = (key: 'nds' | 'vng2030'): ChartTable | null => {
    const dim = data?.dimensions.find((d) => d.key === key);
    if (!dim) return null;
    return {
      columns: [t('export.category'), t('export.count'), t('export.initiatives')],
      rows: dim.categories.map((c) => [catLabel(`categories.${key}`, c.key), c.count, c.items.join(', ')]),
    };
  };
  const phaseTable = (): ChartTable | null => {
    const pd = data?.phaseDistribution;
    if (!pd) return null;
    return {
      columns: [t('export.phase'), t('export.count'), t('export.initiatives')],
      rows: pd.phases.map((p) => [catLabel('categories.phase', p.key), p.count, p.items.join(', ')]),
    };
  };
  const distTable = (): ChartTable | null => {
    const gd = data?.gemeenteDistribution;
    if (!gd) return null;
    return {
      columns: [
        t('export.bucket'),
        t('dashboard.groei'),
        t('dashboard.gemeenteDelers'),
        t('dashboard.total'),
        t('export.initiatives'),
      ],
      rows: gd.buckets.map((b) => [
        b.key === 'none' ? '0' : b.key,
        b.groei,
        b.gd,
        b.groei + b.gd,
        [...b.groeiItems, ...b.gdItems].join(', '),
      ]),
    };
  };
  const matrixTable = (): ChartTable | null => {
    const m = data?.categoryMatrix;
    if (!m) return null;
    return {
      columns: [
        t('dashboard.nds'),
        t('dashboard.vng2030'),
        t('export.count'),
        t('dashboard.groei'),
        t('dashboard.gemeenteDelers'),
        t('export.initiatives'),
      ],
      rows: m.cells.map((c) => [
        catLabel('categories.nds', c.nds),
        catLabel('categories.vng2030', c.vng2030),
        c.count,
        c.spacesItems.length,
        c.gdItems.length,
        [...c.spacesItems, ...c.gdItems].join(', '),
      ]),
    };
  };
  // City chart export: one row per INITIATIVE with the cities it connects (FR-025),
  // inverted client-side from the same graph the Cities tab uses.
  const cityTable = (): ChartTable | null => {
    const rows = buildCityRows(dataset);
    if (rows.length === 0) return null;
    const byInit = new Map<string, { name: string; kind: 'groei' | 'gd'; cities: Set<string> }>();
    for (const c of rows)
      for (const init of c.initiatives) {
        let e = byInit.get(init.id);
        if (!e) byInit.set(init.id, (e = { name: init.name, kind: init.kind, cities: new Set() }));
        e.cities.add(c.name);
      }
    const out = [...byInit.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      columns: [t('export.initiative'), t('export.kind'), t('export.count'), t('export.cities')],
      rows: out.map((e) => [
        e.name,
        e.kind === 'gd' ? t('dashboard.gemeenteDelers') : t('dashboard.groei'),
        e.cities.size,
        [...e.cities].sort((a, b) => a.localeCompare(b)).join(', '),
      ]),
    };
  };

  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'chart';

  const runChartExport = async (
    id: string,
    title: string,
    node: HTMLElement | null,
    table: ChartTable | null,
  ) => {
    setBusyChart(id);
    try {
      await exportSingleChartXlsx({
        title,
        node,
        table,
        creator: exportCreator,
        filename: `${exportFilenameStem}-${slug(title)}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetDataName: t('export.sheetData', { defaultValue: 'Gegevens' }),
        sheetChartName: t('export.sheetCharts', { defaultValue: 'Grafieken' }),
      });
    } finally {
      setBusyChart(null);
    }
  };

  // A plain element helper (NOT a nested component — avoids remounting the chart each
  // render): a right-aligned per-chart download button above the captured chart card.
  const frame = (
    id: string,
    chartRef: RefObject<HTMLDivElement | null>,
    title: string,
    tableFn: () => ChartTable | null,
    className: string | undefined,
    children: ReactNode,
  ) => (
    <div className={className}>
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          title={t('export.downloadChart', { defaultValue: 'Download chart' })}
          onClick={() => runChartExport(id, title, chartRef.current, tableFn())}
          disabled={!data || busyChart !== null}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground',
            'transition-colors hover:bg-muted disabled:opacity-60',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
        >
          {busyChart === id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Download className="h-3.5 w-3.5" aria-hidden />
          )}
          {t('export.downloadChart', { defaultValue: 'Download chart' })}
        </button>
      </div>
      <div ref={chartRef}>{children}</div>
    </div>
  );

  const onExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportDashboardXlsx({
        data,
        charts: [
          {
            title: t('dashboard.phases', { defaultValue: 'Initiatieven per groeifase' }),
            node: phaseRef.current,
          },
          { title: t('dashboard.nds'), node: ndsRef.current },
          { title: t('dashboard.vng2030'), node: vngRef.current },
          {
            title: t('dashboard.gemeenteDistribution', { defaultValue: 'Initiatives by gemeentes' }),
            node: distRef.current,
          },
          {
            title: t('dashboard.categoryMatrix', { defaultValue: 'NDS × VNG-2030' }),
            node: matrixRef.current,
          },
          {
            title: t('dashboard.cityPopulation', {
              defaultValue: 'Inwoners versus deelname',
            }),
            node: cityPopRef.current,
          },
        ],
        labelOf: (ns, key) => t(`${ns}.${key}`, { defaultValue: key }),
        creator: exportCreator,
        filename: `${exportFilenameStem}-${new Date().toISOString().slice(0, 10)}.xlsx`,
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
          phases: t('dashboard.phases', { defaultValue: 'Initiatieven per groeifase' }),
          phase: t('export.phase', { defaultValue: 'Groeifase' }),
          bucket: t('export.bucket', { defaultValue: 'Aantal gemeenten' }),
          groei: t('dashboard.groei', { defaultValue: 'Groei' }),
          gd: t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' }),
          total: t('dashboard.total', { defaultValue: 'Totaal' }),
          noClassification: t('dashboard.uncategorised', { defaultValue: 'No classification' }),
          cityPopulation: t('dashboard.cityPopulation', {
            defaultValue: 'Inwoners versus deelname',
          }),
          city: t('export.city', { defaultValue: 'Gemeente' }),
          province: t('export.province', { defaultValue: 'Provincie' }),
          population: t('export.population', { defaultValue: 'Inwoners' }),
          participating: t('export.participating', { defaultValue: 'Neemt deel' }),
          yes: t('export.yes', { defaultValue: 'Ja' }),
          no: t('export.no', { defaultValue: 'Nee' }),
          cityExcluded: t('dashboard.cityExcluded', {
            count: data.cityPopulation?.excludedUnknownPopulation ?? 0,
            defaultValue: '{{count}} gemeenten zonder bekend inwonertal zijn weggelaten',
          }),
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
    <div className="relative h-full">
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
        {/* Growth-phase pipeline leads the dashboard; omitted entirely when the
            selected spaces carry no phase tags (the server then sends no data). */}
        {data?.phaseDistribution &&
          frame(
            'phase',
            phaseRef,
            t('dashboard.phases', { defaultValue: 'Initiatieven per groeifase' }),
            phaseTable,
            'lg:col-span-2',
            <PhaseDistributionChart
              distribution={data.phaseDistribution}
              emptyLabel={t('dashboard.noData')}
            />,
          )}
        {frame(
          'nds',
          ndsRef,
          t('dashboard.nds'),
          () => dimTable('nds'),
          undefined,
          <NdsChart dimension={ndsDimension} gdIncluded={gdIncluded} />,
        )}
        {frame(
          'vng2030',
          vngRef,
          t('dashboard.vng2030'),
          () => dimTable('vng2030'),
          undefined,
          <Vng2030Chart dimension={vng2030Dimension} gdIncluded={gdIncluded} />,
        )}
        {frame(
          'dist',
          distRef,
          t('dashboard.gemeenteDistribution', { defaultValue: 'Initiatives by gemeentes' }),
          distTable,
          'lg:col-span-2',
          <GemeenteDistributionChart
            distribution={data?.gemeenteDistribution}
            emptyLabel={t('dashboard.noData')}
          />,
        )}
        {frame(
          'matrix',
          matrixRef,
          t('dashboard.categoryMatrix', { defaultValue: 'NDS × VNG-2030' }),
          matrixTable,
          'lg:col-span-2',
          <CategoryMatrixChart
            matrix={data?.categoryMatrix}
            gdIncluded={gdIncluded}
            emptyLabel={t('dashboard.noData')}
          />,
        )}
        {frame(
          'city',
          cityPopRef,
          t('dashboard.cityPopulation', { defaultValue: 'Inwoners versus deelname' }),
          cityTable,
          'lg:col-span-2',
          <CityPopulationChart series={data?.cityPopulation} emptyLabel={t('dashboard.noData')} />,
        )}
      </div>
      </div>

      {loading && (
        <LoadingOverlay
          progress={progress}
          currentSpace={currentSpaceLabel}
          dim
          labels={{
            loading: t('states.loadingData', { defaultValue: t('states.loading') }),
            transforming: t('states.graphTransforming', { defaultValue: 'Netwerk opbouwen…' }),
            acquiring: t('states.graphAcquiring', { defaultValue: 'Initiatieven ophalen' }),
            building: t('states.graphBuilding', { defaultValue: 'Netwerk' }),
            hint: t('states.loadingGraphHint', { defaultValue: 'Dit kan even duren' }),
          }}
        />
      )}
    </div>
  );
}
