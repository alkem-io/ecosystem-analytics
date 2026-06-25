import type { GraphNode, GraphDataset } from '@server/types/graph.js';
import { proxyImageUrl } from '../lib/imageProxy.js';
import { SafeImage } from '../ui/SafeImage.js';
import styles from './HoverCard.module.css';

const TYPE_LABELS: Record<string, string> = {
  SPACE_L0: 'Space',
  SPACE_L1: 'Subspace',
  SPACE_L2: 'Subspace',
  USER: 'Person',
  ORGANIZATION: 'Organization',
  INITIATIVE: 'Initiative',
  THEME: 'Theme',
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
      <SafeImage
        src={avatarSrc}
        alt=""
        entityUrl={node.url}
        entityName={node.displayName}
        entityType={node.type}
        className={styles.avatar}
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
