import type { HeadlineMetrics, MemberInfo, ContributorDetail, TimelineBucket } from '@server/types/dashboard.js';
import InfoTooltip from './InfoTooltip.js';
import styles from './EngagementQuality.module.css';

interface EngagementQualityProps {
  headline: HeadlineMetrics;
  members: MemberInfo[];
  contributors: ContributorDetail[];
  timeline: TimelineBucket[];
}

export default function EngagementQuality({ headline, members, contributors, timeline }: EngagementQualityProps) {
  const activeMembers = members.filter((m) => m.isActive).length;
  const inactiveMembers = members.length - activeMembers;

  // Role breakdown
  const roleCounts = { admin: 0, lead: 0, member: 0 };
  for (const m of members) roleCounts[m.role]++;

  // Contributor concentration (FR-024): top 5 share
  const topN = 5;
  const topContributions = contributors
    .slice(0, topN)
    .reduce((sum, c) => sum + c.totalContributions, 0);
  const concentrationPct =
    headline.totalContributions > 0
      ? (topContributions / headline.totalContributions) * 100
      : 0;

  // Cross-active contributors (FR-026): active in 2+ subspaces
  const crossActive = contributors.filter((c) => c.activeSubspaceCount >= 2).length;

  // Return rate (FR-025): compare consecutive months
  const returnRate = computeReturnRate(timeline);

  return (
    <div className={styles.grid}>
      <div className={styles.metric}>
        <InfoTooltip text="Percentage of members who have actively contributed or commented. Higher = more engaged community.">
          <span className={styles.value}>{(headline.engagementRatio * 100).toFixed(0)}%</span>
        </InfoTooltip>
        <span className={styles.label}>Engagement Ratio</span>
        <span className={styles.detail}>
          {activeMembers} active / {members.length} members
        </span>
      </div>

      <div className={styles.metric}>
        <InfoTooltip text="Average number of comments per response. Shows how much discussion responses generate.">
          <span className={styles.value}>{headline.avgCommentsPerContribution.toFixed(1)}</span>
        </InfoTooltip>
        <span className={styles.label}>Avg Comments / Response</span>
      </div>

      <div className={styles.metric}>
        <InfoTooltip text="Share of all responses produced by the top 5 contributors. High concentration may indicate over-reliance on a few members.">
          <span className={styles.value}>{concentrationPct.toFixed(0)}%</span>
        </InfoTooltip>
        <span className={styles.label}>Top {topN} Concentration</span>
        <span className={styles.detail}>
          of all responses
        </span>
      </div>

      <div className={styles.metric}>
        <InfoTooltip text="Contributors who are active in 2 or more subspaces. Indicates cross-pollination across the space.">
          <span className={styles.value}>{crossActive}</span>
        </InfoTooltip>
        <span className={styles.label}>Cross-Active Contributors</span>
        <span className={styles.detail}>active in 2+ subspaces</span>
      </div>

      {returnRate !== null && (
        <div className={styles.metric}>
          <InfoTooltip text="Average percentage of contributors who return the following month. Higher = better retention.">
            <span className={styles.value}>{returnRate.toFixed(0)}%</span>
          </InfoTooltip>
          <span className={styles.label}>Contributor Return Rate</span>
          <span className={styles.detail}>month-over-month</span>
        </div>
      )}

      <div className={styles.metric}>
        <InfoTooltip text="Breakdown of members by role: admins, leads, and regular members.">
          <span className={styles.value}>
            {roleCounts.admin} / {roleCounts.lead} / {roleCounts.member}
          </span>
        </InfoTooltip>
        <span className={styles.label}>Admin / Lead / Member</span>
      </div>
    </div>
  );
}

/** Compute average month-over-month contributor retention */
function computeReturnRate(timeline: TimelineBucket[]): number | null {
  if (timeline.length < 2) return null;
  // Simple approximation: average (uniqueContributors - newContributors) / previous uniqueContributors
  let totalRate = 0;
  let count = 0;
  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1].uniqueContributors;
    if (prev === 0) continue;
    const returning = timeline[i].uniqueContributors - timeline[i].newContributors;
    totalRate += Math.max(0, returning) / prev;
    count++;
  }
  return count > 0 ? (totalRate / count) * 100 : null;
}
