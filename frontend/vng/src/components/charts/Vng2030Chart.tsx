import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardDimension } from '@server/types/api.js';

interface Vng2030ChartProps {
  dimension: DashboardDimension | undefined;
  /** Active counting source from the dashboard response (FR-021). */
  source: 'spaces' | 'gd-initiatives';
}

/**
 * Bar chart of counts by VNG-2030 theme (US3, FR-021). Category labels are localised
 * by key via i18n (`categories.vng2030.<key>`) with a fallback to the raw key (FR-037).
 */
export function Vng2030Chart({ dimension, source }: Vng2030ChartProps) {
  const { t } = useTranslation();
  const categories = dimension?.categories ?? [];

  const data = categories.map((c) => ({
    key: c.key,
    label: t(`categories.vng2030.${c.key}`, { defaultValue: c.key }),
    count: c.count,
  }));

  const sourceLabel =
    source === 'gd-initiatives' ? t('dashboard.sourceInitiatives') : t('dashboard.sourceSpaces');

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{t('dashboard.vng2030')}</h3>
      <p className="text-xs text-muted-foreground">{sourceLabel}</p>
      {data.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          {t('dashboard.noData')}
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={70}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <Tooltip
                cursor={{ fill: 'var(--surface)' }}
                contentStyle={{
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--text-primary)',
                }}
              />
              <Bar dataKey="count" fill="var(--success)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
