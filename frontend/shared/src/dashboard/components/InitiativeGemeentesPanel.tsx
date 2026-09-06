import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@ea/shared';
import type { GraphDataset, GraphNode } from '@server/types/graph.js';

/**
 * Shared geometry for the panels that float over the graph canvas.
 *
 * On a desktop they are a 16rem card pinned to the top-right corner. On a phone
 * that corner card would cover a quarter of an already-small canvas and sit under
 * the thumb's dead zone, so below `sm` the same panel becomes a bottom sheet: full
 * width, capped at 45% of the canvas height, and scrolling internally.
 *
 * Exported so GraphTab's own selected-organisation panel stays identical to this
 * one — two panels that appear in the same place must not drift apart.
 */
export const GRAPH_PANEL_CLASS = cn(
  'absolute z-20 rounded-lg border border-border bg-background/95 p-3 shadow-md',
  'inset-x-2 bottom-2 max-h-[45%] overflow-auto',
  'sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:max-h-none sm:w-64 sm:max-w-[80%] sm:overflow-visible',
);

/** The panels' close button — a real 44px target on touch, not a bare glyph. */
export const GRAPH_PANEL_CLOSE_CLASS = cn(
  '-m-1 inline-flex shrink-0 items-center justify-center rounded p-1 text-xs text-muted-foreground',
  'hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
);

interface InitiativeGemeentesPanelProps {
  initiative: GraphNode;
  dataset: GraphDataset;
  /** Select a gemeente node (mirrors the org → connected-spaces panel behaviour). */
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

/**
 * Side panel shown when an INITIATIVE node is selected: lists the gemeente
 * ORGANIZATION nodes the initiative connects to via INITIATIVE_GEMEENTE edges.
 * Analogous to the organisation → connected-spaces panel in GraphTab.
 */
export function InitiativeGemeentesPanel({
  initiative,
  dataset,
  onSelectNode,
  onClose,
}: InitiativeGemeentesPanelProps) {
  const { t } = useTranslation();

  const gemeentes = useMemo(() => {
    const byId = new Map(dataset.nodes.map((n) => [n.id, n]));
    const ids = new Set<string>();
    for (const e of dataset.edges) {
      if (e.type !== 'INITIATIVE_GEMEENTE') continue;
      if (e.sourceId === initiative.id) ids.add(e.targetId);
      else if (e.targetId === initiative.id) ids.add(e.sourceId);
    }
    return [...ids]
      .map((id) => byId.get(id))
      .filter(
        (n): n is GraphNode => !!n && n.type === 'ORGANIZATION' && n.isGemeente === true,
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [dataset, initiative.id]);

  return (
    <aside className={GRAPH_PANEL_CLASS}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">{initiative.displayName}</span>
        <button
          type="button"
          className={GRAPH_PANEL_CLOSE_CLASS}
          data-touch-target
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </header>
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {t('graph.participatingGemeentes', { defaultValue: 'Participating gemeentes' })}
      </p>
      {gemeentes.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('graph.noParticipatingGemeentes', {
            defaultValue: 'No participating gemeentes in the current selection.',
          })}
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-auto">
          {gemeentes.map((gemeente) => (
            <li key={gemeente.id}>
              <button
                type="button"
                className="w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted"
                title={gemeente.displayName}
                onClick={() => onSelectNode(gemeente.id)}
              >
                {gemeente.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
