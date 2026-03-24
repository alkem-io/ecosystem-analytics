import type { PhaseInfo, SubspaceNode } from '@server/types/dashboard.js';
import type { TimeRangePreset, DashboardFilterState } from '../../hooks/useDashboard.js';
import styles from './DashboardFilters.module.css';

interface DashboardFiltersProps {
  subspaceTree: SubspaceNode[];
  scopedPhases: PhaseInfo[];
  filters: DashboardFilterState;
  onTimeRangeChange: (preset: TimeRangePreset) => void;
  onPhaseChange: (phaseId: string | null) => void;
  onSubspaceChange: (subspaceId: string | null) => void;
  onSubSubspaceChange: (subSubspaceId: string | null) => void;
}

const TIME_RANGE_OPTIONS: { value: TimeRangePreset; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'lastQuarter', label: 'Last Quarter' },
  { value: 'lastYear', label: 'Last Year' },
];

export default function DashboardFilters({
  subspaceTree,
  scopedPhases,
  filters,
  onTimeRangeChange,
  onPhaseChange,
  onSubspaceChange,
  onSubSubspaceChange,
}: DashboardFiltersProps) {
  // Find the selected L1 node to get its L2 children
  const selectedL1 = filters.subspaceId
    ? subspaceTree.find((s) => s.id === filters.subspaceId)
    : null;

  return (
    <div className={styles.filters}>
      {/* Subspace (L1) dropdown */}
      {subspaceTree.length > 0 && (
        <div className={styles.group}>
          <span className={styles.label}>Subspace</span>
          <select
            className={styles.select}
            value={filters.subspaceId ?? ''}
            onChange={(e) => onSubspaceChange(e.target.value || null)}
          >
            <option value="">Entire Space</option>
            {subspaceTree.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sub-subspace (L2) dropdown — only when L1 is selected and has children */}
      {selectedL1 && selectedL1.children.length > 0 && (
        <div className={styles.group}>
          <span className={styles.label}>Sub-subspace</span>
          <select
            className={styles.select}
            value={filters.subSubspaceId ?? ''}
            onChange={(e) => onSubSubspaceChange(e.target.value || null)}
          >
            <option value="">All Sub-subspaces</option>
            {selectedL1.children.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Phase dropdown — scoped to selected subspace */}
      {scopedPhases.length > 1 && (
        <div className={styles.group}>
          <span className={styles.label}>Phase</span>
          <select
            className={styles.select}
            value={filters.phaseId ?? ''}
            onChange={(e) => onPhaseChange(e.target.value || null)}
          >
            <option value="">All Phases</option>
            {scopedPhases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} ({p.calloutCount} posts)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Time range chips */}
      <div className={styles.group}>
        <span className={styles.label}>Time</span>
        <div className={styles.chips}>
          {TIME_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.chip} ${filters.timeRange === opt.value ? styles.chipActive : ''}`}
              onClick={() => onTimeRangeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
