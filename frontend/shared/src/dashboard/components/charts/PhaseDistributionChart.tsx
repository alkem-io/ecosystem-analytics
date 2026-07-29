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
import type { PhaseDistribution } from '@server/types/api.js';

interface Props {
  distribution: PhaseDistribution | undefined;
  emptyLabel: string;
}

const PHASE_COLOR = 'var(--primary)';

/** Localised phase name; falls back to the raw tag key for an unmapped phase. */
function usePhaseLabel() {
  const { t } = useTranslation();
  return (key: string) => t(`categories.phase.${key}`, { defaultValue: key });
}

/** Tooltip showing the phase, its count, and the names of the initiatives in it. */
function PhaseTooltip({ active, payload }: TooltipProps<number, string>) {
  const { t } = useTranslation();
  const phaseLabel = usePhaseLabel();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as PhaseDistribution['phases'][number];

  return (
    <div className="max-w-xs rounded-lg border border-border bg-card p-3 text-xs shadow-md">
      <div className="font-semibold text-foreground">{phaseLabel(d.key)}</div>
      <div className="mt-0.5 text-muted-foreground">
        {t('dashboard.count', { defaultValue: 'Count' })}: {d.count}
      </div>
      {d.items.length > 0 && (
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
 * (pre-intake → beheer). Single series, so no legend is needed — the title names it.
 * Phases with no initiatives still render an empty slot, which is the point of the
 * chart: it shows where the pipeline is thin. GemeenteDelers initiatives are never
 * counted here — they are a separate, completed programme with no phase.
 */
export function PhaseDistributionChart({ distribution, emptyLabel }: Props) {
  const { t } = useTranslation();
  const phaseLabel = usePhaseLabel();
  const data = distribution?.phases ?? [];

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t('dashboard.phases', { defaultValue: 'Initiatives per growth phase' })}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t('dashboard.phasesSub', { defaultValue: 'Groei initiatives, by growth phase' })}
      </p>
      {data.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="key"
                interval={0}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickFormatter={phaseLabel}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <Tooltip cursor={{ fill: 'var(--surface)' }} content={<PhaseTooltip />} />
              {/* Few bars and small counts, so every value is directly labelled — no
                  need to hover to read the pipeline. */}
              <Bar dataKey="count" fill={PHASE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={72}>
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
    </section>
  );
}
