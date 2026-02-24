import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { geoMercator, geoPath } from 'd3-geo';
import type { GraphDataset, GraphNode, GraphEdge } from '@server/types/graph.js';
import { computeClusters } from './clustering.js';
import { computeProximityGroups, type ProximityCluster } from './proximityClustering.js';
import type { MapRegion } from '../map/MapOverlay.js';
import { getToken } from '../../services/auth.js';
import styles from './ForceGraph.module.css';

/** Proxy private Alkemio storage URLs through our auth endpoint */
function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('/api/private/')) {
    const token = getToken();
    return `/api/image-proxy?url=${encodeURIComponent(url)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  }
  return url;
}

const NODE_COLORS: Record<string, string> = {
  SPACE_L0: 'var(--node-space-l0)',
  SPACE_L1: 'var(--node-space-l1)',
  SPACE_L2: 'var(--node-space-l2)',
  ORGANIZATION: 'var(--node-organization)',
  USER: 'var(--node-user)',
};

const PROXIMITY_THRESHOLD = 10;   // only merge truly overlapping nodes
const MAX_NODES_FOR_CLUSTERING = 500;
const ZOOM_TRANSITION_MS = 600;
const LABEL_MAX_CHARS = 30;     // truncate long labels
const FANOUT_RADIUS = 80;       // radius of the fan-out circle when revealing a cluster

// Hierarchical radial layout — flower-circle clustering
// Ring radii are now RESPONSIVE — computed from member count per space
const L1_RING_RADIUS_MIN = 220;   // minimum L0→L1 distance
const L1_RING_RADIUS_PER_MEMBER = 4;  // extra distance per L0-only member
const L1_RING_RADIUS_PER_NODE = 40;   // extra distance per L1 child
const L2_RING_RADIUS_MIN = 65;    // minimum L1→L2 distance
const L2_RING_RADIUS_PER_MEMBER = 3;  // extra distance per L1-direct member
const L2_RING_RADIUS_PER_NODE = 16;   // extra distance per L2 child
const PEOPLE_RING_RADIUS = 65;
const L0_ONLY_PEOPLE_RADIUS = 36;

// Edge styling — refined, professional palette
const EDGE_COLORS: Record<string, string> = {
  CHILD: 'rgba(99,102,241,0.30)',    // indigo for parent-child
  LEAD: 'rgba(170,135,55,0.35)',     // warm brown for leadership
  MEMBER: 'rgba(150,170,190,0.18)', // soft blue-gray — visible but not overwhelming
};

/**
 * Scale highlight stroke widths inversely with the number of direct connections.
 * A node with 5 edges can afford fat highlight lines; one with 138 connections
 * needs hairlines so the graph stays readable.
 */
function highlightEdgeWidth(connectionCount: number, tier: 'direct' | '2nd'): number {
  //  connections  direct  2nd
  //  ≤ 10         2.5     1.5
  //  ~50          1.2     0.7
  //  ≥ 100        0.8     0.4
  const base = tier === 'direct' ? 2.5 : 1.5;
  const scale = Math.max(0.3, 1 / (1 + connectionCount * 0.015));
  return Math.round(base * scale * 10) / 10;
}
function highlightNodeStroke(connectionCount: number, tier: 'selected' | '1st' | '2nd'): number {
  const base = tier === 'selected' ? 4 : tier === '1st' ? 3 : 1.8;
  const scale = Math.max(0.45, 1 / (1 + connectionCount * 0.01));
  return Math.round(base * scale * 10) / 10;
}

// Soft pastel palette for cluster hull backgrounds (non-map view)
const HULL_COLORS = [
  'rgba(99,102,241,0.07)',   // indigo
  'rgba(16,185,129,0.07)',   // emerald
  'rgba(245,158,11,0.07)',   // amber
  'rgba(239,68,68,0.07)',    // red
  'rgba(139,92,246,0.07)',   // violet
  'rgba(6,182,212,0.07)',    // cyan
  'rgba(236,72,153,0.07)',   // pink
  'rgba(34,197,94,0.07)',    // green
];
const HULL_STROKES = [
  'rgba(99,102,241,0.18)',
  'rgba(16,185,129,0.18)',
  'rgba(245,158,11,0.18)',
  'rgba(239,68,68,0.18)',
  'rgba(139,92,246,0.18)',
  'rgba(6,182,212,0.18)',
  'rgba(236,72,153,0.18)',
  'rgba(34,197,94,0.18)',
];

const MAP_URLS: Record<MapRegion, string> = {
  world: '/maps/world.geojson',
  europe: '/maps/europe.geojson',
  netherlands: '/maps/netherlands.geojson',
};

const MAP_CENTERS: Record<MapRegion, [number, number]> = {
  world: [0, 20],
  europe: [15, 50],
  netherlands: [5.3, 52.2],
};

const MAP_SCALES: Record<MapRegion, number> = {
  world: 180,
  europe: 900,
  netherlands: 7000,
};

interface Props {
  dataset: GraphDataset;
  showPeople: boolean;
  showOrganizations: boolean;
  showSpaces: boolean;
  searchQuery: string;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null, position?: { x: number; y: number }) => void;
  selectedNodeId: string | null;
  highlightedNodeIds?: string[];
  showMap?: boolean;
  mapRegion?: MapRegion;
}

interface SimNode extends d3.SimulationNodeDatum {
  data: GraphNode;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  data: GraphEdge;
}

/** Base radius per type — the minimum size when a node has few connections */
const BASE_RADIUS: Record<string, number> = {
  SPACE_L0: 18,
  SPACE_L1: 14,
  SPACE_L2: 9,
  ORGANIZATION: 7,
  USER: 8,
};
/** Max scale factor per category — L0 capped lower to avoid dominating */
const MAX_DEGREE_SCALE: Record<string, number> = {
  space: 1.5,   // L0/L1/L2 grow modestly
  org: 3.5,
  people: 3.5,
};

/**
 * Compute node radius. Uses an external degree map for connection-based scaling.
 * Scaling is relative to the max degree *within the same node category* so
 * users scale against other users, not against high-degree L0 spaces.
 */
let _nodeDegree: Map<string, number> = new Map();
let _maxDegreeByCategory: Record<string, number> = {};

function _category(type: string): string {
  if (type === 'SPACE_L0' || type === 'SPACE_L1' || type === 'SPACE_L2') return 'space';
  if (type === 'ORGANIZATION') return 'org';
  return 'people';
}

function nodeRadius(d: { data: { type: string; weight: number; id: string } }): number {
  const base = BASE_RADIUS[d.data.type] ?? Math.sqrt(d.data.weight) * 3;
  const degree = _nodeDegree.get(d.data.id) || 0;
  const cat = _category(d.data.type);
  const maxDeg = _maxDegreeByCategory[cat] || 1;
  const maxScale = MAX_DEGREE_SCALE[cat] ?? 2.0;
  // Logarithmic scaling relative to peers in same category
  const t = maxDeg > 1 ? Math.log(1 + degree) / Math.log(1 + maxDeg) : 0;
  const scale = 1 + t * (maxScale - 1);
  return base * scale;
}

export default function ForceGraph({
  dataset,
  showPeople,
  showOrganizations,
  showSpaces,
  searchQuery,
  onNodeClick,
  onNodeHover,
  selectedNodeId,
  highlightedNodeIds = [],
  showMap = false,
  mapRegion = 'europe',
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink>>(null);

  const renderGraph = useCallback(() => {
    const svg = d3.select(svgRef.current);
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll('*').remove();

    // Filter nodes based on visibility toggles
    const visibleNodes = dataset.nodes.filter((n) => {
      if (n.type === 'USER' && !showPeople) return false;
      if (n.type === 'ORGANIZATION' && !showOrganizations) return false;
      if ((n.type === 'SPACE_L0' || n.type === 'SPACE_L1' || n.type === 'SPACE_L2') && !showSpaces) return false;
      return true;
    });

    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = dataset.edges.filter(
      (e) => visibleNodeIds.has(e.sourceId) && visibleNodeIds.has(e.targetId),
    );

    // Create simulation data
    const simNodes: SimNode[] = visibleNodes.map((n) => ({ data: n }));
    const nodeMap = new Map(simNodes.map((n) => [n.data.id, n]));

    // Precompute degree (connection count) per node for radius scaling
    const degreeMap = new Map<string, number>();
    for (const e of visibleEdges) {
      degreeMap.set(e.sourceId, (degreeMap.get(e.sourceId) || 0) + 1);
      degreeMap.set(e.targetId, (degreeMap.get(e.targetId) || 0) + 1);
    }
    _nodeDegree = degreeMap;
    // Compute max degree per category so scaling is relative to peers
    const maxByCategory: Record<string, number> = {};
    for (const n of visibleNodes) {
      const cat = _category(n.type);
      const deg = degreeMap.get(n.id) || 0;
      maxByCategory[cat] = Math.max(maxByCategory[cat] || 1, deg);
    }
    _maxDegreeByCategory = maxByCategory;
    const simLinks: SimLink[] = visibleEdges
      .map((e) => ({
        source: nodeMap.get(e.sourceId)!,
        target: nodeMap.get(e.targetId)!,
        data: e,
      }))
      .filter((l) => l.source && l.target);

    // Compute clusters for hull rendering
    const clusters = computeClusters(visibleNodes, 'space');
    const clusterCenters = new Map<string, { x: number; y: number }>();

    // Build node-to-cluster map
    const nodeCluster = new Map<string, string>();
    for (const cluster of clusters) {
      for (const nodeId of cluster.nodeIds) {
        nodeCluster.set(nodeId, cluster.id);
      }
    }

    // ---- Hierarchical radial layout (flower-circle) ----
    // Build parent-child hierarchy from node data
    const childMap = new Map<string, SimNode[]>();
    for (const n of simNodes) {
      if (n.data.parentSpaceId && nodeMap.has(n.data.parentSpaceId)) {
        if (!childMap.has(n.data.parentSpaceId)) childMap.set(n.data.parentSpaceId, []);
        childMap.get(n.data.parentSpaceId)!.push(n);
      }
    }

    // Count direct MEMBER/LEAD connections per space (people around each space)
    const spaceMemberCount = new Map<string, number>();
    for (const e of visibleEdges) {
      if (e.type === 'MEMBER' || e.type === 'LEAD') {
        // Target is usually the space
        const tgtNode = nodeMap.get(e.targetId);
        const srcNode = nodeMap.get(e.sourceId);
        if (tgtNode && (tgtNode.data.type === 'SPACE_L0' || tgtNode.data.type === 'SPACE_L1' || tgtNode.data.type === 'SPACE_L2')) {
          spaceMemberCount.set(e.targetId, (spaceMemberCount.get(e.targetId) || 0) + 1);
        } else if (srcNode && (srcNode.data.type === 'SPACE_L0' || srcNode.data.type === 'SPACE_L1' || srcNode.data.type === 'SPACE_L2')) {
          spaceMemberCount.set(e.sourceId, (spaceMemberCount.get(e.sourceId) || 0) + 1);
        }
      }
    }

    // Target positions for hierarchical layout
    const targetPositions = new Map<string, { x: number; y: number }>();

    // L0 nodes: arrange in a circle, ordered by member overlap so related L0s are adjacent
    const l0Nodes = simNodes.filter(n => n.data.type === 'SPACE_L0');
    const clusterSpread = l0Nodes.length === 1
      ? 0
      : Math.min(width, height) * 0.58 + l0Nodes.length * 90;

    // Build member sets per L0 ecosystem (all people/orgs connected to any space under this L0)
    const l0MemberSets = new Map<string, Set<string>>();
    for (const l0 of l0Nodes) {
      const members = new Set<string>();
      // Collect all space IDs under this L0 (L0 itself + L1s + L2s via scopeGroups)
      const spaceIds = new Set<string>();
      for (const n of simNodes) {
        if (n.data.scopeGroups.includes(l0.data.id) &&
            (n.data.type === 'SPACE_L0' || n.data.type === 'SPACE_L1' || n.data.type === 'SPACE_L2')) {
          spaceIds.add(n.data.id);
        }
      }
      // Find all people/orgs connected to those spaces
      for (const e of visibleEdges) {
        if (e.type === 'MEMBER' || e.type === 'LEAD') {
          if (spaceIds.has(e.targetId)) members.add(e.sourceId);
          else if (spaceIds.has(e.sourceId)) members.add(e.targetId);
        }
      }
      l0MemberSets.set(l0.data.id, members);
    }

    // Compute pairwise overlap (Jaccard-like: shared members count)
    const overlap = (a: string, b: string): number => {
      const setA = l0MemberSets.get(a);
      const setB = l0MemberSets.get(b);
      if (!setA || !setB) return 0;
      let shared = 0;
      for (const id of setA) { if (setB.has(id)) shared++; }
      return shared;
    };

    // Order L0s by greedy nearest-neighbor: start with first, always pick the
    // most-overlapping unvisited neighbor next → related L0s end up adjacent
    let orderedL0: SimNode[] = [];
    if (l0Nodes.length <= 2) {
      orderedL0 = [...l0Nodes];
    } else {
      const remaining = new Set(l0Nodes.map((_, i) => i));
      let current = 0;
      remaining.delete(0);
      orderedL0.push(l0Nodes[0]);
      while (remaining.size > 0) {
        let bestIdx = -1;
        let bestOverlap = -1;
        for (const idx of remaining) {
          const ov = overlap(l0Nodes[current].data.id, l0Nodes[idx].data.id);
          if (ov > bestOverlap) { bestOverlap = ov; bestIdx = idx; }
        }
        remaining.delete(bestIdx);
        orderedL0.push(l0Nodes[bestIdx]);
        current = bestIdx;
      }
    }

    orderedL0.forEach((l0, i) => {
      const angle = orderedL0.length === 1
        ? 0
        : (2 * Math.PI * i) / orderedL0.length - Math.PI / 2;
      const l0Pos = {
        x: width / 2 + clusterSpread * Math.cos(angle),
        y: height / 2 + clusterSpread * Math.sin(angle),
      };
      targetPositions.set(l0.data.id, l0Pos);
      clusterCenters.set(l0.data.id, l0Pos);

      // L1 children: ring around L0 — radius responsive to L0's member count
      const l1Children = (childMap.get(l0.data.id) || [])
        .filter(c => c.data.type === 'SPACE_L1');
      const l0Members = spaceMemberCount.get(l0.data.id) || 0;
      const l1Radius = L1_RING_RADIUS_MIN
        + l1Children.length * L1_RING_RADIUS_PER_NODE
        + l0Members * L1_RING_RADIUS_PER_MEMBER;

      l1Children.forEach((l1, j) => {
        const l1Angle = (2 * Math.PI * j) / l1Children.length - Math.PI / 2;
        const l1Pos = {
          x: l0Pos.x + l1Radius * Math.cos(l1Angle),
          y: l0Pos.y + l1Radius * Math.sin(l1Angle),
        };
        targetPositions.set(l1.data.id, l1Pos);

        // L2 children: ring around L1 — radius responsive to L1's member count
        const l2Children = (childMap.get(l1.data.id) || [])
          .filter(c => c.data.type === 'SPACE_L2');
        const l1Members = spaceMemberCount.get(l1.data.id) || 0;
        const l2Radius = L2_RING_RADIUS_MIN
          + l2Children.length * L2_RING_RADIUS_PER_NODE
          + l1Members * L2_RING_RADIUS_PER_MEMBER;

        l2Children.forEach((l2, k) => {
          const l2Angle = (2 * Math.PI * k) / l2Children.length - Math.PI / 2;
          targetPositions.set(l2.data.id, {
            x: l1Pos.x + l2Radius * Math.cos(l2Angle),
            y: l1Pos.y + l2Radius * Math.sin(l2Angle),
          });
        });
      });
    });

    // Fallback: L1/L2 nodes without parentSpaceId or whose parent isn't visible
    for (const node of simNodes) {
      if (targetPositions.has(node.data.id)) continue;
      if (node.data.type === 'SPACE_L1' || node.data.type === 'SPACE_L2') {
        const clusterId = nodeCluster.get(node.data.id);
        const center = clusterId && clusterCenters.get(clusterId);
        if (center) {
          const angle = Math.random() * 2 * Math.PI;
          const r = node.data.type === 'SPACE_L1'
            ? L1_RING_RADIUS_MIN
            : L1_RING_RADIUS_MIN + L2_RING_RADIUS_MIN;
          targetPositions.set(node.data.id, {
            x: center.x + r * Math.cos(angle),
            y: center.y + r * Math.sin(angle),
          });
        }
      }
    }

    // Pre-build adjacency for user/org placement — track edge type for depth weighting
    const nodeEdges = new Map<string, { otherId: string; weight: number; type: string }[]>();
    for (const edge of visibleEdges) {
      if (!nodeEdges.has(edge.sourceId)) nodeEdges.set(edge.sourceId, []);
      if (!nodeEdges.has(edge.targetId)) nodeEdges.set(edge.targetId, []);
      nodeEdges.get(edge.sourceId)!.push({ otherId: edge.targetId, weight: edge.weight, type: edge.type });
      nodeEdges.get(edge.targetId)!.push({ otherId: edge.sourceId, weight: edge.weight, type: edge.type });
    }

    // Depth weight: deeper spaces carry more positioning influence
    // A person in L0 + L1a + L1b should be pulled toward L1a & L1b more than L0
    const depthWeight = (type: string): number => {
      if (type === 'SPACE_L2') return 4;
      if (type === 'SPACE_L1') return 2;
      if (type === 'SPACE_L0') return 1;
      return 0;
    };

    // Users & Orgs: position at weighted centroid of ALL membership spaces
    // Deeper (more specific) spaces have higher weight — reveals cross-cutting structure
    for (const node of simNodes) {
      if (targetPositions.has(node.data.id)) continue;

      const edges = nodeEdges.get(node.data.id) || [];
      const memberSpaces: { pos: { x: number; y: number }; w: number; id: string }[] = [];

      for (const { otherId } of edges) {
        const other = nodeMap.get(otherId);
        if (!other || !targetPositions.has(otherId)) continue;
        const dw = depthWeight(other.data.type);
        if (dw > 0) {
          memberSpaces.push({ pos: targetPositions.get(otherId)!, w: dw, id: otherId });
        }
      }

      if (memberSpaces.length > 0) {
        // Check if user is only connected to L0 (no L1/L2 memberships)
        const hasDeeper = memberSpaces.some(s => s.w > 1); // L1=2, L2=4
        const l0Only = !hasDeeper;

        // Weighted centroid of all membership spaces
        let totalW = 0, cx = 0, cy = 0;
        for (const s of memberSpaces) {
          totalW += s.w;
          cx += s.pos.x * s.w;
          cy += s.pos.y * s.w;
        }
        cx /= totalW;
        cy /= totalW;

        const angle = Math.random() * 2 * Math.PI;

        let scatter: number;
        if (l0Only) {
          // L0-only users: tight ring centered on the L0 node
          const l0Space = memberSpaces[0];
          const l0R = nodeRadius(nodeMap.get(l0Space.id)!);
          scatter = l0R + L0_ONLY_PEOPLE_RADIUS + Math.random() * 10;
        } else if (memberSpaces.length === 1) {
          // Single deeper space: ring around that space
          const deepestSpace = memberSpaces[0];
          const spaceR = nodeRadius(nodeMap.get(deepestSpace.id)!);
          scatter = spaceR + PEOPLE_RING_RADIUS + Math.random() * 15;
        } else {
          // Multi-space: between spaces, tighter scatter
          scatter = PEOPLE_RING_RADIUS * 0.6 + Math.random() * 12;
        }

        targetPositions.set(node.data.id, {
          x: cx + scatter * Math.cos(angle),
          y: cy + scatter * Math.sin(angle),
        });
      } else {
        // Fallback: use cluster center from scope groups
        const scopeGroup = node.data.scopeGroups[0];
        const clusterPos = scopeGroup && clusterCenters.get(scopeGroup);
        if (clusterPos) {
          const angle = Math.random() * 2 * Math.PI;
          targetPositions.set(node.data.id, {
            x: clusterPos.x + 100 * Math.cos(angle),
            y: clusterPos.y + 100 * Math.sin(angle),
          });
        }
      }
    }

    // Initialize node positions at their hierarchical targets
    for (const simNode of simNodes) {
      const target = targetPositions.get(simNode.data.id);
      if (target) {
        simNode.x = target.x + (Math.random() - 0.5) * 5;
        simNode.y = target.y + (Math.random() - 0.5) * 5;
      } else {
        simNode.x = width / 2 + (Math.random() - 0.5) * 100;
        simNode.y = height / 2 + (Math.random() - 0.5) * 100;
      }
    }

    // Clustering state
    let currentZoomScale = 1;
    // Track nodes that have been "revealed" from a cluster click (exempt from re-clustering)
    const revealedNodeIds = new Set<string>();

    // Setup zoom
    let simulationLocal: d3.Simulation<SimNode, SimLink> | null = null;
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 20]).on('zoom', (event) => {
      g.attr('transform', event.transform);
      currentZoomScale = event.transform.k;
      applyLOD(event.transform.k);
      // Kick simulation gently so proximity clustering recalculates
      if (simulationLocal && simulationLocal.alpha() < 0.01) {
        simulationLocal.alpha(0.01).restart();
      }
    });
    svg.call(zoom as any);

    // Background click: collapse any revealed cluster
    svg.on('click.reveal', () => {
      if (revealedNodeIds.size === 0) return;
      // Unfix the previously revealed nodes
      for (const id of revealedNodeIds) {
        const n = nodeMap.get(id);
        if (n) {
          // In geo mode, snap back to geo position; otherwise release
          const geoTarget = geoTargets.get(id);
          if (geoTarget) {
            n.fx = geoTarget.x;
            n.fy = geoTarget.y;
          } else {
            n.fx = null;
            n.fy = null;
          }
        }
      }
      revealedNodeIds.clear();
      // Restart simulation gently so nodes settle
      if (simulationLocal) {
        simulationLocal.alpha(0.3).restart();
      }
    });

    /**
     * Lightweight LOD: only counter-scale badges and adjust hull opacity.
     * Edges and labels are always handled by the tick + culling.
     */
    function applyLOD(k: number) {
      // Counter-scale badges to stay constant apparent size on screen
      const invScale = 1 / k;
      badgeLayer?.selectAll<SVGGElement, ProximityCluster>('.proximity-badge')
        .each(function (d) {
          d3.select(this).attr('transform', `translate(${d.centroidX},${d.centroidY}) scale(${invScale})`);
        });

      // Hull opacity — fainter at high zoom (detail), more visible at overview
      const hullOpacity = k < 0.5 ? 1 : k < 2 ? 1 - (k - 0.5) * 0.5 : 0.25;
      hullLayer?.selectAll('.cluster-hull').attr('opacity', hullOpacity);

      // Re-cull labels on zoom change
      cullOverlappingLabels();
    }

    // Build projection for geo-pinning
    const projection = showMap
      ? geoMercator()
          .center(MAP_CENTERS[mapRegion])
          .scale(MAP_SCALES[mapRegion])
          .translate([width / 2, height / 2])
      : null;

    // Render map paths inside the zoom group (behind everything)
    if (showMap && projection) {
      const mapGroup = g.append('g').attr('class', 'map-layer');
      const path = geoPath().projection(projection);

      fetch(MAP_URLS[mapRegion])
        .then((res) => {
          if (!res.ok) throw new Error('Map not found');
          return res.json();
        })
        .then((geojson) => {
          const isWorldMap = mapRegion === 'world';

          // Draw country/region paths
          mapGroup
            .selectAll('path')
            .data(geojson.features || [geojson])
            .join('path')
            .attr('d', path as any)
            .attr('fill', isWorldMap ? 'rgba(180, 180, 180, 0.3)' : 'rgba(200, 210, 220, 0.5)')
            .attr('stroke', isWorldMap ? '#fff' : 'rgba(100, 120, 140, 0.5)')
            .attr('stroke-width', isWorldMap ? 0.5 : 0.8)
            .style('pointer-events', 'none');

          // Add region/country labels for non-world maps
          if (!isWorldMap) {
            mapGroup
              .selectAll('text.region-label')
              .data(geojson.features || [])
              .join('text')
              .attr('class', 'region-label')
              .attr('transform', (d: any) => {
                const centroid = path.centroid(d);
                return centroid ? `translate(${centroid[0]},${centroid[1]})` : '';
              })
              .attr('text-anchor', 'middle')
              .attr('fill', 'rgba(80, 100, 120, 0.5)')
              .attr('font-size', mapRegion === 'netherlands' ? 8 : 7)
              .attr('pointer-events', 'none')
              .text((d: any) => d.properties?.name || d.properties?.NAME || '');
          }
        })
        .catch(() => {
          mapGroup
            .append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--text-muted)')
            .attr('font-size', 14)
            .text('Map unavailable');
        });
    }

    // Precompute geo target positions for nodes with location data
    const geoTargets = new Map<string, { x: number; y: number }>();
    if (showMap && projection) {
      for (const node of simNodes) {
        const loc = node.data.location;
        if (loc && loc.longitude != null && loc.latitude != null) {
          const projected = projection([loc.longitude, loc.latitude]);
          if (projected) {
            geoTargets.set(node.data.id, { x: projected[0], y: projected[1] });
          }
        }
      }
    }

    // Draw edges — curved paths like Kumu
    const linkSelection = g
      .append('g')
      .attr('class', 'edges')
      .selectAll('path')
      .data(simLinks)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => EDGE_COLORS[d.data.type] || EDGE_COLORS.MEMBER)
      .attr('stroke-width', (d) => {
        if (d.data.type === 'MEMBER') return 0.6;  // thin hairline — clean at scale
        if (d.data.type === 'LEAD') return 1.2;
        return Math.max(0.5, Math.min(d.data.weight * 0.5, 1.8)); // CHILD
      })
      .attr('stroke-linecap', 'round');

    // Draw nodes
    const nodeSelection = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => {
        _event.stopPropagation();
        onNodeClick(d.data);
      })
      .on('mouseenter', (_event: MouseEvent, d) => {
        onNodeHover?.(d.data, { x: _event.clientX, y: _event.clientY });
      })
      .on('mousemove', (_event: MouseEvent, d) => {
        onNodeHover?.(d.data, { x: _event.clientX, y: _event.clientY });
      })
      .on('mouseleave', () => {
        onNodeHover?.(null);
      })
      .call(
        (d3
          .drag<SVGGElement, SimNode>() as any)
          .on('start', (event: any, d: any) => {
            if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event: any, d: any) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event: any, d: any) => {
            if (!event.active) simulationRef.current?.alphaTarget(0);
            // In geo mode, snap back to geographic position if node has one
            const geoTarget = geoTargets.get(d.data.id);
            if (geoTarget) {
              d.fx = geoTarget.x;
              d.fy = geoTarget.y;
            } else {
              d.fx = null;
              d.fy = null;
            }
          }),
      );

    // SVG defs — avatar clip paths + badge shadow filter
    const defs = svg.append('defs');

    // Drop-shadow filter for cluster badges
    const shadowFilter = defs.append('filter')
      .attr('id', 'badge-shadow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    shadowFilter.append('feDropShadow')
      .attr('dx', 0).attr('dy', 1)
      .attr('stdDeviation', 3)
      .attr('flood-color', 'rgba(0,0,0,0.25)');

    // Glow filter for hovered badges
    const glowFilter = defs.append('filter')
      .attr('id', 'badge-glow')
      .attr('x', '-80%').attr('y', '-80%')
      .attr('width', '260%').attr('height', '260%');
    glowFilter.append('feDropShadow')
      .attr('dx', 0).attr('dy', 0)
      .attr('stdDeviation', 5)
      .attr('flood-color', 'rgba(99,102,241,0.5)');

    // White halo/outline filter for label readability
    const labelHalo = defs.append('filter')
      .attr('id', 'label-halo')
      .attr('x', '-5%').attr('y', '-15%')
      .attr('width', '110%').attr('height', '130%');
    labelHalo.append('feFlood')
      .attr('flood-color', 'rgba(255,255,255,0.85)')
      .attr('result', 'bg');
    labelHalo.append('feComposite')
      .attr('in', 'bg')
      .attr('in2', 'SourceGraphic')
      .attr('operator', 'over');

    // Avatar clip paths
    simNodes
      .filter((d) => !!d.data.avatarUrl)
      .forEach((d) => {
        const r = nodeRadius(d);
        defs
          .append('clipPath')
          .attr('id', `clip-avatar-${d.data.id}`)
          .append('circle')
          .attr('r', r);
      });

    // Node circles — Kumu-inspired: spaces are filled, users/orgs get ring borders
    nodeSelection
      .append('circle')
      .attr('r', (d) => nodeRadius(d))
      .attr('fill', (d) => {
        if (d.data.type === 'USER' || d.data.type === 'ORGANIZATION') {
          return d.data.avatarUrl ? 'white' : NODE_COLORS[d.data.type] || '#999';
        }
        return NODE_COLORS[d.data.type] || '#999';
      })
      .attr('stroke', (d) => {
        if (d.data.type === 'USER') return 'rgba(160,175,195,0.5)';
        if (d.data.type === 'ORGANIZATION') return NODE_COLORS.ORGANIZATION;
        if (d.data.type === 'SPACE_L0') return 'rgba(255,255,255,0.9)';
        return 'rgba(255,255,255,0.7)';
      })
      .attr('stroke-width', (d) => {
        if (d.data.type === 'USER') return 1.5;
        if (d.data.type === 'ORGANIZATION') return 1.5;
        if (d.data.type === 'SPACE_L0') return 2;
        return 1;
      });

    // Avatar images — clipped to circle, with fallback on error
    nodeSelection
      .filter((d) => !!d.data.avatarUrl)
      .append('image')
      .attr('href', (d) => proxyImageUrl(d.data.avatarUrl) ?? d.data.avatarUrl!)
      .attr('x', (d) => -nodeRadius(d))
      .attr('y', (d) => -nodeRadius(d))
      .attr('width', (d) => nodeRadius(d) * 2)
      .attr('height', (d) => nodeRadius(d) * 2)
      .attr('clip-path', (d) => `url(#clip-avatar-${d.data.id})`)
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .on('error', function () {
        d3.select(this).remove();
      });

    // Node labels (for spaces and orgs) — with white halo for readability
    // Each label gets a shadow text (white stroke outline) + foreground text
    const labelNodes = nodeSelection.filter((d) => d.data.type !== 'USER');

    // White outline/halo behind the text
    labelNodes
      .append('text')
      .attr('class', 'node-label-halo')
      .text((d) => {
        const name = d.data.displayName;
        return name.length > LABEL_MAX_CHARS ? name.slice(0, LABEL_MAX_CHARS - 1) + '\u2026' : name;
      })
      .attr('font-size', (d) => (d.data.type === 'SPACE_L0' ? 13 : d.data.type === 'SPACE_L1' ? 10 : 9))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => nodeRadius(d) + 14)
      .attr('fill', 'none')
      .attr('stroke', 'white')
      .attr('stroke-width', 4)
      .attr('stroke-linejoin', 'round')
      .attr('pointer-events', 'none')
      .attr('opacity', 0);

    // Foreground label text
    labelNodes
      .append('text')
      .attr('class', 'node-label')
      .text((d) => {
        const name = d.data.displayName;
        return name.length > LABEL_MAX_CHARS ? name.slice(0, LABEL_MAX_CHARS - 1) + '\u2026' : name;
      })
      .attr('font-size', (d) => (d.data.type === 'SPACE_L0' ? 13 : d.data.type === 'SPACE_L1' ? 10 : 9))
      .attr('font-weight', (d) => (d.data.type === 'SPACE_L0' ? '700' : d.data.type === 'SPACE_L1' ? '600' : '400'))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => nodeRadius(d) + 14)
      .attr('fill', 'var(--text-secondary)')
      .attr('pointer-events', 'none')
      .attr('opacity', 0);

    // Cluster hull background layer (non-map view only)
    const hullLayer = g.insert('g', '.edges').attr('class', 'cluster-hulls');

    // Proximity clustering badge layer (above nodes)
    const badgeLayer = g.append('g').attr('class', 'cluster-badges');

    // Force simulation — adjust forces based on whether map mode is active
    const isGeoMode = showMap && geoTargets.size > 0;

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink(simLinks)
          .id((_d, i) => simNodes[i]?.data.id || '')
          .distance((d: any) => {
            if (isGeoMode) return 30;
            const edgeData = (d as SimLink).data;
            // CHILD edges (hierarchy) shorter, MEMBER longer — maintains flower structure
            if (edgeData.type === 'CHILD') return 60;
            if (edgeData.type === 'LEAD') return 70;
            return 80; // MEMBER — tighter to keep people near their spaces
          })
          .strength((d: any) => {
            if (isGeoMode) return 0.15;
            const edgeData = (d as SimLink).data;
            // Hierarchy edges stronger to maintain structure
            if (edgeData.type === 'CHILD') return 0.6;
            if (edgeData.type === 'LEAD') return 0.15;
            return 0.1; // MEMBER — enough pull to keep people near spaces
          }),
      )
      .force('charge', d3.forceManyBody()
        .strength((d: any) => {
          if (isGeoMode) return -40;
          const nd = d as SimNode;
          // Spaces repel more to maintain cluster separation
          if (nd.data.type === 'SPACE_L0') return -500;
          if (nd.data.type === 'SPACE_L1') return -200;
          if (nd.data.type === 'SPACE_L2') return -80;
          return -25; // people/orgs: gentle repulsion
        }))
      .force('center', isGeoMode ? null : d3.forceCenter(width / 2, height / 2).strength(0.03))
      .force('collision', d3.forceCollide().radius((d) => nodeRadius(d as SimNode) + 8))
      .force('radial-hierarchy', isGeoMode ? null : (alpha: number) => {
        for (const node of simNodes) {
          const target = targetPositions.get(node.data.id);
          if (!target) continue;
          // Strength varies by level — spaces anchor the layout
          let strength = 0.08;
          if (node.data.type === 'SPACE_L0') strength = 0.4;
          else if (node.data.type === 'SPACE_L1') strength = 0.25;
          else if (node.data.type === 'SPACE_L2') strength = 0.15;

          node.vx = (node.vx || 0) + (target.x - (node.x || 0)) * alpha * strength;
          node.vy = (node.vy || 0) + (target.y - (node.y || 0)) * alpha * strength;
        }
      });

    // Geographic pinning — fix nodes with lat/lon to their exact map position
    // Uses fx/fy (immutable positions) like the old analytics-playground repo,
    // so the simulation cannot drift them away from their geographic location.
    if (isGeoMode) {
      for (const node of simNodes) {
        const target = geoTargets.get(node.data.id);
        if (target) {
          // Pin to exact geographic position
          node.x = target.x;
          node.y = target.y;
          node.fx = target.x;
          node.fy = target.y;
        }
      }
    }

    simulation.on('tick', () => {
      // Update link positions — curved quadratic bezier
      linkSelection.attr('d', (d) => {
        const sx = (d.source as SimNode).x || 0;
        const sy = (d.source as SimNode).y || 0;
        const tx = (d.target as SimNode).x || 0;
        const ty = (d.target as SimNode).y || 0;
        // Perpendicular offset for curve (proportional to distance)
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const curvature = dist * 0.15; // subtle curve
        // Control point: perpendicular midpoint offset
        const mx = (sx + tx) / 2 - (dy / dist) * curvature;
        const my = (sy + ty) / 2 + (dx / dist) * curvature;
        return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
      });

      // Update node positions
      nodeSelection.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);

      // Update cluster hulls (non-map view)
      if (!isGeoMode && clusters.length > 1) {
        updateHulls();
      }

      // Label collision culling — hide labels that overlap higher-priority ones
      cullOverlappingLabels();

      // Proximity clustering — only active in map overlay mode
      if (showMap && simNodes.length <= MAX_NODES_FOR_CLUSTERING) {
        // Build list of clusterable nodes — exclude revealed (fanned-out) nodes
        const clusterableNodes = simNodes
          .filter((n) => !revealedNodeIds.has(n.data.id))
          .map((n) => ({ id: n.data.id, x: n.x || 0, y: n.y || 0 }));

        // Threshold decays quadratically with zoom — clusters dissolve fast as you zoom
        const effectiveThreshold = PROXIMITY_THRESHOLD / (currentZoomScale * currentZoomScale);
        const proxClusters = computeProximityGroups(clusterableNodes, effectiveThreshold);

        // Collect all clustered node IDs
        const clusteredIds = new Set<string>();
        for (const c of proxClusters) {
          for (const id of c.memberIds) {
            clusteredIds.add(id);
          }
        }

        // Toggle node visibility — hide clustered nodes (but not revealed ones)
        nodeSelection.attr('display', (d) =>
          clusteredIds.has(d.data.id) && !revealedNodeIds.has(d.data.id) ? 'none' : '',
        );
        // Also hide edges that connect to hidden nodes (but show edges to revealed nodes)
        linkSelection.attr('display', (d) => {
          const srcId = (d.source as SimNode).data.id;
          const tgtId = (d.target as SimNode).data.id;
          const srcHidden = clusteredIds.has(srcId) && !revealedNodeIds.has(srcId);
          const tgtHidden = clusteredIds.has(tgtId) && !revealedNodeIds.has(tgtId);
          if (srcHidden || tgtHidden) return 'none';
          return '';
        });

        // D3 join for badge groups
        const badges = badgeLayer
          .selectAll<SVGGElement, ProximityCluster>('g.proximity-badge')
          .data(proxClusters, (d) => d.key);

        // Exit
        badges.exit()
          .transition().duration(200)
          .attr('opacity', 0)
          .remove();

        const enter = badges.enter()
          .append('g')
          .attr('class', 'proximity-badge')
          .attr('cursor', 'pointer')
          .attr('opacity', 0)
          .attr('filter', 'url(#badge-shadow)');

        enter.transition().duration(250).attr('opacity', 1);

        // Invisible hitbox
        enter.append('circle')
          .attr('class', 'badge-hitbox')
          .attr('r', 30)
          .attr('fill', 'transparent')
          .attr('cursor', 'pointer');

        // Outer ring
        enter.append('circle')
          .attr('class', 'badge-ring')
          .attr('r', 22)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(99,102,241,0.15)')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '3,2');

        // Badge circle
        enter.append('circle')
          .attr('class', 'badge-circle')
          .attr('r', 18)
          .attr('fill', '#f8f9ff')
          .attr('stroke', '#6366f1')
          .attr('stroke-width', 2);

        // Count label
        enter.append('text')
          .attr('class', 'badge-text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('font-size', 13)
          .attr('font-weight', '700')
          .attr('fill', '#4338ca')
          .attr('pointer-events', 'none');

        // Summary label below badge — shows top space name
        enter.append('text')
          .attr('class', 'badge-summary')
          .attr('text-anchor', 'middle')
          .attr('dy', '2.2em')
          .attr('font-size', 9)
          .attr('font-weight', '500')
          .attr('fill', 'var(--text-secondary)')
          .attr('pointer-events', 'none');

        // Hover effects
        enter
          .on('mouseenter', function (_event, d) {
            const el = d3.select(this);
            el.attr('filter', 'url(#badge-glow)');
            el.select('.badge-circle')
              .transition().duration(150)
              .attr('r', 21)
              .attr('fill', '#eef2ff')
              .attr('stroke-width', 2.5);
            el.select('.badge-ring')
              .transition().duration(150)
              .attr('r', 26)
              .attr('stroke', 'rgba(99,102,241,0.35)');

            // Show tooltip with all member names
            const names = d.memberIds
              .map(id => nodeMap.get(id)?.data.displayName || id)
              .slice(0, 8);
            const overflow = d.memberIds.length > 8 ? `\n+${d.memberIds.length - 8} more` : '';
            el.select('.badge-summary')
              .text(names[0] || '');
          })
          .on('mouseleave', function () {
            const el = d3.select(this);
            el.attr('filter', 'url(#badge-shadow)');
            el.select('.badge-circle')
              .transition().duration(150)
              .attr('r', 18)
              .attr('fill', '#f8f9ff')
              .attr('stroke-width', 2);
            el.select('.badge-ring')
              .transition().duration(150)
              .attr('r', 22)
              .attr('stroke', 'rgba(99,102,241,0.15)');
          });

        // Badge click → fan out cluster members in a circle and zoom in
        enter.on('click', function (_event, d) {
          _event.stopPropagation();

          // Reset any previously revealed nodes first
          for (const id of revealedNodeIds) {
            const n = nodeMap.get(id);
            if (n) {
              const geoTarget = geoTargets.get(id);
              if (geoTarget) {
                n.fx = geoTarget.x;
                n.fy = geoTarget.y;
              } else {
                n.fx = null;
                n.fy = null;
              }
            }
          }
          revealedNodeIds.clear();

          // Fan out member nodes in a circle around the cluster centroid
          const angleStep = (2 * Math.PI) / d.memberIds.length;
          d.memberIds.forEach((id, i) => {
            const n = nodeMap.get(id);
            if (n) {
              const angle = i * angleStep - Math.PI / 2;
              n.fx = d.centroidX + FANOUT_RADIUS * Math.cos(angle);
              n.fy = d.centroidY + FANOUT_RADIUS * Math.sin(angle);
              revealedNodeIds.add(id);
            }
          });

          // Zoom to show the fanned-out cluster
          const viewSize = Math.min(width, height) * 0.4;
          const targetScale = Math.min(20, Math.max(currentZoomScale * 1.5, viewSize / (FANOUT_RADIUS * 2.5)));

          const transform = d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(targetScale)
            .translate(-d.centroidX, -d.centroidY);

          svg.transition()
            .duration(ZOOM_TRANSITION_MS)
            .ease(d3.easeCubicInOut)
            .call(zoom.transform as any, transform);

          // Restart simulation so nodes animate to their new fixed positions
          if (simulationLocal) {
            simulationLocal.alpha(0.5).restart();
          }
        });

        const merged = enter.merge(badges);

        // Position badges
        const invScale = 1 / currentZoomScale;
        merged.attr('transform', (d) => `translate(${d.centroidX},${d.centroidY}) scale(${invScale})`);
        merged.select('.badge-text').text((d) => `${d.count}`);

        // Show dominant space name as summary on each badge
        merged.select('.badge-summary').text((d) => {
          // Find the most prominent node (highest weight space) in this cluster
          let bestName = '';
          let bestWeight = -1;
          for (const id of d.memberIds) {
            const n = nodeMap.get(id);
            if (n && (n.data.type === 'SPACE_L0' || n.data.type === 'SPACE_L1' || n.data.type === 'SPACE_L2')) {
              if (n.data.weight > bestWeight) {
                bestWeight = n.data.weight;
                bestName = n.data.displayName;
              }
            }
          }
          if (!bestName) {
            // Fallback: first node name
            const first = nodeMap.get(d.memberIds[0]);
            bestName = first?.data.displayName || '';
          }
          return bestName.length > 18 ? bestName.slice(0, 17) + '\u2026' : bestName;
        });

        // Badge highlighting for search
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchesFn = (d: ProximityCluster) =>
            d.memberIds.some((id) => {
              const n = nodeMap.get(id);
              return n && n.data.displayName.toLowerCase().includes(q);
            });
          merged.select('.badge-circle')
            .attr('stroke', (d) => matchesFn(d) ? '#f59e0b' : '#6366f1')
            .attr('stroke-width', (d) => matchesFn(d) ? 3 : 2);
          merged.select('.badge-ring')
            .attr('stroke', (d) => matchesFn(d) ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.15)');
          merged.select('.badge-text')
            .attr('fill', (d) => matchesFn(d) ? '#b45309' : '#4338ca');
          merged.attr('opacity', (d) => matchesFn(d) ? 1 : 0.15);
        }

        // Badge highlighting for insights
        if (highlightedNodeIds.length > 0) {
          const hlSet = new Set(highlightedNodeIds);
          const hlMatchFn = (d: ProximityCluster) => d.memberIds.some((id) => hlSet.has(id));
          merged.select('.badge-circle')
            .attr('stroke', (d) => hlMatchFn(d) ? '#f59e0b' : '#6366f1')
            .attr('stroke-width', (d) => hlMatchFn(d) ? 3 : 2);
          merged.select('.badge-ring')
            .attr('stroke', (d) => hlMatchFn(d) ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.15)');
          merged.select('.badge-text')
            .attr('fill', (d) => hlMatchFn(d) ? '#b45309' : '#4338ca');
          merged.attr('opacity', (d) => hlMatchFn(d) ? 1 : 0.25);
        }

        // Auto-zoom to cluster containing selected node
        if (selectedNodeId) {
          for (const c of proxClusters) {
            if (c.memberIds.includes(selectedNodeId)) {
              const targetScale = Math.min(20, Math.max(currentZoomScale * 2, 4));
              const transform = d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(targetScale)
                .translate(-c.centroidX, -c.centroidY);
              svg.transition()
                .duration(ZOOM_TRANSITION_MS)
                .ease(d3.easeCubicInOut)
                .call(zoom.transform as any, transform);
              break;
            }
          }
        }
      } else {
        // No clustering — show all nodes/edges, clear badges
        nodeSelection.attr('display', '');
        linkSelection.attr('display', '');
        badgeLayer.selectAll('*').remove();
      }
    });

    simulationRef.current = simulation;
    simulationLocal = simulation;

    /**
     * Label collision culling.
     * Sorts labels by priority (L0 > L1 > others, then by weight),
     * allocates each a bounding box in screen space, and hides labels
     * that would overlap a higher-priority one already placed.
     * This runs on every tick so labels declutter in real time.
     */
    function cullOverlappingLabels() {
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const invK = 1 / currentZoomScale;

      // Collect label nodes with priority
      type LabelEntry = { el: SVGTextElement; haloEl: SVGTextElement | null; priority: number; sx: number; sy: number; w: number; h: number };
      const entries: LabelEntry[] = [];

      nodeSelection.each(function (d) {
        const group = d3.select(this);
        const label = group.select<SVGTextElement>('text.node-label').node();
        const halo = group.select<SVGTextElement>('text.node-label-halo').node();
        if (!label) return;

        // Priority: L0=3, L1=2, others=1, scaled by weight
        let priority = 1;
        if (d.data.type === 'SPACE_L0') priority = 3;
        else if (d.data.type === 'SPACE_L1') priority = 2;
        priority += d.data.weight * 0.01;

        // Approximate text dimensions (rough: 6px per char)
        const text = label.textContent || '';
        const fontSize = d.data.type === 'SPACE_L0' ? 13 : d.data.type === 'SPACE_L1' ? 10 : 9;
        const charWidth = fontSize * 0.6;
        const w = text.length * charWidth * invK;
        const h = fontSize * 1.5 * invK;
        const r = nodeRadius(d);

        entries.push({
          el: label,
          haloEl: halo,
          priority,
          sx: (d.x || 0) - w / 2,
          sy: (d.y || 0) + r + 6 * invK,
          w,
          h,
        });
      });

      // Sort by priority descending (highest first = gets placed first)
      entries.sort((a, b) => b.priority - a.priority);

      for (const entry of entries) {
        // All labels are candidates (no LOD gating) — collision culling
        // is the sole mechanism for preventing overlaps

        // Check overlap against already-placed labels
        const overlaps = placed.some((p) =>
          entry.sx < p.x + p.w &&
          entry.sx + entry.w > p.x &&
          entry.sy < p.y + p.h &&
          entry.sy + entry.h > p.y
        );

        if (overlaps) {
          d3.select(entry.el).attr('opacity', 0);
          if (entry.haloEl) d3.select(entry.haloEl).attr('opacity', 0);
        } else {
          d3.select(entry.el).attr('opacity', 1);
          if (entry.haloEl) d3.select(entry.haloEl).attr('opacity', 1);
          placed.push({ x: entry.sx, y: entry.sy, w: entry.w, h: entry.h });
        }
      }
    }

    /**
     * Draw soft colored convex hull backgrounds behind each semantic cluster.
     * Uses D3's polygonHull to compute minimal bounding polygon around cluster
     * node positions, then draws it with rounded corners and subtle fill.
     */
    function updateHulls() {
      const hullData: { id: string; points: [number, number][]; colorIdx: number }[] = [];

      clusters.forEach((cluster, ci) => {
        const pts: [number, number][] = [];
        for (const nodeId of cluster.nodeIds) {
          const sn = nodeMap.get(nodeId);
          if (sn && sn.x != null && sn.y != null) {
            pts.push([sn.x, sn.y]);
          }
        }
        // Need at least 3 points for a hull
        if (pts.length >= 3) {
          const hull = d3.polygonHull(pts);
          if (hull) {
            hullData.push({ id: cluster.id, points: hull, colorIdx: ci % HULL_COLORS.length });
          }
        } else if (pts.length === 2) {
          // 2 points — draw an ellipse-ish shape by expanding to a tiny hull
          const [a, b] = pts;
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const nx = -dy;
          const ny = dx;
          const len = Math.sqrt(nx * nx + ny * ny) || 1;
          const offset = 15;
          hullData.push({
            id: cluster.id,
            points: [
              a, b,
              [mx + (nx / len) * offset, my + (ny / len) * offset],
              [mx - (nx / len) * offset, my - (ny / len) * offset],
            ].map(p => p as [number, number]),
            colorIdx: ci % HULL_COLORS.length,
          });
        }
      });

      // Expand hull points outward by padding
      const padding = 30;
      const expandedHulls = hullData.map((hd) => {
        const centroid = d3.polygonCentroid(hd.points);
        const expanded = hd.points.map(([px, py]) => {
          const dx = px - centroid[0];
          const dy = py - centroid[1];
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          return [px + (dx / dist) * padding, py + (dy / dist) * padding] as [number, number];
        });
        return { ...hd, points: expanded };
      });

      // D3 join for hull paths
      const hulls = hullLayer
        .selectAll<SVGPathElement, typeof expandedHulls[0]>('path.cluster-hull')
        .data(expandedHulls, (d) => d.id);

      hulls.exit().transition().duration(300).attr('opacity', 0).remove();

      const hullLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.8));

      hulls.enter()
        .append('path')
        .attr('class', 'cluster-hull')
        .attr('fill', (d) => HULL_COLORS[d.colorIdx])
        .attr('stroke', (d) => HULL_STROKES[d.colorIdx])
        .attr('stroke-width', 1.5)
        .attr('opacity', 0)
        .merge(hulls)
        .attr('d', (d) => hullLine(d.points))
        .transition().duration(200)
        .attr('opacity', 1);
    }

    // Initial LOD and label culling
    applyLOD(1);
    requestAnimationFrame(() => {
      cullOverlappingLabels();
    });

    // Apply search highlighting
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      nodeSelection.attr('opacity', (d) =>
        d.data.displayName.toLowerCase().includes(q) ? 1 : 0.1,
      );
      linkSelection.attr('opacity', 0.05);
    }

    // Apply insight highlighting
    if (highlightedNodeIds.length > 0) {
      const hlSet = new Set(highlightedNodeIds);
      nodeSelection.select('circle')
        .attr('stroke', (d: any) => (hlSet.has(d.data.id) ? '#f59e0b' : null))
        .attr('stroke-width', (d: any) => (hlSet.has(d.data.id) ? 3 : null));
      nodeSelection.attr('opacity', (d: any) => (hlSet.has(d.data.id) ? 1 : 0.2));
    }

    // Apply selection highlighting — analytics-playground style:
    // Colored strokes + bold edges with animated transitions
    if (selectedNodeId) {
      // 1st-degree neighbors
      const firstDegree = new Set<string>();
      firstDegree.add(selectedNodeId);
      for (const edge of visibleEdges) {
        if (edge.sourceId === selectedNodeId) firstDegree.add(edge.targetId);
        if (edge.targetId === selectedNodeId) firstDegree.add(edge.sourceId);
      }

      // 2nd-degree neighbors (neighbors of neighbors)
      const secondDegree = new Set<string>();
      for (const edge of visibleEdges) {
        if (firstDegree.has(edge.sourceId) && !firstDegree.has(edge.targetId)) {
          secondDegree.add(edge.targetId);
        }
        if (firstDegree.has(edge.targetId) && !firstDegree.has(edge.sourceId)) {
          secondDegree.add(edge.sourceId);
        }
      }

      // Count direct connections so highlight stroke scales inversely
      const directCount = firstDegree.size - 1; // minus the node itself

      // Nodes: subtle colored rings + opacity fade
      nodeSelection
        .transition().duration(300)
        .attr('opacity', (d) => {
          if (d.data.id === selectedNodeId) return 1;
          if (firstDegree.has(d.data.id)) return 1;
          if (secondDegree.has(d.data.id)) return 0.7;
          return 0.08;
        });
      nodeSelection.select('circle')
        .transition().duration(300)
        .attr('stroke', (d: any) => {
          if (d.data.id === selectedNodeId) return '#2563eb'; // bright blue
          if (firstDegree.has(d.data.id)) return '#3b82f6'; // medium blue
          if (secondDegree.has(d.data.id)) return '#93c5fd'; // soft blue
          return 'rgba(200,210,220,0.5)';
        })
        .attr('stroke-width', (d: any) => {
          if (d.data.id === selectedNodeId) return highlightNodeStroke(directCount, 'selected');
          if (firstDegree.has(d.data.id)) return highlightNodeStroke(directCount, '1st');
          if (secondDegree.has(d.data.id)) return highlightNodeStroke(directCount, '2nd');
          return 0.5;
        });

      // Edges: connection-count-aware widths — stays clean even with 100+ links
      linkSelection
        .transition().duration(300)
        .attr('opacity', (d) => {
          const src = (d.source as SimNode).data.id;
          const tgt = (d.target as SimNode).data.id;
          if (src === selectedNodeId || tgt === selectedNodeId) return 0.7;
          if ((firstDegree.has(src) && secondDegree.has(tgt)) ||
              (firstDegree.has(tgt) && secondDegree.has(src))) return 0.25;
          return 0.03;
        })
        .attr('stroke', (d) => {
          const src = (d.source as SimNode).data.id;
          const tgt = (d.target as SimNode).data.id;
          if (src === selectedNodeId || tgt === selectedNodeId) return '#3b82f6';
          if ((firstDegree.has(src) && secondDegree.has(tgt)) ||
              (firstDegree.has(tgt) && secondDegree.has(src))) return '#93c5fd';
          return 'rgba(200,210,220,0.3)';
        })
        .attr('stroke-width', (d) => {
          const src = (d.source as SimNode).data.id;
          const tgt = (d.target as SimNode).data.id;
          if (src === selectedNodeId || tgt === selectedNodeId) return highlightEdgeWidth(directCount, 'direct');
          if ((firstDegree.has(src) && secondDegree.has(tgt)) ||
              (firstDegree.has(tgt) && secondDegree.has(src))) return highlightEdgeWidth(directCount, '2nd');
          return 0.3;
        });
    }
  }, [dataset, showPeople, showOrganizations, showSpaces, searchQuery, selectedNodeId, highlightedNodeIds, onNodeClick, onNodeHover, showMap, mapRegion]);

  useEffect(() => {
    renderGraph();
    return () => {
      simulationRef.current?.stop();
    };
  }, [renderGraph]);

  // Re-render on resize
  useEffect(() => {
    const handleResize = () => renderGraph();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderGraph]);

  return <svg ref={svgRef} className={styles.svg} role="img" aria-label="Ecosystem network graph" />;
}
