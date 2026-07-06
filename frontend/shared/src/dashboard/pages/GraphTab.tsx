import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  ForceGraph,
  HoverCard,
  isWithinRegion,
  proxyImageUrl,
  SafeImage,
  useAppConfig,
} from '@ea/shared';
import type { GeoPermissibleObjects } from 'd3-geo';
import type { GraphDataset, GraphNode } from '@server/types/graph.js';
import { useVngGraph } from '../hooks/useVngGraph.js';
import { useGraphProgress } from '../hooks/useGraphProgress.js';
import { MapToggle } from '../components/MapToggle.js';
import { GemeenteToggle } from '../components/GemeenteToggle.js';
import { GraphMetricsBar } from '../components/GraphMetricsBar.js';
import { InitiativeGemeentesPanel } from '../components/InitiativeGemeentesPanel.js';
import { LoadingOverlay } from '../components/LoadingOverlay.js';

/**
 * Graph tab (US1/US7/US10) — the force-directed graph of the selected spaces.
 * The Netherlands basemap is optional (off by default): when the "show map"
 * toggle is on, nodes are geo-pinned onto the map; when off the graph uses a
 * free force layout.
 *
 * Selection source: GraphTab accepts an optional `spaceIds`/`includeInitiatives`
 * override (so App can pass a shared selection later), but by default it reads the
 * persisted selection from the `vng_selection` localStorage key that the shared
 * `useSelectedSpaces` hook owns. This keeps the tab decoupled from the selection
 * provider — it works whether or not App wraps a SelectionProvider — and the
 * effective set is recomputed exactly as `useSelectedSpaces` does:
 * `(hubSpaceIds ∪ directAdded) − directRemoved`.
 */

interface PersistedSelection {
  activeHubNameId?: string | null;
  hubSpaceIds?: string[];
  directAdded?: string[];
  directRemoved?: string[];
  showGemeentes?: boolean;
  includeInitiatives?: boolean;
}

interface EffectiveSelection {
  spaceIds: string[];
  includeInitiatives: boolean;
  showGemeentes: boolean;
}

function readSelection(storageKey: string): EffectiveSelection {
  const empty: EffectiveSelection = {
    spaceIds: [],
    includeInitiatives: false,
    showGemeentes: true,
  };
  if (typeof localStorage === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as PersistedSelection;
    const removed = new Set(parsed.directRemoved ?? []);
    const seen = new Set<string>();
    const spaceIds: string[] = [];
    for (const id of [...(parsed.hubSpaceIds ?? []), ...(parsed.directAdded ?? [])]) {
      if (removed.has(id) || seen.has(id)) continue;
      seen.add(id);
      spaceIds.push(id);
    }
    return {
      spaceIds,
      includeInitiatives: parsed.includeInitiatives ?? false,
      // showGemeentes defaults to true (matches useSelectedSpaces DEFAULT_STATE).
      showGemeentes: parsed.showGemeentes ?? true,
    };
  } catch {
    return empty;
  }
}

interface GraphTabProps {
  /** Optional override; when omitted the effective set is read from localStorage. */
  spaceIds?: string[];
  includeInitiatives?: boolean;
  /** When false, gemeente organisation nodes (and their edges) are hidden (T051). */
  showGemeentes?: boolean;
  /**
   * When provided, the graph renders its own "show gemeentes" toggle (this control
   * is graph-only) and calls back to update the shared selection.
   */
  onShowGemeentesChange?: (value: boolean) => void;
  /** Bumped to force a cache-bypassing reload of the graph (Refresh control). */
  refreshNonce?: number;
}

export function GraphTab({
  spaceIds: spaceIdsProp,
  includeInitiatives: initProp,
  showGemeentes: showGemeentesProp,
  onShowGemeentesChange,
  refreshNonce,
}: GraphTabProps = {}) {
  const { t } = useTranslation();
  const { storagePrefix, eventPrefix } = useAppConfig();
  const storageKey = `${storagePrefix}_selection`;
  const selectionEvent = `${eventPrefix}:selection`;
  const openSpaceEvent = `${eventPrefix}:openSpace`;

  // GraphTab is "controlled" when App passes the shared selection via props.
  const controlled = spaceIdsProp != null;

  // ── Selection (prop override, else persisted `<app>_selection`) ────────────
  const [selection, setSelection] = useState<EffectiveSelection>(() =>
    controlled
      ? {
          spaceIds: spaceIdsProp ?? [],
          includeInitiatives: initProp ?? false,
          showGemeentes: showGemeentesProp ?? true,
        }
      : readSelection(storageKey),
  );

  useEffect(() => {
    if (controlled) {
      setSelection({
        spaceIds: spaceIdsProp ?? [],
        includeInitiatives: initProp ?? false,
        showGemeentes: showGemeentesProp ?? true,
      });
    }
  }, [controlled, spaceIdsProp, initProp, showGemeentesProp]);

  // Refresh from storage on cross-tab writes, focus, and a same-tab custom event
  // that other selection controls may dispatch.
  useEffect(() => {
    if (controlled) return; // controlled by props
    const refresh = () => setSelection(readSelection(storageKey));
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    window.addEventListener(selectionEvent, refresh as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(selectionEvent, refresh as EventListener);
    };
  }, [controlled, storageKey, selectionEvent]);

  const spaceIds = selection.spaceIds;
  const includeInitiatives = selection.includeInitiatives;
  const showGemeentes = selection.showGemeentes;

  const { dataset: rawDataset, loading, error, warnings } = useVngGraph(spaceIds, {
    includeInitiatives,
    refreshNonce,
  });
  const progress = useGraphProgress(loading);
  const [offMapMinimized, setOffMapMinimized] = useState(false);

  // ── T051 — hide gemeente organisation nodes (and any edges touching them) ──
  // when the "show gemeentes" toggle is off. Filtering client-side keeps the
  // server response cacheable regardless of the toggle. No dangling edges: an
  // edge is dropped if either endpoint was removed.
  const dataset = useMemo<GraphDataset | null>(() => {
    if (!rawDataset) return null;
    if (showGemeentes) return rawDataset;
    const hiddenIds = new Set(
      rawDataset.nodes
        .filter((n) => n.type === 'ORGANIZATION' && n.isGemeente === true)
        .map((n) => n.id),
    );
    if (hiddenIds.size === 0) return rawDataset;
    const nodes = rawDataset.nodes.filter((n) => !hiddenIds.has(n.id));
    const edges = rawDataset.edges.filter(
      (e) => !hiddenIds.has(e.sourceId) && !hiddenIds.has(e.targetId),
    );
    return { ...rawDataset, nodes, edges };
  }, [rawDataset, showGemeentes]);

  // ── Interaction state ──────────────────────────────────────────────────────
  // Map is OPTIONAL and OFF BY DEFAULT (internal GraphTab state). When on,
  // ForceGraph renders its OWN projected Netherlands basemap — we must NOT also
  // render a separate static MapOverlay (that produced the misaligned "two maps").
  const [showMap, setShowMap] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ node: GraphNode; x: number; y: number } | null>(null);

  // Netherlands region boundary — fetched once, used to decide which nodes can't
  // be pinned on the map (off-map notice at the bottom of the graph area).
  const [regionGeo, setRegionGeo] = useState<GeoPermissibleObjects | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/maps/netherlands.geojson')
      .then((res) => (res.ok ? res.json() : null))
      .then((geo) => {
        if (!cancelled && geo) setRegionGeo(geo as GeoPermissibleObjects);
      })
      .catch(() => {
        /* off-map notice simply stays empty if the boundary can't be loaded */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nodes that can't be placed on the map: no valid lat/lng, or outside the NL
  // region. Computed from the gemeente-filtered dataset and GROUPED by type so the
  // box reads "Users …", then "Organisations …", then "Spaces …".
  const offMapGroups = useMemo(() => {
    // Order: Users, Organisations, then Spaces split by level (L0, L1, L2).
    const byType: Record<string, { key: string; titleKey: string; nodes: GraphNode[] }> = {
      USER: { key: 'users', titleKey: 'graph.offMapUsers', nodes: [] },
      ORGANIZATION: { key: 'organisations', titleKey: 'graph.offMapOrganisations', nodes: [] },
      SPACE_L0: { key: 'spacesL0', titleKey: 'graph.offMapSpacesL0', nodes: [] },
      SPACE_L1: { key: 'spacesL1', titleKey: 'graph.offMapSpacesL1', nodes: [] },
      SPACE_L2: { key: 'spacesL2', titleKey: 'graph.offMapSpacesL2', nodes: [] },
      OTHER: { key: 'other', titleKey: 'graph.offMapOther', nodes: [] },
    };
    const order = ['USER', 'ORGANIZATION', 'SPACE_L0', 'SPACE_L1', 'SPACE_L2', 'OTHER'];
    let total = 0;
    if (dataset) {
      for (const n of dataset.nodes) {
        const { latitude, longitude } = n.location ?? { latitude: null, longitude: null };
        const offMap =
          latitude == null || longitude == null
            ? true
            : regionGeo
              ? !isWithinRegion(regionGeo, longitude, latitude)
              : false;
        if (!offMap) continue;
        total += 1;
        (byType[n.type] ?? byType.OTHER).nodes.push(n);
      }
    }
    const groups = order
      .map((k) => byType[k])
      .filter((g) => g.nodes.length > 0)
      .map((g) => ({ ...g, nodes: [...g.nodes].sort((a, b) => a.displayName.localeCompare(b.displayName)) }));
    return { groups, total };
  }, [dataset, regionGeo]);

  const selectedNode = useMemo(
    () => dataset?.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [dataset, selectedNodeId],
  );

  // US7 — spaces an organisation connects to within the current graph.
  const connectedSpaces = useMemo(() => {
    if (!dataset || !selectedNode || selectedNode.type !== 'ORGANIZATION') return [];
    const spaceTypes = new Set(['SPACE_L0', 'SPACE_L1', 'SPACE_L2']);
    const byId = new Map(dataset.nodes.map((n) => [n.id, n]));
    const neighbourIds = new Set<string>();
    for (const e of dataset.edges) {
      if (e.sourceId === selectedNode.id) neighbourIds.add(e.targetId);
      else if (e.targetId === selectedNode.id) neighbourIds.add(e.sourceId);
    }
    return [...neighbourIds]
      .map((id) => byId.get(id))
      .filter((n): n is GraphNode => !!n && spaceTypes.has(n.type));
  }, [dataset, selectedNode]);

  // Gemeente organisation nodes a selected INITIATIVE connects to via
  // INITIATIVE_GEMEENTE edges (mirrors the org → connected-spaces relationship).
  const participatingGemeentes = useMemo(() => {
    if (!dataset || !selectedNode || selectedNode.type !== 'INITIATIVE') return [];
    const byId = new Map(dataset.nodes.map((n) => [n.id, n]));
    const ids = new Set<string>();
    for (const e of dataset.edges) {
      if (e.type !== 'INITIATIVE_GEMEENTE') continue;
      if (e.sourceId === selectedNode.id) ids.add(e.targetId);
      else if (e.targetId === selectedNode.id) ids.add(e.sourceId);
    }
    return [...ids]
      .map((id) => byId.get(id))
      .filter((n): n is GraphNode => !!n && n.type === 'ORGANIZATION' && n.isGemeente === true);
  }, [dataset, selectedNode]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
    // Bridge to the Space details tab (US4 scenario 2): a space click broadcasts
    // the space's nameId — the key the effective set / details picker matches on
    // (graph node ids are Alkemio UUIDs). The shell may listen and switch tabs;
    // non-fatal if nobody listens.
    if (node.type === 'SPACE_L0' || node.type === 'SPACE_L1' || node.type === 'SPACE_L2') {
      window.dispatchEvent(
        new CustomEvent(openSpaceEvent, { detail: { spaceId: node.nameId ?? node.id } }),
      );
    }
  }, [openSpaceEvent]);

  const handleNodeHover = useCallback(
    (node: GraphNode | null, position?: { x: number; y: number }) => {
      if (node && position) setHover({ node, x: position.x, y: position.y });
      else setHover(null);
    },
    [],
  );

  // Highlight the connected spaces (org selected) or participating gemeentes
  // (initiative selected).
  const highlightedNodeIds = useMemo(
    () => [...connectedSpaces.map((s) => s.id), ...participatingGemeentes.map((g) => g.id)],
    [connectedSpaces, participatingGemeentes],
  );

  // ── States ──────────────────────────────────────────────────────────────────
  const isEmpty = !loading && !error && spaceIds.length === 0;
  const hasNoNodes = !loading && !error && dataset != null && dataset.nodes.length === 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {warnings.length > 0 && (
        <div className="border-b border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-800">
          {warnings.join(' · ')}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Floating graph controls (top-left), overlaid on the canvas. The
            "show gemeentes" toggle is graph-only, so it lives here rather than in
            the shared selection panel. */}
        <div className="absolute left-4 top-4 z-10 flex flex-col gap-2 rounded-md border border-border bg-background/95 px-3 py-1.5 shadow-sm">
          <MapToggle checked={showMap} onChange={setShowMap} />
          {onShowGemeentesChange && (
            <GemeenteToggle checked={showGemeentes} onChange={onShowGemeentesChange} />
          )}
        </div>

        {/* Force-directed graph — ForceGraph draws its own projected NL basemap when
            showMap is on (no separate overlay), free force layout when off. */}
        {dataset && !loading && (
          <ForceGraph
            dataset={dataset}
            showPeople={false}
            showOrganizations
            showSpaces
            searchQuery=""
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            selectedNodeId={selectedNodeId}
            highlightedNodeIds={highlightedNodeIds}
            showMap={showMap}
            mapRegion="netherlands"
          />
        )}

        {/* Loading overlay — spinner, current-space name, and a live progress bar. */}
        {loading && (
          <LoadingOverlay
            progress={progress}
            currentSpace={progress?.currentSpace ?? null}
            labels={{
              loading: t('states.loadingGraph', { defaultValue: 'Initiatieven laden…' }),
              transforming: t('states.graphTransforming', { defaultValue: 'Netwerk opbouwen…' }),
              acquiring: t('states.graphAcquiring', { defaultValue: 'Initiatieven ophalen' }),
              building: t('states.graphBuilding', { defaultValue: 'Netwerk' }),
              hint: t('states.loadingGraphHint', { defaultValue: 'Dit kan even duren' }),
            }}
          />
        )}

        {/* Empty / error overlay */}
        {!loading && (isEmpty || hasNoNodes || error) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-md bg-background/80 px-4 py-2 text-sm text-muted-foreground shadow-sm">
              {error ? `${t('states.error')}: ${error}` : t('states.emptyGraph')}
            </span>
          </div>
        )}

        {/* Hover card */}
        {hover && dataset && (
          <HoverCard node={hover.node} dataset={dataset} x={hover.x} y={hover.y} />
        )}

        {/* US7 — organisation → connected spaces panel */}
        {selectedNode && selectedNode.type === 'ORGANIZATION' && (
          <aside className="absolute right-4 top-4 w-64 max-w-[80%] rounded-lg border border-border bg-background/95 p-3 shadow-md">
            <header className="mb-2 flex items-start justify-between gap-2">
              <span className="text-sm font-semibold">{selectedNode.displayName}</span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedNodeId(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </header>
            {connectedSpaces.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No connected spaces in the current selection.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-auto">
                {connectedSpaces.map((space) => (
                  <li key={space.id}>
                    <button
                      type="button"
                      className="w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      title={space.displayName}
                      onClick={() => {
                        setSelectedNodeId(space.id);
                        window.dispatchEvent(
                          new CustomEvent(openSpaceEvent, {
                            detail: { spaceId: space.nameId ?? space.id },
                          }),
                        );
                      }}
                    >
                      {space.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        {/* Initiative → participating gemeentes panel */}
        {selectedNode && selectedNode.type === 'INITIATIVE' && dataset && (
          <InitiativeGemeentesPanel
            initiative={selectedNode}
            dataset={dataset}
            onSelectNode={(id) => setSelectedNodeId(id)}
            onClose={() => setSelectedNodeId(null)}
          />
        )}

        {/* Off-map notice — only when the map is shown and some nodes can't be
            placed on it (no valid location or outside the Netherlands region). */}
        {showMap && offMapGroups.total > 0 && (
          <div className="absolute inset-x-4 bottom-4 z-10 rounded-md border border-border bg-background/95 p-3 shadow-md">
            <button
              type="button"
              onClick={() => setOffMapMinimized((v) => !v)}
              className="flex w-full items-center gap-1 text-xs font-semibold text-foreground"
              aria-expanded={!offMapMinimized}
            >
              {offMapMinimized ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              {t('graph.offMapTitle', { count: offMapGroups.total })}
            </button>
            {!offMapMinimized && (
            <div className="mt-1 max-h-40 space-y-2 overflow-auto">
              {offMapGroups.groups.map((group) => (
                <div key={group.key}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(group.titleKey, { count: group.nodes.length })}
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {group.nodes.map((node) => {
                      const avatar = node.avatarUrl ? proxyImageUrl(node.avatarUrl) : null;
                      return (
                        <li
                          key={node.id}
                          className="flex items-center gap-1.5 pl-2 text-xs text-muted-foreground"
                          title={node.displayName}
                        >
                          <SafeImage
                            src={avatar}
                            alt=""
                            entityUrl={node.url}
                            entityName={node.displayName}
                            entityType={node.type}
                            className="h-4 w-4 shrink-0 rounded-full border border-border object-cover"
                            fallback={
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-muted-foreground">
                                {(node.displayName || '?').charAt(0).toUpperCase()}
                              </span>
                            }
                          />
                          <span className="truncate">{node.displayName || t('graph.offMapNode')}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom metrics bar */}
      {dataset && dataset.nodes.length > 0 && <GraphMetricsBar dataset={dataset} />}
    </div>
  );
}
