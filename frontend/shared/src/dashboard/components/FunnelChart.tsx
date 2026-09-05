import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Euro } from 'lucide-react';
import type { FunnelDot, FunnelLayout } from '../utils/funnel.js';
import { FunnelHoverCard } from './FunnelHoverCard.js';

/** Source colours, matching the dashboard's existing stacked charts (spec A-007). */
const GROEI_COLOR = 'var(--primary)';
const GD_COLOR = '#16a34a';

const LABEL_BAND = 56; // px reserved at the top for stage names and counts
const RAMP_BAND = 46; // px reserved at the bottom for the money/effort ramp
/**
 * Vertical space the chart adds AROUND the funnel itself (labels + ramp), plus the
 * legend below the SVG. The tab subtracts this from the measured box before asking for a
 * funnel height, so the whole thing fits without scrolling (FR-006).
 */
export const FUNNEL_CHROME = LABEL_BAND + RAMP_BAND + 56;

interface Props {
  layout: FunnelLayout;
}

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
export function FunnelChart({ layout }: Props) {
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

  const totalHeight = height + LABEL_BAND + RAMP_BAND;
  const dotColor = (dot: FunnelDot) => (dot.row.kind === 'gd' ? GD_COLOR : GROEI_COLOR);

  const renderDot = (dot: FunnelDot, yOffset: number) => (
    <circle
      key={dot.id}
      cx={dot.x}
      cy={dot.y + yOffset}
      r={dot.r}
      fill={dotColor(dot)}
      fillOpacity={hovered && hovered.id !== dot.id ? 0.35 : 0.85}
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
  );

  return (
    <div className="relative w-full">
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
              fill={i % 2 === 0 ? 'var(--surface)' : 'transparent'}
              fillOpacity={0.5}
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

        {/* Stage names and counts, above the funnel so they never collide with dots. */}
        {stages.map((stage) => {
          const cx = (stage.x0 + stage.x1) / 2;
          const label = stage.label ?? t('funnel.gdStage', { defaultValue: 'GemeenteDelers' });
          return (
            <g key={`label-${stage.key}`}>
              <text
                x={cx}
                y={22}
                textAnchor="middle"
                className="fill-foreground text-[12px] font-semibold"
              >
                {label}
              </text>
              <text x={cx} y={40} textAnchor="middle" className="fill-muted-foreground text-[11px]">
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
      </svg>

      {/* Legend: both source colours named, and what dot size means (FR-015). */}
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GROEI_COLOR }} />
          {t('funnel.legendGroei', { defaultValue: 'Groei' })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GD_COLOR }} />
          {t('funnel.legendGd', { defaultValue: 'GemeenteDelers' })}
        </span>
        <span>{t('funnel.legendSize', { defaultValue: 'Dot size = number of participating municipalities' })}</span>
        <span className="flex items-center gap-1.5">
          <Euro className="h-3 w-3" />
          <Clock className="h-3 w-3" />
          {t('funnel.rampHint', {
            defaultValue: 'Each phase costs more money and more time than the one before it',
          })}
        </span>
      </div>

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
  );
}
