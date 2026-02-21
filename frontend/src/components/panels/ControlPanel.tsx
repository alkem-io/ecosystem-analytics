import type { GraphDataset } from '@server/types/graph.js';
import type { ClusterMode } from '../graph/clustering.js';
import ClusterControls from './ClusterControls.js';
import FilterControls from './FilterControls.js';
import styles from './ControlPanel.module.css';

interface Props {
  dataset: GraphDataset;
  clusterMode: ClusterMode;
  onClusterModeChange: (mode: ClusterMode) => void;
  showPeople: boolean;
  showOrganizations: boolean;
  onTogglePeople: () => void;
  onToggleOrganizations: () => void;
  onHighlightNodes?: (nodeIds: string[]) => void;
}

export default function ControlPanel({
  dataset,
  clusterMode,
  onClusterModeChange,
  showPeople,
  showOrganizations,
  onTogglePeople,
  onToggleOrganizations,
  onHighlightNodes,
}: Props) {
  // Get L0 space nodes for scope chips
  const scopeSpaces = dataset.nodes.filter((n) => n.type === 'SPACE_L0');
  const insights = dataset.insights;

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <h3 className={styles.heading}>Scope</h3>
        <div className={styles.chips}>
          {scopeSpaces.map((s) => (
            <span key={s.id} className={styles.chip}>
              {s.displayName}
            </span>
          ))}
        </div>
      </div>

      <ClusterControls mode={clusterMode} onChange={onClusterModeChange} />

      <FilterControls
        dataset={dataset}
        showPeople={showPeople}
        showOrganizations={showOrganizations}
        onTogglePeople={onTogglePeople}
        onToggleOrganizations={onToggleOrganizations}
      />

      {insights && onHighlightNodes && (
        <div className={styles.section}>
          <h3 className={styles.heading}>Insights</h3>
          {insights.superConnectors.length > 0 && (
            <button
              className={styles.insightBtn}
              onClick={() => onHighlightNodes(insights.superConnectors)}
            >
              Super-connectors ({insights.superConnectors.length})
            </button>
          )}
          {insights.isolatedNodes.length > 0 && (
            <button
              className={styles.insightBtn}
              onClick={() => onHighlightNodes(insights.isolatedNodes)}
            >
              Isolated nodes ({insights.isolatedNodes.length})
            </button>
          )}
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.heading}>Legend</h3>
        <div className={styles.legendItem}>
          <span className={styles.dot} style={{ background: 'var(--node-space-l0)' }} /> Space (L0)
        </div>
        <div className={styles.legendItem}>
          <span className={styles.dot} style={{ background: 'var(--node-space-l1)' }} /> Space (L1)
        </div>
        <div className={styles.legendItem}>
          <span className={styles.dot} style={{ background: 'var(--node-space-l2)' }} /> Space (L2)
        </div>
        <div className={styles.legendItem}>
          <span className={styles.dot} style={{ background: 'var(--node-organization)' }} /> Organization
        </div>
        <div className={styles.legendItem}>
          <span className={styles.dot} style={{ background: 'var(--node-user)' }} /> Person
        </div>
      </div>
    </div>
  );
}
