import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as d3 from 'd3';
import type { PhaseDistribution } from '@server/types/api.js';
import type { InitiativeRow } from '../../utils/initiatives.js';
import type { CityRow } from '../../utils/cities.js';
import { proxyImageUrl } from '@ea/shared';
import { useTip, tint } from './primitives.js';

export type PhaseColorBy = 'source' | 'handelen' | 'nds' | 'vng2030';

/** Colour of one initiative under the chosen "Kleur op". */
export function colorOf(
  row: InitiativeRow | undefined,
  by: PhaseColorBy,
  ndsOrder: string[],
  vngOrder: string[],
): string {
  if (!row) return 'var(--cat-none)';
  if (by === 'source') return row.kind === 'gd' ? 'var(--series-gd)' : 'var(--series-groei)';
  if (by === 'handelen') {
    const s = row.handelen?.status;
    return s === 'active'
      ? 'var(--handelen-active)'
      : s === 'quiet'
        ? 'var(--handelen-quiet)'
        : s === 'dormant'
          ? 'var(--handelen-dormant)'
          : 'var(--cat-none)';
  }
  const list = by === 'nds' ? row.nds : row.vng2030;
  const order = by === 'nds' ? ndsOrder : vngOrder;
  const i = list.length ? order.indexOf(list[0]) : -1;
  return i >= 0 && i < 8 ? `var(--cat-${i + 1})` : i >= 8 ? 'var(--cat-other)' : 'var(--cat-none)';
}

const COL_W = 170;
const MIN_R = 11;
const MAX_R = 72;

interface Bubble {
  row: InitiativeRow | undefined;
  name: string;
  g: number;
  r: number;
  x: number;
  y: number;
}

/** Stable small hash — keeps every layout deterministic (no randomness, no clock). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function packColumn(items: { name: string; row: InitiativeRow | undefined }[], h: number, s: number): Bubble[] {
  const nodes: Bubble[] = items
    .map(({ name, row }) => {
      const g = row?.gemeentes.length ?? 0;
      const hh = hash(name);
      return {
        row,
        name,
        g,
        r: (MIN_R + (MAX_R - MIN_R) * Math.sqrt(Math.min(g, 70) / 70)) * s,
        x: COL_W / 2 + ((hh % 41) - 20),
        y: h / 2 + (((hh >> 8) % 61) - 30),
      };
    })
    .sort((a, b) => b.r - a.r);
  const pad = 3;
  const sim = d3
    .forceSimulation(nodes as d3.SimulationNodeDatum[] & Bubble[])
    .force('x', d3.forceX(COL_W / 2).strength((0.12 * h) / COL_W))
    .force('y', d3.forceY(h / 2).strength((0.12 * COL_W) / h))
    .force('c', d3.forceCollide<Bubble>((n) => n.r + 1.6).iterations(5))
    .stop();
  for (let t = 0; t < 200; t++) {
    sim.tick();
    for (const n of nodes) {
      n.x = Math.max(n.r + pad, Math.min(COL_W - n.r - pad, n.x));
      n.y = Math.max(n.r + pad, Math.min(h - n.r - pad, n.y));
    }
  }
  return nodes;
}

/** How much the bubbles of one column must shrink to fit their box. */
function fitScale(items: { row: InitiativeRow | undefined }[], h: number): number {
  const area = d3.sum(items, ({ row }) => {
    const g = row?.gemeentes.length ?? 0;
    return Math.PI * (MIN_R + (MAX_R - MIN_R) * Math.sqrt(Math.min(g, 70) / 70) + 2) ** 2;
  });
  return Math.min(1, Math.sqrt((COL_W * h * 0.6) / Math.max(1, area)));
}

const shortName = (n: string) => n.replace(/\s*\(.*\)/, '');

function Label({ name, r }: { name: string; r: number }) {
  const n = shortName(name).replace('Registratie Vakantie Verhuur', 'Vakantie Verhuur');
  const fs = Math.min(13, Math.max(9.5, r / 2.7));
  const maxChars = Math.floor((r * 1.75) / (fs * 0.56));
  const lines: string[] = [];
  for (const w of n.split(' ')) {
    if (lines.length && `${lines[lines.length - 1]} ${w}`.length <= maxChars) lines[lines.length - 1] += ` ${w}`;
    else lines.push(w);
  }
  if (lines.length > 3 || lines.some((l) => l.length > maxChars)) {
    if (r < 13) return null;
    const ini = n
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
    return (
      <text className="pointer-events-none fill-foreground font-semibold" textAnchor="middle" fontSize={Math.min(13, r * 0.62)} y={r * 0.22}>
        {ini}
      </text>
    );
  }
  return (
    <text
      className="pointer-events-none fill-foreground font-semibold"
      textAnchor="middle"
      fontSize={fs}
      y={-(lines.length - 1) * fs * 0.56 + fs * 0.35}
    >
      {lines.map((l, i) => (
        <tspan key={i} x={0} dy={i ? fs * 1.12 : 0}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

/** Pack one dot per participating gemeente inside a bubble, sized by inhabitants. */
function GemeenteDots({
  row,
  r,
  color,
  cities,
  onOpenCity,
}: {
  row: InitiativeRow;
  r: number;
  color: string;
  cities: Map<string, CityRow>;
  onOpenCity: (cityId: string) => void;
}) {
  const tip = useTip();
  const { t } = useTranslation();
  const dots = useMemo(() => {
    const cs = row.gemeentes.map((name) => {
      const city = cities.get(name);
      const pop = city?.population ?? 20000;
      return {
        name,
        city,
        o: hash(name) % 1000,
        r: Math.max(0.62, Math.min(1.9, Math.sqrt(pop / 42000))),
        x: 0,
        y: 0,
      };
    });
    cs.sort((a, b) => a.o - b.o);
    if (!cs.length) return [];
    d3.packSiblings(cs);
    const e = d3.packEnclose(cs);
    for (const q of cs) {
      const a = (q.o / 1000) * Math.PI * 2;
      q.x += Math.cos(a) * q.r * 0.18;
      q.y += Math.sin(a) * q.r * 0.18;
    }
    return cs.map((q) => ({ ...q, x: q.x - e.x, y: q.y - e.y, er: e.r }));
  }, [row.gemeentes, cities]);
  if (!dots.length || r < 9) return null;
  const n = dots.length;
  const R = r * (n === 1 ? 0.2 : n <= 3 ? 0.34 : n <= 8 ? 0.62 : 0.8);
  const k = R / dots[0].er;
  const cy = n <= 3 ? r * 0.5 : 0;
  const cap = Math.min(r * 0.16, 7.5);
  return (
    <g>
      {dots.map((d) => (
        <circle
          key={d.name}
          className="cursor-pointer transition-[fill-opacity] hover:[fill-opacity:1]"
          cx={d.x * k}
          cy={d.y * k + cy}
          r={Math.min(cap, d.r * k * 0.8)}
          fill={color}
          fillOpacity={0.3}
          onClick={(e) => {
            e.stopPropagation();
            if (d.city) onOpenCity(d.city.id);
          }}
          {...tip(() => ({
            title: d.name,
            image: proxyImageUrl(d.city?.node.avatarUrl),
            initial: d.name[0],
            lines: [d.city?.provinceName ?? ''].filter(Boolean),
            rows: d.city?.population
              ? [[t('dashboard.a.inhabitants', { defaultValue: 'Inwoners' }), d.city.population.toLocaleString('nl-NL')]]
              : [],
          }))}
        />
      ))}
    </g>
  );
}

export function PhaseBubbles({
  phases,
  rows,
  cities,
  colorBy,
  ndsOrder,
  vngOrder,
  height = 300,
  onOpenInitiative,
  onOpenCity,
}: {
  phases: PhaseDistribution['phases'];
  rows: InitiativeRow[];
  cities: Map<string, CityRow>;
  colorBy: PhaseColorBy;
  ndsOrder: string[];
  vngOrder: string[];
  height?: number;
  onOpenInitiative: (id: string) => void;
  onOpenCity: (id: string) => void;
}) {
  const { t } = useTranslation();
  const tip = useTip();
  const byName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  const cols = useMemo(() => {
    const shown = phases.filter((p) => p.key !== 'unknown' || p.count > 0);
    const items = shown.map((p) => p.items.map((name) => ({ name, row: byName.get(name) })));
    const s = Math.min(...items.map((it) => fitScale(it, height)));
    return shown.map((p, i) => ({ phase: p, bubbles: packColumn(items[i], height, s) }));
  }, [phases, byName, height]);

  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
      {cols.map(({ phase, bubbles }) => (
        <div key={phase.key} className="flex min-w-0 flex-col rounded-lg bg-muted px-3 pt-3 pb-2">
          <div className="flex items-baseline gap-2">
            <b className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">{phase.count}</b>
            <span className="truncate text-[13px] font-medium text-muted-foreground">
              {phase.label ?? t('categories.phase.unknown', { defaultValue: 'Geen fase' })}
            </span>
          </div>
          {bubbles.length ? (
            <svg viewBox={`0 0 ${COL_W} ${height}`} className="mt-1 w-full flex-1" style={{ minHeight: 180 }} role="img" aria-label={phase.label ?? ''}>
              {bubbles.map((b) => {
                const color = colorOf(b.row, colorBy, ndsOrder, vngOrder);
                const r = b.r - 1;
                return (
                  <g
                    key={b.name}
                    transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`}
                    className="cursor-pointer"
                    role="link"
                    tabIndex={0}
                    aria-label={`${b.name}, ${b.g} ${t('dashboard.a.gemeenten', { defaultValue: 'gemeenten' })}`}
                    onClick={() => b.row && onOpenInitiative(b.row.id)}
                    onKeyDown={(e) => e.key === 'Enter' && b.row && onOpenInitiative(b.row.id)}
                    {...tip(() => ({
                      title: b.name,
                      rows: [
                        [t('dashboard.a.phase', { defaultValue: 'Fase' }), phase.label ?? '—'],
                        [t('dashboard.nds', { defaultValue: 'NDS' }), b.row?.nds.join(', ') || '—'],
                        [t('dashboard.a.gemeenten', { defaultValue: 'Gemeenten' }), b.g],
                      ],
                    }))}
                  >
                    <circle r={r} fill={tint(color)} stroke={color} strokeWidth={1.6} />
                    {b.row && (
                      <GemeenteDots row={b.row} r={r} color={color} cities={cities} onOpenCity={onOpenCity} />
                    )}
                    <g style={{ paintOrder: 'stroke', stroke: tint(color, 0.8), strokeWidth: 4, strokeLinejoin: 'round' }}>
                      {r > 13 && <Label name={b.name} r={r} />}
                    </g>
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="grid min-h-[150px] flex-1 place-items-center text-center text-[12.5px] text-muted-foreground">
              {t('dashboard.a.noInitiatives', { defaultValue: 'Geen initiatieven' })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
