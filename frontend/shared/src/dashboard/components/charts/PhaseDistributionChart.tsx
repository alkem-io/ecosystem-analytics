import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { HANDELEN_COLOR, HANDELEN_INK, HANDELEN_ORDER, handelenLabel, type HandelenSplit, type HandelenStatus } from '../../utils/handelen.js';
import { useIsMobile } from '@ea/shared';
import type { PhaseDistribution, VocabularyDrift } from '@server/types/api.js';
import { VocabularyDriftNotice } from './VocabularyDriftNotice.js';

interface Props {
  distribution: PhaseDistribution | undefined;
  emptyLabel: string;
  /** Phase-vocabulary mismatch, shown as a notice under the chart. */
  drift?: VocabularyDrift;
  /** Each bar split by handelen, in phase order. Absent = plain bars (the default). */
  split?: HandelenSplit[] | null;
  /** Shown in place of the legend while the split was asked for but is not there. */
  splitStatus?: string | null;
}

type ChartRow = PhaseDistribution['phases'][number] & { name: string; split?: HandelenSplit };

/** A segment's count, when the segment is tall enough to hold it. */
function segmentLabel(status: HandelenStatus) {
  return function SegmentLabel(props: { x?: unknown; y?: unknown; width?: unknown; height?: unknown; value?: unknown }) {
    const [x, y, w, h] = [props.x, props.y, props.width, props.height].map(Number);
    const value = Number(props.value);
    if (!value || !(h >= 14)) return null;
    return (
      <text
        x={x + w / 2}
        y={y + h / 2}
        dy="0.35em"
        textAnchor="middle"
        fontSize={11}
        fill={HANDELEN_INK[status]}
        data-segment={status}
        className="pointer-events-none"
      >
        {value}
      </text>
    );
  };
}

const PHASE_COLOR = 'var(--primary)';

/**
 * A phase's name. Real phases carry their Alkemio-authored label and are rendered
 * verbatim (FR-024); only the synthetic trailing bucket (label === null) is localised.
 */
function usePhaseLabel() {
  const { t } = useTranslation();
  return (phase: { label: string | null }) =>
    phase.label ?? t('categories.phase.unknown', { defaultValue: 'No phase' });
}

/** Tooltip showing the phase, its count, and the names of the initiatives in it. */
function PhaseTooltip({ active, payload }: TooltipProps<number, string>) {
  const { t } = useTranslation();
  const phaseLabel = usePhaseLabel();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartRow;

  return (
    <div className="max-w-xs rounded-lg border border-border bg-card p-3 text-xs shadow-md">
      <div className="font-semibold text-foreground">{phaseLabel(d)}</div>
      <div className="mt-0.5 text-muted-foreground">
        {t('dashboard.count', { defaultValue: 'Count' })}: {d.count}
      </div>
      {d.split ? (
        <div className="mt-1.5 space-y-1.5">
          {HANDELEN_ORDER.filter((s) => d.split![s].length > 0).map((s) => (
            <div key={s}>
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: HANDELEN_COLOR[s] }} />
                {handelenLabel(t, s)}: {d.split![s].length}
              </div>
              <div className="text-muted-foreground">{d.split![s].join(', ')}</div>
            </div>
          ))}
        </div>
      ) : d.items.length > 0 && (
        <ul className="mt-1.5 max-h-40 list-disc space-y-0.5 overflow-auto pl-4 text-foreground">
          {d.items.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Groei initiatives per growth phase ("groeifase"), in pipeline order
 * (pre-intake → beheer). Single series, so no legend is needed — the title names it —
 * unless the viewer turns on the handelen split (off by default), which stacks each bar.
 * Phases with no initiatives still render an empty slot, which is the point of the
 * chart: it shows where the pipeline is thin. GemeenteDelers initiatives are never
 * counted here — they are a separate, completed programme with no phase.
 */
export function PhaseDistributionChart({ distribution, emptyLabel, drift, split, splitStatus }: Props) {
  const { t } = useTranslation();
  const phaseLabel = usePhaseLabel();
  // Five horizontal phase names need ~440px to sit side by side; under that they
  // overlap into an unreadable smear, so they tilt instead (the same treatment
  // CategoryBarChart already uses for its longer category names).
  const mobile = useIsMobile();
  // Resolve each phase's axis name up front: the tick formatter only sees the scalar
  // dataKey value, and the synthetic bucket's name is localised rather than authored.
  const data: ChartRow[] = (distribution?.phases ?? []).map((p, i) => ({
    ...p,
    name: phaseLabel(p),
    split: split?.[i],
  }));
  const totals = HANDELEN_ORDER.map((status) => ({
    status,
    count: split?.reduce((n, s) => n + s[status].length, 0) ?? 0,
  })).filter((e) => e.count > 0);

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t('dashboard.phases', { defaultValue: 'Initiatives per growth phase' })}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t('dashboard.phasesSub', { defaultValue: 'Groei initiatives, by growth phase' })}
      </p>
      {split ? (
        <div className="mt-1 text-xs" data-testid="phase-handelen-legend">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {totals.map(({ status, count }) => (
              <li key={status} className="inline-flex items-center gap-1.5 text-foreground">
                <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: HANDELEN_COLOR[status] }} />
                {handelenLabel(t, status)}
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted-foreground">
            {t('handelen.hint', { defaultValue: 'Since the last recorded event in the Space or its subspaces; new members count.' })}
          </p>
        </div>
      ) : splitStatus ? (
        <p className="mt-1 text-xs text-muted-foreground" role="status" data-testid="phase-handelen-status">
          {splitStatus}
        </p>
      ) : null}
      {data.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 20, right: 16, bottom: mobile ? 40 : 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                interval={0}
                angle={mobile ? -35 : 0}
                textAnchor={mobile ? 'end' : 'middle'}
                height={mobile ? 70 : 30}
                tickMargin={mobile ? 6 : 3}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <Tooltip cursor={{ fill: 'var(--surface)' }} content={<PhaseTooltip />} />
              {/* Few bars and small counts, so every value is directly labelled — no
                  need to hover to read the pipeline. */}
              {split &&
                totals.map(({ status }) => (
                  <Bar
                    key={status}
                    dataKey={(r: ChartRow) => r.split?.[status].length ?? 0}
                    name={status}
                    stackId="handelen"
                    fill={HANDELEN_COLOR[status]}
                    stroke="var(--card)"
                    strokeWidth={1}
                    maxBarSize={72}
                    isAnimationActive={false}
                    className={`phase-handelen-${status}`}
                  >
                    {/* Its own dataKey: a stacked bar's default label value is the running total. */}
                    <LabelList
                      dataKey={(r) => (r as ChartRow).split?.[status].length ?? 0}
                      content={segmentLabel(status)}
                    />
                  </Bar>
                ))}
              {/* Split: an empty bar on top of the stack that carries the total. */}
              <Bar
                key={split ? 'total' : 'plain'}
                dataKey={split ? () => 0 : 'count'}
                stackId={split ? 'handelen' : undefined}
                fill={PHASE_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={72}
              >
                <LabelList
                  dataKey="count"
                  position="top"
                  style={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* Below the chart: the pipeline order and membership come from Alkemio's authored
          vocabulary, so a drift here means the x-axis itself may not be the pipeline
          this build was written against. */}
      <VocabularyDriftNotice drift={drift} />
    </section>
  );
}
