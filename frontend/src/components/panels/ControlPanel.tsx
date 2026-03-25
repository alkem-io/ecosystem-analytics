import { useMemo } from 'react';
import type { GraphDataset } from '@server/types/graph.js';
import type { ActivityPeriod } from '@server/types/graph.js';
import type { MapRegion } from '../map/MapOverlay.js';
import type { ViewMode, HierarchySizeMetric, ChordMode } from '../../types/views.js';
import FilterControls from './FilterControls.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './ControlPanel.module.css';

interface Props {
  dataset: GraphDataset;
  showPeople: boolean;
  showOrganizations: boolean;
  showSpaces: boolean;
  onTogglePeople: () => void;
  onToggleOrganizations: () => void;
  onToggleSpaces: () => void;
  showMembers?: boolean;
  showLeads?: boolean;
  showAdmins?: boolean;
  onToggleMembers?: () => void;
  onToggleLeads?: () => void;
  onToggleAdmins?: () => void;
  showMap: boolean;
  onToggleMap: () => void;
  mapRegion: MapRegion;
  onMapRegionChange: (region: MapRegion) => void;
  onRemoveSpace?: (spaceId: string) => void;
  activityPulseEnabled: boolean;
  onToggleActivityPulse: () => void;
  hasActivityData: boolean;
  spaceActivityEnabled?: boolean;
  onToggleSpaceActivity?: () => void;
  activityPeriod?: ActivityPeriod;
  onActivityPeriodChange?: (period: ActivityPeriod) => void;
  showPublic?: boolean;
  showPrivate?: boolean;
  onTogglePublic?: () => void;
  onTogglePrivate?: () => void;
  directConnectionsOnly?: boolean;
  onToggleDirectConnections?: () => void;
  /** 009: Active view mode for conditional controls */
  activeView?: ViewMode;
  /** 009: Hierarchy sizing metric for treemap/sunburst */
  sizeMetric?: HierarchySizeMetric;
  onSizeMetricChange?: (metric: HierarchySizeMetric) => void;
  /** 009: Chord diagram mode */
  chordMode?: ChordMode;
  onChordModeChange?: (mode: ChordMode) => void;
  /** 009: Chord grouping level */
  chordGroupLevel?: 'L0' | 'L1';
  onChordGroupLevelChange?: (level: 'L0' | 'L1') => void;
  /** 009: Sunburst show member leaves */
  showMemberLeaves?: boolean;
  onToggleMemberLeaves?: () => void;
  /** 009: Timeline chart type */
  timelineChartType?: 'stacked' | 'stream';
  onTimelineChartTypeChange?: (type: 'stacked' | 'stream') => void;
  /** 014: Collapsible panel */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function ControlPanel({
  dataset,
  showPeople,
  showOrganizations,
  showSpaces,
  onTogglePeople,
  onToggleOrganizations,
  onToggleSpaces,
  showMembers,
  showLeads,
  showAdmins,
  onToggleMembers,
  onToggleLeads,
  onToggleAdmins,
  showMap,
  onToggleMap,
  mapRegion,
  onMapRegionChange,
  onRemoveSpace,
  activityPulseEnabled,
  onToggleActivityPulse,
  hasActivityData,
  spaceActivityEnabled,
  onToggleSpaceActivity,
  activityPeriod = 'allTime',
  onActivityPeriodChange,
  showPublic,
  showPrivate,
  onTogglePublic,
  onTogglePrivate,
  directConnectionsOnly = false,
  onToggleDirectConnections,
  activeView,
  sizeMetric,
  onSizeMetricChange,
  chordMode,
  onChordModeChange,
  chordGroupLevel,
  onChordGroupLevelChange,
  showMemberLeaves,
  onToggleMemberLeaves,
  timelineChartType,
  onTimelineChartTypeChange,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  // Get L0 space nodes for scope chips
  const scopeSpaces = dataset.nodes.filter((n) => n.type === 'SPACE_L0');

  // Detect reduced-motion preference for toggle label
  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  /** Whether the current view is the force graph or temporal force */
  const isForceView = !activeView || activeView === 'force-graph' || activeView === 'temporal-force';
  /** Whether the active view uses activity period for sizing/display */
  const usesActivityPeriod = isForceView || activeView === 'treemap' || activeView === 'sunburst';

  return (
    <div className={`${styles.panel} ${collapsed ? styles.panelCollapsed : ''}`}>
      {onToggleCollapse && (
        <button
          className={styles.collapseToggle}
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand control panel' : 'Collapse control panel'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      )}
      {collapsed ? null : (
        <>
      {/* ─── Scope — always visible ─── */}
      <div className={styles.section}>
        <h3 className={styles.heading}>Scope</h3>
        <div className={styles.chips}>
          {scopeSpaces.map((s) => (
            <span key={s.id} className={styles.chip}>
              {s.displayName}
              {onRemoveSpace && scopeSpaces.length > 1 && (
                <button
                  className={styles.chipRemove}
                  onClick={() => onRemoveSpace(s.id)}
                  aria-label={`Remove ${s.displayName}`}
                >
                  &times;
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* ─── Filters — Force Graph / Temporal only ─── */}
      {isForceView && (
        <FilterControls
          dataset={dataset}
          showPeople={showPeople}
          showOrganizations={showOrganizations}
          showSpaces={showSpaces}
          onTogglePeople={onTogglePeople}
          onToggleOrganizations={onToggleOrganizations}
          onToggleSpaces={onToggleSpaces}
          showMembers={showMembers}
          showLeads={showLeads}
          showAdmins={showAdmins}
          onToggleMembers={onToggleMembers}
          onToggleLeads={onToggleLeads}
          onToggleAdmins={onToggleAdmins}
          showPublic={showPublic}
          showPrivate={showPrivate}
          onTogglePublic={onTogglePublic}
          onTogglePrivate={onTogglePrivate}
        />
      )}

      {/* ─── Display — Force Graph only ─── */}
      {isForceView && (
        <div className={styles.section}>
          <h3 className={styles.heading}>Display</h3>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={directConnectionsOnly}
              onChange={onToggleDirectConnections}
            />
            <span>Direct connections only</span>
          </label>
          <p className={styles.sectionHint}>
            Hide redundant parent-space edges when a person is also connected to a child space
          </p>
        </div>
      )}

      {/* ─── Activity — Force Graph + views that use activity period ─── */}
      {usesActivityPeriod && (
        <div className={styles.section}>
          <h3 className={styles.heading}>Activity</h3>
          {isForceView && (
            <>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={activityPulseEnabled}
                  onChange={onToggleActivityPulse}
                  disabled={!hasActivityData}
                />
                <span>{!hasActivityData ? 'Activity data unavailable' : (prefersReducedMotion ? 'Activity Indicators' : 'Activity Pulse')}</span>
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={spaceActivityEnabled ?? false}
                  onChange={onToggleSpaceActivity}
                  disabled={!hasActivityData}
                />
                <span>{!hasActivityData ? 'Activity data unavailable' : 'Space Activity'}</span>
              </label>
            </>
          )}
          {hasActivityData && (
            <div className={styles.toggleRow} style={{ paddingLeft: isForceView ? '1.5rem' : 0 }}>
              <label style={{ fontSize: '12px' }}>Time period</label>
              <select
                className={styles.viewSelect}
                value={activityPeriod}
                onChange={(e) => onActivityPeriodChange?.(e.target.value as ActivityPeriod)}
                disabled={isForceView && !spaceActivityEnabled && !activityPulseEnabled}
                style={{ marginLeft: 'auto' }}
              >
                <option value="day">Past Day</option>
                <option value="week">Past Week</option>
                <option value="month">Past Month</option>
                <option value="allTime">All Time</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* ─── Map — Force Graph only ─── */}
      {isForceView && (
        <div className={styles.section}>
          <h3 className={styles.heading}>Map</h3>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={showMap} onChange={onToggleMap} />
            <span>Show map overlay</span>
          </label>
          {showMap && (
            <>
              <select
                className={styles.regionSelect}
                value={mapRegion}
                onChange={(e) => onMapRegionChange(e.target.value as MapRegion)}
              >
                <option value="europe">Europe</option>
                <option value="world">World</option>
                <option value="netherlands">Netherlands</option>
              </select>
              <p className={styles.mapHint}>
                Nodes with location data snap to geographic position
              </p>
              <p className={styles.mapStats}>
                {dataset.nodes.filter((n) => n.location?.latitude != null && n.location?.longitude != null).length} with location
                {' / '}
                {dataset.nodes.filter((n) => !n.location?.latitude || !n.location?.longitude).length} without
              </p>
            </>
          )}
        </div>
      )}

      {/* ─── 009: View-specific Controls ─────────────────────── */}
      {(activeView === 'treemap' || activeView === 'sunburst') && onSizeMetricChange && (
        <div className={styles.section}>
          <h3 className={styles.heading}>Hierarchy</h3>
          <div className={styles.toggleRow}>
            <label style={{ fontSize: '12px' }}>Size by</label>
            <select
              className={styles.viewSelect}
              value={sizeMetric ?? 'activity'}
              onChange={(e) => onSizeMetricChange(e.target.value as HierarchySizeMetric)}
              style={{ marginLeft: 'auto' }}
            >
              <option value="members">Members</option>
              <option value="activity">Activity</option>
            </select>
          </div>
          {activeView === 'sunburst' && onToggleMemberLeaves && (
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={showMemberLeaves ?? false}
                onChange={onToggleMemberLeaves}
              />
              <span>Show member arcs</span>
            </label>
          )}
        </div>
      )}

      {activeView === 'chord' && onChordModeChange && (
        <div className={styles.section}>
          <h3 className={styles.heading}>Chord</h3>
          <div className={styles.toggleRow}>
            <label style={{ fontSize: '12px' }}>Mode</label>
            <select
              className={styles.viewSelect}
              value={chordMode ?? 'shared-members'}
              onChange={(e) => onChordModeChange(e.target.value as ChordMode)}
              style={{ marginLeft: 'auto' }}
            >
              <option value="shared-members">Shared Members</option>
              <option value="shared-tags">Shared Tags</option>
            </select>
          </div>
          {onChordGroupLevelChange && (
            <div className={styles.toggleRow}>
              <label style={{ fontSize: '12px' }}>Group by</label>
              <select
                className={styles.viewSelect}
                value={chordGroupLevel ?? 'L0'}
                onChange={(e) => onChordGroupLevelChange(e.target.value as 'L0' | 'L1')}
                style={{ marginLeft: 'auto' }}
              >
                <option value="L0">L0 Spaces</option>
                <option value="L1">L1 Subspaces</option>
              </select>
            </div>
          )}
        </div>
      )}

      {activeView === 'timeline' && onTimelineChartTypeChange && (
        <div className={styles.section}>
          <h3 className={styles.heading}>Timeline</h3>
          <div className={styles.toggleRow}>
            <label style={{ fontSize: '12px' }}>Chart type</label>
            <select
              className={styles.viewSelect}
              value={timelineChartType ?? 'stacked'}
              onChange={(e) => onTimelineChartTypeChange(e.target.value as 'stacked' | 'stream')}
              style={{ marginLeft: 'auto' }}
            >
              <option value="stacked">Stacked Area</option>
              <option value="stream">Streamgraph</option>
            </select>
          </div>
        </div>
      )}

      {/* ─── Legend — Force Graph / Temporal only ─── */}
      {isForceView && (
        <div className={styles.section}>
          <h3 className={styles.heading}>Legend</h3>
          <div className={styles.legendGroup}>
            <span className={styles.legendGroupLabel}>Nodes</span>
            <div className={styles.legendItem}>
              <span className={styles.dot} style={{ background: 'var(--node-space-l0)' }} /> Space (L0)
            </div>
            <div className={styles.legendItem}>
              <span className={styles.dot} style={{ background: 'var(--node-space-l1)' }} /> Subspace (L1)
            </div>
            <div className={styles.legendItem}>
              <span className={styles.dot} style={{ background: 'var(--node-space-l2)' }} /> Space (L2)
            </div>
            <div className={styles.legendItem}>
              <span className={styles.dot} style={{ background: 'var(--node-organization)' }} /> Organization
            </div>
            <div className={styles.legendItem}>
              <span className={styles.dot} style={{ background: 'var(--node-user)' }} /> Person
            </div>
          </div>
          <div className={styles.legendGroup}>
            <span className={styles.legendGroupLabel}>Connections</span>
            <div className={styles.legendItem}>
              <span className={styles.line} style={{ background: 'rgba(67,56,202,0.6)' }} /> Parent–Child
            </div>
            <div className={styles.legendItem}>
              <span className={styles.line} style={{ background: 'rgba(234,88,12,0.6)' }} /> Lead
            </div>
            <div className={styles.legendItem}>
              <span className={styles.line} style={{ background: 'rgba(13,148,136,0.6)' }} /> Admin
            </div>
            <div className={styles.legendItem}>
              <span className={styles.line} style={{ background: 'rgba(148,163,184,0.35)' }} /> Member
            </div>
            <div className={styles.legendItem}>
              <span className={styles.line} style={{ background: '#7dd3fc' }} /> 2nd-degree
            </div>
          </div>
          <div className={styles.legendGroup}>
            <span className={styles.legendGroupLabel}>Visibility</span>
            <div className={styles.legendItem}>
              <span className={styles.legendIcon}>🔒</span> Private
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
