import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
import { cn, useAppConfig, useIsCompact } from '@ea/shared';
import type { VngDashboardResponse } from '@server/types/api.js';
import type { InitiativeRow } from '../../utils/initiatives.js';
import type { CityRow } from '../../utils/cities.js';
import { Card, DownloadButton, Legend, TipProvider, type LegendItem } from './primitives.js';
import { PhaseBubbles, colorOf, type PhaseColorBy } from './PhaseBubbles.js';
import { CategoryBars, DistributionColumns, PieMatrix, PopulationScatter, shortCat } from './charts.js';

export type ChartId = 'phase' | 'nds' | 'vng2030' | 'dist' | 'matrix' | 'city';

const GROEI = 'var(--series-groei)';
const GD = 'var(--series-gd)';

const RANGES: { key: string; label: string; range: [number, number] }[] = [
  { key: 'all', label: 'Alles tonen', range: [0, 1e7] },
  { key: 's', label: 'Tot 50.000', range: [0, 50000] },
  { key: 'm', label: '50.000 tot 100.000', range: [50000, 100000] },
  { key: 'l', label: 'Vanaf 100.000', range: [100000, 1e7] },
];

/**
 * Layout A dashboard (AppConfig.layout = 'sidebar'). The same counts, rows and exports as
 * the tab-strip dashboard — only the presentation is new: KPI tiles, the phase chart as
 * bubbles with one dot per participating gemeente, horizontal NDS / VNG-2030 bars with
 * the initiatives' names on hover, a pie per NDS × VNG-2030 cell and a pie per gemeente
 * in the population scatter.
 */
export function DashboardA({
  data,
  rows,
  cityRows,
  leads,
  colorBy,
  onColorBy,
  handelenStatus,
  refs,
  busyChart,
  exporting,
  onChartExport,
  onExport,
  header,
}: {
  data: VngDashboardResponse | null;
  rows: InitiativeRow[];
  cityRows: CityRow[];
  leads: Map<string, Set<string>>;
  colorBy: PhaseColorBy;
  onColorBy: (c: PhaseColorBy) => void;
  handelenStatus: string | null;
  refs: Record<ChartId, RefObject<HTMLDivElement | null>>;
  busyChart: string | null;
  exporting: boolean;
  onChartExport: (id: ChartId) => void;
  onExport: () => void;
  header?: ReactNode;
}) {
  const { t } = useTranslation();
  const { eventPrefix } = useAppConfig();
  const compact = useIsCompact();
  const [log, setLog] = useState(true);
  const [rangeKey, setRangeKey] = useState('all');

  const cities = useMemo(() => new Map(cityRows.map((c) => [c.name, c])), [cityRows]);
  const ndsDim = data?.dimensions.find((d) => d.key === 'nds');
  const vngDim = data?.dimensions.find((d) => d.key === 'vng2030');
  const vocab = (d: typeof ndsDim) => (d?.categories ?? []).filter((c) => c.key !== 'uncategorised').map((c) => c.label ?? '');
  const ndsOrder = useMemo(() => vocab(ndsDim), [ndsDim]);
  const vngOrder = useMemo(() => vocab(vngDim), [vngDim]);
  const gdIncluded = data?.gdIncluded ?? false;

  const openInitiative = (spaceId: string) =>
    window.dispatchEvent(new CustomEvent(`${eventPrefix}:openSpace`, { detail: { spaceId } }));
  const openCity = (cityId: string) =>
    window.dispatchEvent(new CustomEvent(`${eventPrefix}:openCity`, { detail: { cityId } }));

  const dl = (id: ChartId) => (
    <DownloadButton
      label={t('export.downloadChart', { defaultValue: 'Grafiek downloaden' })}
      busy={busyChart === id}
      disabled={!data || busyChart !== null}
      onClick={() => onChartExport(id)}
    />
  );
  const sourceLegend: LegendItem[] = [
    { label: t('dashboard.groei', { defaultValue: 'Groei' }), color: GROEI },
    ...(gdIncluded ? [{ label: t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' }), color: GD }] : []),
  ];

  // KPI tiles
  const kpi = useMemo(() => {
    const groei = rows.filter((r) => r.kind !== 'gd').length;
    const gd = rows.length - groei;
    const part = data?.cityPopulation?.participating ?? [];
    const non = data?.cityPopulation?.nonParticipating ?? [];
    const all = part.length + non.length + (data?.cityPopulation?.excludedUnknownPopulation ?? 0);
    const popPart = part.reduce((s, p) => s + p.population, 0);
    const popAll = popPart + non.reduce((s, p) => s + p.population, 0);
    return { groei, gd, total: data?.totalCounted ?? rows.length, part: part.length, all, popPart, popAll };
  }, [rows, data]);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const mln = (n: number) => (n / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 });

  const legendFor = (): ReactNode => {
    if (colorBy === 'source') return <Legend items={[{ label: t('dashboard.groei', { defaultValue: 'Groei' }), color: GROEI, shape: 'dot' }]} />;
    if (colorBy === 'handelen')
      return (
        <Legend
          items={[
            { label: t('handelen.status.active', { defaultValue: 'Actief (≤ 30 dagen)' }), color: 'var(--handelen-active)', shape: 'dot' },
            { label: t('handelen.status.quiet', { defaultValue: 'Stil (31–90 dagen)' }), color: 'var(--handelen-quiet)', shape: 'dot' },
            { label: t('handelen.status.dormant', { defaultValue: 'Slapend (> 90 dagen)' }), color: 'var(--handelen-dormant)', shape: 'dot' },
            { label: t('handelen.status.none', { defaultValue: 'Geen handelen bekend' }), color: 'var(--cat-none)', shape: 'dot' },
          ]}
        />
      );
    const order = colorBy === 'nds' ? ndsOrder : vngOrder;
    return (
      <Legend
        items={[
          ...order.map((l, i) => ({ label: shortCat(l), color: i < 8 ? `var(--cat-${i + 1})` : 'var(--cat-other)', shape: 'dot' as const })),
          { label: t('dashboard.uncategorised', { defaultValue: 'Geen classificatie' }), color: 'var(--cat-none)', shape: 'dot' },
        ]}
      />
    );
  };

  const srcSpaces = t('dashboard.a.sourceSpaces', { defaultValue: 'Op basis van de Spaces in de monitor' });
  const srcBoth = gdIncluded ? `${srcSpaces} + ${t('dashboard.a.sourceGd', { defaultValue: 'GemeenteDelers-initiatieven' })}` : srcSpaces;
  const range = RANGES.find((r) => r.key === rangeKey)?.range ?? RANGES[0].range;
  const selectCls =
    'h-[30px] rounded-md border border-border bg-card px-2 text-[13px] text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  return (
    <TipProvider>
      <div className="mx-auto max-w-[1560px]">
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-[-0.015em] text-foreground">
              {t('tabs.dashboard', { defaultValue: 'Dashboard' })}
            </h1>
            {data && (
              <p className="mt-0.5 text-[14px] text-muted-foreground">
                {t('dashboard.a.counted', { count: data.totalCounted, defaultValue: '{{count}} geteld' })}
                {data.uncategorisedCount > 0 &&
                  ` · ${t('dashboard.a.uncategorised', { count: data.uncategorisedCount, defaultValue: '{{count}} zonder categorie' })}`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onExport}
            disabled={!data || exporting}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cbd5e1] bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            {t('export.downloadXlsx', { defaultValue: 'Download XLSX' })}
          </button>
        </div>
        {header}

        {/* KPI tiles */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
          <Kpi
            label={t('dashboard.a.kpiCounted', { defaultValue: 'Geteld' })}
            value={String(kpi.total)}
            meter={[[pct(kpi.groei, kpi.total), GROEI], [pct(kpi.gd, kpi.total), GD]]}
            detail={`${kpi.groei} Groei${gdIncluded ? ` · ${kpi.gd} ${compact ? 'GD' : 'GemeenteDelers'}` : ''}`}
          />
          <Kpi
            label={t('dashboard.a.kpiCities', { defaultValue: 'Gemeenten die meedoen' })}
            value={String(kpi.part)}
            small={`van ${kpi.all}`}
            meter={[[pct(kpi.part, kpi.all), GROEI]]}
            detail={`${pct(kpi.part, kpi.all)}% ${t('dashboard.a.ofCities', { defaultValue: 'van de gemeenten' })}`}
          />
          <Kpi
            label={t('dashboard.a.kpiPopulation', { defaultValue: 'Inwoners in deze gemeenten' })}
            value={mln(kpi.popPart)}
            small="mln"
            meter={[[pct(kpi.popPart, kpi.popAll), GROEI]]}
            detail={`${pct(kpi.popPart, kpi.popAll)}% van ${mln(kpi.popAll)} mln`}
          />
          <Kpi
            label={t('dashboard.a.kpiUncategorised', { defaultValue: 'Zonder categorie' })}
            value={String(data?.uncategorisedCount ?? 0)}
            meter={[[pct(data?.uncategorisedCount ?? 0, kpi.total), '#a3b0be']]}
            detail={t('dashboard.a.kpiUncategorisedDetail', { defaultValue: 'Geen NDS en geen VNG 2030' })}
          />
        </div>

        <div className="grid grid-cols-12 gap-3 lg:gap-4">
          {data?.phaseDistribution && (
            <Card
              className="col-span-12"
              bodyRef={refs.phase}
              source={srcSpaces}
              title={t('dashboard.phases', { defaultValue: 'Initiatieven per groeifase' })}
              subtitle={t('dashboard.a.phasesSub', { defaultValue: 'Groei-initiatieven, verdeeld over de groeifases' })}
              tools={
                <>
                  <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    {t('dashboard.a.colorBy', { defaultValue: 'Kleur op' })}
                    <select
                      className={cn(selectCls, 'max-w-[240px]')}
                      value={colorBy}
                      onChange={(e) => onColorBy(e.target.value as PhaseColorBy)}
                      data-testid="phase-color-by"
                    >
                      <option value="source">{t('funnel.colorBy.source', { defaultValue: 'Bron (Groei / GemeenteDelers)' })}</option>
                      <option value="handelen">{t('handelen.title', { defaultValue: 'Handelen' })}</option>
                      <option value="nds">NDS</option>
                      <option value="vng2030">VNG 2030</option>
                    </select>
                  </label>
                  {dl('phase')}
                </>
              }
              footer={
                <>
                  {legendFor()}
                  {!compact && (
                    <>
                      <span>{t('dashboard.a.bubbleSize', { defaultValue: 'Puntgrootte = aantal deelnemende gemeenten' })}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <svg width="16" height="10" aria-hidden>
                          <circle cx="4" cy="5" r="3.2" fill="#7c90a4" fillOpacity=".45" />
                          <circle cx="12" cy="5" r="3.2" fill="#7c90a4" />
                        </svg>
                        {t('dashboard.a.dotMeaning', { defaultValue: 'Stip = gemeente, grootte = inwoners, donker = trekker' })}
                      </span>
                    </>
                  )}
                  {handelenStatus && <span className="text-warning">{handelenStatus}</span>}
                </>
              }
            >
              {compact ? (
                <PhaseBars phases={data.phaseDistribution.phases} color={(name) => colorOf(rows.find((r) => r.name === name), colorBy, ndsOrder, vngOrder)} />
              ) : (
                <PhaseBubbles
                  phases={data.phaseDistribution.phases}
                  rows={rows}
                  cities={cities}
                  leads={leads}
                  colorBy={colorBy}
                  ndsOrder={ndsOrder}
                  vngOrder={vngOrder}
                  onOpenInitiative={openInitiative}
                  onOpenCity={openCity}
                />
              )}
            </Card>
          )}

          <Card className="col-span-12 lg:col-span-6" bodyRef={refs.nds} source={srcBoth} title={t('dashboard.a.ndsTitle', { defaultValue: 'Initiatieven volgens NDS' })} tools={dl('nds')} footer={<Legend items={sourceLegend} />}>
            <CategoryBars dimension={ndsDim} gdIncluded={gdIncluded} />
          </Card>
          <Card className="col-span-12 lg:col-span-6" bodyRef={refs.vng2030} source={srcBoth} title={t('dashboard.vng2030', { defaultValue: 'Aantal initiatieven volgens VNG-2030' })} tools={dl('vng2030')} footer={<Legend items={sourceLegend} />}>
            <CategoryBars dimension={vngDim} gdIncluded={gdIncluded} />
          </Card>

          <Card
            className="col-span-12 lg:col-span-5"
            bodyRef={refs.dist}
            title={t('dashboard.gemeenteDistribution', { defaultValue: 'Initiatieven per aantal gemeenten' })}
            subtitle={`${t('dashboard.a.distSub', { defaultValue: 'Gegroepeerd op aantal gemeenten' })} · ${gdIncluded ? t('dashboard.a.distBoth', { defaultValue: 'Groei + GemeenteDelers initiatieven' }) : t('dashboard.a.distGroei', { defaultValue: 'Groei initiatieven' })}`}
            tools={dl('dist')}
            footer={<Legend items={sourceLegend} />}
          >
            <DistributionColumns distribution={data?.gemeenteDistribution} compact={compact} />
          </Card>
          <Card
            className="col-span-12 lg:col-span-7"
            bodyRef={refs.matrix}
            title={t('dashboard.categoryMatrix', { defaultValue: 'NDS × VNG-2030' })}
            subtitle={t('dashboard.a.matrixSub', { defaultValue: 'Initiatieven volgens primaire NDS- en VNG-2030-categorie' })}
            tools={dl('matrix')}
            footer={
              <>
                <Legend items={sourceLegend} />
                <span>{t('dashboard.a.matrixSize', { defaultValue: 'Grootte = aantal initiatieven' })}</span>
              </>
            }
          >
            <PieMatrix matrix={data?.categoryMatrix} gdIncluded={gdIncluded} compact={compact} />
          </Card>

          <Card
            className="col-span-12"
            bodyRef={refs.city}
            title={t('dashboard.cityPopulation', { defaultValue: 'Inwoners versus deelname' })}
            subtitle={t('dashboard.a.citySub', { defaultValue: 'Elke gemeente naar inwonertal en aantal initiatieven' })}
            tools={dl('city')}
            footer={
              <>
                <Legend items={[...sourceLegend.map((l) => ({ ...l, shape: 'dot' as const })), { label: `Neemt niet deel (${data?.cityPopulation?.nonParticipating.length ?? 0})`, color: '#fff', shape: 'dot', outline: true }]} />
                <span>{t('dashboard.a.cityPie', { defaultValue: 'Cirkel = verdeling Groei / GemeenteDelers' })}</span>
              </>
            }
          >
            <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
              <div className="inline-flex gap-0.5 rounded-lg bg-[#e8eef5] p-[3px]" role="group" aria-label="Schaal">
                {[
                  ['Log', true],
                  ['Lineair', false],
                ].map(([l, v]) => (
                  <button
                    key={String(l)}
                    type="button"
                    aria-pressed={log === v}
                    onClick={() => setLog(v as boolean)}
                    className={cn('h-7 rounded-md px-3 text-[13px] font-medium', log === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                {t('dashboard.a.populationRange', { defaultValue: 'Inwonersbereik' })}
                <select className={selectCls} value={rangeKey} onChange={(e) => setRangeKey(e.target.value)}>
                  {RANGES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <PopulationScatter series={data?.cityPopulation} cities={cities} log={log} range={range} compact={compact} onOpenCity={openCity} />
          </Card>
        </div>
      </div>
    </TipProvider>
  );
}

function Kpi({
  label,
  value,
  small,
  meter,
  detail,
}: {
  label: string;
  value: string;
  small?: string;
  meter: [number, string][];
  detail: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[10px] border border-border bg-card px-[18px] pt-[15px] pb-3.5">
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <span className="whitespace-nowrap text-[26px] font-semibold leading-tight tracking-[-0.025em] text-foreground lg:text-[30px]">
        {value}
        {small && <small className="ml-1 text-sm font-medium tracking-normal text-muted-foreground">{small}</small>}
      </span>
      <span className="my-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-[3px] bg-[#e6ecf4]">
        {meter.map(([w, c], i) =>
          w > 0 ? <i key={i} className="block h-full" style={{ width: `${w}%`, background: c }} /> : null,
        )}
      </span>
      <span className="text-[12.5px] leading-snug text-muted-foreground">{detail}</span>
    </div>
  );
}

/** Phones get bars: the bubble columns need more width than a phone has. Segments follow "Kleur op". */
function PhaseBars({
  phases,
  color,
}: {
  phases: NonNullable<VngDashboardResponse['phaseDistribution']>['phases'];
  color: (name: string) => string;
}) {
  const max = Math.max(1, ...phases.map((p) => p.count));
  return (
    <div className="-mx-2 flex flex-col gap-px">
      {phases
        .filter((p) => p.key !== 'unknown' || p.count > 0)
        .map((p) => {
          const groups = new Map<string, number>();
          for (const n of p.items) groups.set(color(n), (groups.get(color(n)) ?? 0) + 1);
          return (
            <div key={p.key} className="grid min-h-10 grid-cols-[minmax(0,40%)_minmax(0,1fr)_32px] items-center gap-2.5 px-2">
              <span className="text-[13px] text-muted-foreground">{p.label ?? 'Geen fase'}</span>
              <span className="flex h-3.5 gap-0.5">
                {[...groups].sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                  <i key={c} className="block h-full last:rounded-r" style={{ width: `${(n / max) * 100}%`, background: c }} />
                ))}
              </span>
              <span className="text-right text-[13px] font-semibold tabular-nums">{p.count}</span>
            </div>
          );
        })}
    </div>
  );
}
