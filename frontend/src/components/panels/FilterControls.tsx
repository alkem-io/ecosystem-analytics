import { useMemo } from 'react';
import type { GraphDataset } from '@server/types/graph.js';
import styles from './FilterControls.module.css';

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
  showPublic?: boolean;
  showPrivate?: boolean;
  onTogglePublic?: () => void;
  onTogglePrivate?: () => void;
}

export default function FilterControls({
  dataset,
  showPeople,
  showOrganizations,
  showSpaces,
  onTogglePeople,
  onToggleOrganizations,
  onToggleSpaces,
  showMembers = true,
  showLeads = true,
  showAdmins = true,
  onToggleMembers,
  onToggleLeads,
  onToggleAdmins,
  showPublic = true,
  showPrivate = true,
  onTogglePublic,
  onTogglePrivate,
}: Props) {
  const peopleCount = dataset.nodes.filter((n) => n.type === 'USER').length;
  const orgCount = dataset.nodes.filter((n) => n.type === 'ORGANIZATION').length;
  const spaceCount = dataset.nodes.filter((n) => n.type === 'SPACE_L0' || n.type === 'SPACE_L1' || n.type === 'SPACE_L2').length;

  // T026+T027: Compute unique user counts per role type (memoized)
  const roleCounts = useMemo(() => {
    const memberIds = new Set<string>();
    const leadIds = new Set<string>();
    const adminIds = new Set<string>();
    const userNodeIds = new Set(dataset.nodes.filter((n) => n.type === 'USER').map((n) => n.id));

    for (const edge of dataset.edges) {
      // Only count edges where source is a user
      if (!userNodeIds.has(edge.sourceId)) continue;
      if (edge.type === 'MEMBER') memberIds.add(edge.sourceId);
      else if (edge.type === 'LEAD') leadIds.add(edge.sourceId);
      else if (edge.type === 'ADMIN') adminIds.add(edge.sourceId);
    }
    return { members: memberIds.size, leads: leadIds.size, admins: adminIds.size };
  }, [dataset]);

  // Compute public/private space counts (memoized)
  const visibilityCounts = useMemo(() => {
    let publicCount = 0;
    let privateCount = 0;
    for (const n of dataset.nodes) {
      if (n.type === 'SPACE_L0' || n.type === 'SPACE_L1' || n.type === 'SPACE_L2') {
        if (n.privacyMode === 'PRIVATE') privateCount++;
        else publicCount++;
      }
    }
    return { public: publicCount, private: privateCount };
  }, [dataset]);

  return (
    <div className={styles.section}>
      <h3 className={styles.heading}>Filters</h3>
      <label className={styles.toggle}>
        <input type="checkbox" checked={showSpaces} onChange={onToggleSpaces} />
        <span>Spaces ({spaceCount})</span>
      </label>
      {onTogglePublic && onTogglePrivate && (
        <div className={`${styles.roleFilters} ${!showSpaces ? styles.roleFiltersDisabled : ''}`}>
          <span className={styles.heading} style={{ fontSize: '0.75rem', marginTop: 4 }}>Visibility</span>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showPublic}
              onChange={onTogglePublic}
              disabled={!showSpaces}
            />
            <span>Public ({visibilityCounts.public})</span>
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showPrivate}
              onChange={onTogglePrivate}
              disabled={!showSpaces}
            />
            <span>Private ({visibilityCounts.private})</span>
          </label>
        </div>
      )}
      <label className={styles.toggle}>
        <input type="checkbox" checked={showPeople} onChange={onTogglePeople} />
        <span>People ({peopleCount})</span>
      </label>
      {onToggleMembers && onToggleLeads && onToggleAdmins && (
        <div className={`${styles.roleFilters} ${!showPeople ? styles.roleFiltersDisabled : ''}`}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showMembers}
              onChange={onToggleMembers}
              disabled={!showPeople}
            />
            <span>Members ({roleCounts.members})</span>
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showLeads}
              onChange={onToggleLeads}
              disabled={!showPeople}
            />
            <span>Leads ({roleCounts.leads})</span>
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showAdmins}
              onChange={onToggleAdmins}
              disabled={!showPeople}
            />
            <span>Admins ({roleCounts.admins})</span>
          </label>
        </div>
      )}
      <label className={styles.toggle}>
        <input type="checkbox" checked={showOrganizations} onChange={onToggleOrganizations} />
        <span>Organizations ({orgCount})</span>
      </label>
    </div>
  );
}
