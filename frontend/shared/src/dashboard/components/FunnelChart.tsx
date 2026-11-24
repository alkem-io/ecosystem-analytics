import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Euro } from 'lucide-react';
import { cn } from '@ea/shared';
import type { FunnelDot, FunnelLayout } from '../utils/funnel.js';
import {
  NONE_KEY,
  categoryLegend,
  categoryScale,
  colorOfKey,
  rowKeys,
  type FunnelColorBy,
} from '../utils/funnel-colors.js';
import { HANDELEN_COLOR, HANDELEN_ORDER, handelenLabel } from '../utils/handelen.js';
import { GD_COLOR, GROEI_COLOR, slicePath } from '../utils/pie.js';
import { FunnelHoverCard } from './FunnelHoverCard.js';

const LABEL_BAND = 68; // px reserved at the top for the stage header boxes
/** Geometry of one stage header box inside that band. */
const HEADER_TOP = 4;
const HEADER_HEIGHT = 46;
/** Horizontal gutter between adjacent header boxes, so they read as separate cards. */
const HEADER_GUTTER = 3;
const RAMP_BAND = 46; // px reserved at the bottom for the money/effort ramp
/**
 * Vertical space the chart adds AROUND the funnel itself (labels + ramp), plus a little
 * slack (the legend now sits above the panel, outside the measured box). The tab subtracts this from the measured box before asking for a
 * funnel height, so the whole thing fits without scrolling (FR-006).
 */
export const FUNNEL_CHROME = LABEL_BAND + RAMP_BAND + 8;

interface Props {
  layout: FunnelLayout;
  /**
   * Draw each initiative's name beside its dot. Off by default: at full corpus the
   * labels overprint into a smear, and the funnel's job at that size is the SHAPE. It
   * earns its keep once a classification filter has cut the set down.
   */
  showLabels?: boolean;
  /** What the dots are coloured by (default: their source, Groei / GemeenteDelers). */
  colorBy?: FunnelColorBy;
  /** The chosen classification's values in authored order — fixes each value's colour. */
  vocabulary?: readonly string[];
  /** The legend entry being highlighted (its dots stay, the rest fade), or null. */
  focusKey?: string | null;
}

/** GemeenteDelers in the handelen colouring: recognisably its green, but receding. */
const GD_FADED = `color-mix(in srgb, ${GD_COLOR} 35%, var(--surface-raised))`;
/** A Groei dot whose handelen has not loaded. */
const HANDELEN_PENDING = 'pending';

/** A legend entry: a source (Groei / GemeenteDelers), a handelen status or a classification value. */
interface LegendEntry {
  key: string;
  label: string;
  color: string;
  count: number;
}

/**
 * How the dots are coloured, shared by the chart and its legend: each dot's legend keys
 * and colours, and the legend entries with their counts. By source the keys are the row
 * kinds; by classification, the values (utils/funnel-colors.ts).
 */
function funnelColoring(
  layout: FunnelLayout,
  colorBy: FunnelColorBy,
  vocabulary: readonly string[],
  t: ReturnType<typeof useTranslation>['t'],
) {
  const allDots = [...layout.stages.flatMap((s) => s.dots), ...(layout.holding?.dots ?? [])];
  const byHandelen = colorBy === 'handelen';
  const byCategory = colorBy === 'nds' || colorBy === 'vng2030' ? colorBy : null;
  const scale = categoryScale(vocabulary);
  // By handelen: a Groei dot wears its status. GemeenteDelers has none (a completed
  // programme), so it keeps a faded version of its own green. Until the item has loaded,
  // Groei dots are neutral and have no legend entry of their own.
  const handelenKey = (dot: FunnelDot) =>
    dot.row.kind === 'gd' ? 'gd' : (dot.row.handelen?.status ?? HANDELEN_PENDING);
  const handelenColor = (key: string) =>
    key === 'gd'
      ? GD_FADED
      : key === HANDELEN_PENDING
        ? 'var(--cat-none)'
        : HANDELEN_COLOR[key as keyof typeof HANDELEN_COLOR];
  const keysOf = (dot: FunnelDot): string[] =>
    byHandelen ? [handelenKey(dot)] : byCategory ? rowKeys(dot.row, byCategory, scale, vocabulary) : [dot.row.kind === 'gd' ? 'gd' : 'groei'];
  const colorsOf = (dot: FunnelDot): string[] =>
    byHandelen ? [handelenColor(handelenKey(dot))] : byCategory ? keysOf(dot).map((k) => colorOfKey(k, scale)) : [dot.row.kind === 'gd' ? GD_COLOR : GROEI_COLOR];
  let legend: LegendEntry[];
  if (byHandelen) {
    const counts = new Map<string, number>();
    for (const d of allDots) counts.set(handelenKey(d), (counts.get(handelenKey(d)) ?? 0) + 1);
    legend = [
      ...HANDELEN_ORDER.map((s) => ({ key: s as string, label: handelenLabel(t, s) })),
      { key: 'gd', label: t('handelen.gd', { defaultValue: 'GemeenteDelers (no activity tracked)' }) },
    ].flatMap((e) => {
      const count = counts.get(e.key) ?? 0;
      return count > 0 ? [{ ...e, color: handelenColor(e.key), count }] : [];
    });
  } else if (byCategory) {
    legend = categoryLegend(
      allDots.map((d) => d.row),
      byCategory,
      vocabulary,
    ).map((e) => ({
      key: e.key,
      color: e.color,
      count: e.count,
      label:
        e.label ??
        (e.key === NONE_KEY
          ? t('funnel.legendNone', { defaultValue: 'No classification' })
          : t('funnel.legendOther', { defaultValue: 'Other' })),
    }));
  } else {
    const gd = allDots.filter((d) => d.row.kind === 'gd').length;
    legend = [
      { key: 'groei', label: t('funnel.legendGroei', { defaultValue: 'Groei' }), color: GROEI_COLOR, count: allDots.length - gd },
      { key: 'gd', label: t('funnel.legendGd', { defaultValue: 'GemeenteDelers' }), color: GD_COLOR, count: gd },
    ].filter((e) => e.count > 0);
  }
  const anySplit = byCategory !== null && allDots.some((d) => keysOf(d).length > 1);
  return { legend, keysOf, colorsOf, anySplit };
}

/**
 * What the colours mean, for whichever colouring is chosen — placed by the tab ABOVE the
 * funnel, outside its scrolling area, so it is always beside the dots it explains. Each
 * entry is a button: click to highlight its initiatives (colour alone cannot carry eight
 * values on scattered dots).
 */
export function FunnelLegend({
  layout,
  colorBy = 'source',
  vocabulary = [],
  focusKey,
  onFocusKey,
}: {
  layout: FunnelLayout;
  colorBy?: FunnelColorBy;
  vocabulary?: readonly string[];
  focusKey: string | null;
  onFocusKey: (key: string | null) => void;
}) {
  const { t } = useTranslation();
  const { legend, anySplit } = funnelColoring(layout, colorBy, vocabulary, t);
  const focus = legend.some((e) => e.key === focusKey) ? focusKey : null;
  if (legend.length === 0) return null;
  return (
    <div className="mt-2" data-testid={
        colorBy === 'source'
          ? 'funnel-source-legend'
          : colorBy === 'handelen'
            ? 'funnel-handelen-legend'
            : 'funnel-category-legend'
      }>
      <div className="flex flex-wrap items-center gap-1.5">
        {legend.map((entry) => {
          const active = focus === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              aria-pressed={active}
              onClick={() => onFocusKey(active ? null : entry.key)}
              data-testid="funnel-legend-item"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active
                  ? 'border-foreground/40 bg-muted text-foreground'
                  : 'border-border text-foreground hover:bg-muted',
                focus !== null && !active && 'opacity-50',
              )}
            >
              <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: entry.color }} />
              <span>{entry.label}</span>
              <span className="tabular-nums text-muted-foreground">{entry.count}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          {t('funnel.legendFocusHint', { defaultValue: 'Click a value to highlight its initiatives.' })}
          {colorBy === 'handelen' &&
            ` ${t('handelen.hint', { defaultValue: 'Since the last recorded event in the Space or its subspaces; new members count.' })}`}
          {anySplit && ` ${t('funnel.legendSplit', { defaultValue: 'A dot in several colours has several values.' })}`}
        </span>
        <span>{t('funnel.legendSize', { defaultValue: 'Dot size = number of participating municipalities' })}</span>
        <span className="flex items-center gap-1">
          <Euro className="h-3 w-3" aria-hidden />
          <Clock className="h-3 w-3" aria-hidden />
          {t('funnel.rampHint', { defaultValue: 'Each phase costs more money and more time than the one before it' })}
        </span>
      </p>
    </div>
  );
}

/** A small swatch for one or more colours (equal shares, clockwise from the top). */
function swatchBackground(colors: string[]): string {
  if (colors.length <= 1) return colors[0];
  const step = 360 / colors.length;
  return `conic-gradient(${colors.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(', ')})`;
}

/** Rough advance width per character at the label's 10px size — SVG cannot measure. */
const LABEL_CHAR_PX = 5.2;

function pathOf(points: [number, number][], yOffset: number): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${(y + yOffset).toFixed(2)}`).join(' ');
}

/**
 * The innovation funnel (feature 022).
 *
 * Draws the frame — two converging curved bounding bars, one band per stage, stage names
 * and counts, and a money/effort ramp that grows toward the narrow end — and then one dot
 * per initiative inside it. Positions come from `layoutFunnel`; this component only
 * renders them, so the geometry stays pure and testable.
 *
 * The whole funnel is drawn in a single viewBox-scaled SVG, which is what keeps every
 * stage, both bars and every label visible at any width without scrolling (FR-006).
 */
export function FunnelChart({
  layout,
  showLabels = false,
  colorBy = 'source',
  vocabulary = [],
  focusKey = null,
}: Props) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<FunnelDot | null>(null);

  const { width, height, stages, holding, upper, lower } = layout;
  const upperPath = useMemo(() => pathOf(upper, LABEL_BAND), [upper]);
  const lowerPath = useMemo(() => pathOf(lower, LABEL_BAND), [lower]);
  // The closed funnel silhouette: down the upper curve, back along the lower one. Used
  // both to fill the funnel and to CLIP the stage bands, so the shape between the two
  // bounding bars is the only thing that reads as "the funnel".
  const envelopePath = useMemo(
    () => `${pathOf(upper, LABEL_BAND)} ${pathOf([...lower].reverse(), LABEL_BAND).replace('M', 'L')} Z`,
    [upper, lower],
  );

  if (width <= 0 || height <= 0) return null;

  // The roster model. Stages keep their band geometry so the columns below the funnel
  // can be pinned to them, and every group is ordered the way the funnel orders its dots
  // — most participating gemeentes first — so the list and the picture read alike.
  const byParticipation = (a: FunnelDot, b: FunnelDot) =>
    b.g - a.g || a.row.name.localeCompare(b.row.name);
  const roster = {
    stages: stages.map((stage) => ({
      key: stage.key,
      x0: stage.x0,
      x1: stage.x1,
      dots: [...stage.dots].sort(byParticipation),
    })),
    holding: holding
      ? {
          label: `${t('funnel.noPhaseArea', { defaultValue: 'No phase yet' })} (${holding.dots.length})`,
          dots: [...holding.dots].sort(byParticipation),
        }
      : null,
  };

  const totalHeight = height + LABEL_BAND + RAMP_BAND;
  const { legend, keysOf, colorsOf } = funnelColoring(layout, colorBy, vocabulary, t);
  // A focus whose value has left the funnel (filter, other colouring) is simply off.
  const focus = legend.some((e) => e.key === focusKey) ? focusKey : null;
  const dotColor = (dot: FunnelDot) => colorsOf(dot)[0];
  const outOfFocus = (dot: FunnelDot) => focus !== null && !keysOf(dot).includes(focus);

  const renderDot = (dot: FunnelDot, yOffset: number) => {
    const colors = colorsOf(dot);
    const opacity = outOfFocus(dot) ? 0.12 : hovered && hovered.id !== dot.id ? 0.35 : 0.85;
    const cy = dot.y + yOffset;
    const step = 360 / colors.length;
    return (
    <g key={dot.id}>
    <circle
      cx={dot.x}
      cy={cy}
      r={dot.r}
      fill={colors[0]}
      fillOpacity={opacity}
      data-funnel-colors={colors.join(' ')}
      // Marks the dot LAYER: the ramp's icons are circles too, so tests and any
      // frame-only screenshot need a way to address exactly the initiative dots.
      data-funnel-dot={dot.id}
      stroke="var(--surface-raised)"
      strokeWidth={0.8}
      tabIndex={0}
      role="img"
      aria-label={`${dot.row.name} — ${dot.g}`}
      className="cursor-default outline-none focus-visible:stroke-foreground focus-visible:[stroke-width:2]"
      onMouseEnter={() => setHovered(dot)}
      onMouseLeave={() => setHovered((h) => (h?.id === dot.id ? null : h))}
      onFocus={() => setHovered(dot)}
      onBlur={() => setHovered((h) => (h?.id === dot.id ? null : h))}
    />
    {/* Several values: equal wedges over the disc, clockwise from the top. Inside the
        disc's surface ring, and never in the way of its hover. */}
    {colors.length > 1 &&
      colors.map((c, i) => (
        <path
          key={i}
          d={slicePath(dot.x, cy, Math.max(0, dot.r - 0.6), i * step, (i + 1) * step)}
          fill={c}
          fillOpacity={opacity}
          className="pointer-events-none"
        />
      ))}
    </g>
    );
  };

  return (
    <div className="relative w-full">
      {/* The frame scrolls sideways when the layout width exceeds the viewport (see
          MIN_FUNNEL_WIDTH in FunnelTab): six stage names need about 110px each, and
          below that they overprint each other into an unreadable band. The hover card
          lives INSIDE this scroller, so its container-relative coordinates stay true
          however far the funnel is scrolled. The legend stays outside it, always
          readable without scrolling. */}
      <div className="no-scrollbar overflow-x-auto">
        <div className="relative" style={{ width }}>
      {/* Rendered 1:1 rather than viewBox-scaled: the layout is already computed against
          the measured container, and a 1:1 SVG keeps SVG user units equal to container
          pixels — which is what lets the hover card be positioned from a dot's centre. */}
      <svg
        width={width}
        height={totalHeight}
        viewBox={`0 0 ${width} ${totalHeight}`}
        role="group"
        aria-label={t('funnel.title', { defaultValue: 'Innovation funnel' })}
        className="block"
      >
        <defs>
          <clipPath id="funnel-envelope">
            <path d={envelopePath} />
          </clipPath>
        </defs>

        {/* Column rules at every stage boundary, run the full height of the drawing.
            Drawn FIRST so the envelope's opaque fill covers them where they cross it: the
            rule frames the column above and below the curve, and the dashed separator
            further down carries the division through the funnel itself. */}
        {stages.slice(1).map((stage) => (
          <line
            key={`rule-${stage.key}`}
            x1={stage.x0}
            x2={stage.x0}
            y1={HEADER_TOP}
            y2={LABEL_BAND + height + RAMP_BAND - 4}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        {/* The funnel interior, and the stage bands CLIPPED to it. Without the clip the
            bands run the full height and the picture reads as a bar chart rather than a
            funnel — the silhouette between the two bars has to be what dominates. */}
        <g clipPath="url(#funnel-envelope)" className="pointer-events-none">
          <path d={envelopePath} fill="var(--surface-raised)" />
          {stages.map((stage, i) => (
            <rect
              key={`band-${stage.key}`}
              x={stage.x0}
              y={LABEL_BAND}
              width={stage.x1 - stage.x0}
              height={height}
              fill={i % 2 === 0 ? 'var(--foreground)' : 'transparent'}
              fillOpacity={i % 2 === 0 ? 0.05 : 0}
            />
          ))}
        </g>

        {/* The two curved bounding bars. Everything in the funnel lives between them. */}
        <path d={upperPath} fill="none" stroke="var(--foreground)" strokeWidth={2.5} strokeLinecap="round" />
        <path d={lowerPath} fill="none" stroke="var(--foreground)" strokeWidth={2.5} strokeLinecap="round" />

        {/* Stage separators, drawn only between the bars so they read as part of the funnel. */}
        {stages.slice(1).map((stage) => {
          const i = Math.round((stage.x0 / width) * (upper.length - 1));
          return (
            <line
              key={`sep-${stage.key}`}
              x1={stage.x0}
              x2={stage.x0}
              y1={upper[i][1] + LABEL_BAND}
              y2={lower[i][1] + LABEL_BAND}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          );
        })}

        {/* One header box per phase, above the funnel where nothing can collide with a
            dot. The boxes carry a tint that deepens left → right, which is the same
            claim the money/effort ramp beneath the funnel makes — further along the
            pipeline costs more — so the two reinforce rather than compete. Formation is
            drawn hollow: it is the funnel's own leading stage, not an authored phase. */}
        {stages.map((stage, i) => {
          const label = stage.label ?? t('funnel.formationStage', { defaultValue: 'Formation' });
          // Inset by the gutter, then clamped inside the viewBox so the outermost
          // boxes' 1px stroke is not half-clipped by the SVG edge.
          const x0 = Math.max(1, stage.x0 + HEADER_GUTTER);
          const x1 = Math.min(width - 1, stage.x1 - HEADER_GUTTER);
          const w = Math.max(0, x1 - x0);
          const cx = x0 + w / 2;
          const authored = stage.kind === 'phase';
          // 0 → 1 across the authored phases, so the ramp reads even when the vocabulary
          // is longer or shorter than the VNG five.
          const depth = stages.length > 2 ? (i - 1) / (stages.length - 2) : 0;
          return (
            <g key={`header-${stage.key}`}>
              <rect
                x={x0}
                y={HEADER_TOP}
                width={w}
                height={HEADER_HEIGHT}
                rx={5}
                fill={authored ? 'var(--primary)' : 'transparent'}
                fillOpacity={authored ? 0.06 + 0.16 * depth : 0}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray={authored ? undefined : '4 3'}
              />
              <text
                x={cx}
                y={HEADER_TOP + 20}
                textAnchor="middle"
                className={
                  authored
                    ? 'fill-foreground text-[12px] font-semibold'
                    : 'fill-muted-foreground text-[12px] font-semibold'
                }
              >
                {label}
              </text>
              <text
                x={cx}
                y={HEADER_TOP + 37}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {stage.dots.length}
              </text>
            </g>
          );
        })}

        {/* Money + effort ramp: each stage costs more than the one before it (FR-008/009). */}
        {stages.map((stage) => {
          const cx = (stage.x0 + stage.x1) / 2;
          const y = LABEL_BAND + height + 18;
          // Ramp value 0..1 → 1..4 marks, so the growth is countable, not just a size cue.
          const marks = 1 + Math.round(stage.money * 3);
          const span = 13;
          return (
            /* Decorative: must never steal a hover from a dot. */
            <g key={`ramp-${stage.key}`} aria-hidden="true" className="pointer-events-none">
              {Array.from({ length: marks }, (_, i) => (
                <Euro
                  key={`e${i}`}
                  x={cx - ((marks - 1) * span) / 2 + i * span - 5}
                  y={y - 5}
                  width={10}
                  height={10}
                  className="stroke-muted-foreground"
                />
              ))}
              {Array.from({ length: marks }, (_, i) => (
                <Clock
                  key={`c${i}`}
                  x={cx - ((marks - 1) * span) / 2 + i * span - 5}
                  y={y + 9}
                  width={10}
                  height={10}
                  className="stroke-muted-foreground"
                />
              ))}
            </g>
          );
        })}

        {/* Dots, drawn last so they sit above the frame. */}
        {stages.map((stage) => (
          <g key={`dots-${stage.key}`}>{stage.dots.map((d) => renderDot(d, LABEL_BAND))}</g>
        ))}

        {/* The "no phase" holding area — deliberately OUTSIDE the curves (FR-024a), so
            nothing between the bars is occupied by an initiative with no known stage. */}
        {holding && (
          <g>
            <rect
              x={holding.box.x0}
              y={holding.box.y0 + LABEL_BAND}
              width={holding.box.x1 - holding.box.x0}
              height={holding.box.y1 - holding.box.y0}
              fill="var(--surface)"
              fillOpacity={0.28}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="5 4"
              rx={6}
              className="pointer-events-none"
            />
            <text
              x={holding.box.x0 + 4}
              y={holding.box.y0 + LABEL_BAND - 5}
              className="fill-muted-foreground text-[11px] font-medium"
            >
              {t('funnel.noPhaseArea', { defaultValue: 'No phase yet' })} ({holding.dots.length})
            </text>
            {holding.dots.map((d) => renderDot(d, LABEL_BAND))}
          </g>
        )}
        {/* Initiative names, on request. Drawn after every dot so a label is never
            buried under a neighbouring disc, with a halo in the surface colour so it
            stays readable where it crosses one. Flips to the left of its dot near the
            right edge rather than running off the frame. */}
        {showLabels &&
          [...stages.flatMap((s) => s.dots), ...(holding?.dots ?? [])].map((dot) => {
            const name = dot.row.name;
            const estimated = name.length * LABEL_CHAR_PX;
            const flip = dot.x + dot.r + 6 + estimated > width;
            return (
              <text
                key={`label-${dot.id}`}
                x={flip ? dot.x - dot.r - 6 : dot.x + dot.r + 6}
                y={dot.y + LABEL_BAND + 3.5}
                textAnchor={flip ? 'end' : 'start'}
                className="pointer-events-none fill-foreground text-[10px]"
                stroke="var(--surface-raised)"
                strokeWidth={2.5}
                // A name fades with its dot, so a highlighted value's names stand out.
                opacity={outOfFocus(dot) ? 0.25 : 1}
                data-funnel-name={dot.id}
                style={{ paintOrder: 'stroke' }}
              >
                {name}
              </text>
            );
          })}

      </svg>

      {/* Who is actually in the funnel, by stage.
          The dots carry the shape; this carries the names — the thing a reader otherwise
          has to hover for, one at a time. Each column is pinned to its stage's own band
          and inset by the same gutter as the header box above it, so a phase's
          initiatives sit directly beneath that phase. It lives INSIDE the horizontal
          scroller for the same reason: scrolled sideways on a phone, the names must
          still line up with the stage they belong to. */}
      {roster.stages.some((g) => g.dots.length > 0) && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('funnel.inFunnel', { defaultValue: 'Initiatives in the funnel' })}
          </p>
          <div className="flex items-start">
            {roster.stages.map((group) => (
              <div
                key={group.key}
                style={{ width: group.x1 - group.x0 }}
                className="min-w-0 shrink-0 px-[3px]"
              >
                <div
                  className={cn(
                    'h-full min-w-0 rounded-md border p-2',
                    group.dots.length > 0 ? 'border-border bg-card' : 'border-transparent',
                  )}
                >
                  {group.dots.map((dot) => (
                    <div key={dot.id} className={cn('flex items-start gap-1.5 text-xs', outOfFocus(dot) && 'opacity-30')}>
                      <span
                        aria-hidden
                        className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: swatchBackground(colorsOf(dot)) }}
                      />
                      <span className="min-w-0 break-words text-muted-foreground">
                        {dot.row.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* The holding area spans the whole funnel, so its names do too. */}
          {roster.holding && (
            <div className="mt-2 rounded-md border border-dashed border-border p-2">
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                {roster.holding.label}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {roster.holding.dots.map((dot) => (
                  <span key={dot.id} className={cn('flex items-center gap-1.5 text-xs', outOfFocus(dot) && 'opacity-30')}>
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: swatchBackground(colorsOf(dot)) }}
                    />
                    <span className="text-muted-foreground">{dot.row.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {hovered && (
        <FunnelHoverCard
          dot={hovered}
          color={dotColor(hovered)}
          x={hovered.x}
          y={hovered.y + LABEL_BAND}
          containerWidth={width}
        />
      )}
        </div>
      </div>

      {/* The legend is rendered by the tab, above the funnel (FunnelLegend). */}
    </div>
  );
}
