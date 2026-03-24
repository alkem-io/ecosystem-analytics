import type { HeadlineMetrics } from '@server/types/dashboard.js';
import InfoTooltip from './InfoTooltip.js';
import styles from './WhiteboardMetrics.module.css';

interface WhiteboardMetricsProps {
  headline: HeadlineMetrics;
}

export default function WhiteboardMetrics({ headline }: WhiteboardMetricsProps) {
  if (headline.totalWhiteboards === 0) {
    return <div className={styles.empty}>No whiteboards in this space</div>;
  }

  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <InfoTooltip text="Total number of whiteboard responses created in this space.">
          <span className={styles.value}>{headline.totalWhiteboards}</span>
        </InfoTooltip>
        <span className={styles.label}>Total Whiteboards</span>
      </div>
      <div className={styles.card}>
        <InfoTooltip text="Total number of modifications (edits) made across all whiteboards.">
          <span className={styles.value}>{headline.totalWhiteboardModifications}</span>
        </InfoTooltip>
        <span className={styles.label}>Total Modifications</span>
      </div>
      <div className={styles.card}>
        <InfoTooltip text="Average number of modifications per whiteboard. Higher values indicate more iterative collaboration.">
          <span className={styles.value}>{headline.avgWhiteboardModifications.toFixed(1)}</span>
        </InfoTooltip>
        <span className={styles.label}>Avg Modifications / Board</span>
      </div>
    </div>
  );
}
