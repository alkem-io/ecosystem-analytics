import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGraph } from '../hooks/useGraph.js';
import ForceGraph from '../components/graph/ForceGraph.js';
import LoadingOverlay from '../components/graph/LoadingOverlay.js';
import TopBar from '../components/panels/TopBar.js';
import ControlPanel from '../components/panels/ControlPanel.js';
import DetailsDrawer from '../components/panels/DetailsDrawer.js';
import MetricsBar from '../components/panels/MetricsBar.js';
import MapOverlay from '../components/map/MapOverlay.js';
import type { MapRegion } from '../components/map/MapOverlay.js';
import type { ClusterMode } from '../components/graph/clustering.js';
import type { GraphNode } from '@server/types/graph.js';
import { api } from '../services/api.js';
import styles from './Explorer.module.css';

/**
 * Screen C — Graph Explorer
 * Design reference: design-brief-figma-make.md Screen C
 */
export default function Explorer() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dataset, progress, loading, error, generate } = useGraph();

  const [clusterMode, setClusterMode] = useState<ClusterMode>('space');
  const [showPeople, setShowPeople] = useState(true);
  const [showOrganizations, setShowOrganizations] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [mapRegion] = useState<MapRegion>('europe');
  const [showMap] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Get spaceIds from navigation state
  const spaceIds = (location.state as { spaceIds?: string[] })?.spaceIds;

  useEffect(() => {
    if (!spaceIds || spaceIds.length === 0) {
      navigate('/spaces');
      return;
    }
    generate(spaceIds);
  }, []); // Run once on mount

  const [activeSpaceIds, setActiveSpaceIds] = useState<string[]>(spaceIds || []);

  const handleRefresh = useCallback(() => {
    if (activeSpaceIds.length > 0) generate(activeSpaceIds, true);
  }, [activeSpaceIds, generate]);

  const handleExpandSpace = useCallback(
    async (newSpaceId: string) => {
      const updated = [...activeSpaceIds, newSpaceId];
      setActiveSpaceIds(updated);
      generate(updated);
    },
    [activeSpaceIds, generate],
  );

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    setHighlightedNodeIds([]);
  }, []);

  const handleExport = useCallback(async () => {
    if (!activeSpaceIds.length) return;
    try {
      const data = await api.post('/api/graph/export', { spaceIds: activeSpaceIds });
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecosystem-graph-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Export failed silently — non-critical
    }
  }, [activeSpaceIds]);

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <p>Failed to generate graph: {error}</p>
        <button onClick={() => navigate('/spaces')}>Back to Space Selector</button>
      </div>
    );
  }

  const lastSync = dataset?.generatedAt || null;

  return (
    <div className={styles.layout} role="application" aria-label="Ecosystem Analytics Explorer">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        lastSync={lastSync}
        onRefresh={handleRefresh}
        refreshing={loading}
        onExport={dataset ? handleExport : undefined}
      />
      <div className={styles.main}>
        {dataset && (
          <ControlPanel
            dataset={dataset}
            clusterMode={clusterMode}
            onClusterModeChange={setClusterMode}
            showPeople={showPeople}
            showOrganizations={showOrganizations}
            onTogglePeople={() => setShowPeople((p) => !p)}
            onToggleOrganizations={() => setShowOrganizations((p) => !p)}
            onHighlightNodes={setHighlightedNodeIds}
          />
        )}
        <div className={styles.canvas} ref={canvasRef}>
          {dataset && (
            <ForceGraph
              dataset={dataset}
              clusterMode={clusterMode}
              showPeople={showPeople}
              showOrganizations={showOrganizations}
              searchQuery={searchQuery}
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNode?.id || null}
              highlightedNodeIds={highlightedNodeIds}
            />
          )}
          <MapOverlay
            region={mapRegion}
            width={canvasRef.current?.clientWidth || 800}
            height={canvasRef.current?.clientHeight || 600}
            visible={showMap}
          />
          {loading && <LoadingOverlay progress={progress} />}
        </div>
        {selectedNode && dataset && (
          <DetailsDrawer
            node={selectedNode}
            dataset={dataset}
            onClose={() => setSelectedNode(null)}
            onExpandSpace={handleExpandSpace}
          />
        )}
      </div>
      {dataset && <MetricsBar metrics={dataset.metrics} />}
    </div>
  );
}
