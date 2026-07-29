import { useMemo } from 'react';
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

/** Participating cities carry the brand hue; non-participating stay recessive ink. */
const PARTICIPATING_COLOR = 'var(--primary)';
const NON_PARTICIPATING_COLOR = 'var(--text-secondary)';

/** Candidate log-axis ticks — filtered to the range actually present in the data. */
const LOG_TICKS = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];

/** Compact axis labels: 1.000 → 1k, 100.000 → 100k, 1.000.000 → 1M. */
function compact(value: number): string {
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}k`;
  return String(value);
}

/**
 * Point marker. Participating cities are filled and ringed in the card surface so
 * overlapping marks stay separable; non-participating cities are hollow, so identity
 * never rests on colour alone. Both carry a transparent hit circle far larger than the
 * visible mark — a dense scatter must not demand pixel-perfect aim.
 */
function Mark({
  cx,
  cy,
  fill,
  hollow,
}: {
  cx?: number;
  cy?: number;
  fill?: string;
  hollow?: boolean;
}) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      {hollow ? (
        // Every non-participating municipality sits at y=0, so this series is really a
        // rug along the baseline — a few hundred marks deep in the 10k–100k band. Keep
        // it small and faint so the dense middle reads as texture and the informative
        // case (an isolated large city out on the right) still stands out.
        <circle cx={cx} cy={cy} r={2.5} fill="none" stroke={fill} strokeWidth={1} opacity={0.5} />
      ) : (
        <circle cx={cx} cy={cy} r={5} fill={fill} stroke="var(--card)" strokeWidth={1.5} />
      )}
    </g>
  );
}

/** Tooltip: city name, population, and the initiative count behind the point. */
function PointTooltip({ active, payload }: TooltipProps<number, string>) {
  const { t, i18n } = useTranslation();
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as CityPopulationPoint | undefined;
  if (!point) return null;
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
      </div>
    </div>
  );
}

/**
 * Population × participation scatter (feature 018, US3). One point per municipality:
 * the cities taking part in the current selection, plus the Dutch municipalities taking
 * part in none (plotted at zero, visually distinct) — so a large city with no
 * participation reads as an outreach gap rather than an absence (FR-021).
 *
 * The population axis is LOG-scaled: Dutch municipalities span ~1 000 to ~900 000
 * inhabitants, and on a linear axis everything below ~50 000 collapses into the left
 * edge (FR-024). Municipalities with an unknown population cannot be placed on that
 * axis at all; they are excluded and their count is stated, never silently dropped
 * (FR-023).
 */
export function CityPopulationChart({ series, emptyLabel }: Props) {
  const { t } = useTranslation();

  const participating = series?.participating ?? [];
  const nonParticipating = series?.nonParticipating ?? [];
  const hasAny = participating.length > 0 || nonParticipating.length > 0;

  // Initiative counts are whole numbers, and recharts' auto ticks on a clamped domain
  // come out irregular (0, 2, 5). Step by a whole number so every gridline lands on a
  // real count, capped at ~6 gridlines.
  const yTicks = useMemo(() => {
    const max = Math.max(0, ...participating.map((p) => p.initiativeCount));
    const step = Math.max(1, Math.ceil(max / 5));
    const out: number[] = [];
    for (let v = 0; v <= max; v += step) out.push(v);
    if (out[out.length - 1] !== max) out.push(max);
    return out;
  }, [participating]);

  // Log axes cannot auto-range, so derive the domain from the data and keep only the
  // ticks that fall inside it.
  const { domain, ticks } = useMemo(() => {
    const populations = [...participating, ...nonParticipating].map((p) => p.population);
    if (populations.length === 0) return { domain: [1_000, 1_000_000] as [number, number], ticks: LOG_TICKS };
    const min = Math.min(...populations);
    const max = Math.max(...populations);
    // Pad by a decade fraction so edge points aren't clipped by the axis line.
    const lo = Math.max(1, min * 0.8);
    const hi = max * 1.2;
    return {
      domain: [lo, hi] as [number, number],
      ticks: LOG_TICKS.filter((v) => v >= lo && v <= hi),
    };
  }, [participating, nonParticipating]);

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
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

      {/* Custom legend — recharts' default overlaps the plot area. */}
      <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: PARTICIPATING_COLOR }}
          />
          {t('dashboard.cityParticipating', { defaultValue: 'Participating' })} (
          {participating.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border"
            style={{ borderColor: NON_PARTICIPATING_COLOR }}
          />
          {t('dashboard.cityNonParticipating', { defaultValue: 'Not participating' })} (
          {nonParticipating.length})
        </span>
      </div>

      {!hasAny ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 20, bottom: 24, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                type="number"
                dataKey="population"
                scale="log"
                domain={domain}
                ticks={ticks}
                allowDataOverflow
                tickFormatter={compact}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                label={{
                  value: t('dashboard.cityPopulationX', { defaultValue: 'Population (log scale)' }),
                  position: 'insideBottom',
                  offset: -14,
                  style: { fontSize: 11, fill: 'var(--text-secondary)' },
                }}
              />
              <YAxis
                type="number"
                dataKey="initiativeCount"
                allowDecimals={false}
                // Auto-domain adds headroom well past the real maximum, leaving the plot
                // half empty; clamp it to the data so the spread fills the card.
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
                data={nonParticipating}
                name={t('dashboard.cityNonParticipating', { defaultValue: 'Not participating' })}
                fill={NON_PARTICIPATING_COLOR}
                shape={<Mark hollow />}
                isAnimationActive={false}
              />
              <Scatter
                data={participating}
                name={t('dashboard.cityParticipating', { defaultValue: 'Participating' })}
                fill={PARTICIPATING_COLOR}
                shape={<Mark />}
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
