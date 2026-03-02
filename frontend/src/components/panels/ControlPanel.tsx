import { useMemo } from 'react';
import type { GraphDataset } from '@server/types/graph.js';
import type { ActivityPeriod } from '@server/types/graph.js';
import type { MapRegion } from '../map/MapOverlay.js';
import FilterControls from './FilterControls.js';
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
}: Props) {
  // Get L0 space nodes for scope chips
  const scopeSpaces = dataset.nodes.filter((n) => n.type === 'SPACE_L0');

  // Detect reduced-motion preference for toggle label
  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  return (
    <div className={styles.panel}>
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
        <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.25rem 0 0 1.5rem', lineHeight: 1.3 }}>
          Hide redundant parent-space edges when a person is also connected to a child space
        </p>
      </div>

      <div className={styles.section}>
        <h3 className={styles.heading}>Activity</h3>
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
        {hasActivityData && (
          <div className={styles.toggleRow} style={{ paddingLeft: '1.5rem' }}>
            <select
              value={activityPeriod}
              onChange={(e) => onActivityPeriodChange?.(e.target.value as ActivityPeriod)}
              disabled={!spaceActivityEnabled && !activityPulseEnabled}
              style={{ fontSize: '0.85rem', background: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '4px', padding: '2px 6px' }}
            >
              <option value="day">Past Day</option>
              <option value="week">Past Week</option>
              <option value="month">Past Month</option>
              <option value="allTime">All Time</option>
            </select>
          </div>
        )}
      </div>

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
    </div>
  );
}
