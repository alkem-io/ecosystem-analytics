/**
 * SunburstView — Zoomable sunburst (partition) visualization.
 *
 * Uses d3.partition() layout on HierarchyDatum tree.
 * - Center circle: "Ecosystem" label, click to zoom out
 * - Depth-band coloring: L0=dark, L1=medium, L2=light
 * - Private spaces: diagonal hatch pattern overlay
 * - Click any arc: zooms in with animated transition (~750ms)
 */

import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import * as d3 from 'd3';
import type { GraphDataset } from '@server/types/graph.js';
import type { ActivityPeriod, ActivityTier } from '@server/types/graph.js';
import { NodeType } from '@server/types/graph.js';
import type { HierarchySizeMetric, HierarchyDatum } from '../../types/views.js';
import { useHierarchyData } from '../../hooks/useHierarchyData.js';
import { useViewTheme, type ViewThemeColors } from '../../hooks/useViewTheme.js';
import viewStyles from './Views.module.css';

// ─── Per-L0 Categorical Palette ────────────────────────────────
// Each L0 space gets a distinct base hue. Children lighten progressively.
const L0_PALETTE_LIGHT = [
  '#0284c7', // sky-600
  '#7c3aed', // violet-600
  '#059669', // emerald-600
  '#dc2626', // red-600
  '#d97706', // amber-600
  '#db2777', // pink-600
  '#2563eb', // blue-600
  '#ca8a04', // yellow-600
  '#0891b2', // cyan-600
  '#9333ea', // purple-600
  '#65a30d', // lime-600
  '#e11d48', // rose-600
];

const L0_PALETTE_DARK = [
  '#38bdf8', // sky-400
  '#a78bfa', // violet-400
  '#34d399', // emerald-400
  '#f87171', // red-400
  '#fbbf24', // amber-400
  '#f472b6', // pink-400
  '#60a5fa', // blue-400
  '#facc15', // yellow-400
  '#22d3ee', // cyan-400
  '#c084fc', // purple-400
  '#a3e635', // lime-400
  '#fb7185', // rose-400
];

/** Build a map from L0 node id → palette index */
function buildL0ColorMap(root: d3.HierarchyRectangularNode<HierarchyDatum>): Map<string, number> {
  const map = new Map<string, number>();
  const l0Children = root.children ?? [];
  // Filter to space nodes only (skip synthetic grouping)
  l0Children.forEach((child, i) => {
    map.set(child.data.id, i % L0_PALETTE_LIGHT.length);
  });
  return map;
}

/** Find the L0 ancestor of a node (child of root). Returns the node's L0 parent index or -1. */
function getL0Ancestor(node: d3.HierarchyRectangularNode<HierarchyDatum>): d3.HierarchyRectangularNode<HierarchyDatum> | null {
  let current: d3.HierarchyRectangularNode<HierarchyDatum> | null = node;
  while (current) {
    // L0 node = depth 1 (root is depth 0)
    if (current.depth === 1) return current;
    current = current.parent;
  }
  return null;
}

/** Lighten a color by mixing with white (light theme) or black (dark theme) */
function lightenColor(baseColor: string, depth: number, isDark: boolean): string {
  if (depth <= 0) return baseColor;
  const target = isDark ? '#1e293b' : '#ffffff';
  // depth 1 = base, depth 2 = 30% lighter, depth 3+ = 50% lighter
  const t = Math.min(depth - 1, 2) * (isDark ? 0.25 : 0.30);
  return d3.interpolateHcl(baseColor, target)(t);
}

function getArcColor(
  datum: HierarchyDatum,
  depth: number,
  isDark: boolean,
  l0ColorMap: Map<string, number>,
  node?: d3.HierarchyRectangularNode<HierarchyDatum>,
): string {
  if (datum.type === NodeType.USER || datum.type === NodeType.ORGANIZATION) {
    return isDark ? '#64748b' : '#94a3b8';
  }
  const palette = isDark ? L0_PALETTE_DARK : L0_PALETTE_LIGHT;
  if (node) {
    const l0 = getL0Ancestor(node);
    if (l0) {
      const idx = l0ColorMap.get(l0.data.id) ?? 0;
      const base = palette[idx % palette.length];
      const depthFromL0 = node.depth - l0.depth;
      return lightenColor(base, depthFromL0, isDark);
    }
  }
  // Fallback for root or unknown
  return isDark ? '#334155' : '#cbd5e1';
}

/** Drop-shadow filter for activity glow */
function getTierGlow(tier?: ActivityTier, isDark = false): string | undefined {
  if (tier === 'HIGH') return isDark
    ? 'drop-shadow(0 0 6px rgba(30, 58, 95, 0.8))'
    : 'drop-shadow(0 0 5px rgba(2, 132, 199, 0.4))';
  if (tier === 'MEDIUM') return isDark
    ? 'drop-shadow(0 0 4px rgba(56, 189, 248, 0.4))'
    : 'drop-shadow(0 0 3px rgba(56, 189, 248, 0.3))';
  return undefined;
}

/** Get the right label color for text on an arc given depth and theme */
function getArcLabelColor(depth: number, isDark: boolean, bgColor?: string): string {
  if (isDark) return '#e2e8f0';
  // Use luminance of background to decide text color
  if (bgColor) {
    const c = d3.color(bgColor);
    if (c) {
      const rgb = c.rgb();
      const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      return luminance > 0.55 ? '#1e293b' : '#ffffff';
    }
  }
  return depth <= 1 ? '#ffffff' : '#1e293b';
}

interface SunburstTooltip {
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

interface SunburstViewProps {
  dataset: GraphDataset;
  sizeMetric: HierarchySizeMetric;
  activityPeriod: ActivityPeriod;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  showMembers: boolean;
  width: number;
  height: number;
}

export default function SunburstView({
  dataset,
  sizeMetric,
  activityPeriod,
  selectedNodeId,
  onNodeSelect,
  showMembers,
  width,
  height,
}: SunburstViewProps) {
  const { root: hierarchyRoot } = useHierarchyData({
    dataset,
    sizeMetric,
    activityPeriod,
    showMembers,
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const theme = useViewTheme();
  const [focusNode, setFocusNode] = useState<d3.HierarchyRectangularNode<HierarchyDatum> | null>(null);
  const [tooltip, setTooltip] = useState<SunburstTooltip | null>(null);

  const radius = Math.min(width, height) / 2;

  // Build D3 partition layout
  const partitionRoot = useMemo(() => {
    if (!hierarchyRoot || radius <= 0) return null;

    const root = d3.hierarchy<HierarchyDatum>(hierarchyRoot)
      .sum((d) => (!d.children || d.children.length === 0) ? d.value : 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.partition<HierarchyDatum>()
      .size([2 * Math.PI, radius])(root);

    return root as d3.HierarchyRectangularNode<HierarchyDatum>;
  }, [hierarchyRoot, radius]);

  // Build L0 color map for per-space coloring
  const l0ColorMap = useMemo(() => {
    if (!partitionRoot) return new Map<string, number>();
    return buildL0ColorMap(partitionRoot);
  }, [partitionRoot]);

  // Reset focus when data changes
  useEffect(() => {
    if (partitionRoot) setFocusNode(partitionRoot);
  }, [partitionRoot]);

  const currentFocus = focusNode ?? partitionRoot;

  // Arc generator
  const arc = useMemo(() => {
    return d3.arc<d3.HierarchyRectangularNode<HierarchyDatum>>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(radius / 2)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1 - 1);
  }, [radius]);

  // Imperative zoom transition
  const handleArcClick = useCallback((node: d3.HierarchyRectangularNode<HierarchyDatum>) => {
    if (!partitionRoot || !svgRef.current) return;

    // If clicking the center, zoom out to parent
    if (node === currentFocus && currentFocus.parent) {
      setFocusNode(currentFocus.parent as d3.HierarchyRectangularNode<HierarchyDatum>);
      return;
    }

    // If leaf, select it
    if (!node.children || node.children.length === 0) {
      onNodeSelect(node.data.id === selectedNodeId ? null : node.data.id);
      return;
    }

    setFocusNode(node);
  }, [partitionRoot, currentFocus, selectedNodeId, onNodeSelect]);

  // Compute visible arcs relative to current focus
  const visibleArcs = useMemo(() => {
    if (!currentFocus) return [];

    const focusDepth = currentFocus.depth;
    return currentFocus.descendants().filter((d) => {
      // Show only descendants within a reasonable depth range
      const relativeDepth = d.depth - focusDepth;
      return relativeDepth >= 0 && relativeDepth <= 3 && d.x1 > d.x0;
    });
  }, [currentFocus]);

  // Rescale arcs to fill the full radius when zoomed
  const getArcPath = useCallback((node: d3.HierarchyRectangularNode<HierarchyDatum>) => {
    if (!currentFocus) return '';

    const focusX0 = currentFocus.x0;
    const focusX1 = currentFocus.x1;
    const focusY0 = currentFocus.y0;
    const xScale = (2 * Math.PI) / (focusX1 - focusX0);
    const yScale = radius / (radius - focusY0);

    const scaled = {
      ...node,
      x0: Math.max(0, (node.x0 - focusX0) * xScale),
      x1: Math.min(2 * Math.PI, (node.x1 - focusX0) * xScale),
      y0: Math.max(0, (node.y0 - focusY0) * yScale),
      y1: Math.min(radius, (node.y1 - focusY0) * yScale),
    };

    return arc(scaled as d3.HierarchyRectangularNode<HierarchyDatum>) ?? '';
  }, [currentFocus, radius, arc]);

  // Compute scaled centroid for label/avatar placement
  const getArcCentroid = useCallback((node: d3.HierarchyRectangularNode<HierarchyDatum>): [number, number] | null => {
    if (!currentFocus) return null;
    const focusX0 = currentFocus.x0;
    const focusX1 = currentFocus.x1;
    const focusY0 = currentFocus.y0;
    const xScale = (2 * Math.PI) / (focusX1 - focusX0);
    const yScale = radius / (radius - focusY0);

    const sX0 = Math.max(0, (node.x0 - focusX0) * xScale);
    const sX1 = Math.min(2 * Math.PI, (node.x1 - focusX0) * xScale);
    const sY0 = Math.max(0, (node.y0 - focusY0) * yScale);
    const sY1 = Math.min(radius, (node.y1 - focusY0) * yScale);

    const angle = (sX0 + sX1) / 2;
    const r = (sY0 + sY1) / 2;
    return [r * Math.sin(angle), -r * Math.cos(angle)];
  }, [currentFocus, radius]);

  // Build breadcrumb trail from focus ancestors
  const breadcrumb = useMemo(() => {
    if (!currentFocus) return [];
    const trail: Array<{ id: string; name: string; node: d3.HierarchyRectangularNode<HierarchyDatum> }> = [];
    let current: d3.HierarchyRectangularNode<HierarchyDatum> | null = currentFocus;
    while (current) {
      trail.unshift({ id: current.data.id, name: current.data.name, node: current });
      current = current.parent;
    }
    return trail;
  }, [currentFocus]);

  const handleTooltipEnter = useCallback((e: React.MouseEvent, node: d3.HierarchyRectangularNode<HierarchyDatum>) => {
    setTooltip({
      x: e.clientX,
      y: e.clientY,
      name: node.data.name,
      value: node.value ?? 0,
      tagline: node.data.tagline,
      tags: node.data.tags,
      memberCount: node.data.memberCount,
      activityCount: node.data.activityCount,
      activityTier: node.data.activityTier,
      isPrivate: node.data.isPrivate,
      type: node.data.type,
    });
  }, []);

  if (!hierarchyRoot || !partitionRoot || radius <= 0) {
    return (
      <div className={viewStyles.emptyState}>
        <span className={viewStyles.emptyIcon}>◎</span>
        <span className={viewStyles.emptyTitle}>No data for Sunburst</span>
        <span className={viewStyles.emptyMessage}>Select spaces to visualize</span>
      </div>
    );
  }

  return (
    <div className={viewStyles.viewContainer} style={{ width, height }}>
      {/* Breadcrumb trail */}
      {breadcrumb.length > 1 && (
        <nav className={viewStyles.breadcrumb} aria-label="Sunburst navigation">
          {breadcrumb.map((item, i) => (
            <span key={item.id}>
              {i > 0 && <span className={viewStyles.breadcrumbSeparator}>›</span>}
              {i < breadcrumb.length - 1 ? (
                <button
                  className={viewStyles.breadcrumbItem}
                  onClick={() => setFocusNode(item.node)}
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

      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block' }}
      >
        <g transform={`translate(${width / 2},${height / 2})`}>
          {/* Arcs */}
          {visibleArcs.map((node) => {
            if (node === currentFocus) return null;
            const pathD = getArcPath(node);
            if (!pathD) return null;

            const relativeDepth = node.depth - (currentFocus?.depth ?? 0);
            const isSelected = node.data.id === selectedNodeId;
            const color = getArcColor(node.data, relativeDepth, theme.isDark, l0ColorMap, node);
            const glow = getTierGlow(node.data.activityTier, theme.isDark);
            const angularExtent = node.x1 - node.x0;
            const centroid = getArcCentroid(node);
            const imgUrl = node.data.avatarUrl;
            const clipId = `sb-clip-${node.data.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

            return (
              <g key={node.data.id}>
                <path
                  d={pathD}
                  fill={color}
                  stroke={theme.stroke}
                  strokeWidth={isSelected ? 2 : 0.5}
                  style={{ cursor: 'pointer', transition: 'fill 0.3s ease', filter: glow }}
                  onClick={() => handleArcClick(node)}
                  onMouseEnter={(e) => handleTooltipEnter(e, node)}
                  onMouseMove={(e) => setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                  onMouseLeave={() => setTooltip(null)}
                />
                {isSelected && (
                  <path d={pathD} fill="none" stroke={theme.selection} strokeWidth={2} style={{ pointerEvents: 'none' }} />
                )}
                {node.data.isPrivate && (
                  <path d={pathD} fill="url(#sunburst-hatch)" style={{ pointerEvents: 'none' }} />
                )}

                {/* Arc label for arcs with sufficient angular extent */}
                {centroid && angularExtent > 0.12 && relativeDepth <= 2 && node.data.type !== NodeType.USER && node.data.type !== NodeType.ORGANIZATION && (
                  <text
                    x={centroid[0]}
                    y={centroid[1]}
                    textAnchor="middle"
                    dy="0.35em"
                    fill={getArcLabelColor(relativeDepth, theme.isDark, color)}
                    fontSize={angularExtent > 0.4 ? 11 : 9}
                    fontWeight={relativeDepth === 1 ? 600 : 400}
                    fontFamily="var(--font-family, system-ui)"
                    style={{ pointerEvents: 'none', textShadow: theme.labelShadow }}
                  >
                    {node.data.name.length > 14 ? node.data.name.slice(0, 13) + '…' : node.data.name}
                  </text>
                )}

                {/* Small circular avatar for larger arcs */}
                {imgUrl && centroid && angularExtent > 0.35 && relativeDepth <= 2 && (
                  <>
                    <defs>
                      <clipPath id={clipId}>
                        <circle cx={centroid[0]} cy={centroid[1] - 14} r={10} />
                      </clipPath>
                    </defs>
                    <image
                      href={imgUrl}
                      x={centroid[0] - 10}
                      y={centroid[1] - 24}
                      width={20}
                      height={20}
                      clipPath={`url(#${clipId})`}
                      preserveAspectRatio="xMidYMid slice"
                      style={{ pointerEvents: 'none' }}
                    />
                  </>
                )}

                {/* Lock badge for private arcs with enough space */}
                {node.data.isPrivate && centroid && angularExtent > 0.2 && (
                  <text
                    x={centroid[0] + 12}
                    y={centroid[1] - 4}
                    fontSize={8}
                    style={{ pointerEvents: 'none' }}
                  >🔒</text>
                )}
              </g>
            );
          })}

          {/* Center label */}
          <circle
            r={currentFocus ? Math.max(currentFocus.y0 * (radius / (radius - (currentFocus.y0 ?? 0))), 20) : 20}
            fill={theme.bg}
            stroke={theme.border}
            strokeWidth={1}
            style={{ cursor: currentFocus?.parent ? 'pointer' : 'default' }}
            onClick={() => {
              if (currentFocus?.parent) {
                setFocusNode(currentFocus.parent as d3.HierarchyRectangularNode<HierarchyDatum>);
              }
            }}
          />
          {/* Center avatar for focused space */}
          {currentFocus?.data.avatarUrl && (
            <>
              <defs>
                <clipPath id="sb-center-clip">
                  <circle r={Math.max((currentFocus.y0 * (radius / (radius - (currentFocus.y0 ?? 0)))) - 2, 16)} />
                </clipPath>
              </defs>
              <image
                href={currentFocus.data.avatarUrl}
                x={-(Math.max((currentFocus.y0 * (radius / (radius - (currentFocus.y0 ?? 0)))) - 2, 16))}
                y={-(Math.max((currentFocus.y0 * (radius / (radius - (currentFocus.y0 ?? 0)))) - 2, 16))}
                width={2 * Math.max((currentFocus.y0 * (radius / (radius - (currentFocus.y0 ?? 0)))) - 2, 16)}
                height={2 * Math.max((currentFocus.y0 * (radius / (radius - (currentFocus.y0 ?? 0)))) - 2, 16)}
                clipPath="url(#sb-center-clip)"
                preserveAspectRatio="xMidYMid slice"
                opacity={0.3}
                style={{ pointerEvents: 'none' }}
              />
            </>
          )}
          <text
            textAnchor="middle"
            dy="0.35em"
            fill={theme.text}
            fontSize={12}
            fontWeight={600}
            fontFamily="var(--font-family, system-ui)"
            style={{ pointerEvents: 'none', textShadow: theme.labelShadow }}
          >
            {currentFocus?.data.name ?? 'Ecosystem'}
          </text>

          {/* Hatch pattern def */}
          <defs>
            <pattern id="sunburst-hatch" patternUnits="userSpaceOnUse" width="6" height="6">
              <path d="M0,6 l6,-6" stroke={theme.hatchStroke} strokeWidth="1" />
            </pattern>
          </defs>
        </g>
      </svg>

      {/* Rich tooltip */}
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
            <span className={viewStyles.tooltipDetail} style={{ display: 'block' }}>Members: {tooltip.memberCount}</span>
          )}
          {tooltip.activityCount !== undefined && tooltip.activityCount > 0 && sizeMetric !== 'activity' && (
            <span className={viewStyles.tooltipDetail} style={{ display: 'block' }}>Activity: {tooltip.activityCount}</span>
          )}
          {tooltip.activityTier && (
            <span className={viewStyles.tooltipDetail} style={{ display: 'block' }}>Tier: {tooltip.activityTier}</span>
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
