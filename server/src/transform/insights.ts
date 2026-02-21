import type { GraphNode, GraphEdge, GraphInsights } from '../types/graph.js';

/**
 * Detect super-connectors and isolated nodes.
 * FR-015: Insight shortcuts.
 */
export function computeInsights(nodes: GraphNode[], edges: GraphEdge[]): GraphInsights {
  // Compute degree for each node
  const degree = new Map<string, number>();
  for (const node of nodes) {
    degree.set(node.id, 0);
  }
  for (const edge of edges) {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) || 0) + 1);
    degree.set(edge.targetId, (degree.get(edge.targetId) || 0) + 1);
  }

  const degrees = Array.from(degree.values());
  if (degrees.length === 0) {
    return { superConnectors: [], isolatedNodes: [] };
  }

  // Mean and standard deviation
  const mean = degrees.reduce((a, b) => a + b, 0) / degrees.length;
  const variance = degrees.reduce((sum, d) => sum + (d - mean) ** 2, 0) / degrees.length;
  const stdDev = Math.sqrt(variance);

  // Super-connectors: degree > mean + 2σ
  const threshold = mean + 2 * stdDev;
  const superConnectors = nodes
    .filter((n) => (degree.get(n.id) || 0) > threshold)
    .map((n) => n.id);

  // Isolated nodes: degree ≤ 1
  const isolatedNodes = nodes
    .filter((n) => (degree.get(n.id) || 0) <= 1)
    .map((n) => n.id);

  return { superConnectors, isolatedNodes };
}
