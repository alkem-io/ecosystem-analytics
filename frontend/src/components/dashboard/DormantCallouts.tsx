import { useState } from 'react';
import type { CalloutDetail } from '@server/types/dashboard.js';
import styles from './DormantCallouts.module.css';

interface DormantCalloutsProps {
  callouts: CalloutDetail[];
}

type ThresholdDays = 30 | 60 | 90;

export default function DormantCallouts({ callouts }: DormantCalloutsProps) {
  const [threshold, setThreshold] = useState<ThresholdDays>(30);

  const now = Date.now();
  const cutoff = new Date(now - threshold * 24 * 60 * 60 * 1000).toISOString();

  const dormant = callouts
    .filter((c) => {
      const lastDate = c.lastActivityDate ?? c.createdDate;
      return lastDate < cutoff;
    })
    .map((c) => {
      const lastDate = c.lastActivityDate ?? c.createdDate;
      const daysDormant = Math.floor((now - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
      return { ...c, daysDormant, lastDate };
    })
    .sort((a, b) => b.daysDormant - a.daysDormant);

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        {([30, 60, 90] as ThresholdDays[]).map((d) => (
          <button
            key={d}
            className={`${styles.chip} ${threshold === d ? styles.active : ''}`}
            onClick={() => setThreshold(d)}
          >
            {d}d
          </button>
        ))}
      </div>

      {dormant.length === 0 ? (
        <div className={styles.empty}>No dormant posts (last {threshold} days)</div>
      ) : (
        <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Post</th>
              <th className={styles.thRight}>Days Dormant</th>
              <th className={styles.th}>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {dormant.slice(0, 15).map((c) => (
              <tr key={c.id} className={styles.row}>
                <td className={styles.td}>
                  <div className={styles.calloutTitle}>{c.title}</div>
                  <div className={styles.phase}>{c.phaseName}</div>
                </td>
                <td className={styles.tdRight}>{c.daysDormant}</td>
                <td className={styles.td}>{formatDate(c.lastDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
