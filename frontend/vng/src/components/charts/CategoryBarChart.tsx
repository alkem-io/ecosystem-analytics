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
import type { DashboardDimension } from '@server/types/api.js';

interface Datum {
  key: string;
  label: string;
  count: number;
  items: string[];
}

interface CategoryBarChartProps {
  title: string;
  sourceLabel: string;
  dimension: DashboardDimension | undefined;
  /** i18n namespace for category labels, e.g. "categories.nds". */
  labelNamespace: string;
  emptyLabel: string;
}

/** Tooltip listing the category count plus the names of the initiatives in it. */
function NamesTooltip({ active, payload }: TooltipProps<number, string>) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Datum;
  return (
    <div className="max-w-xs rounded-lg border border-border bg-card p-3 text-xs shadow-md">
      <div className="font-semibold text-foreground">{d.label}</div>
      <div className="mt-0.5 text-muted-foreground">
        {t('dashboard.count', { defaultValue: 'Count' })}: {d.count}
      </div>
      {d.items.length > 0 && (
        <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-auto pl-4 text-foreground">
          {d.items.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Shared category bar chart (NDS / VNG-2030). Long category labels are wrapped to
 * two lines and given generous bottom room so they never clip; hovering a bar
 * shows the names of the initiatives in that category (US3 tooltip feedback).
 */
export function CategoryBarChart({
  title,
  sourceLabel,
  dimension,
  labelNamespace,
  emptyLabel,
}: CategoryBarChartProps) {
  const { t } = useTranslation();
  const data: Datum[] = (dimension?.categories ?? []).map((c) => ({
    key: c.key,
    label: t(`${labelNamespace}.${c.key}`, { defaultValue: c.key }),
    count: c.count,
    items: c.items ?? [],
  }));

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{sourceLabel}</p>
      {data.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 96, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                interval={0}
                angle={-35}
                textAnchor="end"
                height={110}
                tickMargin={8}
                tick={<WrappedTick />}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <Tooltip cursor={{ fill: 'var(--surface)' }} content={<NamesTooltip />} />
              <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

/** Angled X tick that wraps long category labels onto up to two lines. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WrappedTick(props: any) {
  const { x, y, payload } = props;
  const text: string = payload?.value ?? '';
  const words = text.split(' ');
  // Greedy wrap into <= 2 lines of ~18 chars.
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 18 && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 2);
  if (lines.length > 2) shown[1] = shown[1].replace(/.{0,1}$/, '…');

  return (
    <g transform={`translate(${x},${y})`}>
      <text transform="rotate(-35)" textAnchor="end" fontSize={11} fill="var(--text-secondary)">
        {shown.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
