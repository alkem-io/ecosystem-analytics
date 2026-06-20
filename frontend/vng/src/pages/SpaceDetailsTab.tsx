import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@ea/shared';
import type { GraphNode } from '@server/types/graph.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useVngGraph } from '../hooks/useVngGraph.js';

const SPACE_TYPES = new Set(['SPACE_L0', 'SPACE_L1', 'SPACE_L2']);

/**
 * Space details tab (US4). Provides a dedicated picker to choose any space from
 * the effective set (FR-018). Detailed rendering is a simple placeholder card for
 * now — the shared DetailsDrawer is owned by another agent — wired to the fields
 * available from the selection state, degrading gracefully (FR-019).
 */
interface SpaceDetailsTabProps {
  /**
   * A space requested from elsewhere (a graph node click → `vng:openSpace`, T042).
   * The id is the graph node id, which for VNG spaces is the space nameId/slug; we
   * match it against the effective set's nameId. Ignored if it isn't in the set.
   */
  openSpaceId?: string | null;
  /** Bumped on each request so re-clicking the same space re-selects it. */
  openSpaceSeq?: number;
}

export function SpaceDetailsTab({ openSpaceId, openSpaceSeq }: SpaceDetailsTabProps = {}) {
  const { t } = useTranslation();
  const { selectedSpaces, effectiveSpaceIds, state } = useSelectionContext();
  const [selected, setSelected] = useState<string | null>(null);

  // Graph data for the effective set — used to resolve the gemeentes connected to
  // the selected initiative (the user reported the cities were never shown).
  const { dataset, loading: graphLoading } = useVngGraph(effectiveSpaceIds, {
    includeInitiatives: state.includeInitiatives,
  });

  // T042 — honour an externally requested space (from a graph node click). Runs
  // whenever a new request arrives (tracked by openSpaceSeq) and the requested
  // space is part of the effective set.
  useEffect(() => {
    if (!openSpaceId) return;
    if (selectedSpaces.some((s) => s.nameId === openSpaceId)) {
      setSelected(openSpaceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSpaceSeq, openSpaceId, selectedSpaces]);

  // Keep a valid selection as the effective set changes.
  useEffect(() => {
    if (selectedSpaces.length === 0) {
      if (selected !== null) setSelected(null);
      return;
    }
    if (!selected || !selectedSpaces.some((s) => s.nameId === selected)) {
      setSelected(selectedSpaces[0].nameId);
    }
  }, [selectedSpaces, selected]);

  // Gemeente ORGANIZATION nodes connected (via ANY edge) to the selected
  // initiative's graph node (the space node whose nameId matches the picked one).
  const connectedGemeentes = useMemo<GraphNode[]>(() => {
    if (!dataset || !selected) return [];
    const initiativeNode = dataset.nodes.find(
      (n) => SPACE_TYPES.has(n.type) && n.nameId === selected,
    );
    if (!initiativeNode) return [];
    const neighbourIds = new Set<string>();
    for (const e of dataset.edges) {
      if (e.sourceId === initiativeNode.id) neighbourIds.add(e.targetId);
      else if (e.targetId === initiativeNode.id) neighbourIds.add(e.sourceId);
    }
    return dataset.nodes
      .filter(
        (n) =>
          n.type === 'ORGANIZATION' && n.isGemeente === true && neighbourIds.has(n.id),
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [dataset, selected]);

  if (selectedSpaces.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t('selection.empty')}
      </div>
    );
  }

  const current = selectedSpaces.find((s) => s.nameId === selected) ?? null;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-6 flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t('details.pickSpace')}</span>
        <Select.Root value={selected ?? undefined} onValueChange={setSelected}>
          <Select.Trigger
            className={cn(
              'inline-flex min-w-64 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring',
            )}
            aria-label={t('details.pickSpace')}
          >
            <Select.Value placeholder={t('details.pickSpace')} />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              position="popper"
              sideOffset={4}
              className="z-50 max-h-72 overflow-hidden rounded-md border border-border bg-card text-foreground shadow-md"
            >
              <Select.Viewport className="p-1">
                {selectedSpaces.map((space) => (
                  <Select.Item
                    key={space.nameId}
                    value={space.nameId}
                    className={cn(
                      'relative flex cursor-pointer select-none items-center rounded px-7 py-1.5 text-sm outline-none',
                      'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                    )}
                  >
                    <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                      <Check className="h-4 w-4" aria-hidden />
                    </Select.ItemIndicator>
                    <Select.ItemText>{space.displayName}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      {current && (
        <div className="max-w-2xl rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">{current.displayName}</h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t('details.nameId')}</dt>
            <dd className="text-foreground">{current.nameId}</dd>
            <dt className="text-muted-foreground">{t('details.origin')}</dt>
            <dd className="text-foreground">
              {current.origin === 'hub' ? t('selection.fromHub') : t('selection.added')}
            </dd>
          </dl>

          <section className="mt-6 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">
              {t('details.connectedGemeentes')}
            </h3>
            {graphLoading && !dataset ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('details.loading')}</p>
            ) : connectedGemeentes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('details.noGemeentes')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {connectedGemeentes.map((gemeente) => {
                  const city = gemeente.location?.city ?? null;
                  const country = gemeente.location?.country ?? null;
                  const place = [city, country].filter(Boolean).join(', ');
                  return (
                    <li
                      key={gemeente.id}
                      className="rounded-md border border-border bg-background px-3 py-2"
                    >
                      <div className="text-sm font-medium text-foreground">
                        {gemeente.displayName}
                      </div>
                      {place && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t('details.city')}: {place}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
