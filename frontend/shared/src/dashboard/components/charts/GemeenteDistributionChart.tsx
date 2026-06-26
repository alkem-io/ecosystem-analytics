import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type { GemeenteDistribution } from '@server/types/api.js';

interface Props {
  distribution: GemeenteDistribution | undefined;
  emptyLabel: string;
}

const GROEI_COLOR = 'var(--primary)';
const GD_COLOR = '#16a34a'; // GemeenteDelers green (matches the dashboard GD charts)

/** Tooltip showing per-source counts, the bucket total, and the initiative NAMES. */
function StackTooltip({ active, payload, label }: TooltipProps<number, string>) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  // Both bars share the same datum (the bucket), so read names/counts off either.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const datum = (payload[0]?.payload ?? {}) as any;
  const groei = Number(datum.groei ?? 0);
  const gd = Number(datum.gd ?? 0);
  const groeiItems: string[] = datum.groeiItems ?? [];
  const gdItems: string[] = datum.gdItems ?? [];
  // The leading "none" bucket holds initiatives with no associated gemeente — i.e.
  // 0 gemeentes — so it is labelled "0" (not "no classification") on this count chart.
  const gemeenteCount = label === 'none' ? '0' : label;
  const header = `${gemeenteCount} ${t('dashboard.gemeenteAxis', { defaultValue: 'gemeenten' })} · ${groei + gd}`;

  const NameList = ({ names, color, title }: { names: string[]; color: string; title: string }) =>
    names.length === 0 ? null : (
      <div className="mt-1.5">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
          {title} ({names.length})
        </div>
        <ul className="mt-0.5 max-h-40 list-disc space-y-0.5 overflow-auto pl-4 text-foreground">
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="max-w-xs rounded-lg border border-border bg-card p-3 text-xs shadow-md">
      <div className="font-semibold text-foreground">{header}</div>
      <NameList names={groeiItems} color={GROEI_COLOR} title={t('dashboard.groei', { defaultValue: 'Groei' })} />
      <NameList
        names={gdItems}
        color={GD_COLOR}
        title={t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' })}
      />
    </div>
  );
}

/**
 * Stacked bar chart: number of initiatives by how many gemeentes they are
 * associated with, bucketed (1-3, 3-6, …, 50+). Each bar stacks Groei (selected
 * spaces) and — when the GD checkbox is on — GemeenteDelers initiatives.
 */
export function GemeenteDistributionChart({ distribution, emptyLabel }: Props) {
  const { t } = useTranslation();
  const data = distribution?.buckets ?? [];
  const hasAny = data.some((b) => b.groei > 0 || b.gd > 0);

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t('dashboard.gemeenteDistribution', { defaultValue: 'Initiatives by number of gemeentes' })}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t('dashboard.gemeenteAxisFull', { defaultValue: 'Grouped by associated gemeentes' })}
        {' · '}
        {distribution?.gdIncluded
          ? t('dashboard.gemeenteDistGd', { defaultValue: 'Groei + GemeenteDelers initiatives' })
          : t('dashboard.gemeenteDistGroei', { defaultValue: 'Groei initiatives' })}
      </p>
      {/* Custom legend (recharts' default overlapped). */}
      <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GROEI_COLOR }} />
          {t('dashboard.groei', { defaultValue: 'Groei' })}
        </span>
        {distribution?.gdIncluded && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GD_COLOR }} />
            {t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' })}
          </span>
        )}
      </div>
      {!hasAny ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="key"
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickFormatter={(k: string) => (k === 'none' ? '0' : k)}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <Tooltip cursor={{ fill: 'var(--surface)' }} content={<StackTooltip />} />
              <Bar
                dataKey="groei"
                stackId="a"
                name={t('dashboard.groei', { defaultValue: 'Groei' })}
                fill={GROEI_COLOR}
              />
              {distribution?.gdIncluded && (
                <Bar
                  dataKey="gd"
                  stackId="a"
                  name={t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' })}
                  fill={GD_COLOR}
                  radius={[4, 4, 0, 0]}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
