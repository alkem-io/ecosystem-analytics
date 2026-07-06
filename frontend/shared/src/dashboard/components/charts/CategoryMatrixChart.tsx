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
import type { CategoryMatrix } from '@server/types/api.js';

interface Props {
  matrix: CategoryMatrix | undefined;
  /** True when GD initiatives are folded into the counts (adds the GD split to tooltips). */
  gdIncluded: boolean;
  emptyLabel: string;
}

const SPACES_COLOR = 'var(--primary)';
const GD_COLOR = '#16a34a'; // GemeenteDelers green (matches the other dashboard charts)

/** A plotted bubble: category indices on each axis plus its source-split names/counts. */
interface Point {
  x: number;
  y: number;
  count: number;
  spacesCount: number;
  gdCount: number;
  ndsLabel: string;
  vng2030Label: string;
  spacesItems: string[];
  gdItems: string[];
}

/** Tooltip listing the initiatives at the hovered (NDS, VNG-2030) intersection. */
function CellTooltip({ active, payload }: TooltipProps<number, string>) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;

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
      <div className="font-semibold text-foreground">
        {p.ndsLabel} · {p.vng2030Label}
      </div>
      <div className="mt-0.5 text-muted-foreground">
        {t('dashboard.count', { defaultValue: 'Count' })}: {p.count}
      </div>
      <NameList
        names={p.spacesItems}
        color={SPACES_COLOR}
        title={t('dashboard.groei', { defaultValue: 'Groei' })}
      />
      <NameList
        names={p.gdItems}
        color={GD_COLOR}
        title={t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' })}
      />
    </div>
  );
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
 * Custom Scatter mark: a small pie at the (NDS, VNG-2030) intersection, split into the
 * Groei and GemeenteDelers shares of the initiatives in that cell. Radius scales with the
 * cell total (area ∝ count) so denser intersections read as larger pies.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieMark(props: any) {
  const { cx, cy, payload, maxCount } = props as {
    cx?: number;
    cy?: number;
    payload: Point;
    maxCount: number;
  };
  if (cx == null || cy == null) return null;
  const { spacesCount, gdCount, count } = payload;
  const r = 6 + 16 * Math.sqrt(count / Math.max(maxCount, 1));

  // Pure single-source cells render as a full circle (an arc from 0→360 degenerates).
  if (gdCount === 0) return <circle cx={cx} cy={cy} r={r} fill={SPACES_COLOR} fillOpacity={0.85} />;
  if (spacesCount === 0) return <circle cx={cx} cy={cy} r={r} fill={GD_COLOR} fillOpacity={0.85} />;

  const spacesEnd = (spacesCount / count) * 360;
  return (
    <g>
      <path d={slicePath(cx, cy, r, 0, spacesEnd)} fill={SPACES_COLOR} fillOpacity={0.85} />
      <path d={slicePath(cx, cy, r, spacesEnd, 360)} fill={GD_COLOR} fillOpacity={0.85} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={0.5} />
    </g>
  );
}

/** Greedy-wrap a label into up to `maxLines` lines of ~`width` chars (last line elided). */
function wrapLabel(text: string, width: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown[maxLines - 1] = shown[maxLines - 1].replace(/.{0,1}$/, '…');
  return shown;
}

/** Angled, wrapped X tick (VNG-2030 category labels are long). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function XTick(props: any) {
  const { x, y, payload, formatter } = props;
  const label: string = formatter ? formatter(payload?.value) : String(payload?.value ?? '');
  const lines = wrapLabel(label, 16, 3);
  return (
    <g transform={`translate(${x},${y})`}>
      <text transform="rotate(-40)" textAnchor="end" fontSize={11} fill="var(--text-secondary)">
        {lines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 8 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/** Right-aligned, wrapped Y tick (NDS category labels). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function YTick(props: any) {
  const { x, y, payload, formatter } = props;
  const label: string = formatter ? formatter(payload?.value) : String(payload?.value ?? '');
  const lines = wrapLabel(label, 20, 2);
  const dy0 = -((lines.length - 1) * 6);
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="end" fontSize={11} fill="var(--text-secondary)">
        {lines.map((line, i) => (
          <tspan key={i} x={-4} dy={i === 0 ? dy0 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/**
 * NDS × VNG-2030 pie matrix (the 4th dashboard chart). Each initiative is placed at one
 * cell by its PRIMARY category on each axis; each cell is drawn as a pie split into its
 * Groei and GemeenteDelers shares, sized by how many initiatives share the intersection.
 * Hovering lists them. The synthetic "Geen classificatie" slot leads each axis, so
 * initiatives uncategorised on one axis still appear on the grid's leading row/column.
 * Initiatives carrying more than one category on either axis are surfaced in the detail
 * list below the chart.
 */
export function CategoryMatrixChart({ matrix, gdIncluded, emptyLabel }: Props) {
  const { t } = useTranslation();

  const ndsLabel = (key: string) =>
    key === 'uncategorised'
      ? t('dashboard.uncategorised', { defaultValue: 'No classification' })
      : t(`categories.nds.${key}`, { defaultValue: key });
  const vngLabel = (key: string) =>
    key === 'uncategorised'
      ? t('dashboard.uncategorised', { defaultValue: 'No classification' })
      : t(`categories.vng2030.${key}`, { defaultValue: key });

  const rows = matrix?.ndsCategories ?? [];
  const cols = matrix?.vng2030Categories ?? [];

  const points: Point[] = useMemo(() => {
    if (!matrix) return [];
    return matrix.cells
      .filter((c) => c.count > 0)
      .map((c) => ({
        x: cols.indexOf(c.vng2030),
        y: rows.indexOf(c.nds),
        count: c.count,
        spacesCount: c.spacesItems.length,
        gdCount: c.gdItems.length,
        ndsLabel: ndsLabel(c.nds),
        vng2030Label: vngLabel(c.vng2030),
        spacesItems: c.spacesItems,
        gdItems: c.gdItems,
      }))
      .filter((p) => p.x >= 0 && p.y >= 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix]);

  const maxCount = points.reduce((m, p) => Math.max(m, p.count), 0);
  const multi = matrix?.multiCategoryItems ?? [];

  const ndsAxisTitle = t('dashboard.ndsAxis', { defaultValue: 'NDS' });
  const vngAxisTitle = t('dashboard.vng2030Axis', { defaultValue: 'VNG-2030' });

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t('dashboard.categoryMatrix', { defaultValue: 'NDS × VNG-2030' })}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t('dashboard.categoryMatrixSub', {
          defaultValue: 'Initiatives by primary NDS and VNG-2030 category',
        })}
      </p>

      {/* Legend explaining the two pie slices. */}
      <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SPACES_COLOR }} />
          {t('dashboard.groei', { defaultValue: 'Groei' })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GD_COLOR }} />
          {t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' })}
        </span>
      </div>

      {points.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        // Grid: rotated Y-axis title | (chart + X-axis title).
        <div className="mt-1 flex w-full items-stretch">
          <div className="flex items-center justify-center pr-1">
            <span
              className="text-xs font-medium text-muted-foreground"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              {ndsAxisTitle} ↑
            </span>
          </div>
          <div className="flex-1">
            <div className="h-[560px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 24, bottom: 132, left: 148 }}>
                  <CartesianGrid stroke="var(--border)" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[-0.5, Math.max(cols.length - 0.5, 0.5)]}
                    ticks={cols.map((_, i) => i)}
                    interval={0}
                    tickLine={false}
                    tick={<XTick formatter={(i: number) => vngLabel(cols[i])} />}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[-0.5, Math.max(rows.length - 0.5, 0.5)]}
                    ticks={rows.map((_, i) => i)}
                    interval={0}
                    tickLine={false}
                    tick={<YTick formatter={(i: number) => ndsLabel(rows[i])} />}
                  />
                  {/* Kept so recharts sizes the domain; actual radius is computed in PieMark. */}
                  <ZAxis type="number" dataKey="count" range={[60, 60]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CellTooltip />} />
                  <Scatter data={points} shape={<PieMark maxCount={maxCount} />} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center text-xs font-medium text-muted-foreground">
              {vngAxisTitle} →
            </div>
          </div>
        </div>
      )}

      {multi.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <h4 className="text-xs font-semibold text-foreground">
            {t('dashboard.multiCategoryTitle', { defaultValue: 'Initiatives with multiple categories' })}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('dashboard.multiCategoryNote', {
              defaultValue:
                'These are plotted above under their first category on each axis; their full categories are listed here.',
            })}
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {multi.map((m) => (
              <li key={`${m.source}:${m.label}`} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: m.source === 'gd' ? GD_COLOR : SPACES_COLOR }}
                  />
                  {m.label}
                </span>
                <span className="text-muted-foreground">
                  <span className="font-medium">{t('dashboard.nds')}:</span>{' '}
                  {m.nds.length ? m.nds.map(ndsLabel).join(', ') : ndsLabel('uncategorised')}
                  {'  ·  '}
                  <span className="font-medium">{t('dashboard.vng2030')}:</span>{' '}
                  {m.vng2030.length ? m.vng2030.map(vngLabel).join(', ') : vngLabel('uncategorised')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
