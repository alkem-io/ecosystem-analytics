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

import { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import type { GraphDataset, GraphNode, GraphEdge, ActivityPeriod } from '@server/types/graph.js';
import { NodeType, EdgeType } from '@server/types/graph.js';
import { getToken } from '../../services/auth.js';
import { useViewTheme } from '../../hooks/useViewTheme.js';
import viewStyles from './Views.module.css';

// ─── Image helpers (shared with ForceGraph) ─────────────────────

/** Proxy private Alkemio storage URLs through our auth endpoint */
function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('/api/private/')) {
    const token = getToken();
    return `/api/image-proxy?url=${encodeURIComponent(url)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  }
  return url;
}

/** Pick the best image URL for a node: spaces prefer bannerUrl, users/orgs prefer avatarUrl */
function nodeImageUrl(node: { type: string; avatarUrl: string | null; bannerUrl: string | null }): string | null {
  if (node.type.startsWith('SPACE_')) {
    return node.bannerUrl || node.avatarUrl || null;
  }
  return node.avatarUrl || null;
}

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
  SPACE_L0: 20, SPACE_L1: 14, SPACE_L2: 10,
  ORGANIZATION: 8, USER: 8,
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
  // Filter toggles (matching FilterControls)
  showPeople?: boolean;
  showOrganizations?: boolean;
  showSpaces?: boolean;
  showMembers?: boolean;
  showLeads?: boolean;
  showAdmins?: boolean;
  showPublic?: boolean;
  showPrivate?: boolean;
}

export default function TemporalForceView({
  dataset,
  temporalDate,
  selectedNodeId,
  onNodeSelect,
  activityPeriod = 'allTime',
  width,
  height,
  showPeople = true,
  showOrganizations = true,
  showSpaces = true,
  showMembers = true,
  showLeads = true,
  showAdmins = true,
  showPublic = true,
  showPrivate = true,
}: TemporalForceViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const theme = useViewTheme();

  // Stable refs for callback access
  const temporalDateRef = useRef(temporalDate);
  temporalDateRef.current = temporalDate;
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Stable ref for filter state — read by D3 updateVisibility without triggering rebuild
  const filtersRef = useRef({
    showPeople, showOrganizations, showSpaces,
    showMembers, showLeads, showAdmins,
    showPublic, showPrivate,
  });
  filtersRef.current = {
    showPeople, showOrganizations, showSpaces,
    showMembers, showLeads, showAdmins,
    showPublic, showPrivate,
  };

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

  // ─── Compute date range ──────────────────────────────────────
  // Timeline starts at the oldest L0 space creation date
  const { minTime, maxTime, hasDates } = useMemo(() => {
    // Start: oldest L0 space
    const l0Times: number[] = [];
    for (const n of dataset.nodes) {
      if (n.type === NodeType.SPACE_L0 && n.createdDate) {
        const t = new Date(n.createdDate).getTime();
        if (!isNaN(t)) l0Times.push(t);
      }
    }
    // End: latest date across everything
    const allTimes: number[] = [...l0Times];
    for (const n of dataset.nodes) {
      if (n.type !== NodeType.SPACE_L0 && n.createdDate) {
        const t = new Date(n.createdDate).getTime();
        if (!isNaN(t)) allTimes.push(t);
      }
    }
    for (const e of dataset.edges) {
      if (e.createdDate) {
        const t = new Date(e.createdDate).getTime();
        if (!isNaN(t)) allTimes.push(t);
      }
    }
    if (l0Times.length === 0) return { minTime: 0, maxTime: 0, hasDates: false };
    return {
      minTime: Math.min(...l0Times),
      maxTime: Math.max(...allTimes),
      hasDates: true,
    };
  }, [dataset]);

  // ─── Build SimNodes & SimLinks ──────────────────────────────
  const { simNodes, simLinks, nodeMap } = useMemo(() => {
    const nMap = new Map<string, SimNode>();

    // Pre-compute: for each node, find the earliest edge date connected to it.
    // This is used to determine when users/orgs "enter" the ecosystem (join a space)
    // rather than using their platform account creation date.
    const earliestEdgeDateByNode = new Map<string, number>();
    for (const e of dataset.edges) {
      if (!e.createdDate) continue;
      const t = new Date(e.createdDate).getTime();
      if (isNaN(t)) continue;
      for (const nid of [e.sourceId, e.targetId]) {
        const prev = earliestEdgeDateByNode.get(nid);
        if (prev === undefined || t < prev) {
          earliestEdgeDateByNode.set(nid, t);
        }
      }
    }

    // First pass: build nodes with dates
    const nodes: SimNode[] = dataset.nodes.map((n) => {
      const l0Id = parentSpaceMap.get(n.id);
      const cIdx = l0Id ? (l0ColorMap.get(l0Id) ?? 0) : 0;

      let enter = NaN;
      const isSpace = n.type === NodeType.SPACE_L0 || n.type === NodeType.SPACE_L1 || n.type === NodeType.SPACE_L2;

      if (isSpace && n.createdDate) {
        // Spaces use their own createdDate (when the space was created)
        enter = new Date(n.createdDate).getTime();
      } else {
        // Users & Orgs: use the earliest edge date (when they first joined a space)
        const edgeDate = earliestEdgeDateByNode.get(n.id);
        if (edgeDate !== undefined) {
          enter = edgeDate;
        }
        // NOTE: Do NOT fall back to n.createdDate (account creation) — it's not
        // when they joined this space. Undated users are handled in the second pass.
      }

      const sn: SimNode = {
        data: n,
        enterTime: isNaN(enter) ? NaN : enter,
        radius: computeRadius(n),
        colorIndex: cIdx,
      };
      nMap.set(n.id, sn);
      return sn;
    });

    // Second pass: resolve undated nodes
    // Collect all undated user/org nodes and spread them evenly across the timeline
    // between minTime and maxTime. This prevents a burst of members at the start.
    const undatedUserOrgs: SimNode[] = [];
    for (const sn of nodes) {
      if (!isNaN(sn.enterTime)) continue;
      const isSpace = sn.data.type === NodeType.SPACE_L0 || sn.data.type === NodeType.SPACE_L1 || sn.data.type === NodeType.SPACE_L2;
      if (isSpace) {
        // Subspaces inherit parent date (+ small offset so they appear slightly later)
        if (sn.data.parentSpaceId) {
          const parent = nMap.get(sn.data.parentSpaceId);
          if (parent && !isNaN(parent.enterTime)) {
            sn.enterTime = parent.enterTime + 86_400_000; // +1 day
            continue;
          }
        }
        // Space without date: appear at minTime
        sn.enterTime = hasDates ? minTime : 0;
      } else {
        // User/Org without date — collect for spreading
        undatedUserOrgs.push(sn);
      }
    }

    // Spread undated users evenly between minTime and maxTime
    if (undatedUserOrgs.length > 0 && hasDates) {
      const range = maxTime - minTime;
      // Sort by display name for deterministic ordering
      undatedUserOrgs.sort((a, b) => a.data.displayName.localeCompare(b.data.displayName));
      for (let i = 0; i < undatedUserOrgs.length; i++) {
        // Distribute from 10% to 90% of the time range
        const frac = 0.1 + (0.8 * i / Math.max(1, undatedUserOrgs.length - 1));
        undatedUserOrgs[i].enterTime = minTime + range * frac;
      }
    } else {
      // No dates at all — show everything
      for (const sn of undatedUserOrgs) {
        sn.enterTime = 0;
      }
    }

    // Build links: enter when both endpoints exist, or use explicit edge date
    const links: SimLink[] = dataset.edges
      .map((e) => {
        const source = nMap.get(e.sourceId);
        const target = nMap.get(e.targetId);
        if (!source || !target) return null;
        let enter = 0;
        if (e.createdDate) {
          enter = new Date(e.createdDate).getTime();
        } else {
          // Edge appears when its later endpoint appears
          enter = Math.max(source.enterTime || 0, target.enterTime || 0);
        }
        return {
          source,
          target,
          data: e,
          enterTime: isNaN(enter) ? 0 : enter,
        } as SimLink;
      })
      .filter((l): l is SimLink => l !== null);

    return { simNodes: nodes, simLinks: links, nodeMap: nMap };
  }, [dataset, l0ColorMap, parentSpaceMap, minTime, maxTime, hasDates]);

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
    // Radial layout: L0 spaces spread around a ring, everything else pulled to center
    const viewRadius = Math.min(width, height) * 0.38;

    const simulation = d3.forceSimulation<SimNode>()
      .force('charge', d3.forceManyBody<SimNode>().strength((d) => {
        if (d.data.type === NodeType.SPACE_L0) return -500;
        if (d.data.type === NodeType.SPACE_L1) return -250;
        if (d.data.type === NodeType.SPACE_L2) return -120;
        return -30;  // Users/orgs: light repulsion only
      }))
      .force('link', d3.forceLink<SimNode, SimLink>().id((d) => d.data.id)
        .distance((d) => {
          const src = (d.source as SimNode).data.type;
          const tgt = (d.target as SimNode).data.type;
          if (src.startsWith('SPACE_') && tgt.startsWith('SPACE_')) return 140;
          return 50;  // Keep users close to their space
        })
        .strength((d) => {
          const e = d.data.type;
          if (e === EdgeType.CHILD) return 0.12;
          return 0.35;  // User→Space: strong pull to cluster around space
        }))
      // Radial force pushes L0 spaces out to a ring
      .force('radial', d3.forceRadial<SimNode>(
        (d) => d.data.type === NodeType.SPACE_L0 ? viewRadius : 0,
        0, 0,
      ).strength((d) => d.data.type === NodeType.SPACE_L0 ? 0.4 : 0))
      .force('x', d3.forceX<SimNode>(0).strength(0.015))
      .force('y', d3.forceY<SimNode>(0).strength(0.015))
      .force('collision', d3.forceCollide<SimNode>().radius((d) => d.radius + 3).iterations(3))
      .alphaDecay(0.02)
      .alpha(0.5)
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

    // ── Highlight helpers — show edges only for hovered/selected node ──
    function highlightConnections(nodeId: string) {
      // Show edges connected to this node, hide all others (except CHILD)
      linkGroup.selectAll<SVGPathElement, SimLink>('path')
        .attr('stroke-opacity', (d) => {
          if (d.data.type === EdgeType.CHILD) return 0.5;
          const srcId = (d.source as SimNode).data.id;
          const tgtId = (d.target as SimNode).data.id;
          if (srcId === nodeId || tgtId === nodeId) return 0.65;
          return 0;
        });
      // Dim non-connected nodes
      nodeGroup.selectAll<SVGGElement, SimNode>('g.temporal-node')
        .attr('opacity', (d) => {
          if (d.data.id === nodeId) return 1;
          // Check if connected
          const connected = currentLinks.some((l) => {
            const src = (l.source as SimNode).data.id;
            const tgt = (l.target as SimNode).data.id;
            return (src === nodeId && tgt === d.data.id) || (tgt === nodeId && src === d.data.id);
          });
          return connected ? 1 : 0.25;
        });
    }

    function clearHighlight() {
      linkGroup.selectAll<SVGPathElement, SimLink>('path')
        .attr('stroke-opacity', (d) => d.data.type === EdgeType.CHILD ? 0.5 : 0);
      nodeGroup.selectAll<SVGGElement, SimNode>('g.temporal-node')
        .attr('opacity', 1);
    }

    // ── Update function — called whenever temporal cursor changes ──
    let prevVisibleCount = 0;

    function updateVisibility(cursor: number) {
      // Read current filter state from refs
      const fShowPeople = filtersRef.current.showPeople;
      const fShowOrgs = filtersRef.current.showOrganizations;
      const fShowSpaces = filtersRef.current.showSpaces;
      const fShowMembers = filtersRef.current.showMembers;
      const fShowLeads = filtersRef.current.showLeads;
      const fShowAdmins = filtersRef.current.showAdmins;
      const fShowPublic = filtersRef.current.showPublic;
      const fShowPrivate = filtersRef.current.showPrivate;

      // Filter visible nodes: temporal + type/role/visibility filters
      const visibleNodes = simNodes.filter((n) => {
        if (n.enterTime > cursor) return false;
        const t = n.data.type;
        // Node-type filters
        if (t === NodeType.USER && !fShowPeople) return false;
        if (t === NodeType.ORGANIZATION && !fShowOrgs) return false;
        if ((t === NodeType.SPACE_L0 || t === NodeType.SPACE_L1 || t === NodeType.SPACE_L2) && !fShowSpaces) return false;
        // Visibility filters (spaces only)
        if (t === NodeType.SPACE_L0 || t === NodeType.SPACE_L1 || t === NodeType.SPACE_L2) {
          if (n.data.privacyMode === 'PUBLIC' && !fShowPublic) return false;
          if (n.data.privacyMode === 'PRIVATE' && !fShowPrivate) return false;
        }
        return true;
      });
      const visibleNodeIds = new Set(visibleNodes.map((n) => n.data.id));
      const visibleLinks = simLinks.filter((l) => {
        const srcId = (l.source as SimNode).data.id;
        const tgtId = (l.target as SimNode).data.id;
        if (!visibleNodeIds.has(srcId) || !visibleNodeIds.has(tgtId)) return false;
        if (l.enterTime > cursor) return false;
        // Role filters: hide edges by type
        if (l.data.type === EdgeType.MEMBER && !fShowMembers) return false;
        if (l.data.type === EdgeType.LEAD && !fShowLeads) return false;
        if (l.data.type === EdgeType.ADMIN && !fShowAdmins) return false;
        return true;
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

      link.exit().remove();

      const linkEnter = link.enter()
        .append('path')
        .attr('stroke', (d) => {
          if (d.data.type === EdgeType.LEAD) return isDark ? '#f59e0b' : '#d97706';
          if (d.data.type === EdgeType.ADMIN) return isDark ? '#ef4444' : '#dc2626';
          const target = d.target as SimNode;
          return d3.color(getNodeColor(target))?.copy({ opacity: 0.5 })?.formatRgb() ?? (isDark ? '#475569' : '#cbd5e1');
        })
        .attr('stroke-width', (d) => {
          if (d.data.type === EdgeType.CHILD) return 1.8;
          if (d.data.type === EdgeType.LEAD) return 1.2;
          if (d.data.type === EdgeType.ADMIN) return 1.2;
          return 0.6;
        })
        // Member/Lead/Admin edges hidden by default; only CHILD edges visible
        .attr('stroke-opacity', (d) => d.data.type === EdgeType.CHILD ? 0.5 : 0)
        .attr('fill', 'none')
        .attr('marker-end', (d) => d.data.type === EdgeType.CHILD ? '' : 'url(#temporal-arrow)');

      // ── Nodes ──
      const node = nodeGroup.selectAll<SVGGElement, SimNode>('g.temporal-node')
        .data(visibleNodes, (d) => d.data.id);

      node.exit().remove();

      const nodeEnter = node.enter()
        .append('g')
        .attr('class', 'temporal-node')
        .attr('cursor', 'pointer')
        .call(drag)
        .on('click', (_event, d) => {
          onNodeSelectRef.current(d.data.id === selectedNodeIdRef.current ? null : d.data.id);
        })
        .on('mouseenter', (_event, d) => {
          highlightConnections(d.data.id);
        })
        .on('mouseleave', () => {
          // If a node is selected, keep its connections highlighted; otherwise clear
          const selId = selectedNodeIdRef.current;
          if (selId) {
            highlightConnections(selId);
          } else {
            clearHighlight();
          }
        });

      // Circle — white background when avatar present, colored otherwise
      nodeEnter.append('circle')
        .attr('r', (d) => d.radius)
        .attr('fill', (d) => nodeImageUrl(d.data) ? (isDark ? '#1e293b' : '#ffffff') : getNodeColor(d))
        .attr('stroke', (d) => {
          if (nodeImageUrl(d.data)) return getNodeColor(d);  // colored ring around avatar
          return isDark ? '#1e293b' : '#ffffff';
        })
        .attr('stroke-width', (d) => nodeImageUrl(d.data) ? 2 : 1.5)
        .attr('opacity', (d) => getNodeOpacity(d, cursor));

      // Avatar image (for ALL node types with images)
      nodeEnter.each(function (d) {
        const imgUrl = proxyImageUrl(nodeImageUrl(d.data));
        if (!imgUrl) return;
        const r = d.radius;
        const clipId = `temp-clip-${d.data.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const g = d3.select(this);
        g.append('clipPath')
          .attr('id', clipId)
          .append('circle')
          .attr('r', r - 1);
        const imgEl = g.append('image')
          .attr('href', imgUrl)
          .attr('x', -(r - 1))
          .attr('y', -(r - 1))
          .attr('width', (r - 1) * 2)
          .attr('height', (r - 1) * 2)
          .attr('clip-path', `url(#${clipId})`)
          .attr('preserveAspectRatio', 'xMidYMid slice')
          .style('pointer-events', 'none')
          .on('error', function () { d3.select(this).remove(); });
        // Detect Alkemio default placeholder banners (square padlock icons)
        if (d.data.type.startsWith('SPACE_') && d.data.bannerUrl) {
          const probe = new Image();
          probe.onload = () => {
            if (probe.naturalWidth / probe.naturalHeight < 1.3) {
              imgEl.remove();
            }
          };
          probe.onerror = () => imgEl.remove();
          probe.src = imgUrl;
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
        .attr('stroke', (d) => {
          if (d.data.id === selectedNodeIdRef.current) return '#f59e0b';
          if (nodeImageUrl(d.data)) return getNodeColor(d);
          return isDark ? '#1e293b' : '#ffffff';
        })
        .attr('stroke-width', (d) => d.data.id === selectedNodeIdRef.current ? 2.5 : (nodeImageUrl(d.data) ? 2 : 1.5));

      // Restore highlight for selected node
      if (selectedNodeIdRef.current) {
        highlightConnections(selectedNodeIdRef.current);
      }

      // Update simulation
      simulation.nodes(visibleNodes);
      (simulation.force('link') as d3.ForceLink<SimNode, SimLink>)
        .links(visibleLinks);

      // Only reheat simulation when new nodes appear
      const countChanged = visibleNodes.length !== prevVisibleCount;
      prevVisibleCount = visibleNodes.length;
      if (countChanged) {
        // Reheat to at least 0.1 — don't lower alpha if it's already above that
        simulation.alpha(Math.max(simulation.alpha(), 0.1)).restart();
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

    // Initial render — if temporalDate is null, start at minTime so L0 spaces appear
    const cursor = temporalDateRef.current?.getTime() ?? (hasDates ? minTime : Date.now());
    updateVisibility(cursor);

    // Store update function for external calls
    (svgRef.current as any).__updateVisibility = updateVisibility;

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  // NOTE: onNodeSelect excluded — accessed via onNodeSelectRef to prevent
  // D3 teardown/rebuild on every parent render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simNodes, simLinks, width, height, hasDates, minTime]);

  // ── React to temporal date changes ────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const updateFn = (svgRef.current as any).__updateVisibility;
    if (!updateFn || !temporalDate) return;
    updateFn(temporalDate.getTime());
  }, [temporalDate]);

  // ── React to filter changes ───────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const updateFn = (svgRef.current as any).__updateVisibility;
    if (!updateFn) return;
    const cursor = temporalDateRef.current?.getTime();
    if (cursor != null) updateFn(cursor);
  }, [showPeople, showOrganizations, showSpaces, showMembers, showLeads, showAdmins, showPublic, showPrivate]);

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
        <span className={viewStyles.emptyMessage}>Space creation dates are required for the temporal view. Try refreshing.</span>
      </div>
    );
  }

  // Show a warning banner when no nodes have real dates (stale cache)
  const showNoDateWarning = !hasDates;

  return (
    <div className={viewStyles.viewContainer} style={{ width, height }}>
      {showNoDateWarning && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, background: theme.isDark ? '#1e293b' : '#fef3c7',
          color: theme.isDark ? '#fbbf24' : '#92400e',
          padding: '6px 16px', borderRadius: 6, fontSize: 12,
          border: `1px solid ${theme.isDark ? '#854d0e' : '#fcd34d'}`,
        }}>
          ⚠ No creation dates in cached data — refresh to fetch temporal data from Alkemio
        </div>
      )}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block' }}
      />
    </div>
  );
}
