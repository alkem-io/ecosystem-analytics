import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn, proxyImageUrl, SafeImage } from '@ea/shared';
import { buildCityRows, type CityRow } from '../utils/cities.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useVngGraph } from '../hooks/useVngGraph.js';
import { useGraphProgress } from '../hooks/useGraphProgress.js';
import { InitiativeMap } from '../components/InitiativeMap.js';
import { LoadingOverlay } from '../components/LoadingOverlay.js';

interface CityDetailsTabProps {
  /** A city requested from another tab (`<app>:openCity`, FR-018/019). */
  openCityId?: string | null;
  /** Bumped on each request so re-choosing the same city re-selects it. */
  openCitySeq?: number;
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

/**
 * City information tab (feature 018, US2) — the city-side mirror of the Initiative
 * information tab: pick one gemeente and see its population, province, position on
 * the Netherlands map, and the initiatives it takes part in.
 *
 * Rows come from {@link buildCityRows} over the shared graph dataset, so the initiative
 * count here is by construction the same number the Cities table shows (FR-028). The
 * map reuses {@link InitiativeMap} unchanged, which is what preserves the constitution's
 * §VII Netherlands-only requirement.
 */
export function CityDetailsTab({ openCityId, openCitySeq }: CityDetailsTabProps = {}) {
  const { t, i18n } = useTranslation();
  const { effectiveSpaceIds, selectedSpaces, state } = useSelectionContext();
  const { dataset, loading, error } = useVngGraph(effectiveSpaceIds, {
    includeInitiatives: state.includeInitiatives,
  });

  const cities = useMemo<CityRow[]>(() => buildCityRows(dataset), [dataset]);
  const [selected, setSelected] = useState<string | null>(null);

  // Live server-side progress while the (heavy) first generation is in flight, so the
  // tab names what it is waiting on instead of looking stuck. Matches the other tabs.
  const firstLoading = loading && !dataset;
  const progress = useGraphProgress(firstLoading);
  const currentSpaceLabel = useMemo(() => {
    const nameId = progress?.currentSpace;
    if (!nameId) return null;
    return selectedSpaces.find((s) => s.nameId === nameId)?.displayName ?? nameId;
  }, [progress?.currentSpace, selectedSpaces]);

  // Cross-tab request (FR-018/019): select the requested city when asked.
  useEffect(() => {
    if (!openCityId) return;
    if (cities.some((c) => c.id === openCityId)) setSelected(openCityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCitySeq, openCityId, cities]);

  // Default to the alphabetically first city, and recover if the current one vanishes
  // because the selection changed.
  //
  // The update MUST be functional. This effect and the cross-tab one above both run in
  // the same commit on the mount triggered by an `openCity` request — the tab is only
  // mounted once that tab is active. A plain `setSelected(cities[0].id)` here would read
  // the stale `selected` (still null) and clobber the requested city with the
  // alphabetically first one; the updater form sees the value the effect above just
  // queued and leaves it alone.
  useEffect(() => {
    if (cities.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((prev) => (prev && cities.some((c) => c.id === prev) ? prev : cities[0].id));
  }, [cities]);

  const current = cities.find((c) => c.id === selected) ?? null;
  const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const unknown = <span className="text-muted-foreground">{t('cityDetailsTab.unknown')}</span>;

  const fact = (label: string, value: React.ReactNode) => (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );

  if (effectiveSpaceIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t('selection.empty')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {t('states.error')}: {error}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-8 p-6">
        {/* Picker */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            {t('cityDetailsTab.pickCity')}
          </span>
          <Select.Root value={selected ?? ''} onValueChange={setSelected}>
            <Select.Trigger
              className={cn(
                'inline-flex min-w-72 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring',
              )}
              aria-label={t('cityDetailsTab.pickCity')}
              disabled={cities.length === 0}
            >
              <Select.Value placeholder={t('cityDetailsTab.pickCity')} />
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
                  {cities.map((c) => (
                    <Select.Item
                      key={c.id}
                      value={c.id}
                      className={cn(
                        'relative flex cursor-pointer select-none items-center rounded px-7 py-1.5 text-sm outline-none',
                        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                      )}
                    >
                      <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                        <Check className="h-4 w-4" aria-hidden />
                      </Select.ItemIndicator>
                      <Select.ItemText>
                        {c.name} ({c.initiativeCount})
                      </Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        {firstLoading ? (
          <div className="relative rounded-xl border border-border bg-card p-4">
            <div className="h-72" />
            <LoadingOverlay
              progress={progress}
              currentSpace={currentSpaceLabel}
              labels={{
                loading: t('cityDetailsTab.loading'),
                transforming: t('states.graphTransforming', { defaultValue: 'Netwerk opbouwen…' }),
                acquiring: t('states.graphAcquiring', { defaultValue: 'Initiatieven ophalen' }),
                building: t('states.graphBuilding', { defaultValue: 'Netwerk' }),
                hint: t('states.loadingGraphHint', { defaultValue: 'Dit kan even duren' }),
              }}
            />
          </div>
        ) : cities.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('cityDetailsTab.noCities')}</p>
        ) : (
          current && (
            <>
              {/* Header — avatar + name */}
              <header className="flex items-center gap-4">
                <SafeImage
                  src={current.node.avatarUrl ? proxyImageUrl(current.node.avatarUrl) : null}
                  alt=""
                  entityUrl={current.node.url}
                  entityName={current.name}
                  entityType={current.node.type}
                  className="h-14 w-14 rounded-full border border-border object-cover"
                  fallback={
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {initials(current.name)}
                    </div>
                  }
                />
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {current.name}
                </h2>
              </header>

              {/* Facts — population / province / participation. Unknown is explicit (FR-005). */}
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {fact(
                  t('cityDetailsTab.population'),
                  current.population == null ? unknown : numberFormat.format(current.population),
                )}
                {fact(t('cityDetailsTab.province'), current.provinceName ?? unknown)}
                {fact(t('cityDetailsTab.initiativesTitle'), current.initiativeCount)}
              </dl>

              {/* Location — the shared Netherlands-only map, reused unchanged (§VII). */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('cityDetailsTab.mapTitle')}
                </h3>
                <div className="rounded-xl border border-border bg-card p-4">
                  <InitiativeMap gemeentes={[current.node]} />
                </div>
              </section>

              {/* The initiatives this city takes part in */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('cityDetailsTab.initiativesTitle')} ({current.initiativeCount})
                </h3>
                {current.initiatives.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('cityDetailsTab.noInitiatives')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {current.initiatives.map((i) => (
                      <li
                        key={i.id}
                        className="rounded-lg border border-border bg-card px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{i.name}</span>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                              i.kind === 'groei'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {i.kind === 'groei'
                              ? t('initiativesTab.typeGroei')
                              : t('initiativesTab.typeGd')}
                          </span>
                        </div>
                        {(i.vng2030.length > 0 || i.nds.length > 0 || i.themes.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {i.vng2030.map((v) => (
                              <span
                                key={`v-${v}`}
                                className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
                              >
                                {t(`categories.vng2030.${v}`, { defaultValue: v })}
                              </span>
                            ))}
                            {i.nds.map((v) => (
                              <span
                                key={`n-${v}`}
                                className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
                              >
                                {t(`categories.nds.${v}`, { defaultValue: v })}
                              </span>
                            ))}
                            {i.themes.map((v) => (
                              <span
                                key={`t-${v}`}
                                className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
                              >
                                {v}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )
        )}
      </div>
    </div>
  );
}
