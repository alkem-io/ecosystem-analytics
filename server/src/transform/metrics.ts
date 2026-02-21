import type { GraphNode, GraphEdge, GraphMetrics } from '../types/graph.js';

/**
 * Compute basic network metrics for the graph dataset.
 * FR-014: total nodes, total edges, average degree, density.
 */
export function computeMetrics(nodes: GraphNode[], edges: GraphEdge[]): GraphMetrics {
  const totalNodes = nodes.length;
  const totalEdges = edges.length;

  // Average degree: each edge contributes 1 to source + 1 to target degree
  const averageDegree = totalNodes > 0 ? (2 * totalEdges) / totalNodes : 0;

  // Density: actual edges / max possible edges in an undirected graph
  const maxEdges = totalNodes > 1 ? (totalNodes * (totalNodes - 1)) / 2 : 0;
  const density = maxEdges > 0 ? totalEdges / maxEdges : 0;

  return {
    totalNodes,
    totalEdges,
    averageDegree: Math.round(averageDegree * 100) / 100,
    density: Math.round(density * 10000) / 10000,
  };
}
