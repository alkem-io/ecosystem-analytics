import type { ReactNode } from 'react';
import styles from './DashboardPanel.module.css';

interface DashboardPanelProps {
  title: string;
  loading?: boolean;
  error?: string | null;
  empty?: string | null;
  className?: string;
  children: ReactNode;
}

export default function DashboardPanel({ title, loading, error, empty, className, children }: DashboardPanelProps) {
  return (
    <div className={`${styles.panel} ${className ?? ''}`}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.content}>
        {loading ? (
          <div className={styles.skeleton}>
            <div className={styles.skeletonBar} />
            <div className={styles.skeletonBar} />
            <div className={styles.skeletonBar} />
          </div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : empty ? (
          <div className={styles.empty}>{empty}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
