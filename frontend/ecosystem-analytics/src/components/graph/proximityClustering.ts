/**
 * Pure proximity clustering algorithm for the force graph.
 * Groups nodes that are within a pixel-distance threshold into clusters.
 * No D3 dependency — operates on plain coordinates.
 */

export interface ProximityNode {
  id: string;
  x: number;
  y: number;
}

export interface ProximityCluster {
  /** Stable identifier: sorted member IDs joined with '|' */
  key: string;
  /** Average x-position of all members */
  centroidX: number;
  /** Average y-position of all members */
  centroidY: number;
  /** IDs of all nodes in this cluster */
  memberIds: string[];
  /** Number of members (convenience) */
  count: number;
}

/**
 * Compute proximity-based groups of overlapping nodes.
 *
 * Algorithm: Greedy single-pass with x-sort optimization.
 * 1. Sort nodes by x-coordinate
 * 2. For each unassigned node, find all unassigned neighbors within threshold
 * 3. If 2+ nodes found → create cluster at average position
 *
 * Complexity: O(n²) worst case, early-exit on dx > threshold.
 */
export function computeProximityGroups(
  nodes: ProximityNode[],
  threshold: number,
): ProximityCluster[] {
  if (nodes.length < 2) return [];

  // Sort by x for early termination
  const sorted = [...nodes].sort((a, b) => a.x - b.x);
  const assigned = new Set<string>();
  const clusters: ProximityCluster[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const seed = sorted[i];
    if (assigned.has(seed.id)) continue;

    const members: ProximityNode[] = [seed];

    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j];
      if (assigned.has(candidate.id)) continue;

      // Early termination: if dx alone exceeds threshold, no further nodes can match
      const dx = candidate.x - seed.x;
      if (dx > threshold) break;

      const dy = candidate.y - seed.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= threshold) {
        members.push(candidate);
      }
    }

    if (members.length >= 2) {
      let cx = 0;
      let cy = 0;
      const ids: string[] = [];
      for (const m of members) {
        cx += m.x;
        cy += m.y;
        ids.push(m.id);
        assigned.add(m.id);
      }

      // Stable key: sorted member IDs
      ids.sort();

      clusters.push({
        key: ids.join('|'),
        centroidX: cx / members.length,
        centroidY: cy / members.length,
        memberIds: ids,
        count: members.length,
      });
    }
  }

  return clusters;
}
