import { useTranslation } from 'react-i18next';
import { Maximize2, X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import type { EcosystemFilters } from '../utils/ecosystem.js';

export interface EcosystemFilterBarProps {
  filters: EcosystemFilters;
  onChange: (filters: EcosystemFilters) => void;
  hiddenCount: number;
  onFit: () => void;
}

/**
 * The map's toolbar (feature 024, FR-019/020a/021).
 *
 * Every organisation is drawn by default — the map is meant to be busy, because that
 * busyness IS the finding. These two filters are how a reader cuts it down to the story
 * the hand-drawn reference tells: the organisations that hold the ecosystem together.
 */
export function EcosystemFilterBar({ filters, onChange, hiddenCount, onFit }: EcosystemFilterBarProps) {
  const { t } = useTranslation();
  const any = filters.linkedToOrchestrator || filters.multiMembership;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border)] px-4 py-2 text-sm">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          data-testid="ecosystem-filter-orchestrator"
          checked={filters.linkedToOrchestrator}
          onChange={(e) => onChange({ ...filters, linkedToOrchestrator: e.target.checked })}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        {t('ecosystem.filter.orchestrator')}
      </label>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          data-testid="ecosystem-filter-multi"
          checked={filters.multiMembership}
          onChange={(e) => onChange({ ...filters, multiMembership: e.target.checked })}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        {t('ecosystem.filter.multi')}
      </label>

      {hiddenCount > 0 && (
        <span data-testid="ecosystem-filter-hidden" className="text-[var(--text-secondary)]">
          {t('ecosystem.filter.hidden', { count: hiddenCount })}
        </span>
      )}

      {any && (
        <button
          type="button"
          data-testid="ecosystem-filter-clear"
          onClick={() => onChange({ linkedToOrchestrator: false, multiMembership: false })}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[var(--primary)] hover:bg-[var(--surface)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {t('ecosystem.filter.clear')}
        </button>
      )}

      <button
        type="button"
        data-testid="ecosystem-fit"
        onClick={onFit}
        className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--surface)]"
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        {t('ecosystem.fit')}
      </button>

      <Legend />
    </div>
  );
}

/** What the strokes and rings mean. Without it the two line styles are just noise. */
function Legend() {
  const { t } = useTranslation();
  const items: [string, React.ReactNode][] = [
    [t('ecosystem.legend.lead'), <Swatch key="lead" width={3} />],
    [t('ecosystem.legend.member'), <Swatch key="member" width={1.25} />],
    [t('ecosystem.legend.viaSubspace'), <Swatch key="sub" width={1.25} dashed />],
    [t('ecosystem.legend.partOf'), <Swatch key="part" width={1} primary />],
    [
      t('ecosystem.legend.connector'),
      <svg key="conn" width={16} height={16} aria-hidden>
        <circle cx={8} cy={8} r={5} fill="none" stroke="var(--primary)" strokeWidth={3} />
      </svg>,
    ],
  ];
  return (
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] lg:w-auto">
      {items.map(([label, mark]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          {mark}
          {label}
        </span>
      ))}
    </div>
  );
}

function Swatch({ width, dashed, primary }: { width: number; dashed?: boolean; primary?: boolean }) {
  return (
    <svg width={20} height={8} aria-hidden className={cn('shrink-0')}>
      <line
        x1={0}
        y1={4}
        x2={20}
        y2={4}
        stroke={primary ? 'var(--primary)' : 'var(--text-secondary)'}
        strokeWidth={width}
        strokeDasharray={dashed ? '4 4' : undefined}
        strokeOpacity={primary ? 0.5 : 0.7}
      />
    </svg>
  );
}
