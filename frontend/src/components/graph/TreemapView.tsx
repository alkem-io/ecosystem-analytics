/**
 * TreemapView — D3 treemap visualization of the space hierarchy.
 *
 * Uses d3.treemap() layout on a HierarchyDatum tree. Renders SVG <rect>
 * elements with zoom-on-click and a breadcrumb trail.
 * Color encodes by activity tier per contracts/view-props.md.
 */

import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import * as d3 from 'd3';
import type { GraphDataset } from '@server/types/graph.js';
import type { ActivityPeriod, ActivityTier } from '@server/types/graph.js';
import { NodeType } from '@server/types/graph.js';
import type { HierarchySizeMetric, HierarchyDatum } from '../../types/views.js';
import { useHierarchyData } from '../../hooks/useHierarchyData.js';
import { useViewTheme } from '../../hooks/useViewTheme.js';
import viewStyles from './Views.module.css';

// ─── Color Palette ─────────────────────────────────────────────
// Light-friendly tier colors: softer tones that read well on white bg
const TIER_COLORS_LIGHT: Record<string, string> = {
  LOW: '#bae6fd',     // sky-200
  MEDIUM: '#7dd3fc',  // sky-300
  HIGH: '#0284c7',    // sky-600
  INACTIVE: '#f1f5f9', // slate-100
};

const TIER_COLORS_DARK: Record<string, string> = {
  LOW: '#7dd3fc',
  MEDIUM: '#38bdf8',
  HIGH: '#1e3a5f',
  INACTIVE: '#334155',
};

function getTierColor(tier?: ActivityTier, isDark = false): string {
  const palette = isDark ? TIER_COLORS_DARK : TIER_COLORS_LIGHT;
  if (!tier) return palette.INACTIVE;
  return palette[tier] ?? palette.INACTIVE;
}

/** Readable foreground color for a given tier cell */
function getTierTextColor(tier?: ActivityTier, isDark = false): string {
  if (isDark) {
    return tier === 'HIGH' ? '#e2e8f0' : '#0f172a';
  }
  return tier === 'HIGH' ? '#ffffff' : '#1e293b';
}

/** Drop-shadow filter for activity glow */
function getTierGlow(tier?: ActivityTier, isDark = false): string | undefined {
  if (tier === 'HIGH') return isDark
    ? 'drop-shadow(0 0 8px rgba(30, 58, 95, 0.8))'
    : 'drop-shadow(0 0 6px rgba(2, 132, 199, 0.4))';
  if (tier === 'MEDIUM') return isDark
    ? 'drop-shadow(0 0 5px rgba(56, 189, 248, 0.5))'
    : 'drop-shadow(0 0 4px rgba(56, 189, 248, 0.35))';
  return undefined;
}

/** Node type badge label */
function typeLabel(type: string): string {
  if (type === 'SPACE_L0') return 'L0';
  if (type === 'SPACE_L1') return 'L1';
  if (type === 'SPACE_L2') return 'L2';
  return '';
}

interface TooltipData {
  x: number;
  y: number;
  name: string;
  value: number;
  tagline?: string | null;
  tags?: string[];
  memberCount?: number;
  activityCount?: number;
  activityTier?: ActivityTier;
  isPrivate: boolean;
  type: string;
}

// ─── Props ──────────────────────────────────────────────────────

interface TreemapViewProps {
  dataset: GraphDataset;
  sizeMetric: HierarchySizeMetric;
  focusedSpaceId: string | null;
  activityPeriod: ActivityPeriod;
  selectedNodeId: string | null;
  onSpaceClick: (spaceId: string) => void;
  onNodeSelect: (nodeId: string | null) => void;
  onZoomOut: () => void;
  width: number;
  height: number;
}

export default function TreemapView({
  dataset,
  sizeMetric,
  focusedSpaceId,
  activityPeriod,
  selectedNodeId,
  onSpaceClick,
  onNodeSelect,
  onZoomOut,
  width,
  height,
}: TreemapViewProps) {
  const { root: hierarchyRoot } = useHierarchyData({
    dataset,
    sizeMetric,
    activityPeriod,
    showMembers: false,
  });

  const theme = useViewTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Build D3 hierarchy + treemap layout
  const treemapRoot = useMemo(() => {
    if (!hierarchyRoot) return null;
    const root = d3.hierarchy<HierarchyDatum>(hierarchyRoot).sum((d) => {
      // Only count leaf values
      return (!d.children || d.children.length === 0) ? d.value : 0;
    });

    d3.treemap<HierarchyDatum>()
      .size([width, height])
      .paddingOuter(3)
      .paddingInner(2)
      .paddingTop(20)
      .round(true)(root);

    return root as d3.HierarchyRectangularNode<HierarchyDatum>;
  }, [hierarchyRoot, width, height]);

  // Find the focused node (or use root)
  const focusNode = useMemo(() => {
    if (!treemapRoot) return null;
    if (!focusedSpaceId) return treemapRoot;
    const found = treemapRoot.descendants().find((d) => d.data.id === focusedSpaceId);
    return found ?? treemapRoot;
  }, [treemapRoot, focusedSpaceId]);

  // Compute breadcrumb trail
  const breadcrumb = useMemo(() => {
    if (!focusNode) return [];
    const trail: Array<{ id: string; name: string }> = [];
    let current: d3.HierarchyRectangularNode<HierarchyDatum> | null = focusNode;
    while (current) {
      trail.unshift({ id: current.data.id, name: current.data.name });
      current = current.parent;
    }
    return trail;
  }, [focusNode]);

  // Get visible cells (children of the focused node, laid out relative)
  const cells = useMemo(() => {
    if (!focusNode) return [] as d3.HierarchyRectangularNode<HierarchyDatum>[];

    // Re-layout just the focused subtree
    const subtreeRoot = d3.hierarchy<HierarchyDatum>(focusNode.data).sum((d) => {
      return (!d.children || d.children.length === 0) ? d.value : 0;
    });

    d3.treemap<HierarchyDatum>()
      .size([width, height - 32]) // Leave room for breadcrumb
      .paddingOuter(3)
      .paddingInner(2)
      .paddingTop(20)
      .round(true)(subtreeRoot);

    return (subtreeRoot as d3.HierarchyRectangularNode<HierarchyDatum>).descendants().slice(1); // Exclude root itself
  }, [focusNode, width, height]);

  const handleCellClick = useCallback(
    (datum: HierarchyDatum) => {
      // If it has children, zoom in; otherwise select
      if (datum.children && datum.children.length > 0) {
        onSpaceClick(datum.id);
      } else {
        onNodeSelect(datum.id === selectedNodeId ? null : datum.id);
      }
    },
    [onSpaceClick, onNodeSelect, selectedNodeId],
  );

  const handleMouseEnter = useCallback((e: React.MouseEvent, cell: d3.HierarchyRectangularNode<HierarchyDatum>) => {
    setTooltip({
      x: e.clientX,
      y: e.clientY,
      name: cell.data.name,
      value: cell.value ?? 0,
      tagline: cell.data.tagline,
      tags: cell.data.tags,
      memberCount: cell.data.memberCount,
      activityCount: cell.data.activityCount,
      activityTier: cell.data.activityTier,
      isPrivate: cell.data.isPrivate,
      type: cell.data.type,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (!hierarchyRoot || !treemapRoot || width <= 0 || height <= 0) {
    return (
      <div className={viewStyles.emptyState}>
        <span className={viewStyles.emptyIcon}>▦</span>
        <span className={viewStyles.emptyTitle}>No data for Treemap</span>
        <span className={viewStyles.emptyMessage}>Select spaces to visualize</span>
      </div>
    );
  }

  return (
    <div className={viewStyles.viewContainer} style={{ width, height }}>
      {/* Breadcrumb trail */}
      {breadcrumb.length > 1 && (
        <nav className={viewStyles.breadcrumb} aria-label="Treemap navigation">
          {breadcrumb.map((item, i) => (
            <span key={item.id}>
              {i > 0 && <span className={viewStyles.breadcrumbSeparator}>›</span>}
              {i < breadcrumb.length - 1 ? (
                <button
                  className={viewStyles.breadcrumbItem}
                  onClick={() => {
                    if (item.id === 'ecosystem') {
                      onZoomOut();
                    } else {
                      onSpaceClick(item.id);
                    }
                  }}
                >
                  {item.name}
                </button>
              ) : (
                <span className={viewStyles.breadcrumbCurrent}>{item.name}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* SVG Treemap */}
      <svg
        ref={svgRef}
        width={width}
        height={height - (breadcrumb.length > 1 ? 32 : 0)}
        style={{ display: 'block' }}
      >
        {cells.map((cell) => {
          const x0 = cell.x0 ?? 0;
          const y0 = cell.y0 ?? 0;
          const x1 = cell.x1 ?? 0;
          const y1 = cell.y1 ?? 0;
          const w = x1 - x0;
          const h = y1 - y0;
          if (w < 1 || h < 1) return null;

          const isSelected = cell.data.id === selectedNodeId;
          const color = getTierColor(cell.data.activityTier, theme.isDark);
          const textColor = getTierTextColor(cell.data.activityTier, theme.isDark);
          const glow = getTierGlow(cell.data.activityTier, theme.isDark);
          const imgUrl = cell.data.avatarUrl;
          const clipId = `clip-${cell.data.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const tl = typeLabel(cell.data.type);

          return (
            <g
              key={cell.data.id}
              transform={`translate(${x0},${y0})`}
              style={{ cursor: 'pointer' }}
              onClick={() => handleCellClick(cell.data)}
              onMouseEnter={(e) => handleMouseEnter(e, cell)}
              onMouseMove={(e) => setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
              onMouseLeave={handleMouseLeave}
            >
              {/* Clip path for the image */}
              <defs>
                <clipPath id={clipId}>
                  <rect width={w} height={h} rx={2} />
                </clipPath>
              </defs>

              {/* Base rect */}
              <rect
                width={w}
                height={h}
                fill={color}
                stroke={isSelected ? theme.selection : theme.stroke}
                strokeWidth={isSelected ? 2 : 0.5}
                rx={2}
                style={glow ? { filter: glow } : undefined}
              />

              {/* Banner/avatar image fill */}
              {imgUrl && w > 30 && h > 30 && (
                <image
                  href={imgUrl}
                  x={0}
                  y={0}
                  width={w}
                  height={h}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${clipId})`}
                  opacity={0.35}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Private hatch overlay */}
              {cell.data.isPrivate && (
                <rect
                  width={w}
                  height={h}
                  fill="url(#hatch)"
                  rx={2}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Lock badge for private spaces */}
              {cell.data.isPrivate && w > 24 && h > 24 && (
                <g transform={`translate(${w - 18},${4})`}>
                  <circle r={7} fill={theme.badgeBg} />
                  <text textAnchor="middle" dy="0.35em" fontSize={9} style={{ pointerEvents: 'none' }}>🔒</text>
                </g>
              )}

              {/* Node type badge (L0/L1/L2) */}
              {tl && w > 50 && h > 30 && (
                <g transform={`translate(${4},${h - 8})`}>
                  <rect width={20} height={14} rx={3} fill={theme.badgeBg} />
                  <text x={10} y={10} textAnchor="middle" fill={theme.textMuted} fontSize={8} fontFamily="var(--font-family, system-ui)" style={{ pointerEvents: 'none' }}>
                    {tl}
                  </text>
                </g>
              )}

              {/* Label text */}
              {w > 40 && h > 16 && (
                <text
                  x={4}
                  y={14}
                  fill={textColor}
                  fontSize={Math.min(12, w / 8)}
                  fontWeight={cell.data.type === NodeType.SPACE_L0 ? 600 : 400}
                  fontFamily="var(--font-family, system-ui)"
                  style={{ pointerEvents: 'none', textShadow: theme.labelShadow }}
                >
                  {cell.data.name.length > Math.floor(w / 7)
                    ? cell.data.name.slice(0, Math.floor(w / 7)) + '…'
                    : cell.data.name}
                </text>
              )}
            </g>
          );
        })}

        {/* Hatch pattern for private spaces */}
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6">
            <path d="M0,6 l6,-6" stroke={theme.hatchStroke} strokeWidth="1" />
          </pattern>
        </defs>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className={viewStyles.tooltip}
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y - 8,
          }}
        >
          <span className={viewStyles.tooltipTitle}>
            {tooltip.name}
            {tooltip.isPrivate && ' 🔒'}
          </span>
          {tooltip.tagline && (
            <span className={viewStyles.tooltipDetail} style={{ display: 'block', fontStyle: 'italic', marginBottom: 2 }}>
              {tooltip.tagline}
            </span>
          )}
          <span className={viewStyles.tooltipDetail} style={{ display: 'block' }}>
            {sizeMetric === 'members' ? 'Members' : 'Activity'}: {tooltip.value}
          </span>
          {tooltip.memberCount !== undefined && tooltip.memberCount > 0 && sizeMetric !== 'members' && (
            <span className={viewStyles.tooltipDetail} style={{ display: 'block' }}>
              Members: {tooltip.memberCount}
            </span>
          )}
          {tooltip.activityCount !== undefined && tooltip.activityCount > 0 && sizeMetric !== 'activity' && (
            <span className={viewStyles.tooltipDetail} style={{ display: 'block' }}>
              Activity: {tooltip.activityCount}
            </span>
          )}
          {tooltip.activityTier && (
            <span className={viewStyles.tooltipDetail} style={{ display: 'block' }}>
              Tier: {tooltip.activityTier}
            </span>
          )}
          {tooltip.tags && tooltip.tags.length > 0 && (
            <span className={viewStyles.tooltipDetail} style={{ display: 'block', maxWidth: 240, whiteSpace: 'normal', lineHeight: 1.3 }}>
              Tags: {tooltip.tags.slice(0, 5).join(', ')}{tooltip.tags.length > 5 ? ` +${tooltip.tags.length - 5}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
