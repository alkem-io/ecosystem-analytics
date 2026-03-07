import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { GraphNode, GraphDataset, ActivityPeriod } from '@server/types/graph.js';
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
  onNodeSelect?: (node: GraphNode) => void;
  isPreview?: boolean;
  showPeople?: boolean;
  showOrganizations?: boolean;
  showSpaces?: boolean;
  activityPeriod?: ActivityPeriod;
}

export default function DetailsDrawer({ node, dataset, onClose, onExpandSpace, onNodeSelect, isPreview = false, showPeople = true, showOrganizations = true, showSpaces = true, activityPeriod = 'allTime' }: Props) {
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

  // Filter nodes by current visibility toggles — same as the graph
  const visibleNodeIds = new Set(
    dataset.nodes
      .filter((n) => {
        if (n.type === 'USER' && !showPeople) return false;
        if (n.type === 'ORGANIZATION' && !showOrganizations) return false;
        if ((n.type === 'SPACE_L0' || n.type === 'SPACE_L1' || n.type === 'SPACE_L2') && !showSpaces) return false;
        return true;
      })
      .map((n) => n.id),
  );

  // Only include edges where both endpoints are visible
  const connections = dataset.edges.filter(
    (e) =>
      (e.sourceId === node.id || e.targetId === node.id) &&
      visibleNodeIds.has(e.sourceId) &&
      visibleNodeIds.has(e.targetId),
  );

  // Build a map of connected nodes with their edge type — deduplicate by node ID
  // When multiple edges exist to the same node (e.g. across scope groups), keep
  // the highest-priority edge type: LEAD > CHILD > MEMBER
  const nodeById = new Map(dataset.nodes.map((n) => [n.id, n]));
  const edgePriority: Record<string, number> = { LEAD: 3, CHILD: 2, MEMBER: 1 };
  const connectionMap = new Map<string, { node: GraphNode; edgeType: string }>();

  for (const e of connections) {
    const otherId = e.sourceId === node.id ? e.targetId : e.sourceId;
    const otherNode = nodeById.get(otherId);
    if (!otherNode) continue;
    const existing = connectionMap.get(otherId);
    if (!existing || (edgePriority[e.type] ?? 0) > (edgePriority[existing.edgeType] ?? 0)) {
      connectionMap.set(otherId, { node: otherNode, edgeType: e.type });
    }
  }

  const directConnections = Array.from(connectionMap.values());

  // Stats by connected node type
  const spaceCount = directConnections.filter((c) =>
    c.node.type === 'SPACE_L0' || c.node.type === 'SPACE_L1' || c.node.type === 'SPACE_L2'
  ).length;
  const orgCount = directConnections.filter((c) => c.node.type === 'ORGANIZATION').length;
  const peopleCount = directConnections.filter((c) => c.node.type === 'USER').length;

  // Sort: spaces first (child edges), then orgs, then people
  const sortedConnections = [...directConnections].sort((a, b) => {
    const typeOrder: Record<string, number> = { SPACE_L0: 0, SPACE_L1: 1, SPACE_L2: 2, ORGANIZATION: 3, USER: 4 };
    return (typeOrder[a.node.type] ?? 5) - (typeOrder[b.node.type] ?? 5);
  });

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

  const bannerUrl = l0Space?.bannerUrl ?? node.bannerUrl ?? null;
  const proxiedBanner = proxyImageUrl(bannerUrl);

  return (
    <div className={`${styles.drawer} ${isPreview ? styles.drawerPreview : ''}`}>
      {/* Banner image — always shows L0 parent banner, full width */}
      {isSpace && proxiedBanner && (
        <div className={styles.bannerWrap}>
          <img src={proxiedBanner} alt="" className={styles.banner} />
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
            {(node.privacyMode === 'PRIVATE' || node.restricted) && (
              <span className={styles.typeBadge} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                🔒 {node.restricted ? 'Restricted' : 'Private'}
              </span>
            )}
          </div>
        </div>
        {!isPreview && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close details">
            &times;
          </button>
        )}
      </div>

      {node.tagline && <p className={styles.tagline}>{node.tagline}</p>}

      {node.restricted && (
        <p className={styles.restrictedNotice}>
          You do not have access to view the full contents of this space.
        </p>
      )}

      {/* Organization enriched profile — shown in both preview and full modes */}
      {node.type === 'ORGANIZATION' && (
        <>
          {node.description && (
            <div className={styles.description}>
              <ReactMarkdown>{isPreview && node.description.length > 150 ? node.description.slice(0, 150) + '…' : node.description}</ReactMarkdown>
            </div>
          )}

          {/* Quick info row for orgs — compact metadata */}
          <div className={styles.orgMeta}>
            {node.owner && (
              <div className={styles.orgMetaItem}>
                <span className={styles.orgMetaLabel}>Owner</span>
                <span className={styles.orgMetaValue}>{node.owner}</span>
              </div>
            )}
            {node.associateCount != null && node.associateCount > 0 && (
              <div className={styles.orgMetaItem}>
                <span className={styles.orgMetaLabel}>Associates</span>
                <span className={styles.orgMetaValue}>{node.associateCount}</span>
              </div>
            )}
          </div>

          {node.website && (
            <div className={styles.detail}>
              <span className={styles.detailLabel}>Website</span>
              <a href={node.website} target="_blank" rel="noopener noreferrer" className={styles.link} style={{ padding: 0 }}>
                {node.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            </div>
          )}
          {!isPreview && node.contactEmail && (
            <div className={styles.detail}>
              <span className={styles.detailLabel}>Email</span>
              <a href={`mailto:${node.contactEmail}`} className={styles.link} style={{ padding: 0 }}>
                {node.contactEmail}
              </a>
            </div>
          )}

          {/* Tags */}
          {node.tags && (node.tags.keywords?.length || node.tags.skills?.length || node.tags.default?.length) && (
            <div className={styles.tagsWrap}>
              {[...(node.tags.keywords ?? []), ...(node.tags.skills ?? []), ...(node.tags.default ?? [])].slice(0, isPreview ? 6 : 20).map((tag) => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
            </div>
          )}

          {!isPreview && node.references && node.references.length > 0 && (
            <div className={styles.referencesSection}>
              <h3 className={styles.connectionsHeading}>Links</h3>
              {node.references.map((ref, i) => (
                <a key={i} href={ref.uri} target="_blank" rel="noopener noreferrer" className={styles.referenceLink}>
                  {ref.name || ref.uri}
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {!node.restricted && <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{directConnections.length}</span>
          <span className={styles.statLabel}>Connections</span>
        </div>
        {spaceCount > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{spaceCount}</span>
            <span className={styles.statLabel}>Spaces</span>
          </div>
        )}
        {orgCount > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{orgCount}</span>
            <span className={styles.statLabel}>Orgs</span>
          </div>
        )}
        {peopleCount > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{peopleCount}</span>
            <span className={styles.statLabel}>People</span>
          </div>
        )}
        {isSpace && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{node.activityByPeriod?.[activityPeriod] ?? node.totalActivityCount ?? 0}</span>
            <span className={styles.statLabel}>Contributions{activityPeriod !== 'allTime' ? ` (${activityPeriod === 'day' ? 'day' : activityPeriod === 'week' ? 'week' : 'month'})` : ''}</span>
          </div>
        )}
      </div>}

      {/* Location & Open in Alkemio — always visible above connections */}
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
        </>
      )}

      {/* Direct Connections list */}
      {!isPreview && !node.restricted && sortedConnections.length > 0 && (
        <div className={styles.connectionsSection}>
          <h3 className={styles.connectionsHeading}>Direct Connections</h3>
          <div className={styles.connectionsList}>
            {sortedConnections.map((c) => (
              <div key={c.node.id} className={styles.connectionItem} onClick={() => onNodeSelect?.(c.node)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNodeSelect?.(c.node); }}>
                <div className={styles.connectionLeft}>
                  {c.node.avatarUrl ? (
                    <img
                      src={proxyImageUrl(c.node.avatarUrl) ?? undefined}
                      alt=""
                      className={styles.connectionAvatar}
                    />
                  ) : (
                    <div className={`${styles.connectionAvatar} ${styles.connectionAvatarPlaceholder}`}>
                      {c.node.displayName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                  <span className={styles.connectionName}>{c.node.displayName || 'Unknown'}</span>
                </div>
                <span className={`${styles.edgeBadge} ${styles[`edgeBadge_${c.edgeType.toLowerCase()}`] || ''}`}>
                  {c.edgeType.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Spaces — US3 expansion (users/orgs only) */}
      {!isPreview && !node.restricted && (node.type === 'USER' || node.type === 'ORGANIZATION') && (
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

      {isPreview && (
        <p className={styles.previewHint}>Click node to lock details</p>
      )}
    </div>
  );
}
