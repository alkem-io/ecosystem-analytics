import { useState, useEffect } from 'react';
import type { GraphNode, GraphDataset } from '@server/types/graph.js';
import type { SpaceSelectionItem } from '@server/types/api.js';
import { api } from '../../services/api.js';
import styles from './DetailsDrawer.module.css';

interface Props {
  node: GraphNode | null;
  dataset: GraphDataset;
  onClose: () => void;
  onExpandSpace?: (spaceId: string) => void;
}

export default function DetailsDrawer({ node, dataset, onClose, onExpandSpace }: Props) {
  const [relatedSpaces, setRelatedSpaces] = useState<SpaceSelectionItem[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  useEffect(() => {
    if (!node || (node.type !== 'USER' && node.type !== 'ORGANIZATION')) {
      setRelatedSpaces([]);
      return;
    }

    setLoadingRelated(true);
    const currentIds = dataset.spaces.join(',');
    api
      .get<SpaceSelectionItem[]>(`/api/spaces/${node.id}/related?currentSpaceIds=${currentIds}`)
      .then(setRelatedSpaces)
      .catch(() => setRelatedSpaces([]))
      .finally(() => setLoadingRelated(false));
  }, [node?.id, dataset.spaces]);

  if (!node) return null;

  // Count connections
  const connections = dataset.edges.filter(
    (e) => e.sourceId === node.id || e.targetId === node.id,
  );
  const memberCount = connections.filter((e) => e.type === 'MEMBER').length;
  const leadCount = connections.filter((e) => e.type === 'LEAD').length;
  const childCount = connections.filter((e) => e.type === 'CHILD').length;

  return (
    <div className={styles.drawer}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {node.avatarUrl && (
            <img src={node.avatarUrl} alt="" className={styles.avatar} />
          )}
          <div>
            <h2 className={styles.name}>{node.displayName || 'Unknown'}</h2>
            <span className={styles.typeBadge}>{node.type.replace('_', ' ')}</span>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close details">
          &times;
        </button>
      </div>

      {node.tagline && <p className={styles.tagline}>{node.tagline}</p>}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{connections.length}</span>
          <span className={styles.statLabel}>Connections</span>
        </div>
        {memberCount > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{memberCount}</span>
            <span className={styles.statLabel}>Member</span>
          </div>
        )}
        {leadCount > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{leadCount}</span>
            <span className={styles.statLabel}>Lead</span>
          </div>
        )}
        {childCount > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{childCount}</span>
            <span className={styles.statLabel}>Subspaces</span>
          </div>
        )}
      </div>

      {node.location && (node.location.city || node.location.country) && (
        <div className={styles.detail}>
          <span className={styles.detailLabel}>Location</span>
          <span>{[node.location.city, node.location.country].filter(Boolean).join(', ') || '—'}</span>
        </div>
      )}

      {node.url && (
        <a href={node.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
          Open in Alkemio
        </a>
      )}

      {/* Related Spaces — US3 expansion */}
      {(node.type === 'USER' || node.type === 'ORGANIZATION') && (
        <div className={styles.relatedSection}>
          <h3 className={styles.relatedHeading}>Related Spaces</h3>
          {loadingRelated && <p className={styles.relatedLoading}>Loading...</p>}
          {!loadingRelated && relatedSpaces.length === 0 && (
            <p className={styles.relatedEmpty}>No additional spaces available.</p>
          )}
          {relatedSpaces.map((space) => (
            <div key={space.id} className={styles.relatedItem}>
              <span className={styles.relatedName}>{space.displayName}</span>
              <button
                className={styles.addBtn}
                onClick={() => onExpandSpace?.(space.id)}
              >
                Add to graph
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
