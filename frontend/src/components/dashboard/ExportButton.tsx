import type { DashboardDataset } from '@server/types/dashboard.js';
import type { FilteredDashboard } from '../../hooks/useDashboard.js';
import styles from './ExportButton.module.css';

interface ExportButtonProps {
  dataset: DashboardDataset;
  filtered: FilteredDashboard | null;
}

export default function ExportButton({ dataset, filtered }: ExportButtonProps) {
  const handleExport = () => {
    const sections: string[] = [];
    const data = filtered ?? {
      headline: dataset.headline,
      callouts: dataset.callouts,
      contributors: dataset.contributors,
      timeline: dataset.timeline,
    };

    // Headline metrics
    sections.push('=== Headline Metrics ===');
    sections.push(
      [
        'Metric,Value',
        `Total Posts,${data.headline.totalCallouts}`,
        `Total Responses,${data.headline.totalContributions}`,
        `Total Comments,${data.headline.totalComments}`,
        `Unique Contributors,${data.headline.totalUniqueContributors}`,
        `Total Members,${data.headline.totalMembers}`,
        `Engagement Ratio,${(data.headline.engagementRatio * 100).toFixed(1)}%`,
        `Unanswered Post %,${(data.headline.unansweredCalloutPct * 100).toFixed(1)}%`,
        `Avg Responses/Post,${data.headline.avgContributionsPerCallout.toFixed(1)}`,
        `Posts,${data.headline.contributionsByType.post}`,
        `Memos,${data.headline.contributionsByType.memo}`,
        `Links,${data.headline.contributionsByType.link}`,
        `Whiteboards,${data.headline.contributionsByType.whiteboard}`,
      ].join('\n'),
    );

    // Contributors
    sections.push('\n=== Top Contributors ===');
    sections.push('Name,Role,Organization,Responses,Comments,Active Subspaces');
    for (const c of data.contributors.slice(0, 50)) {
      sections.push(
        [
          csvEscape(c.displayName),
          c.role,
          csvEscape(c.organizationName ?? ''),
          c.totalContributions,
          c.totalComments,
          c.activeSubspaceCount,
        ].join(','),
      );
    }

    // Posts
    sections.push('\n=== Posts ===');
    sections.push('Title,Phase,Responses,Comments,Engagement,Last Activity');
    for (const c of data.callouts) {
      sections.push(
        [
          csvEscape(c.title),
          csvEscape(c.phaseName),
          c.contributionCount,
          c.commentCount,
          c.totalEngagement,
          c.lastActivityDate ?? '',
        ].join(','),
      );
    }

    // Timeline
    sections.push('\n=== Timeline ===');
    sections.push('Period,Responses,Posts,Memos,Links,Whiteboards,Comments,Unique Contributors,New Contributors');
    for (const t of data.timeline) {
      sections.push(
        [
          t.period,
          t.contributions,
          t.byType.post,
          t.byType.memo,
          t.byType.link,
          t.byType.whiteboard,
          t.comments,
          t.uniqueContributors,
          t.newContributors,
        ].join(','),
      );
    }

    const csv = sections.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-${dataset.space.nameId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button className={styles.button} onClick={handleExport} title="Export dashboard data as CSV">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M8 1v9M8 10L5 7M8 10l3-3M2 12v1.5A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5V12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Export CSV
    </button>
  );
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
