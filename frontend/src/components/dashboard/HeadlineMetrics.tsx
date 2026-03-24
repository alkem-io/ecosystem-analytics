import type { HeadlineMetrics as HeadlineMetricsType } from '@server/types/dashboard.js';
import InfoTooltip from './InfoTooltip.js';
import styles from './HeadlineMetrics.module.css';

interface HeadlineMetricsProps {
  metrics: HeadlineMetricsType;
}

export default function HeadlineMetrics({ metrics }: HeadlineMetricsProps) {
  return (
    <div className={styles.grid}>
      <MetricCard
        label="Total Posts"
        value={metrics.totalCallouts}
        info="Number of posts (questions, discussions, or collection points) in this space and its subspaces."
      />
      <MetricCard
        label="Total Responses"
        value={metrics.totalContributions}
        info="Content items (posts, memos, links, whiteboards) added to posts by members. Does not include comments."
      />
      <MetricCard
        label="Total Comments"
        value={metrics.totalComments}
        info="Discussion messages posted on posts. Separate from responses."
      />
      <MetricCard
        label="Unique Contributors"
        value={metrics.totalUniqueContributors}
        info="Members who have made at least one response or comment."
      />
      <MetricCard
        label="Engagement Ratio"
        value={`${(metrics.engagementRatio * 100).toFixed(1)}%`}
        info="Percentage of members who have actively contributed. Calculated as unique contributors / total members."
      />
      <MetricCard
        label="Unanswered Posts"
        value={`${(metrics.unansweredCalloutPct * 100).toFixed(1)}%`}
        info="Percentage of posts that have received zero responses. May indicate questions or topics that need attention."
      />
      <MetricCard
        label="Avg Responses / Post"
        value={metrics.avgContributionsPerCallout.toFixed(1)}
        info="Average number of responses per post. Higher values indicate more active engagement with content."
      />
    </div>
  );
}

function MetricCard({ label, value, info }: { label: string; value: string | number; info: string }) {
  return (
    <div className={styles.card}>
      <InfoTooltip text={info}>
        <span className={styles.value}>{value}</span>
      </InfoTooltip>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
