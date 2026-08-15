import type { GraphNode, GraphDataset } from '@server/types/graph.js';
import { SafeImage, withImageCacheBust } from '@ea/shared';
import { getToken } from '../../services/auth.js';
import styles from './HoverCard.module.css';

function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('/api/private/')) {
    const token = getToken();
    return withImageCacheBust(
      `/api/image-proxy?url=${encodeURIComponent(url)}${token ? `&token=${encodeURIComponent(token)}` : ''}`,
    );
  }
  return withImageCacheBust(url);
}

const TYPE_LABELS: Record<string, string> = {
  SPACE: 'Space',
  USER: 'Person',
  ORGANIZATION: 'Organization',
};

interface Props {
  node: GraphNode;
  dataset: GraphDataset;
  x: number;
  y: number;
}

export default function HoverCard({ node, dataset, x, y }: Props) {
  const connectionCount = dataset.edges.filter(
    (e) => e.sourceId === node.id || e.targetId === node.id,
  ).length;

  const avatarSrc = proxyImageUrl(node.avatarUrl);
  const initial = node.displayName?.charAt(0)?.toUpperCase() || '?';
  const typeKey = node.type.toLowerCase();
  const typeLabel = TYPE_LABELS[node.type] || node.type;

  // Offset the card from the cursor, then keep it inside the viewport — near
  // the right or bottom edge it flips to the other side of the pointer rather
  // than hanging off screen (which it previously did on narrow windows).
  const OFFSET = 16;
  const CARD_WIDTH = 280;
  const CARD_HEIGHT = 64;
  const MARGIN = 8;
  const viewportWidth = typeof window === 'undefined' ? CARD_WIDTH : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? CARD_HEIGHT : window.innerHeight;

  const left = Math.max(
    MARGIN,
    Math.min(x + OFFSET, viewportWidth - CARD_WIDTH - MARGIN),
  );
  const top = Math.max(
    MARGIN,
    Math.min(y + OFFSET, viewportHeight - CARD_HEIGHT - MARGIN),
  );

  const style: React.CSSProperties = { left: `${left}px`, top: `${top}px` };

  return (
    <div className={styles.hoverCard} style={style}>
      <SafeImage
        src={avatarSrc}
        alt=""
        className={styles.avatar}
        entityUrl={node.url}
        entityName={node.displayName}
        entityType={node.type}
        fallback={<div className={styles.avatarPlaceholder}>{initial}</div>}
      />
      <div className={styles.info}>
        <span className={styles.name}>{node.displayName || 'Unknown'}</span>
        <div className={styles.meta}>
          <span className={`${styles.typeBadge} ${styles[`typeBadge_${typeKey}`] || ''}`}>
            {typeLabel}
          </span>
          {node.restricted ? (
            <span className={styles.restrictedBadge}>🔒 Content restricted</span>
          ) : (
            <span className={styles.connections}>
              {connectionCount} connection{connectionCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
