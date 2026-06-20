import { useCallback, useMemo, useState } from 'react';
import { ForceGraph, HoverCard } from '@ea/shared';
import type { GraphDataset, GraphNode } from '@server/types/graph.js';

/**
 * Interactive Netherlands-only map for the initiative-details tab. Reuses the
 * shared ForceGraph in map mode (constitution §VII / FR-048: NL-only, tiles
 * clipped, nothing outside) so it pans/zooms/hovers exactly like the main Graph
 * tab and shares the one map implementation. The participating gemeentes are
 * pinned at their geo-locations.
 */
export function InitiativeMap({ gemeentes }: { gemeentes: GraphNode[] }) {
  const [hover, setHover] = useState<{ node: GraphNode; x: number; y: number } | null>(null);

  // Minimal valid dataset of just the gemeente nodes (all geo-located → pinned).
  const dataset = useMemo<GraphDataset>(
    () => ({
      version: '1.0.0',
      generatedAt: '',
      spaces: [],
      nodes: gemeentes,
      edges: [],
      metrics: {
        totalNodes: gemeentes.length,
        totalEdges: 0,
        averageDegree: 0,
        density: 0,
      },
      cacheInfo: [],
    }),
    [gemeentes],
  );

  const handleHover = useCallback(
    (node: GraphNode | null, position?: { x: number; y: number }) => {
      if (node && position) setHover({ node, x: position.x, y: position.y });
      else setHover(null);
    },
    [],
  );

  return (
    <div className="relative h-[32rem] w-full overflow-hidden rounded-lg">
      <ForceGraph
        dataset={dataset}
        showPeople={false}
        showOrganizations
        showSpaces={false}
        searchQuery=""
        onNodeClick={() => {}}
        onNodeHover={handleHover}
        selectedNodeId={null}
        showMap
        mapRegion="netherlands"
        nodeSizeScale={1.4}
      />
      {hover && <HoverCard node={hover.node} dataset={dataset} x={hover.x} y={hover.y} />}
    </div>
  );
}
