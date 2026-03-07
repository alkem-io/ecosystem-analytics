import { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { geoMercator, geoPath } from 'd3-geo';
import type { GraphDataset, GraphNode, GraphEdge } from '@server/types/graph.js';
import type { ActivityPeriod } from '@server/types/graph.js';
import { computeClusters } from './clustering.js';
import { computeProximityGroups, type ProximityCluster } from './proximityClustering.js';
import type { MapRegion } from '../map/MapOverlay.js';
import { getToken } from '../../services/auth.js';
import styles from './ForceGraph.module.css';
import './pulse.css';

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
const L1_RING_RADIUS_MIN = 260;   // minimum L0→L1 distance (room for L0-only people ring)
const L1_RING_RADIUS_PER_MEMBER = 5;  // extra distance per L0-only member
const L1_RING_RADIUS_PER_NODE = 45;   // extra distance per L1 child
const L2_RING_RADIUS_MIN = 70;    // minimum L1→L2 distance
const L2_RING_RADIUS_PER_MEMBER = 3;  // extra distance per L1-direct member
const L2_RING_RADIUS_PER_NODE = 18;   // extra distance per L2 child
const PEOPLE_RING_RADIUS = 80;
const L0_ONLY_PEOPLE_RADIUS = 60;
const L1_PEOPLE_RING_RADIUS = 55;  // radial ring for people connected to exactly one L1

// Edge styling — refined, professional palette
const EDGE_COLORS: Record<string, string> = {
  CHILD: 'rgba(67,56,202,0.60)',     // deep indigo for parent-child
  LEAD: 'rgba(234,88,12,0.60)',      // orange for leadership
  ADMIN: 'rgba(13,148,136,0.60)',    // teal for admin
  MEMBER: 'rgba(148,163,184,0.35)',  // slate blue-gray — visible but subtle
};

/**
 */

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
  showMembers?: boolean;
  showLeads?: boolean;
  showAdmins?: boolean;
  searchQuery: string;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null, position?: { x: number; y: number }) => void;
  selectedNodeId: string | null;
  highlightedNodeIds?: string[];
  showMap?: boolean;
  mapRegion?: MapRegion;
  activityPulseEnabled?: boolean;
  /** Whether space activity sizing/glow is enabled (default: false) */
  spaceActivityEnabled?: boolean;
  /** Activity time period for sizing/glow (default: allTime) */
  activityPeriod?: ActivityPeriod;
  /** Whether public space nodes are visible (default: true) */
  showPublic?: boolean;
  /** Whether private space nodes are visible (default: true) */
  showPrivate?: boolean;
  /** When true, prune redundant ancestor edges — keep only the deepest space connection per user */
  directConnectionsOnly?: boolean;
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

/** Max scale factor for activity-based sizing (space nodes only) */
const MAX_ACTIVITY_SCALE = 2.5;

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
  showMembers = true,
  showLeads = true,
  showAdmins = true,
  searchQuery,
  onNodeClick,
  onNodeHover,
  selectedNodeId,
  highlightedNodeIds = [],
  showMap = false,
  mapRegion = 'europe',
  activityPulseEnabled = false,
  spaceActivityEnabled = false,
  activityPeriod = 'allTime',
  showPublic = true,
  showPrivate = true,
  directConnectionsOnly = false,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink>>(null);
  // Refs to D3 selections so selection-highlighting can run without re-rendering
  const nodeSelRef = useRef<d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>>(null);
  const linkSelRef = useRef<d3.Selection<SVGPathElement, SimLink, SVGGElement, unknown>>(null);
  const visibleEdgesRef = useRef<typeof dataset.edges>([]);

  // Stable refs for callbacks — avoids including them in renderGraph deps
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;
  const onNodeHoverRef = useRef(onNodeHover);
  onNodeHoverRef.current = onNodeHover;

  // Stable refs for visual state — read inside effects without adding as deps
  const activityPulseEnabledRef = useRef(activityPulseEnabled);
  activityPulseEnabledRef.current = activityPulseEnabled;
  const spaceActivityEnabledRef = useRef(spaceActivityEnabled);
  spaceActivityEnabledRef.current = spaceActivityEnabled;
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const showMembersRef = useRef(showMembers);
  showMembersRef.current = showMembers;
  const showLeadsRef = useRef(showLeads);
  showLeadsRef.current = showLeads;
  const showAdminsRef = useRef(showAdmins);
  showAdminsRef.current = showAdmins;
  const showPublicRef = useRef(showPublic);
  showPublicRef.current = showPublic;
  const showPrivateRef = useRef(showPrivate);
  showPrivateRef.current = showPrivate;


  // Incremented after each renderGraph so visual-state effects re-apply on fresh DOM
  const [graphVersion, setGraphVersion] = useState(0);

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
    let visibleEdges = dataset.edges.filter(
      (e) => visibleNodeIds.has(e.sourceId) && visibleNodeIds.has(e.targetId),
    );

    // Direct-connections mode: for each USER, prune edges to ancestor spaces
    // when the user is also connected to a deeper child space.
    if (directConnectionsOnly) {
      const nodeById = new Map(visibleNodes.map((n) => [n.id, n]));
      // Build parent → children lookup from parentSpaceId
      const childrenOf = new Map<string, Set<string>>();
      for (const n of visibleNodes) {
        if (n.parentSpaceId && visibleNodeIds.has(n.parentSpaceId)) {
          let kids = childrenOf.get(n.parentSpaceId);
          if (!kids) { kids = new Set(); childrenOf.set(n.parentSpaceId, kids); }
          kids.add(n.id);
        }
      }
      // For each user, collect set of space IDs they connect to
      const userSpaces = new Map<string, Set<string>>();
      for (const e of visibleEdges) {
        if (e.type === 'CHILD') continue;
        const srcNode = nodeById.get(e.sourceId);
        const tgtNode = nodeById.get(e.targetId);
        if (!srcNode || !tgtNode) continue;
        const isUserSrc = srcNode.type === 'USER';
        const isSpaceTgt = tgtNode.type.startsWith('SPACE_');
        if (isUserSrc && isSpaceTgt) {
          let set = userSpaces.get(e.sourceId);
          if (!set) { set = new Set(); userSpaces.set(e.sourceId, set); }
          set.add(e.targetId);
        }
        const isUserTgt = tgtNode.type === 'USER';
        const isSpaceSrc = srcNode.type.startsWith('SPACE_');
        if (isUserTgt && isSpaceSrc) {
          let set = userSpaces.get(e.targetId);
          if (!set) { set = new Set(); userSpaces.set(e.targetId, set); }
          set.add(e.sourceId);
        }
      }
      // Helper: check if user connects to any child of a given space
      const userConnectsToChildOf = (userId: string, spaceId: string): boolean => {
        const kids = childrenOf.get(spaceId);
        if (!kids) return false;
        const spaces = userSpaces.get(userId);
        if (!spaces) return false;
        for (const kid of kids) {
          if (spaces.has(kid)) return true;
        }
        return false;
      };
      visibleEdges = visibleEdges.filter((e) => {
        if (e.type === 'CHILD') return true; // always keep hierarchy edges
        const srcNode = nodeById.get(e.sourceId);
        const tgtNode = nodeById.get(e.targetId);
        if (!srcNode || !tgtNode) return true;
        // Identify user→space and space→user edges
        let userId: string | null = null;
        let spaceId: string | null = null;
        if (srcNode.type === 'USER' && tgtNode.type.startsWith('SPACE_')) {
          userId = e.sourceId; spaceId = e.targetId;
        } else if (tgtNode.type === 'USER' && srcNode.type.startsWith('SPACE_')) {
          userId = e.targetId; spaceId = e.sourceId;
        }
        if (!userId || !spaceId) return true; // not a user↔space edge, keep
        // Prune if the user also connects to a child of this space
        return !userConnectsToChildOf(userId, spaceId);
      });
    }

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

    // Count direct MEMBER/LEAD/ADMIN connections per space (people around each space)
    const spaceMemberCount = new Map<string, number>();
    for (const e of visibleEdges) {
      if (e.type === 'MEMBER' || e.type === 'LEAD' || e.type === 'ADMIN') {
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
        if (e.type === 'MEMBER' || e.type === 'LEAD' || e.type === 'ADMIN') {
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

    // --- Track per-space people counts so we can distribute them evenly around the ring ---
    const spaceRadialCounters = new Map<string, number>(); // spaceId → next index
    const spaceRadialTotals = new Map<string, number>();    // spaceId → total radial people

    // Pre-count: figure out how many people will be radially placed per space
    for (const node of simNodes) {
      if (targetPositions.has(node.data.id)) continue;
      if (node.data.type !== 'USER' && node.data.type !== 'ORGANIZATION') continue;
      const edges = nodeEdges.get(node.data.id) || [];
      const connectedSpaces: { id: string; type: string }[] = [];
      for (const { otherId } of edges) {
        const other = nodeMap.get(otherId);
        if (!other || !targetPositions.has(otherId)) continue;
        const dw = depthWeight(other.data.type);
        if (dw > 0) connectedSpaces.push({ id: otherId, type: other.data.type });
      }
      const l0s = connectedSpaces.filter(s => s.type === 'SPACE_L0');
      const l1s = connectedSpaces.filter(s => s.type === 'SPACE_L1');
      const l2s = connectedSpaces.filter(s => s.type === 'SPACE_L2');

      if (l1s.length === 0 && l2s.length === 0 && l0s.length === 1) {
        // L0-only → radial around L0
        const key = l0s[0].id;
        spaceRadialTotals.set(key, (spaceRadialTotals.get(key) || 0) + 1);
      } else if (l1s.length === 1 && l2s.length === 0) {
        // Exactly one L1 (possibly + L0) → radial around L1
        const key = l1s[0].id;
        spaceRadialTotals.set(key, (spaceRadialTotals.get(key) || 0) + 1);
      }
    }

    // Users & Orgs: position radially for low-connection nodes, centroid for multi-membership
    for (const node of simNodes) {
      if (targetPositions.has(node.data.id)) continue;

      const edges = nodeEdges.get(node.data.id) || [];
      const memberSpaces: { pos: { x: number; y: number }; w: number; id: string; type: string }[] = [];

      for (const { otherId } of edges) {
        const other = nodeMap.get(otherId);
        if (!other || !targetPositions.has(otherId)) continue;
        const dw = depthWeight(other.data.type);
        if (dw > 0) {
          memberSpaces.push({ pos: targetPositions.get(otherId)!, w: dw, id: otherId, type: other.data.type });
        }
      }

      if (memberSpaces.length > 0) {
        const l0s = memberSpaces.filter(s => s.type === 'SPACE_L0');
        const l1s = memberSpaces.filter(s => s.type === 'SPACE_L1');
        const l2s = memberSpaces.filter(s => s.type === 'SPACE_L2');

        // --- RADIAL placement: single-parent nodes ---
        if (l1s.length === 0 && l2s.length === 0 && l0s.length === 1) {
          // L0-only person: radial ring around the L0
          const anchor = l0s[0];
          const total = spaceRadialTotals.get(anchor.id) || 1;
          const idx = spaceRadialCounters.get(anchor.id) || 0;
          spaceRadialCounters.set(anchor.id, idx + 1);
          const angle = (2 * Math.PI * idx) / total - Math.PI / 2;
          const anchorR = nodeRadius(nodeMap.get(anchor.id)!);
          const ringR = anchorR + L0_ONLY_PEOPLE_RADIUS + Math.random() * 8;
          targetPositions.set(node.data.id, {
            x: anchor.pos.x + ringR * Math.cos(angle),
            y: anchor.pos.y + ringR * Math.sin(angle),
          });
          continue;
        }

        if (l1s.length === 1 && l2s.length === 0) {
          // Exactly one L1 (+ possibly L0): radial ring around the L1
          const anchor = l1s[0];
          const total = spaceRadialTotals.get(anchor.id) || 1;
          const idx = spaceRadialCounters.get(anchor.id) || 0;
          spaceRadialCounters.set(anchor.id, idx + 1);
          const angle = (2 * Math.PI * idx) / total - Math.PI / 2;
          const anchorR = nodeRadius(nodeMap.get(anchor.id)!);
          const ringR = anchorR + L1_PEOPLE_RING_RADIUS + Math.random() * 10;
          targetPositions.set(node.data.id, {
            x: anchor.pos.x + ringR * Math.cos(angle),
            y: anchor.pos.y + ringR * Math.sin(angle),
          });
          continue;
        }

        // --- CENTROID placement: multi-membership nodes ---
        let totalW = 0, cx = 0, cy = 0;
        for (const s of memberSpaces) {
          totalW += s.w;
          cx += s.pos.x * s.w;
          cy += s.pos.y * s.w;
        }
        cx /= totalW;
        cy /= totalW;

        const angle = Math.random() * 2 * Math.PI;
        const scatter = PEOPLE_RING_RADIUS * 0.5 + Math.random() * 12;

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
        if (d.data.type === 'MEMBER') return 0.9;  // thin but visible
        if (d.data.type === 'LEAD') return 1.4;
        if (d.data.type === 'ADMIN') return 1.4;
        return Math.max(0.7, Math.min(d.data.weight * 0.5, 2.0)); // CHILD
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
        onNodeClickRef.current(d.data);
      })
      .on('mouseenter', (_event: MouseEvent, d) => {
        onNodeHoverRef.current?.(d.data, { x: _event.clientX, y: _event.clientY });
      })
      .on('mousemove', (_event: MouseEvent, d) => {
        onNodeHoverRef.current?.(d.data, { x: _event.clientX, y: _event.clientY });
      })
      .on('mouseleave', () => {
        onNodeHoverRef.current?.(null);
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

    // Persist D3 selections in refs for lightweight highlight updates
    nodeSelRef.current = nodeSelection as any;
    linkSelRef.current = linkSelection as any;
    visibleEdgesRef.current = visibleEdges;

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

    // Avatar / banner clip paths
    simNodes
      .filter((d) => !!nodeImageUrl(d.data))
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
        // Space nodes: use white background when we have a banner/avatar image
        return nodeImageUrl(d.data) ? 'white' : NODE_COLORS[d.data.type] || '#999';
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

    // Node images (avatars / banners) — clipped to circle, with fallback on error
    nodeSelection
      .filter((d) => !!nodeImageUrl(d.data))
      .append('image')
      .attr('href', (d) => proxyImageUrl(nodeImageUrl(d.data)) ?? nodeImageUrl(d.data)!)
      .attr('x', (d) => -nodeRadius(d))
      .attr('y', (d) => -nodeRadius(d))
      .attr('width', (d) => nodeRadius(d) * 2)
      .attr('height', (d) => nodeRadius(d) * 2)
      .attr('clip-path', (d) => `url(#clip-avatar-${d.data.id})`)
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .on('error', function () {
        d3.select(this).remove();
      });

    // Visibility badge — lock/unlock icon overlay on space nodes (bottom-right)
    const spaceNodes = nodeSelection.filter(
      (d) => d.data.type === 'SPACE_L0' || d.data.type === 'SPACE_L1' || d.data.type === 'SPACE_L2',
    );

    // Lock badge — shown on private spaces and restricted spaces
    const privateSpaceNodes = spaceNodes.filter((d) => d.data.privacyMode === 'PRIVATE' || d.data.restricted === true);

    // White circle background for contrast
    privateSpaceNodes
      .append('circle')
      .attr('class', 'visibility-badge-bg')
      .attr('cx', (d) => nodeRadius(d) * 0.6)
      .attr('cy', (d) => nodeRadius(d) * 0.6)
      .attr('r', (d) => (d.data.type === 'SPACE_L0' ? 7 : 5))
      .attr('fill', 'white')
      .attr('stroke', 'rgba(148,163,184,0.4)')
      .attr('stroke-width', 0.5)
      .attr('pointer-events', 'none');

    // Lock emoji
    privateSpaceNodes
      .append('text')
      .attr('class', 'visibility-badge-icon')
      .attr('x', (d) => nodeRadius(d) * 0.6)
      .attr('y', (d) => nodeRadius(d) * 0.6)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', (d) => (d.data.type === 'SPACE_L0' ? 9 : 7))
      .attr('pointer-events', 'none')
      .text('\u{1F512}');

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
            if (edgeData.type === 'ADMIN') return 70;
            return 80; // MEMBER — tighter to keep people near their spaces
          })
          .strength((d: any) => {
            if (isGeoMode) return 0.15;
            const edgeData = (d as SimLink).data;
            // Hierarchy edges stronger to maintain structure
            if (edgeData.type === 'CHILD') return 0.6;
            if (edgeData.type === 'LEAD') return 0.15;
            if (edgeData.type === 'ADMIN') return 0.15;
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
      .force('collision', d3.forceCollide().radius((d) => {
        const sn = d as SimNode;
        return ((sn as any)._effectiveRadius ?? nodeRadius(sn)) + 8;
      }))
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

    // Signal that a fresh graph is ready — visual-state effects will re-apply
    queueMicrotask(() => setGraphVersion((v) => v + 1));

  }, [dataset, showPeople, showOrganizations, showSpaces, showMap, mapRegion, directConnectionsOnly]);

  // ---------- Role filter visibility (T013-T016) ----------
  // Show/hide user→space edges by role type without rebuilding the graph.
  // Organization→space edges are NOT affected (T016).
  useEffect(() => {
    const nodeSelection = nodeSelRef.current;
    const linkSelection = linkSelRef.current;
    if (!nodeSelection || !linkSelection) return;

    // Determine which role edge types are visible
    const roleVisible: Record<string, boolean> = {
      MEMBER: showMembers,
      LEAD: showLeads,
      ADMIN: showAdmins,
    };

    // Track user IDs that still have at least one visible role edge
    const usersWithVisibleEdge = new Set<string>();

    // Apply visibility to edges — only user→space role edges are affected
    linkSelection.each(function (d: any) {
      const edge = d.data;
      const sourceNode = (d.source as SimNode)?.data;
      if (!sourceNode) return;

      // Only filter user→space role edges (T016: skip org edges, skip CHILD)
      if (sourceNode.type !== 'USER') return;
      if (edge.type === 'CHILD') return;

      const visible = roleVisible[edge.type] ?? true;
      d3.select(this).style('display', visible ? '' : 'none');

      if (visible) {
        usersWithVisibleEdge.add(sourceNode.id);
      }
    });

    // Also count visible edges from the non-role types (CHILD won't connect users)
    // and from org edges to keep org-connected users visible
    linkSelection.each(function (d: any) {
      const edge = d.data;
      const sourceNode = (d.source as SimNode)?.data;
      const targetNode = (d.target as SimNode)?.data;
      if (!sourceNode || !targetNode) return;
      // If a user is the target of any visible edge, keep them visible
      if (targetNode.type === 'USER') {
        const el = d3.select(this);
        if (el.style('display') !== 'none') usersWithVisibleEdge.add(targetNode.id);
      }
    });

    // Hide orphaned user nodes (users with no visible role edges)
    nodeSelection.each(function (d: any) {
      const node = d.data;
      if (node.type !== 'USER') return;
      const visible = usersWithVisibleEdge.has(node.id);
      d3.select(this).style('display', visible ? '' : 'none');
    });

    // Update visibleEdgesRef for selection highlighting composition (T014)
    const visibleEdgeData: typeof dataset.edges = [];
    linkSelection.each(function (d: any) {
      const el = d3.select(this);
      if (el.style('display') !== 'none') {
        visibleEdgeData.push(d.data);
      }
    });
    visibleEdgesRef.current = visibleEdgeData;

    // Compose with selection highlighting (T014) — re-apply if a node is selected
    const selId = selectedNodeIdRef.current;
    if (selId) {
      // Trigger selection effect by reading current state
      // Selection effect reads visibleEdgesRef, so it will use updated edges
    }

    // Compose with activity pulse (T015) — pause animation on hidden edges
    linkSelection.each(function () {
      const el = d3.select(this);
      if (!el.classed('edge-pulse') && !el.classed('edge-pulse-entering')) return;
      const isHidden = el.style('display') === 'none';
      el.style('animation-play-state', isHidden ? 'paused' : 'running');
    });

  }, [showMembers, showLeads, showAdmins, graphVersion]);

  // ---------- Visibility filter (T018-T019) ----------
  // Show/hide space nodes by privacyMode without rebuilding the graph.
  // Also hides edges to hidden spaces and orphans users/orgs with no visible edges.
  useEffect(() => {
    const nodeSelection = nodeSelRef.current;
    const linkSelection = linkSelRef.current;
    if (!nodeSelection || !linkSelection) return;

    // Determine which space nodes are hidden by visibility filters
    const hiddenSpaceIds = new Set<string>();
    nodeSelection.each(function (d: any) {
      const node = d.data as GraphNode;
      const isSpace = node.type === 'SPACE_L0' || node.type === 'SPACE_L1' || node.type === 'SPACE_L2';
      if (!isSpace) return;
      const pm = node.privacyMode;
      const isRestricted = node.restricted === true;
      const hide = (pm === 'PUBLIC' && !isRestricted && !showPublic) || ((pm === 'PRIVATE' || isRestricted) && !showPrivate);
      if (hide) {
        hiddenSpaceIds.add(node.id);
        d3.select(this).style('display', 'none');
      }
      // Don't force-show — entity filter or role filter may have hidden it
    });

    // Hide edges connected to hidden spaces
    linkSelection.each(function (d: any) {
      const sourceId = (d.source as SimNode)?.data?.id ?? d.data?.sourceId;
      const targetId = (d.target as SimNode)?.data?.id ?? d.data?.targetId;
      if (hiddenSpaceIds.has(sourceId) || hiddenSpaceIds.has(targetId)) {
        d3.select(this).style('display', 'none');
      }
    });

    // Find orphaned users/orgs (no remaining visible edges)
    const nodesWithVisibleEdge = new Set<string>();
    linkSelection.each(function (d: any) {
      const el = d3.select(this);
      if (el.style('display') === 'none') return;
      const sId = (d.source as SimNode)?.data?.id;
      const tId = (d.target as SimNode)?.data?.id;
      if (sId) nodesWithVisibleEdge.add(sId);
      if (tId) nodesWithVisibleEdge.add(tId);
    });

    nodeSelection.each(function (d: any) {
      const node = d.data as GraphNode;
      // Only orphan-hide users and orgs; spaces are handled above
      if (node.type !== 'USER' && node.type !== 'ORGANIZATION') return;
      // If already hidden by another filter, skip
      const el = d3.select(this);
      if (el.style('display') === 'none') return;
      if (!nodesWithVisibleEdge.has(node.id)) {
        el.style('display', 'none');
      }
    });

    // Update visibleEdgesRef for selection highlighting composition
    const visibleEdgeData: typeof dataset.edges = [];
    linkSelection.each(function (d: any) {
      const el = d3.select(this);
      if (el.style('display') !== 'none') {
        visibleEdgeData.push(d.data);
      }
    });
    visibleEdgesRef.current = visibleEdgeData;

    // Compose with activity pulse — pause animation on hidden edges
    linkSelection.each(function () {
      const el = d3.select(this);
      if (!el.classed('edge-pulse') && !el.classed('edge-pulse-entering')) return;
      const isHidden = el.style('display') === 'none';
      el.style('animation-play-state', isHidden ? 'paused' : 'running');
    });

  }, [showPublic, showPrivate, graphVersion]);

  // ---------- Space Activity sizing + glow (T011/T012/T013) ----------
  // Scales space nodes by contribution volume on top of their degree-based radius.
  // Floor = degree radius (spaces never shrink). Ceiling = degree × MAX_ACTIVITY_SCALE.
  // Also applies tier-based stroke glow. Animated transitions (~300ms).
  useEffect(() => {
    const nodeSelection = nodeSelRef.current;
    if (!nodeSelection) return;

    const svgEl = svgRef.current;
    if (!svgEl) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 0 : 300;

    // Select space nodes only
    const spaceNodes = nodeSelection.filter(
      (d: any) => d.data.type === 'SPACE_L0' || d.data.type === 'SPACE_L1' || d.data.type === 'SPACE_L2',
    );

    if (spaceActivityEnabled) {
      // Compute per-level max activity count for the selected period
      const maxByLevel: Record<string, number> = {};
      const countByNode = new Map<string, number>();
      spaceNodes.each(function (d: any) {
        const periods = d.data.activityByPeriod;
        const count = periods ? (periods[activityPeriod] ?? 0) : (d.data.totalActivityCount ?? 0);
        countByNode.set(d.data.id, count);
        const lvl = d.data.type as string;
        maxByLevel[lvl] = Math.max(maxByLevel[lvl] ?? 0, count);
      });

      // Compute period-specific tiers using quartile logic
      const allCounts = Array.from(countByNode.values()).filter((c) => c > 0).sort((a, b) => a - b);
      const tierByNode = new Map<string, string>();
      if (allCounts.length === 0) {
        // All zero — everyone INACTIVE
        countByNode.forEach((_, id) => tierByNode.set(id, 'INACTIVE'));
      } else if (allCounts.length < 3) {
        // Too few for percentiles — use fixed thresholds
        countByNode.forEach((c, id) => {
          if (c === 0) tierByNode.set(id, 'INACTIVE');
          else if (c <= 2) tierByNode.set(id, 'LOW');
          else if (c <= 10) tierByNode.set(id, 'MEDIUM');
          else tierByNode.set(id, 'HIGH');
        });
      } else if (new Set(allCounts).size === 1) {
        // All equal non-zero → MEDIUM
        countByNode.forEach((c, id) => tierByNode.set(id, c === 0 ? 'INACTIVE' : 'MEDIUM'));
      } else {
        const p25 = allCounts[Math.floor(allCounts.length * 0.25)];
        const p75 = allCounts[Math.floor(allCounts.length * 0.75)];
        countByNode.forEach((c, id) => {
          if (c === 0) tierByNode.set(id, 'INACTIVE');
          else if (c <= p25) tierByNode.set(id, 'LOW');
          else if (c <= p75) tierByNode.set(id, 'MEDIUM');
          else tierByNode.set(id, 'HIGH');
        });
      }

      // Apply activity-based radius + tier glow
      // Uses degree-based radius as the floor so spaces never shrink.
      // Most active space scales to MAX_ACTIVITY_SCALE × its degree size.
      spaceNodes.each(function (d: any) {
        const el = d3.select(this);
        const count = countByNode.get(d.data.id) ?? 0;
        const tier = tierByNode.get(d.data.id) ?? 'INACTIVE';
        const degreeR = nodeRadius(d);
        const maxCount = maxByLevel[d.data.type] ?? 0;
        const t = maxCount > 0 ? Math.log(1 + count) / Math.log(1 + maxCount) : 0;
        const activityRadius = degreeR * (1 + t * (MAX_ACTIVITY_SCALE - 1));

        // Stash effective radius for collision force
        d._effectiveRadius = activityRadius;

        // Transition circle radius
        el.select('circle')
          .transition().duration(duration).ease(d3.easeQuadOut)
          .attr('r', activityRadius)
          // Tier-based stroke glow — dark-blue/light-blue palette
          .attr('stroke', tier === 'HIGH' ? '#1e3a5f' : tier === 'MEDIUM' ? '#38bdf8' : tier === 'LOW' ? '#7dd3fc' : (d.data.type === 'SPACE_L0' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)'))
          .attr('stroke-width', tier === 'HIGH' ? Math.max(3.5, activityRadius * 0.08) : tier === 'MEDIUM' ? Math.max(2.5, activityRadius * 0.05) : tier === 'LOW' ? 1.5 : (d.data.type === 'SPACE_L0' ? 2 : 1))
          .style('filter', tier === 'HIGH'
            ? `drop-shadow(0 0 ${Math.max(6, activityRadius * 0.15)}px #1e3a5f)`
            : tier === 'MEDIUM'
              ? `drop-shadow(0 0 ${Math.max(4, activityRadius * 0.1)}px #38bdf8)`
              : 'none');

        // Transition image
        el.select('image')
          .transition().duration(duration).ease(d3.easeQuadOut)
          .attr('x', -activityRadius)
          .attr('y', -activityRadius)
          .attr('width', activityRadius * 2)
          .attr('height', activityRadius * 2);

        // Transition clipPath circle
        const svgD3 = d3.select(svgEl);
        svgD3.select(`#clip-avatar-${d.data.id} circle`)
          .transition().duration(duration).ease(d3.easeQuadOut)
          .attr('r', activityRadius);

        // Reposition lock badge (FR-009)
        el.select('.visibility-badge-bg')
          .transition().duration(duration).ease(d3.easeQuadOut)
          .attr('cx', activityRadius * 0.6)
          .attr('cy', activityRadius * 0.6);
        el.select('.visibility-badge-icon')
          .transition().duration(duration).ease(d3.easeQuadOut)
          .attr('x', activityRadius * 0.6)
          .attr('y', activityRadius * 0.6);
      });

      // Update collision force and gently push nodes apart
      const sim = simulationRef.current;
      if (sim) {
        sim.force('collision', d3.forceCollide().radius((d) => {
          const sn = d as SimNode;
          return ((sn as any)._effectiveRadius ?? nodeRadius(sn)) + 8;
        }));
        sim.alpha(0.15).restart();
      }
    } else {
      // Restore degree-based radius and default strokes
      spaceNodes.each(function (d: any) {
        const el = d3.select(this);
        const degreeR = nodeRadius(d);

        // Clear effective radius so collision falls back to degree-based
        delete d._effectiveRadius;

        el.select('circle')
          .transition().duration(duration).ease(d3.easeQuadOut)
          .attr('r', degreeR)
          .attr('stroke', d.data.type === 'SPACE_L0' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)')
          .attr('stroke-width', d.data.type === 'SPACE_L0' ? 2 : 1)
          .style('filter', 'none');

        el.select('image')
          .transition().duration(duration).ease(d3.easeQuadOut)
          .attr('x', -degreeR)
          .attr('y', -degreeR)
          .attr('width', degreeR * 2)
          .attr('height', degreeR * 2);

        const svgD3 = d3.select(svgEl);
        svgD3.select(`#clip-avatar-${d.data.id} circle`)
          .transition().duration(duration).ease(d3.easeQuadOut)
          .attr('r', degreeR);

        el.select('.visibility-badge-bg')
          .transition().duration(duration).ease(d3.easeQuadOut)
          .attr('cx', degreeR * 0.6)
          .attr('cy', degreeR * 0.6);
        el.select('.visibility-badge-icon')
          .transition().duration(duration).ease(d3.easeQuadOut)
          .attr('x', degreeR * 0.6)
          .attr('y', degreeR * 0.6);
      });

      // Update collision force back to degree-based and settle
      const sim = simulationRef.current;
      if (sim) {
        sim.force('collision', d3.forceCollide().radius((d) => {
          const sn = d as SimNode;
          return ((sn as any)._effectiveRadius ?? nodeRadius(sn)) + 8;
        }));
        sim.alpha(0.15).restart();
      }
    }
  }, [spaceActivityEnabled, activityPeriod, graphVersion]);

  // ---------- Search highlighting ----------
  useEffect(() => {
    const nodeSelection = nodeSelRef.current;
    const linkSelection = linkSelRef.current;
    if (!nodeSelection || !linkSelection) return;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchedIds = new Set<string>();
      nodeSelection.each((d: any) => {
        if (d.data.displayName.toLowerCase().includes(q)) {
          matchedIds.add(d.data.id);
        }
      });
      nodeSelection.attr('opacity', (d) =>
        matchedIds.has(d.data.id) ? 1 : 0.1,
      );
      linkSelection.each(function (d: any) {
        const srcId = (d.source as SimNode).data.id;
        const tgtId = (d.target as SimNode).data.id;
        const el = d3.select(this);
        if (matchedIds.has(srcId) || matchedIds.has(tgtId)) {
          el.attr('opacity', 0.35)
            .attr('stroke', '#60a5fa')
            .attr('stroke-width', 1.2);
        } else {
          el.attr('opacity', 0.05);
        }
      });
    } else {
      // Reset link styles when search is cleared
      linkSelection.each(function (d: any) {
        const edge = d.data;
        const type = edge?.type;
        const el = d3.select(this);
        el.attr('opacity', null)
          .attr('stroke', (EDGE_COLORS as any)[type] || (EDGE_COLORS as any).MEMBER)
          .attr('stroke-width', type === 'LEAD' ? 1.4 : type === 'ADMIN' ? 1.4 : type === 'MEMBER' ? 0.9 : Math.max(0.7, Math.min((edge?.weight ?? 1) * 0.5, 2.0)));
      });
    }
    // Reset handled by selection effect when searchQuery is cleared
  }, [searchQuery, graphVersion]);

  // ---------- Insight highlighting ----------
  useEffect(() => {
    const nodeSelection = nodeSelRef.current;
    if (!nodeSelection) return;

    if (highlightedNodeIds.length > 0) {
      const hlSet = new Set(highlightedNodeIds);
      nodeSelection.select('circle')
        .attr('stroke', (d: any) => (hlSet.has(d.data.id) ? '#f59e0b' : null))
        .attr('stroke-width', (d: any) => (hlSet.has(d.data.id) ? 3 : null));
      nodeSelection.attr('opacity', (d: any) => (hlSet.has(d.data.id) ? 1 : 0.2));
    }
  }, [highlightedNodeIds, graphVersion]);

  // ---------- Selection highlighting — runs without rebuilding the graph ----------
  useEffect(() => {
    const nodeSelection = nodeSelRef.current;
    const linkSelection = linkSelRef.current;
    const visibleEdges = visibleEdgesRef.current;
    if (!nodeSelection || !linkSelection) return;

    // Read pulse state from ref — avoids having it as a dep that re-triggers
    // the full selection reset (which would race with the pulse effect's transitions).
    const actPulse = activityPulseEnabledRef.current;

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

      // Nodes — matched to analytics-playground: bold strokes, strong fade
      nodeSelection
        .transition().duration(300)
        .attr('opacity', (d: any) => {
          if (d.data.id === selectedNodeId) return 1;
          if (firstDegree.has(d.data.id)) return 1;
          if (secondDegree.has(d.data.id)) return 1;
          return 0.1; // non-connected nearly invisible — matches old repo
        });
      nodeSelection.select('circle')
        .transition().duration(300)
        .attr('stroke', (d: any) => {
          if (d.data.id === selectedNodeId) return '#1e3a5f'; // dark blue
          if (firstDegree.has(d.data.id)) return '#1e3a5f';   // dark blue
          if (secondDegree.has(d.data.id)) return '#7dd3fc';   // light blue
          return '#bfc9d1';
        })
        .attr('stroke-width', (d: any) => {
          if (d.data.id === selectedNodeId) return 5;
          if (firstDegree.has(d.data.id)) return 3.5;
          if (secondDegree.has(d.data.id)) return 1.5;
          return 1;
        });

      // Edges — bold 1st-degree, visible 2nd-degree, nearly hidden rest
      linkSelection
        .transition().duration(300)
        .attr('opacity', (d: any) => {
          const src = (d.source as SimNode).data.id;
          const tgt = (d.target as SimNode).data.id;
          if (src === selectedNodeId || tgt === selectedNodeId) return 0.75;
          if ((firstDegree.has(src) && secondDegree.has(tgt)) ||
              (firstDegree.has(tgt) && secondDegree.has(src))) return 0.4;
          return 0.05;
        })
        .attr('stroke', (d: any) => {
          const src = (d.source as SimNode).data.id;
          const tgt = (d.target as SimNode).data.id;
          if (src === selectedNodeId || tgt === selectedNodeId) return '#1e3a5f';
          if ((firstDegree.has(src) && secondDegree.has(tgt)) ||
              (firstDegree.has(tgt) && secondDegree.has(src))) return '#7dd3fc';
          return '#bfc9d1';
        });

      // Compose pulse with selection — pause animation on non-connected edges
      if (actPulse) {
        linkSelection.each(function (d: any) {
          const el = d3.select(this);
          if (!el.classed('edge-pulse') && !el.classed('edge-pulse-entering')) return;
          const src = (d.source as SimNode).data.id;
          const tgt = (d.target as SimNode).data.id;
          const isConnected = src === selectedNodeId || tgt === selectedNodeId;
          el.style('animation-play-state', isConnected ? 'running' : 'paused');
        });
      }
    } else {
      // Deselected — reset to default visual state
      nodeSelection.transition().duration(300).attr('opacity', 1);
      nodeSelection.select('circle')
        .transition().duration(300)
        .attr('stroke', 'rgba(200,210,220,0.5)')
        .attr('stroke-width', 0.5);

      // For links: if pulse is active, only reset non-pulse properties (opacity);
      // pulse effect owns stroke/stroke-width for pulsing edges.
      if (actPulse) {
        linkSelection
          .transition().duration(300)
          .attr('opacity', (d: any) => {
            const type = d.data?.type;
            if (type === 'CHILD') return 0.60;
            if (type === 'LEAD') return 0.60;
            if (type === 'ADMIN') return 0.60;
            return 0.35;
          });
        // Restore animation-play-state on deselect
        linkSelection.each(function () {
          const el = d3.select(this);
          if (el.classed('edge-pulse') || el.classed('edge-pulse-entering')) {
            el.style('animation-play-state', 'running');
          }
        });
      } else {
        linkSelection
          .transition().duration(300)
          .attr('opacity', (d: any) => {
            const type = d.data?.type;
            if (type === 'CHILD') return 0.60;
            if (type === 'LEAD') return 0.60;
            if (type === 'ADMIN') return 0.60;
            return 0.35;
          })
          .attr('stroke', (d: any) => EDGE_COLORS[d.data?.type] || EDGE_COLORS.MEMBER)
          .attr('stroke-width', (d: any) => {
            if (d.data?.type === 'MEMBER') return 0.9;
            if (d.data?.type === 'LEAD') return 1.4;
            if (d.data?.type === 'ADMIN') return 1.4;
            return Math.max(0.7, Math.min((d.data?.weight ?? 1) * 0.5, 2.0));
          });
      }
    }
  }, [selectedNodeId, graphVersion]);

  // ---------- Activity Pulse animation — applies/removes CSS classes on user→space edges ----------
  useEffect(() => {
    const linkSelection = linkSelRef.current;
    if (!linkSelection) return;

    // Tier-to-duration mapping
    const TIER_DURATION: Record<string, string> = {
      LOW: '4s',
      MEDIUM: '2s',
      HIGH: '0.8s',
    };

    // Tier-to-color mapping — dark-blue/light-blue palette
    const TIER_COLOR: Record<string, string> = {
      LOW: '#7dd3fc',
      MEDIUM: '#38bdf8',
      HIGH: '#1e3a5f',
    };

    // Tier-to-stroke-width mapping — thicker = more active
    const TIER_WIDTH: Record<string, number> = {
      LOW: 1.5,
      MEDIUM: 2.5,
      HIGH: 4.0,
    };

    if (activityPulseEnabled) {
      // Cancel any in-flight D3 transitions on links so they don't overwrite pulse attributes
      linkSelection.interrupt();

      // Compute per-edge period activity counts and derive tiers client-side
      const edgeCounts: number[] = [];
      linkSelection.each(function (d: any) {
        const edge = d.data;
        const sourceNode = (d.source as SimNode)?.data;
        if (!sourceNode || sourceNode.type !== 'USER') return;
        const periods = edge?.activityByPeriod;
        const count = periods ? (periods[activityPeriod] ?? 0) : (edge?.activityCount ?? 0);
        if (count > 0) edgeCounts.push(count);
      });
      edgeCounts.sort((a, b) => a - b);

      // Compute percentile thresholds for edge tiers
      let edgeP25 = 0, edgeP75 = 0;
      if (edgeCounts.length >= 3 && new Set(edgeCounts).size > 1) {
        edgeP25 = edgeCounts[Math.floor(edgeCounts.length * 0.25)];
        edgeP75 = edgeCounts[Math.floor(edgeCounts.length * 0.75)];
      }

      function deriveEdgeTier(count: number): string {
        if (count === 0) return 'INACTIVE';
        if (edgeCounts.length < 3) {
          if (count <= 2) return 'LOW';
          if (count <= 10) return 'MEDIUM';
          return 'HIGH';
        }
        if (new Set(edgeCounts).size === 1) return 'MEDIUM';
        if (count <= edgeP25) return 'LOW';
        if (count <= edgeP75) return 'MEDIUM';
        return 'HIGH';
      }

      // Apply pulse to user→space edges only (T016: exclude org edges)
      linkSelection.each(function (d: any) {
        const edge = d.data;
        const sourceNode = (d.source as SimNode)?.data;
        if (!sourceNode || sourceNode.type !== 'USER') return;
        const periods = edge?.activityByPeriod;
        const count = periods ? (periods[activityPeriod] ?? 0) : (edge?.activityCount ?? 0);
        const tier = deriveEdgeTier(count);

        const el = d3.select(this);
        if (tier === 'INACTIVE') {
          // Edge was pulsing but is now inactive for this period — stop pulse
          if (el.classed('edge-pulse') || el.classed('edge-pulse-entering')) {
            el.classed('edge-pulse', false);
            el.classed('edge-pulse-entering', false);
            el.classed('edge-pulse-exiting', true);
            setTimeout(() => {
              el.classed('edge-pulse-exiting', false);
              el.style('--pulse-duration', null);
              el.style('--pulse-color', null);
              const type = edge?.type;
              el.attr('stroke-width', type === 'LEAD' ? 1.4 : type === 'ADMIN' ? 1.4 : type === 'MEMBER' ? 0.9 : Math.max(0.7, Math.min((edge?.weight ?? 1) * 0.5, 2.0)));
              el.attr('stroke', (EDGE_COLORS as any)[type] || (EDGE_COLORS as any).MEMBER);
            }, 300);
          }
          return;
        }

        const duration = TIER_DURATION[tier] || '2s';
        el.style('--pulse-duration', duration);
        el.style('--pulse-color', TIER_COLOR[tier] || '#3b82f6');
        el.attr('stroke-width', TIER_WIDTH[tier] || 1.5);
        el.attr('stroke', TIER_COLOR[tier] || '#93c5fd');
        el.classed('edge-pulse-exiting', false);
        el.classed('edge-pulse-entering', true);

        // After enter transition, swap to steady-state class
        setTimeout(() => {
          el.classed('edge-pulse-entering', false);
          el.classed('edge-pulse', true);
        }, 300);
      });

      // Compose with selection: pause non-connected edges when a node is selected
      const selId = selectedNodeIdRef.current;
      if (selId) {
        linkSelection.each(function (d: any) {
          const el = d3.select(this);
          if (!el.classed('edge-pulse') && !el.classed('edge-pulse-entering')) return;
          const src = (d.source as SimNode).data.id;
          const tgt = (d.target as SimNode).data.id;
          const isConnected = src === selId || tgt === selId;
          el.style('animation-play-state', isConnected ? 'running' : 'paused');
        });
      }
    } else {
      // Remove pulse: add exiting class, then clean up
      linkSelection.each(function (d: any) {
        const el = d3.select(this);
        if (el.classed('edge-pulse') || el.classed('edge-pulse-entering')) {
          el.classed('edge-pulse', false);
          el.classed('edge-pulse-entering', false);
          el.classed('edge-pulse-exiting', true);

          setTimeout(() => {
            el.classed('edge-pulse-exiting', false);
            el.style('--pulse-duration', null);
            el.style('--pulse-color', null);
            // Restore original stroke-width and color
            const edgeData = (d3.select(this).datum() as any)?.data;
            const type = edgeData?.type;
            el.attr('stroke-width', type === 'LEAD' ? 1.4 : type === 'ADMIN' ? 1.4 : type === 'MEMBER' ? 0.9 : Math.max(0.7, Math.min((edgeData?.weight ?? 1) * 0.5, 2.0)));
            el.attr('stroke', (EDGE_COLORS as any)[type] || (EDGE_COLORS as any).MEMBER);
          }, 300);
        }
      });
    }
  }, [activityPulseEnabled, activityPeriod, graphVersion]);

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
