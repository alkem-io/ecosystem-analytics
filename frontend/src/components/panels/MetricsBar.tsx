import { useState, useCallback } from 'react';
import type { GraphMetrics } from '@server/types/graph.js';
import type { EcosystemMetrics } from '../../hooks/useEcosystemMetrics.js';
import { ChevronUp, ChevronDown, Users, Building2, Network, ArrowRightLeft, Trophy, BarChart3 } from 'lucide-react';
import { Badge } from '../ui/badge.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip.js';
import styles from './MetricsBar.module.css';

interface Props {
  metrics: GraphMetrics;
  ecosystemMetrics?: EcosystemMetrics;
  onHighlightNodes: (ids: string[]) => void;
  onSelectNode: (nodeId: string) => void;
}

export default function MetricsBar({
  metrics,
  ecosystemMetrics,
  onHighlightNodes,
  onSelectNode,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // Fallback when no ecosystem metrics computed
  if (!ecosystemMetrics) {
    return (
      <div className={styles.bar}>
        <div className={styles.statsRow}>
          <StatCard label="Nodes" value={metrics.totalNodes} />
          <StatCard label="Edges" value={metrics.totalEdges} />
          <StatCard label="Avg Degree" value={metrics.averageDegree} />
          <StatCard label="Density" value={metrics.density} />
        </div>
      </div>
    );
  }

  const { aggregates, bridgeConnectors, multiSpaceUsers, spaceRankings, topConnectors, orgDistribution, hasRestrictedNodes } = ecosystemMetrics;

  const multiSpaceUserIds = [...new Set(multiSpaceUsers.map((u) => u.nodeId))];

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`${styles.bar} ${expanded ? styles.barExpanded : ''}`}>
        {/* ── Collapsed: stat cards row ── */}
        <div className={styles.statsRow}>
          <StatCard
            icon={<Users size={14} />}
            label="Users"
            value={aggregates.totalUsers}
            onClick={() => onHighlightNodes([])}
            tooltip="Total users across all loaded ecosystems"
          />
          <StatCard
            icon={<Building2 size={14} />}
            label="Organisations"
            value={aggregates.totalOrganizations}
            onClick={() => onHighlightNodes([])}
            tooltip={
              orgDistribution.length > 1 ? (
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Organisations per ecosystem</span>
                  {orgDistribution.map((d) => (
                    <span key={d.l0SpaceId} className="flex justify-between gap-3">
                      <span className="text-[var(--text-secondary)]">{d.l0SpaceName}</span>
                      <span className="font-semibold tabular-nums">{d.orgCount}</span>
                    </span>
                  ))}
                </div>
              ) : 'Total organisations across the ecosystem'
            }
          />
          <StatCard
            icon={<BarChart3 size={14} />}
            label="Subspaces"
            value={aggregates.totalSubspaces}
            onClick={() => onHighlightNodes([])}
            tooltip="L1 and L2 subspaces across all loaded ecosystems"
          />
          <StatCard
            icon={<Network size={14} />}
            label="Multi-space users"
            value={multiSpaceUserIds.length}
            onClick={() => onHighlightNodes(multiSpaceUserIds)}
            tooltip={
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">Users in 2+ subspaces</span>
                <span className="text-[var(--text-secondary)]">Click to highlight them on the graph</span>
              </div>
            }
            highlight={multiSpaceUserIds.length > 0}
          />
          <StatCard
            icon={<ArrowRightLeft size={14} />}
            label="Bridge connectors"
            value={bridgeConnectors.length}
            onClick={() => onHighlightNodes(bridgeConnectors.map((bc) => bc.nodeId))}
            tooltip={
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">Cross-ecosystem bridges</span>
                <span className="text-[var(--text-secondary)]">Users active in 2+ L0 ecosystems — click to highlight</span>
              </div>
            }
            highlight={bridgeConnectors.length > 0}
          />
          <StatCard
            icon={<Trophy size={14} />}
            label="Top connector"
            value={topConnectors.length > 0 ? topConnectors[0].displayName : '—'}
            subValue={topConnectors.length > 0 ? `${topConnectors[0].spaceCount} spaces` : undefined}
            onClick={() => topConnectors.length > 0 && onSelectNode(topConnectors[0].nodeId)}
            tooltip={
              topConnectors.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">Most connected person</span>
                  <span className="text-[var(--text-secondary)]">{topConnectors[0].displayName} is active in {topConnectors[0].spaceCount} spaces — click to view details</span>
                </div>
              ) : 'No connectors found'
            }
            highlight={topConnectors.length > 0}
          />
          {hasRestrictedNodes && (
            <Badge variant="outline" className="text-[10px] h-5 self-center shrink-0">
              * Restricted data excluded
            </Badge>
          )}
          <button
            className={styles.expandToggle}
            onClick={() => setExpanded((p) => !p)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse details' : 'Show full rankings & details'}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span className={styles.expandLabel}>{expanded ? 'Less' : 'More'}</span>
          </button>
        </div>

        {/* ── Expanded: detailed panels ── */}
        {expanded && (
          <div className={styles.expandedContent}>
            <div className={styles.detailGrid}>
                {/* Busiest subspaces */}
                <DetailSection title="Busiest Subspaces" icon={<BarChart3 size={12} />}>
                  {spaceRankings.length === 0 ? (
                    <p className={styles.emptyMsg}>No subspaces</p>
                  ) : (
                    spaceRankings.slice(0, 8).map((ranking, i) => (
                      <button
                        key={ranking.nodeId}
                        className={styles.detailRow}
                        onClick={() => onHighlightNodes([ranking.nodeId])}
                      >
                        <span className={styles.rank}>{i + 1}</span>
                        <span className={styles.rowName}>{ranking.displayName}</span>
                        <Badge variant="secondary" className="text-[10px] h-4 ml-auto shrink-0">
                          {ranking.memberCount} members
                        </Badge>
                      </button>
                    ))
                  )}
                </DetailSection>

                {/* Top connectors */}
                <DetailSection title="Most Connected" icon={<Trophy size={12} />}>
                  {topConnectors.length === 0 ? (
                    <p className={styles.emptyMsg}>No connectors</p>
                  ) : (
                    topConnectors.slice(0, 8).map((connector, i) => (
                      <button
                        key={connector.nodeId}
                        className={styles.detailRow}
                        onClick={() => onSelectNode(connector.nodeId)}
                      >
                        <span className={styles.rank}>{i + 1}</span>
                        {connector.avatarUrl ? (
                          <img
                            src={connector.avatarUrl}
                            alt=""
                            className={styles.avatar}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <span className={styles.avatarFallback}>
                            {connector.displayName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className={styles.rowName}>{connector.displayName}</span>
                        <Badge variant="secondary" className="text-[10px] h-4 ml-auto shrink-0">
                          {connector.spaceCount} spaces
                        </Badge>
                      </button>
                    ))
                  )}
                </DetailSection>

                {/* Bridge connectors */}
                {bridgeConnectors.length > 0 && (
                  <DetailSection title="Bridge Connectors" icon={<ArrowRightLeft size={12} />}>
                    {bridgeConnectors.map((bc) => (
                      <button
                        key={bc.nodeId}
                        className={styles.detailRow}
                        onClick={() => onHighlightNodes([bc.nodeId])}
                      >
                        <span className={styles.rowName}>{bc.displayName}</span>
                        <span className={styles.rowMeta}>
                          {bc.l0SpaceNames.join(' + ')}
                        </span>
                      </button>
                    ))}
                  </DetailSection>
                )}

                {/* Multi-space users */}
                {multiSpaceUsers.length > 0 && (
                  <DetailSection title="Multi-Space Users" icon={<Network size={12} />}>
                    {multiSpaceUsers.slice(0, 8).map((user) => (
                      <button
                        key={`${user.nodeId}-${user.l0SpaceId}`}
                        className={styles.detailRow}
                        onClick={() => onSelectNode(user.nodeId)}
                      >
                        <span className={styles.rowName}>{user.displayName}</span>
                        <span className={styles.rowMeta}>
                          {user.subspaceCount} subspaces in {user.l0SpaceName}
                        </span>
                      </button>
                    ))}
                  </DetailSection>
                )}

                {/* Org distribution */}
                {orgDistribution.length > 1 && (
                  <DetailSection title="Org Distribution" icon={<Building2 size={12} />}>
                    {orgDistribution.map((d) => (
                      <div key={d.l0SpaceId} className={styles.detailRow}>
                        <span className={styles.rowName}>{d.l0SpaceName}</span>
                        <Badge variant="secondary" className="text-[10px] h-4 ml-auto shrink-0">
                          {d.orgCount} org{d.orgCount !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    ))}
                  </DetailSection>
                )}
              </div>
            </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ── Stat Card ──

function StatCard({
  icon,
  label,
  value,
  subValue,
  onClick,
  tooltip,
  highlight,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  onClick?: () => void;
  tooltip?: React.ReactNode;
  highlight?: boolean;
}) {
  const card = (
    <button
      className={`${styles.statCard} ${onClick ? styles.statCardClickable : ''} ${highlight ? styles.statCardHighlight : ''}`}
      onClick={onClick}
      tabIndex={onClick ? 0 : -1}
    >
      <div className={styles.statHeader}>
        {icon && <span className={styles.statIcon}>{icon}</span>}
        <span className={styles.statLabel}>{label}</span>
      </div>
      <span className={styles.statValue}>{value}</span>
      {subValue && <span className={styles.statSub}>{subValue}</span>}
    </button>
  );

  if (!tooltip) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// ── Detail Section ──

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.detailSection}>
      <div className={styles.detailTitle}>
        {icon}
        <span>{title}</span>
      </div>
      <div className={styles.detailList}>
        {children}
      </div>
    </div>
  );
}
