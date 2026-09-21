import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { EcoSpace, OrchestratorSource } from '../utils/ecosystem.js';

export interface OrchestratorControlProps {
  candidates: EcoSpace[];
  value: string | null;
  source: OrchestratorSource | null;
  /** True when the viewer has a choice of their own to revert. */
  canReset: boolean;
  onChoose: (spaceNameId: string) => void;
  onReset: () => void;
}

/**
 * Which Space orchestrates this ecosystem (feature 024, FR-010/011/012).
 *
 * Alkemio cannot express "this Space runs that hub" yet, so the dashboard guesses and
 * the viewer corrects. The badge is the honest part: it always says WHERE the shown
 * orchestrator came from — your own choice, other viewers' choices, the built-in table,
 * or a guess from the Spaces' profiles — so nobody mistakes a guess for a fact.
 */
export function OrchestratorControl({
  candidates,
  value,
  source,
  canReset,
  onChoose,
  onReset,
}: OrchestratorControlProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--border)] px-4 py-2 text-sm">
      <label htmlFor="ecosystem-orchestrator" className="text-[var(--text-secondary)]">
        {t('ecosystem.orchestrator')}
      </label>

      <select
        id="ecosystem-orchestrator"
        data-testid="ecosystem-orchestrator-select"
        aria-label={t('ecosystem.orchestrator')}
        value={value ?? ''}
        onChange={(e) => e.target.value && onChoose(e.target.value)}
        className="max-w-[18rem] rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1"
      >
        <option value="">—</option>
        {candidates.map((c) => (
          <option key={c.nameId} value={c.nameId}>
            {c.name}
          </option>
        ))}
      </select>

      {source && (
        <span
          data-testid="ecosystem-orchestrator-source"
          className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
        >
          {t(`ecosystem.source.${source}`)}
        </span>
      )}

      {canReset && (
        <button
          type="button"
          data-testid="ecosystem-orchestrator-reset"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[var(--primary)] hover:bg-[var(--surface)]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {t('ecosystem.reset')}
        </button>
      )}

      {/* FR-010: the dropdown can only offer Spaces the map actually holds. */}
      <span className="w-full text-xs text-[var(--text-secondary)] lg:w-auto">
        {t('ecosystem.hint.addSpace')}
      </span>
    </div>
  );
}
