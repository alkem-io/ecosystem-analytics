import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as d3 from 'd3';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@ea/shared';
import { useTip, type TipContent } from './primitives.js';

/* ──────────────────────────────────────────────────────────────────────────────
   Flat gemeente map (layout A). Every Dutch gemeente as a filled shape — no
   background tiles — so a map reads as "where, how much" at a glance: shading,
   highlighted participants, logos on top. One component for the Initiatief map, the
   Gemeente location, and the Gebruiksverkenner.

   ⚠ This is deliberately NOT the MapLibre basemap (feature 021, "one map
   implementation"). The agreed design shades gemeenten on a plain ground; there is
   no imagery here and nothing outside the Netherlands is drawn, so constitution
   §VII has nothing to mask. To be confirmed with the maintainers before merging.
   ────────────────────────────────────────────────────────────────────────────── */

interface Shape {
  code: string;
  name: string;
  province: string;
  d: string;
  cx: number;
  cy: number;
  bounds: [[number, number], [number, number]];
}
interface Geo {
  w: number;
  h: number;
  shapes: Shape[];
  byCode: Map<string, Shape>;
  provinceOutline: string;
}

const W = 600;
let geoPromise: Promise<Geo> | null = null;

/** Loaded once per page; every map shares it. */
function loadGeo(): Promise<Geo> {
  geoPromise ??= Promise.all([
    fetch('/maps/gemeenten.json').then((r) => r.json()),
    fetch('/maps/netherlands.geojson').then((r) => r.json()),
  ]).then(([gem, nl]: [GeoJSON.FeatureCollection, GeoJSON.FeatureCollection]) => {
    const projection = d3.geoMercator().fitWidth(W, gem);
    const path = d3.geoPath(projection);
    const [[, y0], [, y1]] = path.bounds(gem);
    const shapes = gem.features.map((f) => {
      const p = f.properties as { code: string; name: string; province: string };
      const [cx, cy] = path.centroid(f);
      return { code: p.code, name: p.name, province: p.province, d: path(f) ?? '', cx, cy, bounds: path.bounds(f) };
    });
    return {
      w: W,
      h: Math.ceil(y1 - y0 + 2),
      shapes,
      byCode: new Map(shapes.map((s) => [s.code, s])),
      provinceOutline: path(nl) ?? '',
    };
  });
  return geoPromise;
}

export function useGemeenteGeo(): Geo | null {
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => {
    let live = true;
    void loadGeo().then((g) => live && setGeo(g));
    return () => {
      live = false;
    };
  }, []);
  return geo;
}

export interface MapMarker {
  code: string;
  image?: string | null;
  initial: string;
  /** Darker ring (e.g. the trekker). */
  emphasis?: boolean;
  tip: TipContent;
  onClick?: () => void;
}

export interface MapLabel {
  code: string;
  text: string;
  /** Always shown (e.g. the big cities); others appear as you zoom in. */
  always?: boolean;
  population?: number;
}

export function GemeenteMap({
  fill,
  tip,
  onClick,
  province = null,
  highlight = null,
  markers = [],
  labels = [],
  zoomable = true,
  className,
  ariaLabel,
  overlay,
}: {
  fill: (code: string) => string;
  tip?: (code: string, name: string) => TipContent | null;
  onClick?: (code: string) => void;
  /** Province slug: frames that province and fades the rest. */
  province?: string | null;
  highlight?: string | null;
  markers?: MapMarker[];
  labels?: MapLabel[];
  zoomable?: boolean;
  className?: string;
  ariaLabel: string;
  overlay?: ReactNode;
}) {
  const { t } = useTranslation();
  const geo = useGemeenteGeo();
  const tipOf = useTip();
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [k, setK] = useState(1);

  // The framed area: the whole country, or one province with a margin.
  const view = useMemo(() => {
    if (!geo) return [0, 0, W, 700];
    if (!province) return [-12, -12, geo.w + 24, geo.h + 24];
    const ps = geo.shapes.filter((s) => s.province === province);
    if (!ps.length) return [-12, -12, geo.w + 24, geo.h + 24];
    const x0 = d3.min(ps, (s) => s.bounds[0][0])!;
    const y0 = d3.min(ps, (s) => s.bounds[0][1])!;
    const x1 = d3.max(ps, (s) => s.bounds[1][0])!;
    const y1 = d3.max(ps, (s) => s.bounds[1][1])!;
    const m = 16;
    return [x0 - m, y0 - m, x1 - x0 + m * 2, y1 - y0 + m * 2];
  }, [geo, province]);
  const unit = Math.max(view[2] / W, view[3] / 700); // svg units per "national" unit

  // Zoom & pan: drag, the buttons, or ⌘/Ctrl + scroll (a plain scroll keeps scrolling the page).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !geo || !zoomable) return;
    const z = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 12])
      .translateExtent([
        [view[0] - 40, view[1] - 40],
        [view[0] + view[2] + 40, view[1] + view[3] + 40],
      ])
      .filter((e: Event) =>
        e.type === 'wheel'
          ? (e as WheelEvent).ctrlKey || (e as WheelEvent).metaKey
          : 'touches' in e
            ? (e as TouchEvent).touches.length > 1
            : !(e as MouseEvent).button,
      )
      .on('zoom', (e) => {
        gRef.current?.setAttribute('transform', e.transform.toString());
        setK(e.transform.k);
      });
    zoomRef.current = z;
    const sel = d3.select(svg);
    sel.call(z).on('dblclick.zoom', null);
    sel.call(z.transform, d3.zoomIdentity);
    return () => {
      sel.on('.zoom', null);
    };
  }, [geo, zoomable, view]);

  const zoomBy = (f: number) => {
    if (svgRef.current && zoomRef.current) d3.select(svgRef.current).call(zoomRef.current.scaleBy, f);
  };

  // Which labels fit at this zoom without colliding.
  const shownLabels = useMemo(() => {
    if (!geo) return [];
    const fs = (11.5 * unit) / Math.pow(k, 0.85);
    const placed: number[][] = [];
    const out: { x: number; y: number; text: string; fs: number }[] = [];
    // Framed on one province: its eight largest gemeenten are labelled from the start.
    const top = new Set(
      province
        ? labels
            .filter((l) => geo.byCode.get(l.code)?.province === province)
            .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
            .slice(0, 8)
            .map((l) => l.code)
        : [],
    );
    const ordered = [...labels].sort(
      (a, b) => Number(!!b.always) - Number(!!a.always) || (b.population ?? 0) - (a.population ?? 0),
    );
    for (const l of ordered) {
      const s = geo.byCode.get(l.code);
      if (!s) continue;
      if (!l.always && !top.has(l.code) && (l.population ?? 0) < 260000 / Math.pow(k, 1.5)) continue;
      if (province && s.province !== province) continue;
      const w = l.text.length * fs * 0.56;
      const b = [s.cx - w / 2, s.cy - fs * 0.7, s.cx + w / 2, s.cy + fs * 0.5];
      if (placed.some((q) => b[0] < q[2] + fs * 0.3 && b[2] > q[0] - fs * 0.3 && b[1] < q[3] && b[3] > q[1])) continue;
      placed.push(b);
      out.push({ x: s.cx, y: s.cy + fs * 0.35, text: l.text, fs });
    }
    return out;
  }, [geo, labels, k, unit, province]);

  const markerR = (10 * unit) / Math.pow(k, 0.85);

  return (
    <div className={cn('relative min-h-0', className)}>
      {!geo ? (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          {t('states.loading', { defaultValue: 'Laden…' })}
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={view.join(' ')}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full touch-pan-y"
          role="img"
          aria-label={ariaLabel}
        >
          <defs>
            <clipPath id="gm-logo" clipPathUnits="objectBoundingBox">
              <circle cx=".5" cy=".5" r=".5" />
            </clipPath>
          </defs>
          <g ref={gRef}>
            {geo.shapes.map((s) => {
              const out = province != null && s.province !== province;
              const tc = tip?.(s.code, s.name);
              return (
                <path
                  key={s.code}
                  d={s.d}
                  fill={out ? '#f3f6f9' : fill(s.code)}
                  stroke="#fff"
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                  className={cn(
                    out ? 'opacity-[0.28]' : 'hover:stroke-[var(--primary)] hover:[stroke-width:2]',
                    onClick && !out && 'cursor-pointer',
                  )}
                  onClick={() => !out && onClick?.(s.code)}
                  {...(tc && !out ? tipOf(tc) : {})}
                />
              );
            })}
            <path d={geo.provinceOutline} fill="none" stroke="#fff" strokeWidth={1.8} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {highlight && geo.byCode.get(highlight) && (
              <path
                d={geo.byCode.get(highlight)!.d}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
                strokeLinejoin="round"
              />
            )}
            {markers
              .filter((m) => geo.byCode.has(m.code))
              .sort((a, b) => Number(!!a.emphasis) - Number(!!b.emphasis))
              .map((m) => {
                const s = geo.byCode.get(m.code)!;
                const r = markerR;
                return (
                  <g
                    key={m.code}
                    transform={`translate(${s.cx} ${s.cy})`}
                    className={cn('[&>circle:first-child]:transition-colors', m.onClick && 'cursor-pointer hover:[&>circle:first-child]:fill-[#009bdc]')}
                    onClick={(e) => {
                      e.stopPropagation();
                      m.onClick?.();
                    }}
                    {...tipOf(m.tip)}
                  >
                    <circle r={r + 2 * (r / 10)} fill={m.emphasis ? '#1b3560' : '#fff'} />
                    {m.image ? (
                      <image href={m.image} x={-r} y={-r} width={r * 2} height={r * 2} clipPath="url(#gm-logo)" preserveAspectRatio="xMidYMid slice" />
                    ) : (
                      <>
                        <circle r={r} fill="#eef2f6" />
                        <text y={r * 0.36} textAnchor="middle" fontSize={r} fontWeight={600} fill="#4a6072">
                          {m.initial}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            {shownLabels.map((l) => (
              <text
                key={l.text}
                x={l.x}
                y={l.y}
                textAnchor="middle"
                fontSize={l.fs}
                fontWeight={600}
                className="pointer-events-none fill-foreground"
                style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,.9)', strokeWidth: l.fs / 4, strokeLinejoin: 'round' }}
              >
                {l.text}
              </text>
            ))}
          </g>
        </svg>
      )}
      {zoomable && geo && (
        <div className="absolute right-0 bottom-0 flex flex-col gap-1.5">
          <button type="button" onClick={() => zoomBy(1.6)} aria-label={t('dashboard.a.zoomIn', { defaultValue: 'Inzoomen' })} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label={t('dashboard.a.zoomOut', { defaultValue: 'Uitzoomen' })} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground">
            <Minus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      {overlay}
    </div>
  );
}

/* Shading for "initiatives per gemeente": one calm blue ramp, binned. */
export const RAMP = ['#dae5f4', '#b5cae7', '#88a9d7', '#5c84c2', '#3b64a8', '#274a85'];
export const ZERO = '#ebeff4';
const BINS = [1, 2, 3, 5, 10, 20];
export const BIN_LABELS = ['1', '2', '3–4', '5–9', '10–19', '20+'];
export function binColor(n: number | undefined): string {
  if (!n) return ZERO;
  let i = 0;
  BINS.forEach((b, j) => {
    if (n >= b) i = j;
  });
  return RAMP[i];
}

export function BinLegend({ title }: { title?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {title && <span>{title}</span>}
      <span className="flex gap-[3px] text-[11.5px] text-muted-foreground" role="img" aria-label={`Schaal: geen, ${BIN_LABELS.join(', ')}`}>
        {[ZERO, ...RAMP].map((c, i) => (
          <span key={c} className="flex min-w-[34px] flex-col items-center gap-[3px]">
            <i className="block h-2 w-full rounded-[2px]" style={{ background: c }} />
            {i === 0 ? '0' : BIN_LABELS[i - 1]}
          </span>
        ))}
      </span>
    </span>
  );
}
