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
import type { DashboardDimension, VocabularyDrift } from '@server/types/api.js';
import { VocabularyDriftNotice } from './VocabularyDriftNotice.js';

interface Datum {
  key: string;
  label: string;
  count: number;
  items: string[];
  spacesCount: number;
  gdCount: number;
  spacesItems: string[];
  gdItems: string[];
}

interface CategoryBarChartProps {
  title: string;
  sourceLabel: string;
  dimension: DashboardDimension | undefined;
  emptyLabel: string;
  /** Render the GD-initiatives segment as a second stacked bar + legend. */
  gdIncluded: boolean;
  /** Vocabulary mismatch for this dimension, rendered as a notice under the chart. */
  drift?: VocabularyDrift;
}

const SPACES_COLOR = 'var(--primary)';
const GD_COLOR = '#16a34a'; // GemeenteDelers green (matches the gemeente-distribution chart)

/** Tooltip listing the category total plus the names of the initiatives, split by source. */
function NamesTooltip({ active, payload }: TooltipProps<number, string>) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Datum;

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
      <div className="font-semibold text-foreground">{d.label}</div>
      <div className="mt-0.5 text-muted-foreground">
        {t('dashboard.count', { defaultValue: 'Count' })}: {d.count}
      </div>
      <NameList
        names={d.spacesItems}
        color={SPACES_COLOR}
        title={t('dashboard.groei', { defaultValue: 'Groei' })}
      />
      <NameList
        names={d.gdItems}
        color={GD_COLOR}
        title={t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' })}
      />
    </div>
  );
}

/**
 * Shared category bar chart (NDS / VNG-2030). Long category labels are wrapped to
 * two lines and given generous bottom room so they never clip; hovering a bar shows
 * the names of the initiatives in that category (US3 tooltip feedback). When GD
 * initiatives are included they stack on top of the selected-spaces segment; the
 * trailing "Overig" (no classification) bar appears whenever it is non-empty.
 */
export function CategoryBarChart({
  title,
  sourceLabel,
  dimension,
  emptyLabel,
  gdIncluded,
  drift,
}: CategoryBarChartProps) {
  const { t } = useTranslation();
  const categories = dimension?.categories ?? [];

  // The synthetic no-classification bucket is identified by `label === null` — the server
  // leaves it unlabelled precisely so the client can localise it. It is NOT charted: a bar
  // for "no classification" competes with the real categories for the y-axis and, now that
  // a value literally named "Geen classificatie" exists in Alkemio, produced two
  // indistinguishable bars. The entities in it are listed under the chart instead, which
  // is more useful anyway — you can see WHICH ones still need classifying.
  const unclassified = categories.find((c) => c.label === null);
  const data: Datum[] = categories
    .filter((c) => c.label !== null)
    .map((c) => ({
      key: c.key,
      // Category labels are authored in Alkemio and rendered verbatim (FR-024).
      label: c.label as string,
      count: c.count,
      items: c.items ?? [],
      spacesCount: c.spacesCount,
      gdCount: c.gdCount,
      spacesItems: c.spacesItems ?? [],
      gdItems: c.gdItems ?? [],
    }));

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{sourceLabel}</p>
      {gdIncluded && (
        <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SPACES_COLOR }} />
            {t('dashboard.groei', { defaultValue: 'Groei' })}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GD_COLOR }} />
            {t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' })}
          </span>
        </div>
      )}
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
              <Bar
                dataKey="spacesCount"
                stackId="a"
                fill={SPACES_COLOR}
                radius={gdIncluded ? undefined : [4, 4, 0, 0]}
              />
              {gdIncluded && (
                <Bar dataKey="gdCount" stackId="a" fill={GD_COLOR} radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* Covers all three ways an entity can be unclassified — it selected nothing, it
          carries no classification entry at all, or it explicitly selected Alkemio's
          "Geen classificatie" value — because the server folds them into this one bucket.
          From a reader's point of view they are the same gap: nobody has classified these
          yet, and the useful thing is WHICH ones. */}
      {unclassified && unclassified.count > 0 && <UnclassifiedList items={unclassified.items} />}
      {/* Below the chart, deliberately: it annotates the bars above it rather than
          replacing them — every value shown is still counted. */}
      <VocabularyDriftNotice drift={drift} />
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

/** Above this many names the list is collapsed — 182 GD initiatives is a wall of text. */
const INLINE_LIMIT = 12;

/**
 * The entities with no classification, named.
 *
 * Short lists read inline; long ones collapse behind a disclosure so the count stays
 * visible without the names pushing the next chart off the screen. Native `<details>`
 * rather than component state: it is keyboard-accessible and searchable-in-page for free.
 */
function UnclassifiedList({ items }: { items: string[] }) {
  const { t } = useTranslation();
  const heading = `${t('dashboard.uncategorised', { defaultValue: 'No classification' })} (${items.length})`;

  if (items.length <= INLINE_LIMIT) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{heading}:</span> {items.join(', ')}
      </p>
    );
  }

  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">{heading}</summary>
      <p className="mt-1 max-h-48 overflow-auto">{items.join(', ')}</p>
    </details>
  );
}
