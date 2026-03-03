/**
 * TemporalForceView — Dedicated temporal force-directed graph visualization.
 *
 * Inspired by https://observablehq.com/@d3/temporal-force-directed-graph
 *
 * Nodes and edges "appear" over time as the scrubber advances, with:
 * - Smooth entrance animations (scale + fade)
 * - Per-L0-space color coding (children inherit parent hue)
 * - Activity glow on edges
 * - Growth counter overlay showing node/edge counts
 * - Node age fading — older nodes become slightly more opaque/settled
 * - Edge trail particles along active connections
 * - Drag interaction on individual nodes
 *
 * Unlike the regular ForceGraph, this component owns its own D3 simulation
 * and only shows elements whose createdDate ≤ the temporal cursor.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import type { GraphDataset, GraphNode, GraphEdge, ActivityPeriod } from '@server/types/graph.js';
import { NodeType, EdgeType } from '@server/types/graph.js';
import { useViewTheme } from '../../hooks/useViewTheme.js';
import viewStyles from './Views.module.css';

// ─── Types ──────────────────────────────────────────────────────

interface SimNode extends d3.SimulationNodeDatum {
  data: GraphNode;
  enterTime: number;    // ms timestamp when this node enters the scene
  radius: number;
  colorIndex: number;   // palette index based on L0 parent
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  data: GraphEdge;
  enterTime: number;    // ms timestamp when this link enters the scene
}

// ─── Color Palette ──────────────────────────────────────────────

const PALETTE_LIGHT = [
  '#0284c7', '#7c3aed', '#059669', '#dc2626', '#d97706',
  '#db2777', '#2563eb', '#ca8a04', '#0891b2', '#9333ea',
  '#65a30d', '#e11d48',
];

const PALETTE_DARK = [
  '#38bdf8', '#a78bfa', '#34d399', '#f87171', '#fbbf24',
  '#f472b6', '#60a5fa', '#facc15', '#22d3ee', '#c084fc',
  '#a3e635', '#fb7185',
];

// User/Org grey
const USER_COLOR_LIGHT = '#94a3b8';
const USER_COLOR_DARK = '#64748b';
const ORG_COLOR_LIGHT = '#a78bfa';
const ORG_COLOR_DARK = '#7c3aed';

// ─── Sizing ─────────────────────────────────────────────────────

const BASE_RADIUS: Record<string, number> = {
  SPACE_L0: 16, SPACE_L1: 12, SPACE_L2: 8,
  ORGANIZATION: 6, USER: 5,
};

function computeRadius(node: GraphNode): number {
  return BASE_RADIUS[node.type] ?? 5;
}

// ─── Props ──────────────────────────────────────────────────────

interface TemporalForceViewProps {
  dataset: GraphDataset;
  temporalDate: Date | null;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  activityPeriod?: ActivityPeriod;
  width: number;
  height: number;
}

export default function TemporalForceView({
  dataset,
  temporalDate,
  selectedNodeId,
  onNodeSelect,
  activityPeriod = 'allTime',
  width,
  height,
}: TemporalForceViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const theme = useViewTheme();

  // Stable refs for callback access
  const temporalDateRef = useRef(temporalDate);
  temporalDateRef.current = temporalDate;
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // ─── Build L0-color mapping ─────────────────────────────────
  const { l0ColorMap, parentSpaceMap } = useMemo(() => {
    const cMap = new Map<string, number>();
    const pMap = new Map<string, string>(); // nodeId → L0 spaceId
    let idx = 0;

    // Identify L0 spaces (no parentSpaceId, type SPACE_L0)
    const l0Spaces = dataset.nodes.filter(
      (n) => n.type === NodeType.SPACE_L0 && !n.parentSpaceId,
    );

    for (const space of l0Spaces) {
      cMap.set(space.id, idx % PALETTE_LIGHT.length);
      pMap.set(space.id, space.id);
      idx++;
    }

    // Map L1 → L0
    for (const n of dataset.nodes) {
      if (n.type === NodeType.SPACE_L1 && n.parentSpaceId) {
        pMap.set(n.id, n.parentSpaceId);
      }
    }
    // Map L2 → L0 (through L1)
    for (const n of dataset.nodes) {
      if (n.type === NodeType.SPACE_L2 && n.parentSpaceId) {
        const l1Parent = pMap.get(n.parentSpaceId);
        pMap.set(n.id, l1Parent ?? n.parentSpaceId);
      }
    }

    // Map users/orgs to their most-connected L0 space
    const edgesByNode = new Map<string, Map<string, number>>();
    for (const e of dataset.edges) {
      const userId = e.sourceId;
      const spaceId = e.targetId;
      const l0 = pMap.get(spaceId);
      if (!l0) continue;
      if (!edgesByNode.has(userId)) edgesByNode.set(userId, new Map());
      const counts = edgesByNode.get(userId)!;
      counts.set(l0, (counts.get(l0) ?? 0) + 1);
    }
    for (const [userId, counts] of edgesByNode) {
      let maxL0 = '';
      let maxCount = 0;
      for (const [l0, c] of counts) {
        if (c > maxCount) { maxCount = c; maxL0 = l0; }
      }
      if (maxL0) pMap.set(userId, maxL0);
    }

    return { l0ColorMap: cMap, parentSpaceMap: pMap };
  }, [dataset]);

  // ─── Build SimNodes & SimLinks ──────────────────────────────
  const { simNodes, simLinks, nodeMap } = useMemo(() => {
    const nMap = new Map<string, SimNode>();
    const nodes: SimNode[] = dataset.nodes.map((n) => {
      const l0Id = parentSpaceMap.get(n.id);
      const cIdx = l0Id ? (l0ColorMap.get(l0Id) ?? 0) : 0;
      const sn: SimNode = {
        data: n,
        enterTime: n.createdDate ? new Date(n.createdDate).getTime() : 0,
        radius: computeRadius(n),
        colorIndex: cIdx,
      };
      nMap.set(n.id, sn);
      return sn;
    });

    const links: SimLink[] = dataset.edges
      .map((e) => {
        const source = nMap.get(e.sourceId);
        const target = nMap.get(e.targetId);
        if (!source || !target) return null;
        return {
          source,
          target,
          data: e,
          enterTime: e.createdDate ? new Date(e.createdDate).getTime() : 0,
        } as SimLink;
      })
      .filter((l): l is SimLink => l !== null);

    return { simNodes: nodes, simLinks: links, nodeMap: nMap };
  }, [dataset, l0ColorMap, parentSpaceMap]);

  // ─── Render D3 visualization ────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || width <= 0 || height <= 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const isDark = themeRef.current.isDark;
    const palette = isDark ? PALETTE_DARK : PALETTE_LIGHT;

    // Defs for glow filters and gradients
    const defs = svg.append('defs');

    // Soft glow filter for active nodes
    const glowFilter = defs.append('filter')
      .attr('id', 'temporal-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    glowFilter.append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '3')
      .attr('result', 'blur');
    glowFilter.append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter()
      .append('feMergeNode')
      .attr('in', (d) => d);

    // Strong glow for recently appeared nodes
    const pulseFilter = defs.append('filter')
      .attr('id', 'temporal-pulse')
      .attr('x', '-80%').attr('y', '-80%')
      .attr('width', '260%').attr('height', '260%');
    pulseFilter.append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '6')
      .attr('result', 'blur');
    pulseFilter.append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter()
      .append('feMergeNode')
      .attr('in', (d) => d);

    // Arrow marker
    defs.append('marker')
      .attr('id', 'temporal-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', isDark ? '#475569' : '#94a3b8');

    // Main groups
    const g = svg.append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2));

    const linkGroup = g.append('g')
      .attr('class', 'links')
      .attr('fill', 'none');

    const nodeGroup = g.append('g')
      .attr('class', 'nodes');

    // Stats overlay
    const statsGroup = svg.append('g')
      .attr('transform', `translate(${width - 20}, 20)`)
      .attr('text-anchor', 'end');

    const statsDate = statsGroup.append('text')
      .attr('fill', isDark ? '#94a3b8' : '#64748b')
      .attr('font-size', '13px')
      .attr('font-family', 'var(--font-family, system-ui)')
      .attr('font-variant-numeric', 'tabular-nums')
      .attr('dy', 0);

    const statsNodes = statsGroup.append('text')
      .attr('fill', isDark ? '#e2e8f0' : '#1e293b')
      .attr('font-size', '11px')
      .attr('font-family', 'var(--font-family, system-ui)')
      .attr('font-variant-numeric', 'tabular-nums')
      .attr('dy', 18);

    const statsEdges = statsGroup.append('text')
      .attr('fill', isDark ? '#94a3b8' : '#64748b')
      .attr('font-size', '10px')
      .attr('font-family', 'var(--font-family, system-ui)')
      .attr('font-variant-numeric', 'tabular-nums')
      .attr('dy', 32);

    // Track current visible sets
    let currentNodes: SimNode[] = [];
    let currentLinks: SimLink[] = [];
    let prevNodeIds = new Set<string>();

    function getNodeColor(n: SimNode): string {
      if (n.data.type === NodeType.USER)
        return isDark ? USER_COLOR_DARK : USER_COLOR_LIGHT;
      if (n.data.type === NodeType.ORGANIZATION)
        return isDark ? ORG_COLOR_DARK : ORG_COLOR_LIGHT;
      return palette[n.colorIndex % palette.length];
    }

    function getNodeOpacity(n: SimNode, cursor: number): number {
      // Nodes that just appeared are fully opaque; older nodes slightly fade
      if (n.enterTime <= 0) return 0.85;
      const age = cursor - n.enterTime;
      const recentWindow = 30 * 86_400_000; // 30 days
      if (age < recentWindow) return 1.0;
      return 0.85;
    }

    function isRecent(enterTime: number, cursor: number): boolean {
      const window = 14 * 86_400_000; // 14 days
      return enterTime > 0 && (cursor - enterTime) < window;
    }

    // ── Simulation ──
    const simulation = d3.forceSimulation<SimNode>()
      .force('charge', d3.forceManyBody<SimNode>().strength((d) => {
        // Spaces push more, users/orgs less
        if (d.data.type === NodeType.SPACE_L0) return -200;
        if (d.data.type === NodeType.SPACE_L1) return -120;
        if (d.data.type === NodeType.SPACE_L2) return -80;
        return -40;
      }))
      .force('link', d3.forceLink<SimNode, SimLink>().id((d) => d.data.id).distance(60).strength(0.3))
      .force('x', d3.forceX<SimNode>(0).strength(0.03))
      .force('y', d3.forceY<SimNode>(0).strength(0.03))
      .force('collision', d3.forceCollide<SimNode>().radius((d) => d.radius + 2).iterations(2))
      .alphaDecay(0.02)
      .on('tick', ticked);

    simulationRef.current = simulation;

    // Drag behavior
    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    function ticked() {
      // Update link positions
      linkGroup.selectAll<SVGPathElement, SimLink>('path')
        .attr('d', (d) => {
          const s = d.source as SimNode;
          const t = d.target as SimNode;
          const sx = s.x ?? 0, sy = s.y ?? 0;
          const tx = t.x ?? 0, ty = t.y ?? 0;
          const dx = tx - sx, dy = ty - sy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const curve = dist * 0.1;
          const mx = (sx + tx) / 2 - (dy / dist) * curve;
          const my = (sy + ty) / 2 + (dx / dist) * curve;
          return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
        });

      // Update node positions
      nodeGroup.selectAll<SVGGElement, SimNode>('g.temporal-node')
        .attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    }

    // ── Update function — called whenever temporal cursor changes ──
    function updateVisibility(cursor: number) {
      // Filter visible nodes and links
      const visibleNodes = simNodes.filter((n) => n.enterTime <= cursor || n.enterTime === 0);
      const visibleNodeIds = new Set(visibleNodes.map((n) => n.data.id));
      const visibleLinks = simLinks.filter((l) => {
        const srcId = (l.source as SimNode).data.id;
        const tgtId = (l.target as SimNode).data.id;
        if (!visibleNodeIds.has(srcId) || !visibleNodeIds.has(tgtId)) return false;
        return l.enterTime <= cursor || l.enterTime === 0;
      });

      // Determine newly appeared nodes
      const newNodeIds = new Set<string>();
      for (const n of visibleNodes) {
        if (!prevNodeIds.has(n.data.id)) newNodeIds.add(n.data.id);
      }

      currentNodes = visibleNodes;
      currentLinks = visibleLinks;

      // ── Links ──
      const link = linkGroup.selectAll<SVGPathElement, SimLink>('path')
        .data(visibleLinks, (d) => `${(d.source as SimNode).data.id}-${(d.target as SimNode).data.id}-${d.data.type}`);

      link.exit()
        .transition().duration(200).attr('stroke-opacity', 0).remove();

      const linkEnter = link.enter()
        .append('path')
        .attr('stroke', (d) => {
          // Color by edge type
          if (d.data.type === EdgeType.LEAD) return isDark ? '#f59e0b' : '#d97706';
          if (d.data.type === EdgeType.ADMIN) return isDark ? '#ef4444' : '#dc2626';
          // For MEMBER/CHILD, use target space color
          const target = d.target as SimNode;
          return d3.color(getNodeColor(target))?.copy({ opacity: 0.5 })?.formatRgb() ?? (isDark ? '#475569' : '#cbd5e1');
        })
        .attr('stroke-width', (d) => {
          if (d.data.type === EdgeType.CHILD) return 2;
          if (d.data.type === EdgeType.LEAD) return 1.5;
          if (d.data.type === EdgeType.ADMIN) return 1.5;
          return 0.8;
        })
        .attr('stroke-opacity', 0)
        .attr('marker-end', (d) => d.data.type === EdgeType.CHILD ? '' : 'url(#temporal-arrow)');

      linkEnter.transition().duration(400)
        .attr('stroke-opacity', (d) => {
          if (d.data.type === EdgeType.CHILD) return 0.6;
          return isRecent(d.enterTime, cursor) ? 0.7 : 0.35;
        });

      // ── Nodes ──
      const node = nodeGroup.selectAll<SVGGElement, SimNode>('g.temporal-node')
        .data(visibleNodes, (d) => d.data.id);

      node.exit<SimNode>()
        .transition().duration(200)
        .attr('opacity', 0)
        .attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0}) scale(0.3)`)
        .remove();

      const nodeEnter = node.enter()
        .append('g')
        .attr('class', 'temporal-node')
        .attr('cursor', 'pointer')
        .call(drag)
        .on('click', (_event, d) => {
          onNodeSelect(d.data.id === selectedNodeIdRef.current ? null : d.data.id);
        });

      // Circle
      nodeEnter.append('circle')
        .attr('r', (d) => d.radius)
        .attr('fill', (d) => getNodeColor(d))
        .attr('stroke', isDark ? '#1e293b' : '#ffffff')
        .attr('stroke-width', 1.5)
        .attr('opacity', (d) => getNodeOpacity(d, cursor));

      // Avatar image (for spaces)
      nodeEnter.each(function (d) {
        if (d.data.avatarUrl && d.radius >= 8) {
          const clipId = `temp-clip-${d.data.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const g = d3.select(this);
          g.append('clipPath')
            .attr('id', clipId)
            .append('circle')
            .attr('r', d.radius - 1.5);
          g.append('image')
            .attr('href', d.data.avatarUrl)
            .attr('x', -(d.radius - 1.5))
            .attr('y', -(d.radius - 1.5))
            .attr('width', (d.radius - 1.5) * 2)
            .attr('height', (d.radius - 1.5) * 2)
            .attr('clip-path', `url(#${clipId})`)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .style('pointer-events', 'none');
        }
      });

      // Label (spaces only, with enough room)
      nodeEnter.filter((d) =>
        d.data.type === NodeType.SPACE_L0 ||
        d.data.type === NodeType.SPACE_L1,
      ).append('text')
        .attr('dy', (d) => d.radius + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', isDark ? '#e2e8f0' : '#374151')
        .attr('font-size', (d) => d.data.type === NodeType.SPACE_L0 ? '10px' : '8px')
        .attr('font-weight', (d) => d.data.type === NodeType.SPACE_L0 ? 600 : 400)
        .attr('font-family', 'var(--font-family, system-ui)')
        .style('pointer-events', 'none')
        .style('text-shadow', isDark ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px rgba(255,255,255,0.9)')
        .text((d) => d.data.displayName.length > 16 ? d.data.displayName.slice(0, 15) + '…' : d.data.displayName);

      // Lock badge for private spaces
      nodeEnter.filter((d) => d.data.privacyMode === 'PRIVATE')
        .append('text')
        .attr('x', (d) => d.radius * 0.5)
        .attr('y', (d) => -d.radius * 0.5)
        .attr('font-size', '8px')
        .style('pointer-events', 'none')
        .text('🔒');

      // Entrance animation for NEW nodes
      nodeEnter.filter((d) => newNodeIds.has(d.data.id))
        .attr('opacity', 0)
        .attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0}) scale(0.1)`)
        .transition().duration(500).ease(d3.easeBackOut.overshoot(1.5))
        .attr('opacity', 1)
        .attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0}) scale(1)`);

      // Pulse glow on recently appeared nodes
      nodeEnter.filter((d) => newNodeIds.has(d.data.id))
        .select('circle')
        .attr('filter', 'url(#temporal-pulse)')
        .transition().delay(500).duration(1000)
        .attr('filter', null);

      // Update existing nodes: highlight selection, update opacity
      const allNodes = nodeGroup.selectAll<SVGGElement, SimNode>('g.temporal-node');
      allNodes.select('circle')
        .attr('stroke', (d) => d.data.id === selectedNodeIdRef.current
          ? '#f59e0b'
          : (isDark ? '#1e293b' : '#ffffff'))
        .attr('stroke-width', (d) => d.data.id === selectedNodeIdRef.current ? 2.5 : 1.5);

      // Update simulation
      simulation.nodes(visibleNodes);
      (simulation.force('link') as d3.ForceLink<SimNode, SimLink>)
        .links(visibleLinks);

      // Warm restart for layout adaptation
      if (simulation.alpha() < 0.1) {
        simulation.alpha(0.15).restart();
      }

      // Update stats
      const spaceCount = visibleNodes.filter((n) =>
        n.data.type === NodeType.SPACE_L0 ||
        n.data.type === NodeType.SPACE_L1 ||
        n.data.type === NodeType.SPACE_L2,
      ).length;
      const memberCount = visibleNodes.filter((n) =>
        n.data.type === NodeType.USER ||
        n.data.type === NodeType.ORGANIZATION,
      ).length;

      statsDate.text(d3.timeFormat('%B %d, %Y')(new Date(cursor)));
      statsNodes.text(`${spaceCount} spaces · ${memberCount} members`);
      statsEdges.text(`${visibleLinks.length} connections`);

      prevNodeIds = visibleNodeIds;
    }

    // Initial render
    const cursor = temporalDateRef.current?.getTime() ?? 0;
    updateVisibility(cursor);

    // Store update function for external calls
    (svgRef.current as any).__updateVisibility = updateVisibility;

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [simNodes, simLinks, width, height, onNodeSelect]);

  // ── React to temporal date changes ────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const updateFn = (svgRef.current as any).__updateVisibility;
    if (!updateFn || !temporalDate) return;
    updateFn(temporalDate.getTime());
  }, [temporalDate]);

  // ── React to selection changes ────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const isDark = theme.isDark;

    svg.selectAll<SVGGElement, SimNode>('g.temporal-node')
      .select('circle')
      .attr('stroke', (d) => d.data.id === selectedNodeId
        ? '#f59e0b'
        : (isDark ? '#1e293b' : '#ffffff'))
      .attr('stroke-width', (d) => d.data.id === selectedNodeId ? 2.5 : 1.5);
  }, [selectedNodeId, theme.isDark]);

  if (!dataset || width <= 0 || height <= 0) {
    return (
      <div className={viewStyles.emptyState}>
        <span className={viewStyles.emptyIcon}>⏱</span>
        <span className={viewStyles.emptyTitle}>No temporal data</span>
        <span className={viewStyles.emptyMessage}>Activity data is required for the temporal view</span>
      </div>
    );
  }

  return (
    <div className={viewStyles.viewContainer} style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block' }}
      />
    </div>
  );
}
