import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGraph } from '../hooks/useGraph.js';
import { useSpaces } from '../hooks/useSpaces.js';
import { useViewState } from '../hooks/useViewState.js';
import { useTheme } from '../hooks/useTheme.js';
import { useFeatures } from '../hooks/useFeatures.js';
import { useIsCompact, useIsMobile, useIsTouch } from '../hooks/useMediaQuery.js';
import Sheet from '../components/mobile/Sheet.js';
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
import { type MapRegion, bumpImageCacheBust, clearBrokenVisuals } from '@ea/shared';
import HoverCard from '../components/graph/HoverCard.js';
import QueryOverlay from '../components/query/QueryOverlay.js';
import { Button } from '../components/ui/button.js';
import type { GraphNode } from '@server/types/graph.js';
import type { ActivityPeriod } from '@server/types/graph.js';
import { EdgeType, NodeType } from '@server/types/graph.js';
import { useEcosystemMetrics } from '../hooks/useEcosystemMetrics.js';
import { api } from '../services/api.js';
import { Sparkles, MessageCircle, AlertCircle } from 'lucide-react';
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
  const { aiQueryEnabled } = useFeatures();
  // `isCompact` (≤1023px) moves the control panel into a drawer — a fixed
  // 240px column costs a portrait tablet ~30% of its canvas. `isMobile`
  // (≤767px) additionally turns the details panel into a bottom sheet.
  // `isTouch` covers touch-first devices at any width.
  const isCompact = useIsCompact();
  const isMobile = useIsMobile();
  const isTouch = useIsTouch();

  const [showPeople, setShowPeople] = useState(true);
  const [showOrganizations, setShowOrganizations] = useState(true);
  const [showSpaces, setShowSpaces] = useState(true);
  const [showMembers, setShowMembers] = useState(true);
  const [showLeads, setShowLeads] = useState(true);
  const [showAdmins, setShowAdmins] = useState(true);
  const [showPublic, setShowPublic] = useState(true);
  const [showPrivate, setShowPrivate] = useState(true);
  const [showL1Spaces, setShowL1Spaces] = useState(true);
  const [showL2Spaces, setShowL2Spaces] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>(EMPTY_IDS);
  const [mapRegion, setMapRegion] = useState<MapRegion>('netherlands');
  const [showMap, setShowMap] = useState(false);
  const [queryOverlayOpen, setQueryOverlayOpen] = useState(false);
  const [activityPulseEnabled, setActivityPulseEnabled] = useState(false);
  const [spaceActivityEnabled, setSpaceActivityEnabled] = useState(false);
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('allTime');
  const [directConnectionsOnly, setDirectConnectionsOnly] = useState(false);
  const [nodeSizeScale, setNodeSizeScale] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [controlPanelCollapsed, setControlPanelCollapsed] = useState(false);
  /** Compact layouts only: whether the controls drawer is open. */
  const [controlsOpen, setControlsOpen] = useState(false);

  // Prefer localStorage (kept in sync by setActiveSpaceIds) over navigation state,
  // because nav state becomes stale when spaces are added/removed in Explorer.
  const SELECTION_KEY = 'alkemio_selected_spaces';
  const spaceIds = (() => {
    try {
      const saved = localStorage.getItem(SELECTION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (parsed.length > 0) return parsed;
      }
    } catch { /* fall through */ }
    return (location.state as { spaceIds?: string[] })?.spaceIds ?? null;
  })();

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

  const [activeSpaceIds, setActiveSpaceIdsRaw] = useState<string[]>(spaceIds || []);
  const setActiveSpaceIds = useCallback((ids: string[]) => {
    setActiveSpaceIdsRaw(ids);
    localStorage.setItem(SELECTION_KEY, JSON.stringify(ids));
  }, []);
  const { spaces, reload: reloadSpaces } = useSpaces();

  const availableSpaces = useMemo(
    () => spaces.filter((s) => !activeSpaceIds.includes(s.nameId)),
    [spaces, activeSpaceIds],
  );

  const ecosystemMetrics = useEcosystemMetrics(dataset ?? null, {
    showPeople,
    showOrganizations,
    showSpaces,
  });

  const handleHighlightNodes = useCallback((ids: string[]) => {
    setHighlightedNodeIds(ids);
  }, []);

  const handleSelectNode = useCallback((nodeId: string) => {
    if (!dataset) return;
    const node = dataset.nodes.find((n) => n.id === nodeId);
    if (node) setSelectedNode(node);
  }, [dataset]);

  const handleRefresh = useCallback(() => {
    // Re-fetch the space membership list (clears localStorage + bypasses the
    // server `__spaces__` cache via ?refresh=true) alongside the graph, so newly
    // joined spaces appear in the "Add Space" list.
    // A fresh load should re-attempt images that previously failed, and re-fetch
    // cached ones rather than reading stale bytes from the browser cache.
    clearBrokenVisuals();
    bumpImageCacheBust();
    reloadSpaces();
    if (activeSpaceIds.length > 0) generate(activeSpaceIds, true);
  }, [activeSpaceIds, generate, reloadSpaces]);

  const [cacheCleared, setCacheCleared] = useState(false);
  const handleClearCache = useCallback(async () => {
    try {
      await api.delete('/api/graph/cache');
      // The server cache is gone; forget client-side broken-image failures too and
      // bypass the browser image cache so the re-fetched data gets a fresh chance
      // to load its visuals.
      clearBrokenVisuals();
      bumpImageCacheBust();
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 2000);
      // Also refresh the space membership list — clearUserCache wipes the server
      // `__spaces__` entry, but the dropdown reads from localStorage and won't
      // refetch on its own.
      reloadSpaces();
      if (activeSpaceIds.length > 0) generate(activeSpaceIds, true);
    } catch {
      // Silently fail — next refresh will re-fetch anyway
    }
  }, [activeSpaceIds, generate, reloadSpaces]);

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

  const closeDetails = useCallback(() => {
    setSelectedNode(null);
    setHoveredNode(null);
  }, []);

  const handleNodeHover = useCallback((node: GraphNode | null, position?: { x: number; y: number }) => {
    // Touch devices synthesise a mouseenter on tap, which would leave a hover
    // card stranded on screen with no way to dismiss it. Tapping a node opens
    // the details sheet instead — that is the touch equivalent.
    if (isTouch) return;
    setHoveredNode(node);
    if (position) setHoverPos(position);
  }, [isTouch]);

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
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className={styles.errorText}>Failed to generate graph: {error}</p>
        <Button variant="outline" onClick={() => navigate('/spaces')}>
          Back to Space Selector
        </Button>
      </div>
    );
  }

  const lastSync = dataset?.generatedAt || null;

  // The control panel renders twice depending on viewport — as a fixed left
  // column on desktop, and inside a modal drawer on mobile. Sharing one props
  // object keeps the two in step.
  const controlPanelProps = dataset
    ? {
        dataset,
        showPeople,
        showOrganizations,
        showSpaces,
        onTogglePeople: () => setShowPeople((p) => !p),
        onToggleOrganizations: () => setShowOrganizations((p) => !p),
        onToggleSpaces: () => setShowSpaces((p) => !p),
        showMembers,
        showLeads,
        showAdmins,
        onToggleMembers: () => setShowMembers((m) => !m),
        onToggleLeads: () => setShowLeads((l) => !l),
        onToggleAdmins: () => setShowAdmins((a) => !a),
        showPublic,
        showPrivate,
        onTogglePublic: () => setShowPublic((p) => !p),
        onTogglePrivate: () => setShowPrivate((p) => !p),
        showL1Spaces,
        showL2Spaces,
        onToggleL1Spaces: () => setShowL1Spaces((p) => !p),
        onToggleL2Spaces: () => setShowL2Spaces((p) => !p),
        showMap,
        onToggleMap: () => setShowMap((m) => !m),
        mapRegion,
        onMapRegionChange: setMapRegion,
        onRemoveSpace: handleRemoveSpace,
        activityPulseEnabled,
        onToggleActivityPulse: () => setActivityPulseEnabled((p) => !p),
        hasActivityData: dataset.hasActivityData ?? false,
        spaceActivityEnabled,
        onToggleSpaceActivity: () => setSpaceActivityEnabled((p) => !p),
        activityPeriod,
        onActivityPeriodChange: setActivityPeriod,
        directConnectionsOnly,
        onToggleDirectConnections: () => setDirectConnectionsOnly((d) => !d),
        nodeSizeScale,
        onNodeSizeScaleChange: setNodeSizeScale,
        activeView: viewState.state.activeView,
        sizeMetric: viewState.state.sizeMetric,
        onSizeMetricChange: viewState.setSizeMetric,
        chordMode: viewState.state.chordMode,
        onChordModeChange: viewState.setChordMode,
        chordGroupLevel: viewState.state.chordGroupLevel,
        onChordGroupLevelChange: viewState.setChordGroupLevel,
        showMemberLeaves: viewState.state.showMembers,
        onToggleMemberLeaves: () => viewState.setShowMembers(!viewState.state.showMembers),
        timelineChartType: viewState.state.timelineChartType,
        onTimelineChartTypeChange: (type: 'stacked' | 'stream') =>
          viewState.setTimelineChartType(type),
      }
    : null;

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
        availableSpaces={availableSpaces}
        onAddSpace={handleExpandSpace}
        onAsk={aiQueryEnabled ? () => setQueryOverlayOpen(true) : undefined}
        onOpenControls={dataset ? () => setControlsOpen(true) : undefined}
      />
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
        {controlPanelProps && !isCompact && (
          <ControlPanel
            {...controlPanelProps}
            collapsed={controlPanelCollapsed}
            onToggleCollapse={() => setControlPanelCollapsed((c) => !c)}
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
              showL1Spaces={showL1Spaces}
              showL2Spaces={showL2Spaces}
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
              nodeSizeScale={nodeSizeScale}
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
                  showL1Spaces={showL1Spaces}
                  showL2Spaces={showL2Spaces}
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
        {selectedNode && dataset && !isMobile && (
          <DetailsDrawer
            node={selectedNode}
            dataset={dataset}
            onClose={closeDetails}
            onExpandSpace={handleExpandSpace}
            onNodeSelect={handleNodeClick}
            showPeople={showPeople}
            showOrganizations={showOrganizations}
            showSpaces={showSpaces}
            activityPeriod={activityPeriod}
          />
        )}
        {/* Hover previews are pointer-only — see handleNodeHover */}
        {hoveredNode && !selectedNode && dataset && !isTouch && (
          <HoverCard node={hoveredNode} dataset={dataset} x={hoverPos.x} y={hoverPos.y} />
        )}
      </div>

      {/* ─── Mobile: the two side panels become modal sheets ─── */}
      {isCompact && controlPanelProps && (
        <Sheet
          open={controlsOpen}
          onClose={() => setControlsOpen(false)}
          side="left"
          title="Filters & legend"
        >
          <div className={styles.sheetPanelBody}>
            <ControlPanel {...controlPanelProps} />
          </div>
        </Sheet>
      )}

      {isMobile && selectedNode && dataset && (
        <Sheet
          open
          onClose={closeDetails}
          side="bottom"
          title={selectedNode.displayName || 'Details'}
          hideHeader
        >
          <DetailsDrawer
            node={selectedNode}
            dataset={dataset}
            onClose={closeDetails}
            onExpandSpace={handleExpandSpace}
            onNodeSelect={handleNodeClick}
            showPeople={showPeople}
            showOrganizations={showOrganizations}
            showSpaces={showSpaces}
            activityPeriod={activityPeriod}
          />
        </Sheet>
      )}
      {dataset && (
        <MetricsBar
          metrics={dataset.metrics}
          ecosystemMetrics={ecosystemMetrics}
          onHighlightNodes={handleHighlightNodes}
          onSelectNode={handleSelectNode}
        />
      )}
      {aiQueryEnabled && (
        <QueryOverlay
          hidden={!queryOverlayOpen}
          onClose={() => setQueryOverlayOpen(false)}
          onShowOnGraph={(entityIds, spaceNameIds) => {
            // Find spaces that need to be loaded
            const missingSpaces = spaceNameIds.filter((s) => !activeSpaceIds.includes(s));
            if (missingSpaces.length > 0) {
              const updated = [...activeSpaceIds, ...missingSpaces];
              setActiveSpaceIds(updated);
              generate(updated).then(() => {
                setHighlightedNodeIds(entityIds);
                setQueryOverlayOpen(false);
              });
            } else {
              setHighlightedNodeIds(entityIds);
              setQueryOverlayOpen(false);
            }
          }}
        />
      )}
      {/* Floating actions — stacked above the metrics bar and the home indicator */}
      {aiQueryEnabled && !queryOverlayOpen && highlightedNodeIds.length > 0 && (
        <button
          className={`${styles.fab} ${styles.fabWide}`}
          onClick={() => {
            setHighlightedNodeIds(EMPTY_IDS);
            setQueryOverlayOpen(true);
          }}
        >
          <MessageCircle size={18} aria-hidden="true" />
          <span className={styles.fabLabel}>Back to conversation</span>
        </button>
      )}

      {/* Below 1024px the inline "Ask" CTA is hidden, so it becomes a FAB */}
      {aiQueryEnabled && isCompact && !queryOverlayOpen && highlightedNodeIds.length === 0 && (
        <button
          className={`${styles.fab} ${styles.fabPrimary}`}
          onClick={() => setQueryOverlayOpen(true)}
          aria-label="Ask the Ecosystem"
        >
          <Sparkles size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
