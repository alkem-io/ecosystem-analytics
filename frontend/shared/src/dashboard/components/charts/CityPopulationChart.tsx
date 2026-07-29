import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  type TooltipProps,
} from 'recharts';
import type { CityPopulationPoint, CityPopulationSeries } from '@server/types/api.js';

interface Props {
  series: CityPopulationSeries | undefined;
  emptyLabel: string;
}

/** Groei = brand hue, GemeenteDelers = green — the same split language as the other charts. */
const GROEI_COLOR = 'var(--primary)';
const GD_COLOR = '#16a34a';
const NON_PARTICIPATING_COLOR = 'var(--text-secondary)';

/** Candidate log-axis ticks — filtered to the range actually present in the data. */
const LOG_TICKS = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];

/** Compact axis labels: 1.000 → 1k, 100.000 → 100k, 1.000.000 → 1M. */
function compact(value: number): string {
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}k`;
  return String(value);
}

/** SVG path for a pie slice (angles in degrees, 0° at the top, clockwise). */
function slicePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const rad = (deg: number) => (Math.PI / 180) * (deg - 90);
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy + r * Math.sin(rad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

/**
 * Participating city marker: a small pie split into the city's Groei and GemeenteDelers
 * initiatives — the same per-dot pie the NDS × VNG-2030 matrix uses. The pie shows the
 * MIX; the Y position already encodes the total count, so the radius stays constant to
 * avoid double-encoding. A transparent hit circle keeps the dense scatter easy to hover.
 */
function PieMark({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: CityPopulationPoint;
}) {
  if (cx == null || cy == null || !payload) return null;
  const { groeiCount, gdCount } = payload;
  const total = groeiCount + gdCount;
  const r = 5.5;
  return (
    <g>
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      {gdCount === 0 || total === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill={GROEI_COLOR} stroke="var(--card)" strokeWidth={1.25} />
      ) : groeiCount === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill={GD_COLOR} stroke="var(--card)" strokeWidth={1.25} />
      ) : (
        <>
          <path d={slicePath(cx, cy, r, 0, (groeiCount / total) * 360)} fill={GROEI_COLOR} />
          <path d={slicePath(cx, cy, r, (groeiCount / total) * 360, 360)} fill={GD_COLOR} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--card)" strokeWidth={1.25} />
        </>
      )}
    </g>
  );
}

/** Non-participating municipality: a faint hollow rug mark along the baseline. */
function RugMark({ cx, cy }: { cx?: number; cy?: number }) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      <circle
        cx={cx}
        cy={cy}
        r={2.5}
        fill="none"
        stroke={NON_PARTICIPATING_COLOR}
        strokeWidth={1}
        opacity={0.5}
      />
    </g>
  );
}

/** Tooltip: city name, population, and the initiative count (split Groei/GD) behind it. */
function PointTooltip({ active, payload }: TooltipProps<number, string>) {
  const { t, i18n } = useTranslation();
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as CityPopulationPoint | undefined;
  if (!point) return null;
  const showSplit = point.gdCount > 0 && point.groeiCount > 0;
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-xs shadow-md">
      <div className="font-semibold text-foreground">{point.name}</div>
      {point.provinceName && <div className="text-muted-foreground">{point.provinceName}</div>}
      <div className="mt-1.5 text-foreground">
        {/* Format in the APP's language, not the browser's — a bare toLocaleString()
            renders "569,468" here while the Cities table shows "569.468". */}
        {new Intl.NumberFormat(i18n.language).format(point.population)}{' '}
        {t('dashboard.cityInhabitants', { defaultValue: 'inwoners' })}
      </div>
      <div className="text-foreground">
        {point.initiativeCount}{' '}
        {t('dashboard.cityInitiatives', { defaultValue: 'initiatieven' })}
        {showSplit && (
          <span className="text-muted-foreground">
            {' '}
            ({point.groeiCount} {t('dashboard.groei', { defaultValue: 'Groei' })} · {point.gdCount}{' '}
            {t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' })})
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Population × participation scatter (feature 018, US3). One point per municipality:
 * the cities taking part in the current selection (drawn as a Groei/GD pie), plus the
 * Dutch municipalities taking part in none (a faint baseline rug) — so a large city with
 * no participation reads as an outreach gap rather than an absence (FR-021).
 *
 * The population axis defaults to LOG scale: Dutch municipalities span ~1 000 to ~900 000
 * inhabitants, and on a linear axis everything below ~50 000 collapses into the left edge
 * (FR-024). A toggle switches to linear. A min/max population range narrows the plot to a
 * band of interest; the cities that fall outside it are LISTED below rather than silently
 * dropped, the same disclosure the chart makes for unknown-population municipalities.
 */
export function CityPopulationChart({ series, emptyLabel }: Props) {
  const { t, i18n } = useTranslation();
  const [logScale, setLogScale] = useState(true);
  const [range, setRange] = useState<{ min: number | null; max: number | null }>({
    min: null,
    max: null,
  });

  const participating = series?.participating ?? [];
  const nonParticipating = series?.nonParticipating ?? [];
  const hasAny = participating.length > 0 || nonParticipating.length > 0;
  const gdIncluded = series?.gdIncluded ?? false;

  const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  // Data bounds drive the range-input placeholders.
  const { dataMin, dataMax } = useMemo(() => {
    const pops = [...participating, ...nonParticipating].map((p) => p.population);
    return pops.length
      ? { dataMin: Math.min(...pops), dataMax: Math.max(...pops) }
      : { dataMin: 0, dataMax: 0 };
  }, [participating, nonParticipating]);

  const rangeActive = range.min != null || range.max != null;
  const inRange = (p: CityPopulationPoint) =>
    (range.min == null || p.population >= range.min) && (range.max == null || p.population <= range.max);

  // What the chart draws (range-filtered). Excluded cities are surfaced below.
  const shownParticipating = rangeActive ? participating.filter(inRange) : participating;
  const shownNonParticipating = rangeActive ? nonParticipating.filter(inRange) : nonParticipating;
  const excluded = useMemo(
    () =>
      rangeActive
        ? [...participating, ...nonParticipating]
            .filter((p) => !inRange(p))
            .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [participating, nonParticipating, range.min, range.max],
  );
  const hasShown = shownParticipating.length > 0 || shownNonParticipating.length > 0;

  // Initiative counts are whole numbers, and recharts' auto ticks on a clamped domain
  // come out irregular (0, 2, 5). Step by a whole number so every gridline lands on a
  // real count, capped at ~6 gridlines.
  const yTicks = useMemo(() => {
    const max = Math.max(0, ...shownParticipating.map((p) => p.initiativeCount));
    const step = Math.max(1, Math.ceil(max / 5));
    const out: number[] = [];
    for (let v = 0; v <= max; v += step) out.push(v);
    if (out[out.length - 1] !== max) out.push(max);
    return out;
  }, [shownParticipating]);

  // Log axes cannot auto-range; derive the domain from the shown data and keep only the
  // ticks inside it. Linear uses a 0-based domain with recharts' own ticks.
  const { domain, ticks } = useMemo(() => {
    const populations = [...shownParticipating, ...shownNonParticipating].map((p) => p.population);
    if (populations.length === 0) {
      return logScale
        ? { domain: [1_000, 1_000_000] as [number, number], ticks: LOG_TICKS }
        : { domain: [0, 1_000_000] as [number, number], ticks: undefined };
    }
    const min = Math.min(...populations);
    const max = Math.max(...populations);
    if (!logScale) {
      // Pad the top so the largest city isn't glued to the axis line.
      return { domain: [0, Math.ceil(max * 1.05)] as [number, number], ticks: undefined };
    }
    // Pad by a decade fraction so edge points aren't clipped by the axis line.
    const lo = Math.max(1, min * 0.8);
    const hi = max * 1.2;
    return {
      domain: [lo, hi] as [number, number],
      ticks: LOG_TICKS.filter((v) => v >= lo && v <= hi),
    };
  }, [shownParticipating, shownNonParticipating, logScale]);

  const ScaleButton = ({ value, label }: { value: boolean; label: string }) => (
    <button
      type="button"
      onClick={() => setLogScale(value)}
      aria-pressed={logScale === value}
      className={[
        'rounded px-2 py-0.5 text-xs font-medium transition-colors',
        logScale === value
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted',
      ].join(' ')}
    >
      {label}
    </button>
  );

  const parseNum = (v: string): number | null => {
    const n = Number(v.replace(/[^\d]/g, ''));
    return v.trim() === '' || Number.isNaN(n) ? null : n;
  };
  const rangeInputCls =
    'w-24 rounded border border-border bg-card px-2 py-0.5 text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t('dashboard.cityPopulation', { defaultValue: 'Population versus participation' })}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('dashboard.cityPopulationSub', {
              defaultValue: 'Every city by population and number of initiatives',
            })}
            {series && series.excludedUnknownPopulation > 0 && (
              <>
                {' · '}
                {t('dashboard.cityExcluded', {
                  count: series.excludedUnknownPopulation,
                  defaultValue: '{{count}} cities with unknown population were excluded',
                })}
              </>
            )}
          </p>
        </div>
        {/* Population-axis scale toggle (FR-024). */}
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-border p-0.5">
          <ScaleButton value label={t('dashboard.scaleLog', { defaultValue: 'Log' })} />
          <ScaleButton value={false} label={t('dashboard.scaleLinear', { defaultValue: 'Linear' })} />
        </div>
      </div>

      {/* Population range filter. Empty bounds mean "no limit" — the plot shows everything
          until the reader narrows it, and excluded cities are listed below. */}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">
          {t('dashboard.populationRange', { defaultValue: 'Population range' })}
        </span>
        <input
          type="number"
          inputMode="numeric"
          className={rangeInputCls}
          placeholder={dataMin ? String(dataMin) : t('dashboard.rangeMin', { defaultValue: 'Min' })}
          aria-label={t('dashboard.rangeMin', { defaultValue: 'Min' })}
          value={range.min ?? ''}
          onChange={(e) => setRange((r) => ({ ...r, min: parseNum(e.target.value) }))}
        />
        <span aria-hidden>–</span>
        <input
          type="number"
          inputMode="numeric"
          className={rangeInputCls}
          placeholder={dataMax ? String(dataMax) : t('dashboard.rangeMax', { defaultValue: 'Max' })}
          aria-label={t('dashboard.rangeMax', { defaultValue: 'Max' })}
          value={range.max ?? ''}
          onChange={(e) => setRange((r) => ({ ...r, max: parseNum(e.target.value) }))}
        />
        {rangeActive && (
          <>
            <button
              type="button"
              onClick={() => setRange({ min: null, max: null })}
              className="rounded px-2 py-0.5 font-medium text-foreground hover:bg-muted"
            >
              {t('dashboard.rangeAll', { defaultValue: 'Show all' })}
            </button>
            <span>· {t('dashboard.notShownCount', { count: excluded.length, defaultValue: '{{count}} not shown' })}</span>
          </>
        )}
      </div>

      {/* Custom legend — recharts' default overlaps the plot area. */}
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GROEI_COLOR }} />
          {t('dashboard.groei', { defaultValue: 'Groei' })}
        </span>
        {gdIncluded && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GD_COLOR }} />
            {t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' })}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border"
            style={{ borderColor: NON_PARTICIPATING_COLOR }}
          />
          {t('dashboard.cityNonParticipating', { defaultValue: 'Not participating' })} (
          {shownNonParticipating.length})
        </span>
      </div>

      {!hasAny ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : !hasShown ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          {t('dashboard.cityNoneInRange', { defaultValue: 'No cities in this population range' })}
        </div>
      ) : (
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 20, bottom: 24, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                type="number"
                dataKey="population"
                scale={logScale ? 'log' : 'linear'}
                domain={domain}
                ticks={ticks}
                allowDataOverflow
                tickFormatter={compact}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                label={{
                  value: logScale
                    ? t('dashboard.cityPopulationX', { defaultValue: 'Population (log scale)' })
                    : t('dashboard.cityPopulationXLinear', { defaultValue: 'Population (linear)' }),
                  position: 'insideBottom',
                  offset: -14,
                  style: { fontSize: 11, fill: 'var(--text-secondary)' },
                }}
              />
              <YAxis
                type="number"
                dataKey="initiativeCount"
                allowDecimals={false}
                domain={[0, 'dataMax']}
                ticks={yTicks}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                label={{
                  value: t('dashboard.cityPopulationY', { defaultValue: 'Number of initiatives' }),
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 11, fill: 'var(--text-secondary)', textAnchor: 'middle' },
                }}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<PointTooltip />} />
              {/* Non-participating first, so participating cities draw on top. */}
              <Scatter
                data={shownNonParticipating}
                name={t('dashboard.cityNonParticipating', { defaultValue: 'Not participating' })}
                shape={<RugMark />}
                isAnimationActive={false}
              />
              <Scatter
                data={shownParticipating}
                name={t('dashboard.cityParticipating', { defaultValue: 'Participating' })}
                shape={<PieMark />}
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cities filtered out by the range — never silently dropped. */}
      {rangeActive && excluded.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <h4 className="text-xs font-semibold text-foreground">
            {t('dashboard.notShownCount', { count: excluded.length, defaultValue: '{{count}} not shown' })}
          </h4>
          <div className="mt-1 flex max-h-40 flex-wrap gap-x-3 gap-y-0.5 overflow-auto text-xs">
            {excluded.map((p) => (
              <span key={p.nameId} className="flex items-center gap-1 text-foreground">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={
                    p.initiativeCount > 0
                      ? { background: GROEI_COLOR }
                      : { border: `1px solid ${NON_PARTICIPATING_COLOR}` }
                  }
                />
                {p.name}
                <span className="text-muted-foreground">({numberFormat.format(p.population)})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
