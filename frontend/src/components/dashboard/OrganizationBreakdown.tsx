import type { OrganizationActivity } from '@server/types/dashboard.js';
import styles from './OrganizationBreakdown.module.css';

interface OrganizationBreakdownProps {
  organizations: OrganizationActivity[];
}

export default function OrganizationBreakdown({ organizations }: OrganizationBreakdownProps) {
  const sorted = [...organizations].sort((a, b) => b.totalContributions - a.totalContributions);

  if (sorted.length === 0) {
    return <div className={styles.empty}>No organization data</div>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.table}>
        <div className={styles.header}>
          <span>Organization</span>
          <span>Members</span>
          <span>Active</span>
          <span>Contributions</span>
        </div>
        {sorted.map((org) => (
          <div key={org.organizationId} className={styles.row}>
            <span className={styles.name}>{org.displayName}</span>
            <span className={styles.num}>{org.memberCount}</span>
            <span className={styles.num}>{org.activeContributorCount}</span>
            <span className={styles.num}>{org.totalContributions}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
