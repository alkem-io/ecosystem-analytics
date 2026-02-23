import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { geoMercator, geoPath } from 'd3-geo';
import type { GraphDataset, GraphNode, GraphEdge } from '@server/types/graph.js';
import { computeClusters, type ClusterMode } from './clustering.js';
import type { MapRegion } from '../map/MapOverlay.js';
import styles from './ForceGraph.module.css';

const NODE_COLORS: Record<string, string> = {
  SPACE_L0: 'var(--node-space-l0)',
  SPACE_L1: 'var(--node-space-l1)',
  SPACE_L2: 'var(--node-space-l2)',
  ORGANIZATION: 'var(--node-organization)',
  USER: 'var(--node-user)',
};

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
  clusterMode: ClusterMode;
  showPeople: boolean;
  showOrganizations: boolean;
  searchQuery: string;
  onNodeClick: (node: GraphNode) => void;
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
  clusterMode,
  showPeople,
  showOrganizations,
  searchQuery,
  onNodeClick,
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
    const clusters = computeClusters(visibleNodes, clusterMode);
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

    // Setup zoom
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 8]).on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    svg.call(zoom as any);

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
          mapGroup
            .selectAll('path')
            .data(geojson.features || [geojson])
            .join('path')
            .attr('d', path as any)
            .attr('fill', '#e8ecf0')
            .attr('stroke', '#c8cdd3')
            .attr('stroke-width', 0.5);
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

    // Draw edges
    const linkSelection = g
      .append('g')
      .attr('class', 'edges')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (d) =>
        d.data.type === 'CHILD'
          ? 'var(--edge-child)'
          : d.data.type === 'LEAD'
            ? 'var(--edge-lead)'
            : 'var(--edge-member)',
      )
      .attr('stroke-width', (d) => d.data.weight)
      .attr('stroke-opacity', 0.4);

    // Draw nodes
    const nodeSelection = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => onNodeClick(d.data))
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
            d.fx = null;
            d.fy = null;
          }),
      );

    // Node circles
    nodeSelection
      .append('circle')
      .attr('r', (d) => Math.sqrt(d.data.weight) * 3)
      .attr('fill', (d) => NODE_COLORS[d.data.type] || '#999')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    // Node labels (for spaces and orgs)
    nodeSelection
      .filter((d) => d.data.type !== 'USER')
      .append('text')
      .text((d) => d.data.displayName)
      .attr('font-size', (d) => (d.data.type === 'SPACE_L0' ? 11 : 9))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => Math.sqrt(d.data.weight) * 3 + 14)
      .attr('fill', 'var(--text-secondary)')
      .attr('pointer-events', 'none');

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

    // Force simulation
    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink(simLinks)
          .id((_d, i) => simNodes[i]?.data.id || '')
          .distance(50)
          .strength(0.3),
      )
      .force('charge', d3.forceManyBody().strength(-80))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d) => Math.sqrt((d as SimNode).data.weight) * 3 + 5))
      .force('cluster', (alpha: number) => {
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

    // Geographic pinning force — pulls nodes with lat/long toward projected positions
    if (showMap && geoTargets.size > 0) {
      simulation.force('geo', (alpha: number) => {
        for (const node of simNodes) {
          const target = geoTargets.get(node.data.id);
          if (target) {
            node.vx = (node.vx || 0) + (target.x - (node.x || 0)) * alpha * 0.3;
            node.vy = (node.vy || 0) + (target.y - (node.y || 0)) * alpha * 0.3;
          }
        }
      });
    }

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', (d) => (d.source as SimNode).x || 0)
        .attr('y1', (d) => (d.source as SimNode).y || 0)
        .attr('x2', (d) => (d.target as SimNode).x || 0)
        .attr('y2', (d) => (d.target as SimNode).y || 0);

      nodeSelection.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);
    });

    simulationRef.current = simulation;

    // Apply search highlighting
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      nodeSelection.attr('opacity', (d) =>
        d.data.displayName.toLowerCase().includes(q) ? 1 : 0.15,
      );
      linkSelection.attr('stroke-opacity', 0.1);
    }

    // Apply insight highlighting
    if (highlightedNodeIds.length > 0) {
      const hlSet = new Set(highlightedNodeIds);
      nodeSelection.select('circle').attr('stroke', (d: any) => (hlSet.has(d.data.id) ? '#f59e0b' : '#fff'));
      nodeSelection.select('circle').attr('stroke-width', (d: any) => (hlSet.has(d.data.id) ? 3 : 1.5));
      nodeSelection.attr('opacity', (d: any) => (hlSet.has(d.data.id) ? 1 : 0.25));
    }

    // Apply selection highlighting
    if (selectedNodeId) {
      const connectedIds = new Set<string>();
      connectedIds.add(selectedNodeId);
      for (const edge of visibleEdges) {
        if (edge.sourceId === selectedNodeId) connectedIds.add(edge.targetId);
        if (edge.targetId === selectedNodeId) connectedIds.add(edge.sourceId);
      }

      nodeSelection.attr('opacity', (d) => (connectedIds.has(d.data.id) ? 1 : 0.2));
      linkSelection.attr('stroke-opacity', (d) =>
        d.data.sourceId === selectedNodeId || d.data.targetId === selectedNodeId ? 0.8 : 0.05,
      );
    }
  }, [dataset, clusterMode, showPeople, showOrganizations, searchQuery, selectedNodeId, highlightedNodeIds, onNodeClick, showMap, mapRegion]);

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
