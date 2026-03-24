import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard.js';
import TopNavigation from '../components/navigation/TopNavigation.js';
import DashboardSpacePicker from '../components/dashboard/DashboardSpacePicker.js';
import DashboardFilters from '../components/dashboard/DashboardFilters.js';
import LoadingScreen from '../components/dashboard/LoadingScreen.js';
import DashboardPanel from '../components/dashboard/DashboardPanel.js';
import HeadlineMetrics from '../components/dashboard/HeadlineMetrics.js';
import ActivityTimeline from '../components/dashboard/ActivityTimeline.js';
import ContributorRanking from '../components/dashboard/ContributorRanking.js';
import EngagementQuality from '../components/dashboard/EngagementQuality.js';
import OrganizationBreakdown from '../components/dashboard/OrganizationBreakdown.js';
import SubspaceDistribution from '../components/dashboard/SubspaceDistribution.js';
import ContentTypeMix from '../components/dashboard/ContentTypeMix.js';
import WhiteboardMetrics from '../components/dashboard/WhiteboardMetrics.js';
import TopCallouts from '../components/dashboard/TopCallouts.js';
import DormantCallouts from '../components/dashboard/DormantCallouts.js';
import ExportButton from '../components/dashboard/ExportButton.js';
import styles from './Dashboard.module.css';

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [searchParams] = useSearchParams();
  const {
    dataset,
    filtered,
    loading,
    error,
    selectedSpaceId,
    filters,
    generate,
    setTimeRange,
    setPhaseId,
    setSubspaceId,
    setSubSubspaceId,
  } = useDashboard();

  // Pre-select from URL query param
  const querySpaceId = searchParams.get('space');
  useEffect(() => {
    if (querySpaceId && !selectedSpaceId && !loading) {
      generate(querySpaceId);
    }
  }, [querySpaceId, selectedSpaceId, loading, generate]);

  const handleSpaceSelect = (spaceId: string) => {
    generate(spaceId);
  };

  return (
    <div className={styles.layout}>
      <TopNavigation onLogout={onLogout} />

      <div className={styles.header}>
        <div className={styles.headerRow}>
          <DashboardSpacePicker
            selectedSpaceId={selectedSpaceId}
            onSelect={handleSpaceSelect}
            loading={loading}
          />
          {dataset && (
            <>
              {dataset.cacheInfo?.fromCache && (
                <span className={styles.cacheBadge}>
                  Cached
                  <button
                    className={styles.refreshBtn}
                    onClick={() => selectedSpaceId && generate(selectedSpaceId, true)}
                    disabled={loading}
                    title="Refresh data from Alkemio"
                  >
                    ↻
                  </button>
                </span>
              )}
              <ExportButton dataset={dataset} filtered={filtered} />
            </>
          )}
        </div>

        {dataset && (
          <DashboardFilters
            subspaceTree={dataset.subspaceTree}
            scopedPhases={filtered?.scopedPhases ?? dataset.phases}
            filters={filters}
            onTimeRangeChange={setTimeRange}
            onPhaseChange={setPhaseId}
            onSubspaceChange={setSubspaceId}
            onSubSubspaceChange={setSubSubspaceId}
          />
        )}
      </div>

      {error && (
        <div className={styles.error}>Failed to load dashboard: {error}</div>
      )}

      {!dataset && !loading && !error && (
        <div className={styles.placeholder}>
          Select a space to view analytics
        </div>
      )}

      {loading && !dataset && <LoadingScreen />}

      {(dataset || loading) && (
        <div className={styles.grid}>
          <DashboardPanel title="Headline Metrics" loading={loading} className={styles.fullWidth}>
            {filtered && <HeadlineMetrics metrics={filtered.headline} />}
          </DashboardPanel>

          <DashboardPanel title="Activity Over Time" loading={loading} className={styles.fullWidth}>
            {filtered && <ActivityTimeline timeline={filtered.timeline} callouts={filtered.callouts} />}
          </DashboardPanel>

          <DashboardPanel title="Top Contributors" loading={loading}>
            {filtered && <ContributorRanking contributors={filtered.contributors} />}
          </DashboardPanel>

          <DashboardPanel title="Engagement Quality" loading={loading}>
            {dataset && filtered && (
              <EngagementQuality
                headline={filtered.headline}
                members={dataset.members}
                contributors={filtered.contributors}
                timeline={filtered.timeline}
              />
            )}
          </DashboardPanel>

          <DashboardPanel title="Organizations" loading={loading}>
            {filtered && <OrganizationBreakdown organizations={filtered.organizations} />}
          </DashboardPanel>

          {dataset?.space.hasSubspaces && (
            <DashboardPanel title="Subspace Distribution" loading={loading}>
              {filtered && <SubspaceDistribution subspaces={filtered.subspaces} />}
            </DashboardPanel>
          )}

          <DashboardPanel title="Response Type Mix" loading={loading}>
            {filtered && <ContentTypeMix headline={filtered.headline} />}
          </DashboardPanel>

          <DashboardPanel title="Whiteboard Activity" loading={loading}>
            {filtered && <WhiteboardMetrics headline={filtered.headline} />}
          </DashboardPanel>

          <DashboardPanel title="Top Posts by Engagement" loading={loading}>
            {filtered && <TopCallouts callouts={filtered.callouts} />}
          </DashboardPanel>

          <DashboardPanel title="Dormant Posts" loading={loading}>
            {filtered && <DormantCallouts callouts={filtered.callouts} />}
          </DashboardPanel>
        </div>
      )}
    </div>
  );
}
