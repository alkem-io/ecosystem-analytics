import type { ClusterMode } from '../graph/clustering.js';
import styles from './ClusterControls.module.css';

interface Props {
  mode: ClusterMode;
  onChange: (mode: ClusterMode) => void;
}

export default function ClusterControls({ mode, onChange }: Props) {
  return (
    <div className={styles.section}>
      <h3 className={styles.heading}>Cluster By</h3>
      <div className={styles.buttons}>
        <button
          className={`${styles.btn} ${mode === 'space' ? styles.active : ''}`}
          onClick={() => onChange('space')}
        >
          Space
        </button>
        <button
          className={`${styles.btn} ${mode === 'organization' ? styles.active : ''}`}
          onClick={() => onChange('organization')}
        >
          Org
        </button>
      </div>
    </div>
  );
}
