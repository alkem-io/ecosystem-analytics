import type { GraphNode, GraphDataset } from '@server/types/graph.js';
import { getToken } from '../../services/auth.js';
import styles from './HoverCard.module.css';

function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('/api/private/')) {
    const token = getToken();
    return `/api/image-proxy?url=${encodeURIComponent(url)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  }
  return url;
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

  // Position card slightly offset from cursor, clamped to viewport
  const OFFSET = 16;
  const style: React.CSSProperties = {
    left: `${x + OFFSET}px`,
    top: `${y + OFFSET}px`,
  };

  return (
    <div className={styles.hoverCard} style={style}>
      {avatarSrc ? (
        <img src={avatarSrc} alt="" className={styles.avatar} />
      ) : (
        <div className={styles.avatarPlaceholder}>{initial}</div>
      )}
      <div className={styles.info}>
        <span className={styles.name}>{node.displayName || 'Unknown'}</span>
        <div className={styles.meta}>
          <span className={`${styles.typeBadge} ${styles[`typeBadge_${typeKey}`] || ''}`}>
            {typeLabel}
          </span>
          <span className={styles.connections}>
            {connectionCount} connection{connectionCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
