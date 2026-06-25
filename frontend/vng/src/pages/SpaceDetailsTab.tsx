import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn, proxyImageUrl, SafeImage } from '@ea/shared';
import type { GraphNode } from '@server/types/graph.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useVngGraph } from '../hooks/useVngGraph.js';
import { InitiativeMap } from '../components/InitiativeMap.js';

const SPACE_TYPES = new Set(['SPACE_L0', 'SPACE_L1', 'SPACE_L2']);

interface SpaceDetailsTabProps {
  /** A space requested from a graph node click (`vng:openSpace`, T042). */
  openSpaceId?: string | null;
  /** Bumped on each request so re-clicking the same space re-selects it. */
  openSpaceSeq?: number;
}

/** Two-letter fallback initials for a gemeente avatar. */
function initials(name: string): string {
  return name
    .replace(/^gemeente\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Initiative information tab (US4) — tagline → city map → gemeente avatar grid. */
export function SpaceDetailsTab({ openSpaceId, openSpaceSeq }: SpaceDetailsTabProps = {}) {
  const { t } = useTranslation();
  const { selectedSpaces, effectiveSpaceIds, state } = useSelectionContext();
  const [selected, setSelected] = useState<string | null>(null);

  const { dataset, loading: graphLoading } = useVngGraph(effectiveSpaceIds, {
    includeInitiatives: state.includeInitiatives,
  });

  useEffect(() => {
    if (!openSpaceId) return;
    if (selectedSpaces.some((s) => s.nameId === openSpaceId)) setSelected(openSpaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSpaceSeq, openSpaceId, selectedSpaces]);

  useEffect(() => {
    if (selectedSpaces.length === 0) {
      if (selected !== null) setSelected(null);
      return;
    }
    if (!selected || !selectedSpaces.some((s) => s.nameId === selected)) {
      setSelected(selectedSpaces[0].nameId);
    }
  }, [selectedSpaces, selected]);

  // The selected initiative's graph node + its tagline.
  const initiativeNode = useMemo<GraphNode | null>(() => {
    if (!dataset || !selected) return null;
    return dataset.nodes.find((n) => SPACE_TYPES.has(n.type) && n.nameId === selected) ?? null;
  }, [dataset, selected]);

  // Gemeente ORGANIZATION nodes connected (via ANY edge) to the initiative.
  const gemeentes = useMemo<GraphNode[]>(() => {
    if (!dataset || !initiativeNode) return [];
    const neighbours = new Set<string>();
    for (const e of dataset.edges) {
      if (e.sourceId === initiativeNode.id) neighbours.add(e.targetId);
      else if (e.targetId === initiativeNode.id) neighbours.add(e.sourceId);
    }
    return dataset.nodes
      .filter((n) => n.type === 'ORGANIZATION' && n.isGemeente === true && neighbours.has(n.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [dataset, initiativeNode]);

  // Per-initiative count of connected gemeentes (for the "(N)" in the picker).
  const gemeenteCountByNameId = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>();
    if (!dataset) return m;
    const gemeenteIds = new Set(
      dataset.nodes.filter((n) => n.type === 'ORGANIZATION' && n.isGemeente === true).map((n) => n.id),
    );
    const bySpaceNode = new Map<string, Set<string>>();
    const add = (k: string, v: string) => {
      let s = bySpaceNode.get(k);
      if (!s) bySpaceNode.set(k, (s = new Set()));
      s.add(v);
    };
    for (const e of dataset.edges) {
      if (gemeenteIds.has(e.sourceId)) add(e.targetId, e.sourceId);
      if (gemeenteIds.has(e.targetId)) add(e.sourceId, e.targetId);
    }
    for (const n of dataset.nodes) {
      if (SPACE_TYPES.has(n.type) && n.nameId) m.set(n.nameId, bySpaceNode.get(n.id)?.size ?? 0);
    }
    return m;
  }, [dataset]);

  // Collapsible "participating gemeentes" section.
  const [gemeentesCollapsed, setGemeentesCollapsed] = useState(false);

  if (selectedSpaces.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t('selection.empty')}
      </div>
    );
  }

  const current = selectedSpaces.find((s) => s.nameId === selected) ?? null;
  const tagline = initiativeNode?.tagline ?? null;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-8 p-6">
        {/* Picker */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">{t('details.pickSpace')}</span>
          <Select.Root value={selected ?? undefined} onValueChange={setSelected}>
            <Select.Trigger
              className={cn(
                'inline-flex min-w-72 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground',
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
                      <Select.ItemText>
                        {space.displayName} ({gemeenteCountByNameId.get(space.nameId) ?? 0})
                      </Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        {current && (
          <>
            {/* Header + tagline */}
            <header>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {current.displayName}
              </h2>
              {tagline && <p className="mt-2 max-w-3xl text-base text-muted-foreground">{tagline}</p>}
            </header>

            {/* Map of participating gemeentes */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{t('details.mapTitle')}</h3>
              <div className="rounded-xl border border-border bg-card p-4">
                {graphLoading && !dataset ? (
                  <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                    {t('details.loading')}
                  </div>
                ) : (
                  <InitiativeMap gemeentes={gemeentes} />
                )}
              </div>
            </section>

            {/* Avatar-card grid of gemeentes (~10 per row) — collapsible */}
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setGemeentesCollapsed((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
                aria-expanded={!gemeentesCollapsed}
              >
                {gemeentesCollapsed ? (
                  <ChevronRight className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                )}
                {t('details.gemeentesTitle')} ({gemeentes.length})
              </button>
              {gemeentesCollapsed ? null : gemeentes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('details.noGemeentes')}</p>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-[repeat(10,minmax(0,1fr))]">
                  {gemeentes.map((g) => {
                    const avatar = g.avatarUrl ? proxyImageUrl(g.avatarUrl) : null;
                    return (
                      <div
                        key={g.id}
                        className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-2 text-center"
                        title={g.displayName}
                      >
                        <SafeImage
                          src={avatar}
                          alt=""
                          entityUrl={g.url}
                          entityName={g.displayName}
                          entityType={g.type}
                          className="h-12 w-12 rounded-full border border-border object-cover"
                          fallback={
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                              {initials(g.displayName)}
                            </div>
                          }
                        />
                        <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">
                          {g.displayName.replace(/^gemeente\s+/i, '')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
