import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ForceGraph, HoverCard, MapOverlay } from '@ea/shared';
import type { GraphNode } from '@server/types/graph.js';
import { useVngGraph } from '../hooks/useVngGraph.js';

/**
 * Graph tab (US1/US7/US10) — the force-directed network of the selected spaces
 * laid out over a map of the Netherlands.
 *
 * Selection source: GraphTab accepts an optional `spaceIds`/`includeInitiatives`
 * override (so App can pass a shared selection later), but by default it reads the
 * persisted selection from the `vng_selection` localStorage key that the shared
 * `useSelectedSpaces` hook owns. This keeps the tab decoupled from the selection
 * provider — it works whether or not App wraps a SelectionProvider — and the
 * effective set is recomputed exactly as `useSelectedSpaces` does:
 * `(hubSpaceIds ∪ directAdded) − directRemoved`.
 */

const SELECTION_STORAGE_KEY = 'vng_selection';

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
}

function readSelection(): EffectiveSelection {
  if (typeof localStorage === 'undefined') return { spaceIds: [], includeInitiatives: false };
  try {
    const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return { spaceIds: [], includeInitiatives: false };
    const parsed = JSON.parse(raw) as PersistedSelection;
    const removed = new Set(parsed.directRemoved ?? []);
    const seen = new Set<string>();
    const spaceIds: string[] = [];
    for (const id of [...(parsed.hubSpaceIds ?? []), ...(parsed.directAdded ?? [])]) {
      if (removed.has(id) || seen.has(id)) continue;
      seen.add(id);
      spaceIds.push(id);
    }
    return { spaceIds, includeInitiatives: parsed.includeInitiatives ?? false };
  } catch {
    return { spaceIds: [], includeInitiatives: false };
  }
}

interface GraphTabProps {
  /** Optional override; when omitted the effective set is read from localStorage. */
  spaceIds?: string[];
  includeInitiatives?: boolean;
}

export function GraphTab({ spaceIds: spaceIdsProp, includeInitiatives: initProp }: GraphTabProps = {}) {
  const { t } = useTranslation();

  // ── Selection (prop override, else persisted `vng_selection`) ──────────────
  const [selection, setSelection] = useState<EffectiveSelection>(() =>
    spaceIdsProp
      ? { spaceIds: spaceIdsProp, includeInitiatives: initProp ?? false }
      : readSelection(),
  );

  useEffect(() => {
    if (spaceIdsProp) {
      setSelection({ spaceIds: spaceIdsProp, includeInitiatives: initProp ?? false });
    }
  }, [spaceIdsProp, initProp]);

  // Refresh from storage on cross-tab writes, focus, and a same-tab custom event
  // that other selection controls may dispatch.
  useEffect(() => {
    if (spaceIdsProp) return; // controlled by props
    const refresh = () => setSelection(readSelection());
    const onStorage = (e: StorageEvent) => {
      if (e.key === SELECTION_STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    window.addEventListener('vng:selection', refresh as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('vng:selection', refresh as EventListener);
    };
  }, [spaceIdsProp]);

  const spaceIds = selection.spaceIds;
  const includeInitiatives = selection.includeInitiatives;

  const { dataset, loading, error, warnings } = useVngGraph(spaceIds, { includeInitiatives });

  // ── Container measurement for the SVG / map projection ─────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Interaction state ──────────────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ node: GraphNode; x: number; y: number } | null>(null);

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

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
    // Bridge to the Space details tab (US4 scenario 2): a space click broadcasts
    // its id; the shell may listen and switch tabs. Non-fatal if nobody listens.
    if (node.type === 'SPACE_L0' || node.type === 'SPACE_L1' || node.type === 'SPACE_L2') {
      window.dispatchEvent(new CustomEvent('vng:openSpace', { detail: { spaceId: node.id } }));
    }
  }, []);

  const handleNodeHover = useCallback(
    (node: GraphNode | null, position?: { x: number; y: number }) => {
      if (node && position) setHover({ node, x: position.x, y: position.y });
      else setHover(null);
    },
    [],
  );

  // US7 — highlight the connected spaces when an organisation is selected.
  const highlightedNodeIds = useMemo(() => connectedSpaces.map((s) => s.id), [connectedSpaces]);

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

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {/* Netherlands basemap underlay */}
        {size.width > 0 && size.height > 0 && (
          <MapOverlay region="netherlands" width={size.width} height={size.height} visible />
        )}

        {/* Force-directed network */}
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
            showMap
            mapRegion="netherlands"
          />
        )}

        {/* Loading / empty / error overlays */}
        {(loading || isEmpty || hasNoNodes || error) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-md bg-background/80 px-4 py-2 text-sm text-muted-foreground shadow-sm">
              {error
                ? `${t('states.error')}: ${error}`
                : loading
                  ? t('states.loading')
                  : t('states.emptyGraph')}
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
                          new CustomEvent('vng:openSpace', { detail: { spaceId: space.id } }),
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
      </div>
    </div>
  );
}
