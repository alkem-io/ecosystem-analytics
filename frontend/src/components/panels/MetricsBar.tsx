import type { GraphMetrics } from '@server/types/graph.js';
import styles from './MetricsBar.module.css';

interface Props {
  metrics: GraphMetrics;
}

export default function MetricsBar({ metrics }: Props) {
  return (
    <div className={styles.bar}>
      <span className={styles.item}>
        <strong>{metrics.totalNodes}</strong> nodes
      </span>
      <span className={styles.item}>
        <strong>{metrics.totalEdges}</strong> edges
      </span>
      <span className={styles.item}>
        avg degree <strong>{metrics.averageDegree}</strong>
      </span>
      <span className={styles.item}>
        density <strong>{metrics.density}</strong>
      </span>
    </div>
  );
}
