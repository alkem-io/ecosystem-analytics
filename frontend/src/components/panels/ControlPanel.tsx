import type { GraphDataset } from '@server/types/graph.js';
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
  showMap: boolean;
  onToggleMap: () => void;
  mapRegion: MapRegion;
  onMapRegionChange: (region: MapRegion) => void;
  onRemoveSpace?: (spaceId: string) => void;
}

export default function ControlPanel({
  dataset,
  showPeople,
  showOrganizations,
  showSpaces,
  onTogglePeople,
  onToggleOrganizations,
  onToggleSpaces,
  showMap,
  onToggleMap,
  mapRegion,
  onMapRegionChange,
  onRemoveSpace,
}: Props) {
  // Get L0 space nodes for scope chips
  const scopeSpaces = dataset.nodes.filter((n) => n.type === 'SPACE_L0');

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
      />

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
            <span className={styles.line} style={{ background: 'rgba(99,102,241,0.5)' }} /> Parent–Child
          </div>
          <div className={styles.legendItem}>
            <span className={styles.line} style={{ background: 'rgba(180,140,60,0.6)' }} /> Lead
          </div>
          <div className={styles.legendItem}>
            <span className={styles.line} style={{ background: 'rgba(140,160,180,0.4)' }} /> Member
          </div>
        </div>
      </div>
    </div>
  );
}
