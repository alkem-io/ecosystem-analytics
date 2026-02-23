import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { geoMercator, geoPath } from 'd3-geo';
import type { GraphDataset, GraphNode, GraphEdge } from '@server/types/graph.js';
import { computeClusters } from './clustering.js';
import { computeProximityGroups, type ProximityCluster } from './proximityClustering.js';
import type { MapRegion } from '../map/MapOverlay.js';
import styles from './ForceGraph.module.css';

const NODE_COLORS: Record<string, string> = {
  SPACE_L0: 'var(--node-space-l0)',
  SPACE_L1: 'var(--node-space-l1)',
  SPACE_L2: 'var(--node-space-l2)',
  ORGANIZATION: 'var(--node-organization)',
  USER: 'var(--node-user)',
};

const PROXIMITY_THRESHOLD = 15;
const MAX_NODES_FOR_CLUSTERING = 300;
const FAN_OUT_DURATION_MS = 300;
const COLLAPSE_DURATION_MS = 250;
const FAN_OUT_MIN_RADIUS = 50;
const FAN_OUT_PER_NODE_RADIUS = 14;
const LABEL_MAX_CHARS = 30;     // truncate long labels

// Edge styling — Kumu-inspired subtle curves
const EDGE_COLORS: Record<string, string> = {
  CHILD: 'rgba(99,102,241,0.35)',    // indigo for parent-child
  LEAD: 'rgba(180,140,60,0.45)',     // warm brown for leadership
  MEMBER: 'rgba(140,160,180,0.2)',   // neutral blue-gray for membership
};

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
  world: 120,
  europe: 600,
  netherlands: 5000,
};

interface Props {
  dataset: GraphDataset;
  showPeople: boolean;
  showOrganizations: boolean;
  showSpaces: boolean;
  searchQuery: string;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
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
    const simLinks: SimLink[] = visibleEdges
      .map((e) => ({
        source: nodeMap.get(e.sourceId)!,
        target: nodeMap.get(e.targetId)!,
        data: e,
      }))
      .filter((l) => l.source && l.target);

    // Compute clusters for layout forces
    const clusters = computeClusters(visibleNodes, 'space');
    const clusterCenters = new Map<string, { x: number; y: number }>();
    clusters.forEach((c, i) => {
      const angle = (2 * Math.PI * i) / clusters.length;
      const radius = Math.min(width, height) * 0.25;
      clusterCenters.set(c.id, {
        x: width / 2 + radius * Math.cos(angle),
        y: height / 2 + radius * Math.sin(angle),
      });
    });

    // Build node-to-cluster map
    const nodeCluster = new Map<string, string>();
    for (const cluster of clusters) {
      for (const nodeId of cluster.nodeIds) {
        nodeCluster.set(nodeId, cluster.id);
      }
    }

    // Proximity clustering state (persists across ticks within this render)
    let expandedClusterKey: string | null = null;
    const fannedNodeIds = new Set<string>();
    let fanOrigin: { x: number; y: number } | null = null;
    let currentZoomScale = 1;
    let autoExpandedForSelection = false;

    // Setup zoom
    let simulationLocal: d3.Simulation<SimNode, SimLink> | null = null;
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 8]).on('zoom', (event) => {
      g.attr('transform', event.transform);
      currentZoomScale = event.transform.k;
      applyLOD(event.transform.k);
      // Kick simulation gently so proximity clustering recalculates
      if (simulationLocal && simulationLocal.alpha() < 0.01) {
        simulationLocal.alpha(0.01).restart();
      }
    });
    svg.call(zoom as any);

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
      .attr('stroke-width', (d) => Math.max(0.5, Math.min(d.data.weight * 0.6, 2)))
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
      .on('mouseenter', (_event, d) => {
        onNodeHover?.(d.data);
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
            // Fanned-out nodes stay at dragged position
            if (fannedNodeIds.has(d.data.id)) {
              d.fx = d.x;
              d.fy = d.y;
              return;
            }
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
        const r = Math.sqrt(d.data.weight) * 3;
        defs
          .append('clipPath')
          .attr('id', `clip-avatar-${d.data.id}`)
          .append('circle')
          .attr('r', r);
      });

    // Node circles — Kumu-inspired: spaces are filled, users/orgs get ring borders
    nodeSelection
      .append('circle')
      .attr('r', (d) => Math.sqrt(d.data.weight) * 3)
      .attr('fill', (d) => {
        if (d.data.type === 'USER' || d.data.type === 'ORGANIZATION') {
          return d.data.avatarUrl ? 'white' : NODE_COLORS[d.data.type] || '#999';
        }
        return NODE_COLORS[d.data.type] || '#999';
      })
      .attr('stroke', (d) => {
        if (d.data.type === 'USER') return 'rgba(140,160,180,0.6)';
        if (d.data.type === 'ORGANIZATION') return NODE_COLORS.ORGANIZATION;
        return 'rgba(255,255,255,0.8)';
      })
      .attr('stroke-width', (d) => {
        if (d.data.type === 'USER' || d.data.type === 'ORGANIZATION') return 2;
        return 1;
      });

    // Avatar images — clipped to circle, with fallback on error
    nodeSelection
      .filter((d) => !!d.data.avatarUrl)
      .append('image')
      .attr('href', (d) => d.data.avatarUrl!)
      .attr('x', (d) => -Math.sqrt(d.data.weight) * 3)
      .attr('y', (d) => -Math.sqrt(d.data.weight) * 3)
      .attr('width', (d) => Math.sqrt(d.data.weight) * 6)
      .attr('height', (d) => Math.sqrt(d.data.weight) * 6)
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
      .attr('font-size', (d) => (d.data.type === 'SPACE_L0' ? 11 : 9))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => Math.sqrt(d.data.weight) * 3 + 14)
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
      .attr('font-size', (d) => (d.data.type === 'SPACE_L0' ? 11 : 9))
      .attr('font-weight', (d) => (d.data.type === 'SPACE_L0' ? '600' : '400'))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => Math.sqrt(d.data.weight) * 3 + 14)
      .attr('fill', 'var(--text-secondary)')
      .attr('pointer-events', 'none')
      .attr('opacity', 0);

    // Connector lines layer (between badges and fanned nodes)
    const connectorLayer = g.append('g').attr('class', 'fan-connectors')
      .attr('pointer-events', 'none');

    // Cluster hull background layer (non-map view only)
    const hullLayer = g.insert('g', '.edges').attr('class', 'cluster-hulls');

    // Proximity clustering badge layer (above nodes)
    const badgeLayer = g.append('g').attr('class', 'cluster-badges');

    // Animation state
    let fanAnimationId: number | null = null;
    let collapseAnimationId: number | null = null;

    // Force simulation — adjust forces based on whether map mode is active
    const isGeoMode = showMap && geoTargets.size > 0;

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink(simLinks)
          .id((_d, i) => simNodes[i]?.data.id || '')
          .distance(isGeoMode ? 30 : 80)
          .strength(isGeoMode ? 0.15 : 0.2),
      )
      .force('charge', d3.forceManyBody().strength(isGeoMode ? -40 : -150))
      .force('center', isGeoMode ? null : d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d) => Math.sqrt((d as SimNode).data.weight) * 3 + 12))
      .force('cluster', isGeoMode ? null : (alpha: number) => {
        for (const node of simNodes) {
          const clusterId = nodeCluster.get(node.data.id);
          if (clusterId) {
            const center = clusterCenters.get(clusterId);
            if (center) {
              node.vx = (node.vx || 0) + (center.x - (node.x || 0)) * alpha * 0.1;
              node.vy = (node.vy || 0) + (center.y - (node.y || 0)) * alpha * 0.1;
            }
          }
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

      // Proximity clustering
      if (simNodes.length <= MAX_NODES_FOR_CLUSTERING) {
        // Build list of clusterable nodes (exclude fanned-out nodes)
        const clusterableNodes = simNodes
          .filter((n) => !fannedNodeIds.has(n.data.id))
          .map((n) => ({ id: n.data.id, x: n.x || 0, y: n.y || 0 }));

        // Simple linear threshold: clusters only truly overlapping nodes
        const effectiveThreshold = PROXIMITY_THRESHOLD / currentZoomScale;
        const proxClusters = computeProximityGroups(clusterableNodes, effectiveThreshold);

        // Collect all clustered node IDs
        const clusteredIds = new Set<string>();
        for (const c of proxClusters) {
          for (const id of c.memberIds) {
            clusteredIds.add(id);
          }
        }

        // Toggle node visibility
        nodeSelection.attr('display', (d) =>
          clusteredIds.has(d.data.id) ? 'none' : '',
        );

        // D3 join for badge groups
        const badges = badgeLayer
          .selectAll<SVGGElement, ProximityCluster>('g.proximity-badge')
          .data(proxClusters, (d) => d.key);

        // Exit: scale down and fade out
        badges.exit()
          .transition().duration(200)
          .attr('opacity', 0)
          .attr('transform', function () {
            const cur = d3.select(this).attr('transform') || 'translate(0,0)';
            return `${cur} scale(0.3)`;
          })
          .remove();

        const enter = badges.enter()
          .append('g')
          .attr('class', 'proximity-badge')
          .attr('cursor', 'pointer')
          .attr('opacity', 0)
          .attr('filter', 'url(#badge-shadow)');

        // Animate entrance: scale + fade in
        enter.transition().duration(250)
          .attr('opacity', 1);

        // Invisible hitbox for easier clicking
        enter.append('circle')
          .attr('class', 'badge-hitbox')
          .attr('r', 30)
          .attr('fill', 'transparent')
          .attr('cursor', 'pointer');

        // Outer ring (subtle indicator)
        enter.append('circle')
          .attr('class', 'badge-ring')
          .attr('r', 22)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(99,102,241,0.2)')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '3,2');

        // Visible badge circle — themed gradient feel
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

        // Hover effects
        enter
          .on('mouseenter', function () {
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
              .attr('stroke', 'rgba(99,102,241,0.4)');
            el.select('.badge-text')
              .transition().duration(150)
              .attr('font-size', 14);
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
              .attr('stroke', 'rgba(99,102,241,0.2)');
            el.select('.badge-text')
              .transition().duration(150)
              .attr('font-size', 13);
          });

        // Badge click → animated fan-out
        enter.on('click', (_event, d) => {
          _event.stopPropagation();

          // Cancel any running collapse animation
          if (collapseAnimationId) {
            cancelAnimationFrame(collapseAnimationId);
            collapseAnimationId = null;
          }

          expandedClusterKey = d.key;
          fanOrigin = { x: d.centroidX, y: d.centroidY };
          const count = d.memberIds.length;
          const radius = Math.max(FAN_OUT_MIN_RADIUS, count * FAN_OUT_PER_NODE_RADIUS);

          // Calculate target positions (start from top, clockwise)
          const targets = d.memberIds.map((id, i) => ({
            id,
            tx: d.centroidX + radius * Math.cos((2 * Math.PI * i) / count - Math.PI / 2),
            ty: d.centroidY + radius * Math.sin((2 * Math.PI * i) / count - Math.PI / 2),
          }));

          // Start nodes at centroid
          for (const t of targets) {
            const node = nodeMap.get(t.id);
            if (node) { node.fx = d.centroidX; node.fy = d.centroidY; }
            fannedNodeIds.add(t.id);
          }

          // Animated interpolation from centroid → target
          const startTime = performance.now();
          function animateFan() {
            const elapsed = performance.now() - startTime;
            const t = Math.min(1, elapsed / FAN_OUT_DURATION_MS);
            // Cubic ease-out: 1 - (1-t)^3
            const et = 1 - Math.pow(1 - t, 3);

            for (const target of targets) {
              const node = nodeMap.get(target.id);
              if (node) {
                node.fx = d.centroidX + (target.tx - d.centroidX) * et;
                node.fy = d.centroidY + (target.ty - d.centroidY) * et;
              }
            }
            simulation.alpha(Math.max(simulation.alpha(), 0.05)).restart();

            if (t < 1) {
              fanAnimationId = requestAnimationFrame(animateFan);
            } else {
              fanAnimationId = null;
              // Draw connector lines after animation completes
              updateConnectors();
            }
          }
          fanAnimationId = requestAnimationFrame(animateFan);
        });

        const merged = enter.merge(badges);

        // Position badges at cluster centroids — counter-scaled to maintain
        // constant apparent size regardless of zoom level
        const invScale = 1 / currentZoomScale;
        merged.attr('transform', (d) => `translate(${d.centroidX},${d.centroidY}) scale(${invScale})`);
        merged.select('.badge-text').text((d) => `${d.count}`);

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
            .attr('stroke', (d) => matchesFn(d) ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.2)');
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
            .attr('stroke', (d) => hlMatchFn(d) ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.2)');
          merged.select('.badge-text')
            .attr('fill', (d) => hlMatchFn(d) ? '#b45309' : '#4338ca');
          merged.attr('opacity', (d) => hlMatchFn(d) ? 1 : 0.25);
        }

        // Auto-expand cluster containing selected node (with animation)
        if (selectedNodeId && !autoExpandedForSelection) {
          for (const c of proxClusters) {
            if (c.memberIds.includes(selectedNodeId)) {
              expandedClusterKey = c.key;
              fanOrigin = { x: c.centroidX, y: c.centroidY };
              const cnt = c.memberIds.length;
              const r = Math.max(FAN_OUT_MIN_RADIUS, cnt * FAN_OUT_PER_NODE_RADIUS);

              const autoTargets = c.memberIds.map((id, i) => ({
                id,
                tx: c.centroidX + r * Math.cos((2 * Math.PI * i) / cnt - Math.PI / 2),
                ty: c.centroidY + r * Math.sin((2 * Math.PI * i) / cnt - Math.PI / 2),
              }));

              for (const t of autoTargets) {
                const node = nodeMap.get(t.id);
                if (node) { node.fx = c.centroidX; node.fy = c.centroidY; }
                fannedNodeIds.add(t.id);
              }

              autoExpandedForSelection = true;
              const startTime = performance.now();
              function animateAutoFan() {
                const elapsed = performance.now() - startTime;
                const t = Math.min(1, elapsed / FAN_OUT_DURATION_MS);
                const et = 1 - Math.pow(1 - t, 3);
                for (const target of autoTargets) {
                  const node = nodeMap.get(target.id);
                  if (node) {
                    node.fx = c.centroidX + (target.tx - c.centroidX) * et;
                    node.fy = c.centroidY + (target.ty - c.centroidY) * et;
                  }
                }
                simulation.alpha(Math.max(simulation.alpha(), 0.05)).restart();
                if (t < 1) {
                  requestAnimationFrame(animateAutoFan);
                } else {
                  updateConnectors();
                }
              }
              requestAnimationFrame(animateAutoFan);
              break;
            }
          }
        }

        // Update connector lines for fanned-out nodes
        if (fanOrigin && fannedNodeIds.size > 0) {
          updateConnectors();
        } else {
          connectorLayer.selectAll('*').remove();
        }
      } else {
        // Too many nodes — skip clustering
        nodeSelection.attr('display', '');
        badgeLayer.selectAll('*').remove();
      }
    });

    // Helper: draw connector lines from fanOrigin to fanned nodes
    function updateConnectors() {
      if (!fanOrigin || fannedNodeIds.size === 0) {
        connectorLayer.selectAll('*').remove();
        return;
      }
      const lineData = Array.from(fannedNodeIds).map((id) => {
        const node = nodeMap.get(id);
        return node ? { id, x: node.x || 0, y: node.y || 0 } : null;
      }).filter(Boolean) as { id: string; x: number; y: number }[];

      const lines = connectorLayer
        .selectAll<SVGLineElement, typeof lineData[0]>('line')
        .data(lineData, (d) => d.id);

      lines.exit().remove();

      lines.enter().append('line')
        .attr('stroke', 'rgba(99,102,241,0.25)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,3')
        .merge(lines)
        .attr('x1', fanOrigin.x)
        .attr('y1', fanOrigin.y)
        .attr('x2', (d) => d.x)
        .attr('y2', (d) => d.y);
    }

    // Background click to collapse expanded cluster (animated)
    svg.on('click.collapse', () => {
      if (expandedClusterKey) {
        // Cancel any running fan animation
        if (fanAnimationId) {
          cancelAnimationFrame(fanAnimationId);
          fanAnimationId = null;
        }

        const collapsingIds = new Set(fannedNodeIds);
        const origin = fanOrigin ? { ...fanOrigin } : null;

        // Capture current positions as starting points
        const startPositions = new Map<string, { x: number; y: number }>();
        for (const id of collapsingIds) {
          const node = nodeMap.get(id);
          if (node) startPositions.set(id, { x: node.x || 0, y: node.y || 0 });
        }

        // Clear state immediately so tick handler stops re-clustering these
        expandedClusterKey = null;
        fannedNodeIds.clear();
        fanOrigin = null;

        // Animated collapse back to origin / geo position
        if (origin) {
          const startTime = performance.now();
          function animateCollapse() {
            const elapsed = performance.now() - startTime;
            const t = Math.min(1, elapsed / COLLAPSE_DURATION_MS);
            // Cubic ease-in: t^3
            const et = t * t * (3 - 2 * t); // smoothstep for natural deceleration

            for (const id of collapsingIds) {
              const node = nodeMap.get(id);
              const start = startPositions.get(id);
              if (!node || !start) continue;

              const geoTarget = geoTargets.get(id);
              const endX = geoTarget ? geoTarget.x : origin!.x;
              const endY = geoTarget ? geoTarget.y : origin!.y;

              node.fx = start.x + (endX - start.x) * et;
              node.fy = start.y + (endY - start.y) * et;
            }
            simulation.alpha(Math.max(simulation.alpha(), 0.05)).restart();

            // Fade out connectors
            connectorLayer.selectAll('line')
              .attr('stroke', `rgba(99,102,241,${0.25 * (1 - t)})`);

            if (t < 1) {
              collapseAnimationId = requestAnimationFrame(animateCollapse);
            } else {
              collapseAnimationId = null;
              connectorLayer.selectAll('*').remove();
              // Release fx/fy or restore geo
              for (const id of collapsingIds) {
                const node = nodeMap.get(id);
                if (!node) continue;
                const geoTarget = geoTargets.get(id);
                if (geoTarget) {
                  node.fx = geoTarget.x;
                  node.fy = geoTarget.y;
                } else {
                  node.fx = null;
                  node.fy = null;
                }
              }
              simulation.alpha(0.1).restart();
            }
          }
          collapseAnimationId = requestAnimationFrame(animateCollapse);
        } else {
          // No origin — just release
          for (const id of collapsingIds) {
            const node = nodeMap.get(id);
            if (!node) continue;
            const geoTarget = geoTargets.get(id);
            if (geoTarget) { node.fx = geoTarget.x; node.fy = geoTarget.y; }
            else { node.fx = null; node.fy = null; }
          }
          connectorLayer.selectAll('*').remove();
          simulation.alpha(0.3).restart();
        }
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
        const fontSize = d.data.type === 'SPACE_L0' ? 11 : 9;
        const charWidth = fontSize * 0.6;
        const w = text.length * charWidth * invK;
        const h = fontSize * 1.5 * invK;
        const r = Math.sqrt(d.data.weight) * 3;

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

    // Apply selection highlighting — Kumu-style: highlight connected subgraph
    // 1st-degree connections at full opacity, 2nd-degree at medium, rest at low
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

      nodeSelection.attr('opacity', (d) => {
        if (firstDegree.has(d.data.id)) return 1;
        if (secondDegree.has(d.data.id)) return 0.45;
        return 0.15;
      });

      linkSelection.attr('opacity', (d) => {
        const srcFirst = firstDegree.has(d.data.sourceId);
        const tgtFirst = firstDegree.has(d.data.targetId);
        // Direct connection to selected node
        if (d.data.sourceId === selectedNodeId || d.data.targetId === selectedNodeId) return 0.9;
        // Between 1st-degree nodes
        if (srcFirst && tgtFirst) return 0.5;
        // Between 1st and 2nd degree
        if ((srcFirst && secondDegree.has(d.data.targetId)) || (tgtFirst && secondDegree.has(d.data.sourceId))) return 0.2;
        return 0.04;
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
