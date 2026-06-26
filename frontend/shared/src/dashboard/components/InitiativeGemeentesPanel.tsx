import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { GraphDataset, GraphNode } from '@server/types/graph.js';

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
    <aside className="absolute right-4 top-4 w-64 max-w-[80%] rounded-lg border border-border bg-background/95 p-3 shadow-md">
      <header className="mb-2 flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">{initiative.displayName}</span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
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
