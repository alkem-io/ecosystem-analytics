import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGraph } from '../hooks/useGraph.js';
import { useSpaces } from '../hooks/useSpaces.js';
import { useViewState } from '../hooks/useViewState.js';
import { useTheme } from '../hooks/useTheme.js';
import ForceGraph from '../components/graph/ForceGraph.js';
import LoadingOverlay from '../components/graph/LoadingOverlay.js';
import ViewSwitcher from '../components/graph/ViewSwitcher.js';
import TreemapView from '../components/graph/TreemapView.js';
import SunburstView from '../components/graph/SunburstView.js';
import ChordView from '../components/graph/ChordView.js';
import TimelineView from '../components/graph/TimelineView.js';
import TemporalForceView from '../components/graph/TemporalForceView.js';
import TemporalScrubber from '../components/graph/TemporalScrubber.js';
import TopBar from '../components/panels/TopBar.js';
import ControlPanel from '../components/panels/ControlPanel.js';
import DetailsDrawer from '../components/panels/DetailsDrawer.js';
import MetricsBar from '../components/panels/MetricsBar.js';
import type { MapRegion } from '../components/map/MapOverlay.js';
import HoverCard from '../components/graph/HoverCard.js';
import type { GraphNode } from '@server/types/graph.js';
import type { ActivityPeriod } from '@server/types/graph.js';
import { EdgeType, NodeType } from '@server/types/graph.js';
import { api } from '../services/api.js';
import styles from './Explorer.module.css';

/** Stable empty-array reference shared between state init and click handler. */
const EMPTY_IDS: string[] = [];

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
  const { dataset, progress, loading, error, warnings, generate } = useGraph();
  const [dismissedWarnings, setDismissedWarnings] = useState(false);
  const viewState = useViewState();
  const { theme, toggle: toggleTheme } = useTheme();

  const [showPeople, setShowPeople] = useState(true);
  const [showOrganizations, setShowOrganizations] = useState(true);
  const [showSpaces, setShowSpaces] = useState(true);
  const [showMembers, setShowMembers] = useState(true);
  const [showLeads, setShowLeads] = useState(true);
  const [showAdmins, setShowAdmins] = useState(true);
  const [showPublic, setShowPublic] = useState(true);
  const [showPrivate, setShowPrivate] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>(EMPTY_IDS);
  const [mapRegion, setMapRegion] = useState<MapRegion>('europe');
  const [showMap, setShowMap] = useState(false);
  const [activityPulseEnabled, setActivityPulseEnabled] = useState(false);
  const [spaceActivityEnabled, setSpaceActivityEnabled] = useState(false);
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('allTime');
  const [directConnectionsOnly, setDirectConnectionsOnly] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Get spaceIds from navigation state
  const spaceIds = (location.state as { spaceIds?: string[] })?.spaceIds;

  useEffect(() => {
    if (!spaceIds || spaceIds.length === 0) {
      navigate('/spaces');
      return;
    }
    setDismissedWarnings(false);
    generate(spaceIds);
  }, []); // Run once on mount

  // Track canvas container size for view components
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [activeSpaceIds, setActiveSpaceIds] = useState<string[]>(spaceIds || []);
  const { spaces } = useSpaces();

  const availableSpaces = useMemo(
    () => spaces.filter((s) => !activeSpaceIds.includes(s.nameId)),
    [spaces, activeSpaceIds],
  );

  const handleRefresh = useCallback(() => {
    if (activeSpaceIds.length > 0) generate(activeSpaceIds, true);
  }, [activeSpaceIds, generate]);

  const [cacheCleared, setCacheCleared] = useState(false);
  const handleClearCache = useCallback(async () => {
    try {
      await api.delete('/api/graph/cache');
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 2000);
      if (activeSpaceIds.length > 0) generate(activeSpaceIds, true);
    } catch {
      // Silently fail — next refresh will re-fetch anyway
    }
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

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    setHighlightedNodeIds(EMPTY_IDS);
  }, []);

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
        onClearCache={handleClearCache}
        cacheCleared={cacheCleared}
        onExport={dataset ? handleExport : undefined}
        onLogout={onLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
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
      {warnings.length > 0 && !dismissedWarnings && (
        <div className={styles.warningBanner} role="alert">
          <div className={styles.warningContent}>
            <strong>Warnings during graph generation:</strong>
            <ul>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
          <button className={styles.warningDismiss} onClick={() => setDismissedWarnings(true)}>
            Dismiss
          </button>
        </div>
      )}
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
            showMembers={showMembers}
            showLeads={showLeads}
            showAdmins={showAdmins}
            onToggleMembers={() => setShowMembers((m) => !m)}
            onToggleLeads={() => setShowLeads((l) => !l)}
            onToggleAdmins={() => setShowAdmins((a) => !a)}
            showPublic={showPublic}
            showPrivate={showPrivate}
            onTogglePublic={() => setShowPublic((p) => !p)}
            onTogglePrivate={() => setShowPrivate((p) => !p)}
            showMap={showMap}
            onToggleMap={() => setShowMap((m) => !m)}
            mapRegion={mapRegion}
            onMapRegionChange={setMapRegion}
            onRemoveSpace={handleRemoveSpace}
            activityPulseEnabled={activityPulseEnabled}
            onToggleActivityPulse={() => setActivityPulseEnabled((p) => !p)}
            hasActivityData={dataset.hasActivityData ?? false}
            spaceActivityEnabled={spaceActivityEnabled}
            onToggleSpaceActivity={() => setSpaceActivityEnabled((p) => !p)}
            activityPeriod={activityPeriod}
            onActivityPeriodChange={setActivityPeriod}
            directConnectionsOnly={directConnectionsOnly}
            onToggleDirectConnections={() => setDirectConnectionsOnly((d) => !d)}
            activeView={viewState.state.activeView}
            sizeMetric={viewState.state.sizeMetric}
            onSizeMetricChange={viewState.setSizeMetric}
            chordMode={viewState.state.chordMode}
            onChordModeChange={viewState.setChordMode}
            chordGroupLevel={viewState.state.chordGroupLevel}
            onChordGroupLevelChange={viewState.setChordGroupLevel}
            showMemberLeaves={viewState.state.showMembers}
            onToggleMemberLeaves={() => viewState.setShowMembers(!viewState.state.showMembers)}
            timelineChartType={viewState.state.timelineChartType}
            onTimelineChartTypeChange={(type) => viewState.setTimelineChartType(type)}
          />
        )}
        <div className={styles.canvas} ref={canvasRef}>
          {dataset && (
            <ViewSwitcher
              activeView={viewState.state.activeView}
              onViewChange={viewState.setActiveView}
              hasTimelineData={!!(dataset.hasActivityData && dataset.timeSeries && dataset.timeSeries.length > 0)}
            />
          )}
          {dataset && viewState.state.activeView === 'force-graph' && (
            <ForceGraph
              dataset={dataset}
              showPeople={showPeople}
              showOrganizations={showOrganizations}
              showSpaces={showSpaces}
              showMembers={showMembers}
              showLeads={showLeads}
              showAdmins={showAdmins}
              showPublic={showPublic}
              showPrivate={showPrivate}
              searchQuery={searchQuery}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              selectedNodeId={selectedNode?.id || null}
              highlightedNodeIds={highlightedNodeIds}
              showMap={showMap}
              mapRegion={mapRegion}
              activityPulseEnabled={activityPulseEnabled}
              spaceActivityEnabled={spaceActivityEnabled}
              activityPeriod={activityPeriod}
              directConnectionsOnly={directConnectionsOnly}
            />
          )}
          {dataset && viewState.state.activeView === 'temporal-force' && (() => {
            // Timeline starts at the oldest selected L0 space's creation date
            const l0Dates = dataset.nodes
              .filter((n) => n.type === NodeType.SPACE_L0)
              .map((n) => n.createdDate ? new Date(n.createdDate) : null)
              .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
            const allDates = dataset.nodes
              .map((n) => n.createdDate ? new Date(n.createdDate) : null)
              .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
            const minDate = l0Dates.length ? new Date(Math.min(...l0Dates.map((d) => d.getTime()))) : new Date('2020-01-01');
            const maxDate = allDates.length ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : new Date();

            // Auto-initialize temporal cursor to the earliest date when first entering the view
            const effectiveDate = viewState.state.temporalDate ?? minDate;
            if (!viewState.state.temporalDate) {
              // Schedule for next tick to avoid setState-during-render
              // Auto-start playback so the user sees nodes appear
              queueMicrotask(() => {
                viewState.setTemporalDate(minDate);
                viewState.setTemporalPlaying(true);
              });
            }
            const scrubberHeight = 48;
            return (
              <>
                <TemporalForceView
                  dataset={dataset}
                  temporalDate={effectiveDate}
                  selectedNodeId={selectedNode?.id ?? null}
                  onNodeSelect={(id) => {
                    if (id) {
                      const node = dataset.nodes.find((n) => n.id === id);
                      if (node) handleNodeClick(node);
                    } else {
                      setSelectedNode(null);
                    }
                  }}
                  activityPeriod={activityPeriod}
                  width={canvasSize.width}
                  height={Math.max(0, canvasSize.height - scrubberHeight)}
                  showPeople={showPeople}
                  showOrganizations={showOrganizations}
                  showSpaces={showSpaces}
                  showMembers={showMembers}
                  showLeads={showLeads}
                  showAdmins={showAdmins}
                  showPublic={showPublic}
                  showPrivate={showPrivate}
                />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  zIndex: 15, height: scrubberHeight,
                }}>
                  <TemporalScrubber
                    minDate={minDate}
                    maxDate={maxDate}
                    currentDate={viewState.state.temporalDate}
                    playing={viewState.state.temporalPlaying}
                    speed={viewState.state.temporalSpeed}
                    onDateChange={viewState.setTemporalDate}
                    onPlayingChange={viewState.setTemporalPlaying}
                    onSpeedChange={viewState.setTemporalSpeed}
                  />
                </div>
              </>
            );
          })()}
          {dataset && viewState.state.activeView === 'treemap' && (
            <TreemapView
              dataset={dataset}
              sizeMetric={viewState.state.sizeMetric}
              focusedSpaceId={viewState.state.focusedSpaceId}
              activityPeriod={activityPeriod}
              selectedNodeId={selectedNode?.id ?? null}
              onSpaceClick={viewState.setFocusedSpace}
              onNodeSelect={(id) => {
                if (id) {
                  const node = dataset.nodes.find((n) => n.id === id);
                  if (node) handleNodeClick(node);
                } else {
                  setSelectedNode(null);
                }
              }}
              onZoomOut={() => viewState.setFocusedSpace(null)}
              width={canvasSize.width}
              height={canvasSize.height}
            />
          )}
          {dataset && viewState.state.activeView === 'sunburst' && (
            <SunburstView
              dataset={dataset}
              sizeMetric={viewState.state.sizeMetric}
              activityPeriod={activityPeriod}
              selectedNodeId={selectedNode?.id ?? null}
              onNodeSelect={(id) => {
                if (id) {
                  const node = dataset.nodes.find((n) => n.id === id);
                  if (node) handleNodeClick(node);
                } else {
                  setSelectedNode(null);
                }
              }}
              showMembers={viewState.state.showMembers}
              width={canvasSize.width}
              height={canvasSize.height}
            />
          )}
          {dataset && viewState.state.activeView === 'chord' && (
            <ChordView
              dataset={dataset}
              chordMode={viewState.state.chordMode}
              roleFilter={[EdgeType.MEMBER, EdgeType.LEAD, EdgeType.ADMIN]}
              selectedNodeId={selectedNode?.id ?? null}
              onNodeSelect={(id) => {
                if (id) {
                  const node = dataset.nodes.find((n) => n.id === id);
                  if (node) handleNodeClick(node);
                } else {
                  setSelectedNode(null);
                }
              }}
              groupLevel={viewState.state.chordGroupLevel}
              width={canvasSize.width}
              height={canvasSize.height}
            />
          )}
          {dataset && viewState.state.activeView === 'timeline' && (
            <TimelineView
              dataset={dataset}
              brushRange={viewState.state.timelineBrush}
              onBrushChange={viewState.setTimelineBrush}
              selectedNodeId={selectedNode?.id ?? null}
              onNodeSelect={(id) => {
                if (id) {
                  const node = dataset.nodes.find((n) => n.id === id);
                  if (node) handleNodeClick(node);
                } else {
                  setSelectedNode(null);
                }
              }}
              chartType={viewState.state.timelineChartType}
              width={canvasSize.width}
              height={canvasSize.height}
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
            activityPeriod={activityPeriod}
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
