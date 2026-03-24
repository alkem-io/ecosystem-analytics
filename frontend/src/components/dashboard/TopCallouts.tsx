import type { CalloutDetail } from '@server/types/dashboard.js';
import styles from './TopCallouts.module.css';

interface TopCalloutsProps {
  callouts: CalloutDetail[];
}

export default function TopCallouts({ callouts }: TopCalloutsProps) {
  const top = [...callouts]
    .sort((a, b) => b.totalEngagement - a.totalEngagement)
    .slice(0, 10);

  if (top.length === 0) {
    return <div className={styles.empty}>No posts to display</div>;
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
        <tr>
          <th className={styles.th}>Post</th>
          <th className={styles.thRight}>Responses</th>
          <th className={styles.thRight}>Comments</th>
          <th className={styles.thRight}>Engagement</th>
          <th className={styles.th}>Last Activity</th>
        </tr>
      </thead>
      <tbody>
        {top.map((c) => (
          <tr key={c.id} className={styles.row}>
            <td className={styles.td}>
              <div className={styles.calloutTitle}>{c.title}</div>
              <div className={styles.phase}>{c.phaseName}</div>
            </td>
            <td className={styles.tdRight}>{c.contributionCount}</td>
            <td className={styles.tdRight}>{c.commentCount}</td>
            <td className={styles.tdRight}>{c.totalEngagement}</td>
            <td className={styles.td}>
              {c.lastActivityDate ? formatDate(c.lastActivityDate) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
      </table>
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
