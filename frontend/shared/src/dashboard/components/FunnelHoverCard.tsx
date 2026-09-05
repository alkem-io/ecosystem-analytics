import { useTranslation } from 'react-i18next';
import type { FunnelDot } from '../utils/funnel.js';

interface Props {
  dot: FunnelDot;
  /** Colour of the dot's source, so the card is unmistakably about that dot. */
  color: string;
  /** Container-relative position to anchor the card near. */
  x: number;
  y: number;
  containerWidth: number;
}

/** One labelled line. Rendered even when the value is empty — see FR-019. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="min-w-0 break-words text-foreground">{value}</span>
    </div>
  );
}

/**
 * Detail for one initiative in the funnel (FR-018).
 *
 * Shows the name, source, participating-gemeente count, growth phase and every
 * configured classification dimension. A dimension the initiative carries no values in
 * is shown explicitly as "none" rather than omitted (FR-019) — an absent line reads as
 * "not applicable", which is a different claim from "nothing selected".
 */
export function FunnelHoverCard({ dot, color, x, y, containerWidth }: Props) {
  const { t } = useTranslation();
  const { row } = dot;
  const none = t('funnel.hover.none', { defaultValue: 'None' });

  // Flip to the left of the cursor when close to the right edge, so the card is never
  // clipped by the container.
  const CARD_WIDTH = 260;
  const flip = x + CARD_WIDTH + 24 > containerWidth;

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 w-[260px] rounded-lg border border-border bg-card p-3 text-xs shadow-md"
      style={{ left: flip ? x - CARD_WIDTH - 14 : x + 14, top: y + 14 }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="font-semibold text-foreground">{row.name}</span>
      </div>

      <div className="mt-2 space-y-0.5">
        <Field
          label={t('funnel.hover.source', { defaultValue: 'Source' })}
          value={
            row.kind === 'gd'
              ? t('funnel.legendGd', { defaultValue: 'GemeenteDelers' })
              : t('funnel.legendGroei', { defaultValue: 'Groei' })
          }
        />
        <Field
          label={t('funnel.hover.gemeentes', { defaultValue: 'Participating municipalities' })}
          value={String(dot.g)}
        />
        <Field
          label={t('funnel.hover.phase', { defaultValue: 'Phase' })}
          value={row.phase?.label ?? t('funnel.hover.noPhase', { defaultValue: 'No phase yet' })}
        />
      </div>

      {/* Classifications. Groei initiatives carry the authored groups; GD initiatives are
          tag-derived by design, so their dimensions are listed from the resolved fields. */}
      <div className="mt-2 space-y-0.5 border-t border-border pt-2">
        {row.classifications.length > 0
          ? row.classifications.map((c) => (
              <Field
                key={c.id}
                label={c.label}
                value={c.values.length ? c.values.map((v) => v.label).join(', ') : none}
              />
            ))
          : (
              [
                ['NDS', row.nds],
                ['VNG 2030', row.vng2030],
                ['Thema', row.themes],
              ] as const
            ).map(([label, values]) => (
              <Field key={label} label={label} value={values.length ? values.join(', ') : none} />
            ))}
      </div>

      {/* GD-only extras, shown when present rather than as empty lines — they are not
          classification dimensions, so FR-019's "show it as empty" rule does not apply. */}
      {(row.awards.length > 0 || row.sdg.length > 0) && (
        <div className="mt-2 space-y-0.5 border-t border-border pt-2">
          {row.awards.length > 0 && <Field label="GemeenteDelers" value={row.awards.join(', ')} />}
          {row.sdg.length > 0 && <Field label="Global Goals" value={row.sdg.join(', ')} />}
        </div>
      )}
    </div>
  );
}
