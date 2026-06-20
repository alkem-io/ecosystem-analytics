import type { GraphProgress } from '@server/types/api.js';
import styles from './LoadingOverlay.module.css';

interface Props {
  progress: GraphProgress | null;
}

const STEP_LABELS: Record<string, string> = {
  acquiring: 'Acquiring Data',
  transforming: 'Clustering Entities',
  ready: 'Rendering Graph',
};

export default function LoadingOverlay({ progress }: Props) {
  if (!progress || progress.step === 'ready') return null;

  const label = STEP_LABELS[progress.step] || progress.step;
  const pct =
    progress.spacesTotal > 0
      ? Math.round((progress.spacesCompleted / progress.spacesTotal) * 100)
      : 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.spinner} />
        <p className={styles.label}>{label}</p>
        <p className={styles.detail}>
          {progress.spacesCompleted} / {progress.spacesTotal} spaces ({pct}%)
        </p>
      </div>
    </div>
  );
}
