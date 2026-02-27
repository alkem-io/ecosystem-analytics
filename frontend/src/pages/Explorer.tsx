import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGraph } from '../hooks/useGraph.js';
import { useSpaces } from '../hooks/useSpaces.js';
import ForceGraph from '../components/graph/ForceGraph.js';
import LoadingOverlay from '../components/graph/LoadingOverlay.js';
import TopBar from '../components/panels/TopBar.js';
import ControlPanel from '../components/panels/ControlPanel.js';
import DetailsDrawer from '../components/panels/DetailsDrawer.js';
import MetricsBar from '../components/panels/MetricsBar.js';
import type { MapRegion } from '../components/map/MapOverlay.js';
import HoverCard from '../components/graph/HoverCard.js';
import type { GraphNode } from '@server/types/graph.js';
import { api } from '../services/api.js';
import styles from './Explorer.module.css';

/**
 * Screen C — Graph Explorer
 * Design reference: design-brief-figma-make.md Screen C
 */
interface ExplorerProps {
  onLogout: () => void;
}

export default function Explorer({ onLogout }: ExplorerProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { dataset, progress, loading, error, generate } = useGraph();

  const [showPeople, setShowPeople] = useState(true);
  const [showOrganizations, setShowOrganizations] = useState(true);
  const [showSpaces, setShowSpaces] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [mapRegion, setMapRegion] = useState<MapRegion>('europe');
  const [showMap, setShowMap] = useState(false);
  const [activityPulseEnabled, setActivityPulseEnabled] = useState(false);
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
  const { spaces } = useSpaces();

  const availableSpaces = useMemo(
    () => spaces.filter((s) => !activeSpaceIds.includes(s.nameId)),
    [spaces, activeSpaceIds],
  );

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

  const handleRemoveSpace = useCallback(
    (spaceNodeId: string) => {
      // Find the nameId for this L0 node so we can remove it from activeSpaceIds
      const spaceNode = dataset?.nodes.find((n) => n.id === spaceNodeId);
      const nameId = spaceNode?.nameId;
      if (!nameId) return;
      const updated = activeSpaceIds.filter((id) => id !== nameId);
      if (updated.length === 0) {
        navigate('/spaces');
        return;
      }
      setActiveSpaceIds(updated);
      setSelectedNode(null);
      generate(updated);
    },
    [activeSpaceIds, dataset, generate, navigate],
  );

  const EMPTY_IDS: string[] = useMemo(() => [], []);
  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    setHighlightedNodeIds(EMPTY_IDS);
  }, [EMPTY_IDS]);

  const handleNodeHover = useCallback((node: GraphNode | null, position?: { x: number; y: number }) => {
    setHoveredNode(node);
    if (position) setHoverPos(position);
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
        onLogout={onLogout}
      >
        {availableSpaces.length > 0 && (
          <select
            className={styles.addSpaceSelect}
            value=""
            onChange={(e) => {
              if (e.target.value) handleExpandSpace(e.target.value);
            }}
          >
            <option value="" disabled>+ Add Space</option>
            {availableSpaces.map((s) => (
              <option key={s.nameId} value={s.nameId}>{s.displayName}</option>
            ))}
          </select>
        )}
      </TopBar>
      <div className={styles.main}>
        {dataset && (
          <ControlPanel
            dataset={dataset}
            showPeople={showPeople}
            showOrganizations={showOrganizations}
            showSpaces={showSpaces}
            onTogglePeople={() => setShowPeople((p) => !p)}
            onToggleOrganizations={() => setShowOrganizations((p) => !p)}
            onToggleSpaces={() => setShowSpaces((p) => !p)}
            showMap={showMap}
            onToggleMap={() => setShowMap((m) => !m)}
            mapRegion={mapRegion}
            onMapRegionChange={setMapRegion}
            onRemoveSpace={handleRemoveSpace}
            activityPulseEnabled={activityPulseEnabled}
            onToggleActivityPulse={() => setActivityPulseEnabled((p) => !p)}
            hasActivityData={dataset.hasActivityData ?? false}
          />
        )}
        <div className={styles.canvas} ref={canvasRef}>
          {dataset && (
            <ForceGraph
              dataset={dataset}
              showPeople={showPeople}
              showOrganizations={showOrganizations}
              showSpaces={showSpaces}
              searchQuery={searchQuery}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              selectedNodeId={selectedNode?.id || null}
              highlightedNodeIds={highlightedNodeIds}
              showMap={showMap}
              mapRegion={mapRegion}
              activityPulseEnabled={activityPulseEnabled}
            />
          )}
          {loading && <LoadingOverlay progress={progress} />}
        </div>
        {selectedNode && dataset && (
          <DetailsDrawer
            node={selectedNode}
            dataset={dataset}
            onClose={() => { setSelectedNode(null); setHoveredNode(null); }}
            onExpandSpace={handleExpandSpace}
            onNodeSelect={handleNodeClick}
            showPeople={showPeople}
            showOrganizations={showOrganizations}
            showSpaces={showSpaces}
          />
        )}
        {hoveredNode && !selectedNode && dataset && (
          <HoverCard node={hoveredNode} dataset={dataset} x={hoverPos.x} y={hoverPos.y} />
        )}
      </div>
      {dataset && <MetricsBar metrics={dataset.metrics} />}
    </div>
  );
}
