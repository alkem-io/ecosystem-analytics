import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as d3 from 'd3';
import type {
  CategoryMatrix,
  CityPopulationSeries,
  DashboardDimension,
  GemeenteDistribution,
} from '@server/types/api.js';
import type { CityRow } from '../../utils/cities.js';
import { cn, proxyImageUrl } from '@ea/shared';
import { useTip, type TipNames } from './primitives.js';

/** A short axis/legend label for a long Alkemio category name (the full name stays in tooltips). */
/** Column heads for the matrix: a little longer than shortCat, wrapping over two lines. */
const VNG_HEAD: Record<string, string> = {
  'Bedrijfsvoering & gemeentediensten': 'Bedrijfs\u00advoering',
  'Wonen en Ruimte': 'Wonen en Ruimte',
  Bestaanszekerheid: 'Bestaans\u00adzekerheid',
  'Klimaat en energie': 'Klimaat en energie',
  'Kansengelijkheid/jeugd': 'Kansen\u00adgelijkheid',
  'Vergrijzing/gezond leven': 'Gezond leven',
};

export const shortCat = (l: string) =>
  ({
    'Artificiële Intelligentie': 'AI',
    'Centrale (digitale) dienstverlening': 'Dienstverlening',
    'Digitale weerbaarheid en autonomie': 'Weerbaarheid',
    'Digitaal vakmanschap en moderne werkomgeving': 'Vakmanschap',
    'Bedrijfsvoering & gemeentediensten': 'Bedrijfs\u00advoering',
    Bestaanszekerheid: 'Bestaans\u00adzekerheid',
    'Kansengelijkheid/jeugd': 'Kansen\u00adgelijkheid',
    'Vergrijzing/gezond leven': 'Gezond leven',
  })[l] ?? l.split(/ & | en |\//)[0];

const GROEI = 'var(--series-groei)';
const GD = 'var(--series-gd)';

function useNames() {
  const { t } = useTranslation();
  return (spaces: string[], gd: string[], gdIncluded: boolean): TipNames[] => [
    { heading: t('dashboard.groei', { defaultValue: 'Groei' }), color: GROEI, names: [...spaces].sort((a, b) => a.localeCompare(b, 'nl')) },
    ...(gdIncluded
      ? [{ heading: t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' }), color: GD, names: [...gd].sort((a, b) => a.localeCompare(b, 'nl')) }]
      : []),
  ];
}

/* ── NDS / VNG-2030: horizontal bars, Groei + GemeenteDelers stacked ─────────── */
export function CategoryBars({
  dimension,
  gdIncluded,
  onPick,
}: {
  dimension: DashboardDimension | undefined;
  gdIncluded: boolean;
  onPick?: (key: string) => void;
}) {
  const { t } = useTranslation();
  const tip = useTip();
  const names = useNames();
  if (!dimension) return null;
  const Row = onPick ? 'button' : 'div';
  const cats = dimension.categories.filter((c) => c.key !== 'uncategorised');
  const un = dimension.categories.find((c) => c.key === 'uncategorised');
  const max = Math.max(1, ...dimension.categories.map((c) => c.spacesCount + c.gdCount));
  const row = (c: DashboardDimension['categories'][number], isUn = false) => {
    const label = c.label ?? t('dashboard.uncategorised', { defaultValue: 'Geen classificatie' });
    const total = c.spacesCount + c.gdCount;
    return (
      <Row
        key={c.key}
        {...(onPick ? { type: 'button' as const, onClick: () => onPick(c.key) } : { role: 'listitem' })}
        aria-label={`${label}: ${total}`}
        {...tip(() => ({ title: label, names: names(c.spacesItems, c.gdItems, gdIncluded) }))}
        className={cn(
          'grid w-full grid-cols-[minmax(0,42%)_minmax(0,1fr)_40px] items-center gap-3 rounded-md px-2 py-[5px] text-left hover:bg-muted',
          isUn && 'mt-1.5 rounded-none border-t border-dashed border-border pt-2.5',
        )}
      >
        <span className="line-clamp-2 text-[13px] leading-tight text-muted-foreground">{label}</span>
        <span className="flex h-3.5 gap-0.5">
          {c.spacesCount > 0 && (
            <i className="block h-full min-w-[2px]" style={{ width: `${(c.spacesCount / max) * 100}%`, background: isUn ? '#a3b0be' : GROEI }} />
          )}
          {c.gdCount > 0 && (
            <i
              className="block h-full min-w-[2px] rounded-r"
              style={{ width: `${(c.gdCount / max) * 100}%`, background: isUn ? 'var(--cat-none)' : GD }}
            />
          )}
        </span>
        <span className="text-right text-[13px] font-semibold tabular-nums text-foreground">{total}</span>
      </Row>
    );
  };
  return (
    <div className="-mx-2 flex flex-col gap-px" role={onPick ? undefined : 'list'}>
      {cats.map((c) => row(c))}
      {un && un.spacesCount + un.gdCount > 0 && row(un, true)}
    </div>
  );
}

/* ── Initiatieven per aantal gemeenten: stacked columns ────────────────────────── */
export function DistributionColumns({ distribution, compact }: { distribution: GemeenteDistribution | undefined; compact: boolean }) {
  const tip = useTip();
  const names = useNames();
  if (!distribution) return null;
  const w = compact ? 340 : 520;
  const h = compact ? 230 : 300;
  const m = { t: 22, b: 28 };
  const d = distribution.buckets;
  const max = Math.max(1, ...d.map((b) => b.groei + b.gd));
  const bw = w / d.length;
  const ih = h - m.t - m.b;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Initiatieven per aantal gemeenten">
      <line x1={0} x2={w} y1={h - m.b} y2={h - m.b} stroke="var(--border)" />
      {d.map((b, i) => {
        const total = b.groei + b.gd;
        const hk = (b.groei / max) * ih;
        const hg = (b.gd / max) * ih;
        const x = i * bw + bw * 0.22;
        const cw = bw * 0.56;
        const top = h - m.b - hk - hg;
        const label = b.key === 'none' ? '0' : b.key;
        return (
          <g key={b.key} {...tip(() => ({ title: `${label} gemeenten`, names: names(b.groeiItems, b.gdItems, distribution.gdIncluded) }))}>
            <rect x={i * bw} y={0} width={bw} height={h - m.b} fill="transparent" />
            {hk > 0 && <rect x={x} y={h - m.b - hk} width={cw} height={hk} fill={GROEI} rx={hg ? 0 : 3} />}
            {hg > 0 && <rect x={x} y={top} width={cw} height={Math.max(0, hg - 2)} fill={GD} rx={3} />}
            <text x={x + cw / 2} y={top - 6} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
              {total || ''}
            </text>
            <text x={x + cw / 2} y={h - 8} textAnchor="middle" className="fill-muted-foreground text-[11.5px]">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── NDS × VNG-2030: a table of small Groei/GD pies ────────────────────────────── */
export function piePath(cx: number, cy: number, r: number, frac: number): string {
  const a = frac * Math.PI * 2;
  const x = cx + Math.sin(a) * r;
  const y = cy - Math.cos(a) * r;
  return `M${cx},${cy}V${cy - r}A${r},${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)},${y.toFixed(2)}Z`;
}

export function Pie({ cx, cy, r, groei, total }: { cx: number; cy: number; r: number; groei: number; total: number }) {
  if (!total) return null;
  const f = groei / total;
  return (
    <>
      <circle cx={cx} cy={cy} r={r + 1.2} fill="#fff" />
      <circle cx={cx} cy={cy} r={r} fill={f >= 1 ? GROEI : GD} />
      {f > 0 && f < 1 && <path d={piePath(cx, cy, r, f)} fill={GROEI} />}
    </>
  );
}

export function PieMatrix({
  matrix,
  gdIncluded,
  compact,
  onPick,
}: {
  matrix: CategoryMatrix | undefined;
  gdIncluded: boolean;
  compact: boolean;
  onPick?: (nds: string, vng: string) => void;
}) {
  const { t } = useTranslation();
  const tip = useTip();
  const names = useNames();
  const geen = t('dashboard.uncategorised', { defaultValue: 'Geen classificatie' });
  const shorten = (s: string | null) => (s ? shortCat(s) : geen);
  const { rows, cols, cell, max } = useMemo(() => {
    if (!matrix) return { rows: [], cols: [], cell: () => undefined, max: 1 };
    // Uncategorised trails each axis here, so the classified intersections lead.
    const order = <T extends { key: string }>(a: T[]) => [...a.filter((x) => x.key !== 'uncategorised'), ...a.filter((x) => x.key === 'uncategorised')];
    const map = new Map(matrix.cells.map((c) => [`${c.nds}|${c.vng2030}`, c]));
    const classified = matrix.cells.filter((c) => c.nds !== 'uncategorised' && c.vng2030 !== 'uncategorised');
    return {
      rows: order(matrix.ndsCategories),
      cols: order(matrix.vng2030Categories),
      cell: (n: string, v: string) => map.get(`${n}|${v}`),
      max: Math.max(1, ...classified.map((c) => c.count)),
    };
  }, [matrix]);
  if (!matrix) return null;
  const R0 = compact ? 10 : 14.5;
  const rad = (n: number) => Math.min(R0, 2.6 + (R0 - 2.6) * Math.sqrt(n / max));
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-separate" style={{ borderSpacing: compact ? 2 : 3 }}>
        <thead>
          <tr>
            <th className="w-[20%]" />
            {cols.map((c) => (
              <th key={c.key} className="px-0.5 pb-1.5 align-bottom text-[12px] font-medium leading-tight text-muted-foreground">
                {c.key === 'uncategorised' ? 'Geen' : (VNG_HEAD[c.label ?? ''] ?? shorten(c.label))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="pr-1.5 text-left text-[12.5px] font-medium leading-tight text-muted-foreground">
                {r.key === 'uncategorised' ? geen : shorten(r.label)}
              </th>
              {cols.map((c) => {
                const cc = cell(r.key, c.key);
                const n = cc?.count ?? 0;
                const un = r.key === 'uncategorised' || c.key === 'uncategorised';
                const radius = rad(n);
                const d = Math.ceil(radius * 2 + 3);
                return (
                  <td key={c.key} className="p-0">
                    <button
                      type="button"
                      onClick={() => n && onPick?.(r.key, c.key)}
                      aria-label={`${n} initiatieven`}
                      {...tip(() => ({
                        title: `${r.label ?? geen} × ${c.label ?? geen}`,
                        names: names(cc?.spacesItems ?? [], cc?.gdItems ?? [], gdIncluded),
                      }))}
                      className={cn(
                        'flex w-full items-center justify-center gap-1.5 rounded-[5px] text-[12.5px] font-semibold tabular-nums hover:shadow-[0_0_0_2px_var(--primary)]',
                        compact ? 'h-[46px] flex-col gap-px text-[11.5px]' : 'h-[38px]',
                        un ? 'bg-[#fafbfc]' : 'bg-muted',
                        n ? 'text-foreground' : 'text-[#c3ccd6]',
                      )}
                    >
                      {n ? (
                        <>
                          <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} aria-hidden className={un ? 'opacity-75' : undefined}>
                            <Pie cx={d / 2} cy={d / 2} r={radius} groei={cc!.spacesItems.length} total={n} />
                          </svg>
                          <span>{n}</span>
                        </>
                      ) : (
                        '·'
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Inwoners versus deelname: log/linear scatter with a Groei/GD pie per gemeente ── */
export function PopulationScatter({
  series,
  cities,
  log,
  range,
  compact,
  onOpenCity,
}: {
  series: CityPopulationSeries | undefined;
  cities: Map<string, CityRow>;
  log: boolean;
  range: [number, number];
  compact: boolean;
  onOpenCity: (id: string) => void;
}) {
  const { t } = useTranslation();
  const tip = useTip();
  if (!series) return null;
  const pts = [...series.participating, ...series.nonParticipating].filter(
    (p) => p.population >= range[0] && p.population < range[1],
  );
  const w = compact ? 350 : 1120;
  const h = compact ? 290 : 400;
  const m = { t: 14, r: 16, b: 40, l: 30 };
  const lo = Math.max(900, range[0] * 0.95 || 900);
  const hi = Math.min(1e6, range[1]);
  const x = (log ? d3.scaleLog().domain([lo, hi]) : d3.scaleLinear().domain([range[0], hi])).range([m.l, w - m.r]).clamp(true);
  const mx = Math.max(8, ...pts.map((p) => p.initiativeCount));
  const y = d3.scaleSqrt().domain([0, mx * 1.06]).range([h - m.b, m.t]);
  const yt = [0, 1, 2, 5, 10, 20, 35].filter((v) => v <= mx * 1.06);
  const xt = (log ? [1e3, 3e3, 1e4, 3e4, 1e5, 3e5, 1e6] : x.ticks(compact ? 3 : 5)).filter((v) => v >= x.domain()[0] && v <= x.domain()[1]);
  const fmtK = (v: number) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));
  // A few direct labels on the largest participants, placed without collisions.
  const top = pts
    .filter((p) => p.initiativeCount > 0)
    .sort((a, b) => b.initiativeCount - a.initiativeCount)
    .slice(0, compact ? 3 : 6);
  // Labels keep clear of each other AND of the labelled dots themselves.
  const placed: number[][] = top.map((p) => {
    const px = x(p.population);
    const py = y(p.initiativeCount);
    return [px - 7, py - 7, px + 7, py + 7];
  });
  const labels = top
    .map((p) => {
      const px = x(p.population);
      const py = y(p.initiativeCount);
      const tw = p.name.length * 6.6;
      for (const [dx, dy, an] of [[9, 4, 'start'], [-9, 4, 'end'], [0, -10, 'middle'], [0, 18, 'middle']] as const) {
        const x0 = an === 'start' ? px + dx : an === 'end' ? px + dx - tw : px - tw / 2;
        const b = [x0, py + dy - 11, x0 + tw, py + dy + 3];
        if (b[0] < m.l || b[2] > w - 2 || placed.some((q) => b[0] < q[2] + 3 && b[2] > q[0] - 3 && b[1] < q[3] && b[3] > q[1])) continue;
        placed.push(b);
        return (
          <text key={p.nameId} x={px + dx} y={py + dy} textAnchor={an} className="pointer-events-none fill-foreground text-[11.5px] font-semibold" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>
            {p.name}
          </text>
        );
      }
      return null;
    });
  const cityByName = (n: string) => cities.get(n);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={t('dashboard.cityPopulation', { defaultValue: 'Inwoners versus deelname' })}>
      {yt.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11.5px]">
            {v}
          </text>
        </g>
      ))}
      {xt.map((v) => (
        <text key={v} x={x(v)} y={h - m.b + 18} textAnchor={x(v) > w - 50 ? 'end' : 'middle'} className="fill-muted-foreground text-[11.5px]">
          {fmtK(v)}
        </text>
      ))}
      <text x={w - m.r} y={h - 4} textAnchor="end" className="fill-muted-foreground text-[11.5px]">
        {t('dashboard.a.inhabitants', { defaultValue: 'Inwoners' })} ({log ? 'logaritmisch' : 'lineair'})
      </text>
      {[...pts]
        .sort((a, b) => a.initiativeCount - b.initiativeCount)
        .map((p) => {
          const px = x(p.population);
          const py = y(p.initiativeCount);
          const city = cityByName(p.name);
          const tipProps = tip(() => ({
            title: p.name,
            image: proxyImageUrl(city?.node.avatarUrl),
            initial: p.name[0],
            lines: [p.provinceName ?? ''].filter(Boolean),
            rows: [
              [t('dashboard.groei', { defaultValue: 'Groei' }), p.groeiCount],
              [t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' }), p.gdCount],
              [t('dashboard.a.inhabitants', { defaultValue: 'Inwoners' }), p.population.toLocaleString('nl-NL')],
            ],
          }));
          return p.initiativeCount ? (
            <g key={p.nameId} className="cursor-pointer" onClick={() => city && onOpenCity(city.id)} {...tipProps}>
              <circle cx={px} cy={py} r={9} fill="transparent" />
              <Pie cx={px} cy={py} r={compact ? 4.6 : 5.6} groei={p.groeiCount} total={p.initiativeCount} />
            </g>
          ) : (
            <circle key={p.nameId} cx={px} cy={py} r={3.4} fill="#fff" stroke="#a9b5c2" strokeWidth={1.2} {...tipProps} />
          );
        })}
      {labels}
    </svg>
  );
}
