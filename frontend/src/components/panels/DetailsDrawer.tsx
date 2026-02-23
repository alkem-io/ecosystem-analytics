import { useState, useEffect, useMemo } from 'react';
import type { GraphNode, GraphDataset } from '@server/types/graph.js';
import type { SpaceSelectionItem } from '@server/types/api.js';
import { api } from '../../services/api.js';
import { getToken } from '../../services/auth.js';
import styles from './DetailsDrawer.module.css';

/** Convert an Alkemio private storage URL to a proxied URL that includes auth */
function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('/api/private/')) {
    const token = getToken();
    return `/api/image-proxy?url=${encodeURIComponent(url)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  }
  return url;
}

interface Props {
  node: GraphNode | null;
  dataset: GraphDataset;
  onClose: () => void;
  onExpandSpace?: (spaceId: string) => void;
  isPreview?: boolean;
}

export default function DetailsDrawer({ node, dataset, onClose, onExpandSpace, isPreview = false }: Props) {
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

  // For space nodes, resolve the L0 ancestor to show its banner
  const isSpace = node.type === 'SPACE_L0' || node.type === 'SPACE_L1' || node.type === 'SPACE_L2';

  // Walk up the parentSpaceId chain to find the L0 root space
  const l0Space = useMemo(() => {
    if (!isSpace) return null;
    if (node.type === 'SPACE_L0') return node;
    let current: GraphNode | undefined = dataset.nodes.find((n) => n.id === node.parentSpaceId);
    // If current is L1, go one more level up to L0
    if (current?.type === 'SPACE_L1' && current.parentSpaceId) {
      current = dataset.nodes.find((n) => n.id === current!.parentSpaceId);
    }
    return current ?? null;
  }, [isSpace, node, dataset.nodes]);

  const bannerUrl = l0Space?.bannerUrl ?? null;

  return (
    <div className={`${styles.drawer} ${isPreview ? styles.drawerPreview : ''}`}>
      {/* Banner image — always shows L0 parent banner, full width */}
      {isSpace && bannerUrl && (
        <div className={styles.bannerWrap}>
          <img src={proxyImageUrl(bannerUrl) ?? undefined} alt="" className={styles.banner} />
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {node.avatarUrl && (
            <img src={proxyImageUrl(node.avatarUrl) ?? undefined} alt="" className={styles.avatar} />
          )}
          <div>
            <h2 className={styles.name}>{node.displayName || 'Unknown'}</h2>
            <span className={styles.typeBadge}>{node.type.replace('_', ' ')}</span>
          </div>
        </div>
        {!isPreview && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close details">
            &times;
          </button>
        )}
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

      {/* Full details only shown when not in preview (hover) mode */}
      {!isPreview && (
        <>
          <div className={styles.detail}>
            <span className={styles.detailLabel}>Location</span>
            <span>
              {node.location && (node.location.city || node.location.country)
                ? <>
                    {[node.location.city, node.location.country].filter(Boolean).join(', ')}
                    {node.location.latitude != null && node.location.longitude != null && (
                      <> ({node.location.latitude.toFixed(4)}, {node.location.longitude.toFixed(4)})</>
                    )}
                  </>
                : <em>&lt;not set&gt;</em>
              }
            </span>
          </div>

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
        </>
      )}

      {isPreview && (
        <p className={styles.previewHint}>Click node to lock details</p>
      )}
    </div>
  );
}
