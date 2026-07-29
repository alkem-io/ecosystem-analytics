import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import {
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useAppConfig,
} from '@ea/shared';
import { buildCityRows, type CityRow } from '../utils/cities.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useVngGraph } from '../hooks/useVngGraph.js';
import { useGraphProgress } from '../hooks/useGraphProgress.js';

const ALL = '__all__';

type SortKey =
  | 'name'
  | 'province'
  | 'population'
  | 'initiatives'
  | 'groei'
  | 'gd'
  | 'vng2030'
  | 'nds'
  | 'themes';
type SortDir = 'asc' | 'desc';

/** Text columns default to A→Z; numeric columns default to high→low. */
const TEXT_KEYS = new Set<SortKey>(['name', 'province', 'vng2030', 'nds', 'themes']);

/**
 * Cities tab (feature 018, US1) — the city-first counterpart of the Initiatives tab.
 * One row per gemeente, with the number of initiatives it takes part in, its province
 * and population, and the classification profile of those initiatives.
 *
 * Built entirely from the shared graph dataset via {@link buildCityRows} — the same
 * dataset the other tabs already fetch, so opening this tab costs no extra request and
 * its counts are the transpose of the Initiatives tab's gemeente column (FR-028).
 */
export function CitiesTab() {
  const { t, i18n } = useTranslation();
  const cfg = useAppConfig();
  const { effectiveSpaceIds, selectedSpaces, state, refreshNonce } = useSelectionContext();

  // Choosing a city opens its profile on the City information tab (FR-018).
  const openCity = (cityId: string) =>
    window.dispatchEvent(new CustomEvent(`${cfg.eventPrefix}:openCity`, { detail: { cityId } }));
  const { dataset, loading, error } = useVngGraph(effectiveSpaceIds, {
    includeInitiatives: state.includeInitiatives,
    refreshNonce,
  });

  // Name the space currently being fetched (mirrors the other tabs' loading feedback).
  const progress = useGraphProgress(loading && !dataset);
  const currentSpaceLabel = (() => {
    const nameId = progress?.currentSpace;
    if (!nameId) return null;
    return selectedSpaces.find((s) => s.nameId === nameId)?.displayName ?? nameId;
  })();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<SortKey>('initiatives');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const allRows = useMemo<CityRow[]>(() => buildCityRows(dataset), [dataset]);

  const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  // Distinct values per categorical column, for the dropdown filters above the table.
  const distinct = (pick: (r: CityRow) => string[]): string[] => {
    const set = new Set<string>();
    for (const r of allRows) for (const v of pick(r)) set.add(v);
    return [...set].sort((a, b) => a.localeCompare(b));
  };

  // Filter definitions — each renders a dropdown, narrows the rows, and carries a
  // per-option count. Only filters with options render.
  const filterDefs = useMemo(() => {
    const defs = [
      {
        key: 'province',
        labelKey: 'citiesTab.filterProvince',
        options: distinct((r) => (r.provinceName ? [r.provinceName] : [])).map((v) => ({
          value: v,
          label: v,
        })),
        matches: (r: CityRow, v: string) => r.provinceName === v,
      },
      {
        key: 'vng2030',
        labelKey: 'citiesTab.filterVng2030',
        options: distinct((r) => r.vng2030).map((v) => ({
          value: v,
          label: t(`categories.vng2030.${v}`, { defaultValue: v }),
        })),
        matches: (r: CityRow, v: string) => r.vng2030.includes(v),
      },
      {
        key: 'nds',
        labelKey: 'citiesTab.filterNds',
        options: distinct((r) => r.nds).map((v) => ({
          value: v,
          label: t(`categories.nds.${v}`, { defaultValue: v }),
        })),
        matches: (r: CityRow, v: string) => r.nds.includes(v),
      },
      {
        key: 'theme',
        labelKey: 'citiesTab.filterTheme',
        options: distinct((r) => r.themes).map((v) => ({ value: v, label: v })),
        matches: (r: CityRow, v: string) => r.themes.includes(v),
      },
    ];
    return defs.map((f) => ({
      ...f,
      options: f.options.map((o) => ({
        ...o,
        count: allRows.reduce((n, r) => n + (f.matches(r, o.value) ? 1 : 0), 0),
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, t]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = filterDefs.filter((f) => filters[f.key] && filters[f.key] !== ALL);
    const filtered = allRows.filter((r) => {
      for (const f of active) if (!f.matches(r, filters[f.key])) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q);
    });
    // Per-column sort value. `null` means "not applicable / unknown" and always sinks
    // to the bottom, whichever direction is active.
    const value = (r: CityRow): string | number | null => {
      switch (sortKey) {
        case 'province':
          return r.provinceName;
        case 'population':
          return r.population;
        case 'initiatives':
          return r.initiativeCount;
        case 'groei':
          return r.groeiCount;
        case 'gd':
          return r.gdCount;
        case 'vng2030':
          return r.vng2030.join(', ');
        case 'nds':
          return r.nds.join(', ');
        case 'themes':
          return r.themes.join(', ');
        default:
          return r.name;
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: CityRow, b: CityRow) => {
      const av = value(a);
      const bv = value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // unknown/non-applicable always last
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    };
    return [...filtered].sort(cmp);
  }, [allRows, filterDefs, filters, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(TEXT_KEYS.has(key) ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (column !== sortKey) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
    );
  };

  const headerBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={cn(
        'inline-flex items-center gap-1 text-left font-semibold text-foreground',
        'hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
      aria-label={label}
    >
      {label}
      <SortIcon column={key} />
    </button>
  );

  const groupTh =
    'border-l border-border px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

  const chips = (values: string[], labelFor?: (v: string) => string) =>
    values.length === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
          >
            {labelFor ? labelFor(v) : v}
          </span>
        ))}
      </div>
    );

  /**
   * A per-city word cloud for a classification column (themes / VNG-2030 / NDS). Each
   * value is sized by how many of the city's initiatives carry it, so recurring values
   * read larger than one-offs. The values are arranged biggest-in-the-middle with the
   * rest fanning outward, and the container is centred — a compact cloud rather than a
   * left-aligned list. `pick` selects the value list from an initiative; `labelFor`
   * localises the value for display (themes are shown verbatim).
   */
  const wordCloud = (
    row: CityRow,
    values: string[],
    pick: (init: CityRow['initiatives'][number]) => string[],
    labelFor?: (v: string) => string,
  ) => {
    if (values.length === 0) return <span className="text-muted-foreground">—</span>;
    const freq = new Map<string, number>();
    for (const init of row.initiatives)
      for (const v of pick(init)) freq.set(v, (freq.get(v) ?? 0) + 1);
    // Only the row's union values, each with its frequency (≥ 1).
    const entries = values.map((v) => [v, freq.get(v) ?? 1] as [string, number]);
    const counts = entries.map((e) => e[1]);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const MIN_PX = 11;
    const MAX_PX = 20;
    const sizeOf = (n: number) =>
      max === min ? MIN_PX : MIN_PX + ((n - min) / (max - min)) * (MAX_PX - MIN_PX);
    // Sort by weight, then fan out around the centre so the biggest word sits in the
    // middle and smaller words flank it (alternately prepended/appended).
    const sorted = [...entries].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const arranged: [string, number][] = [];
    sorted.forEach((e, i) => (i % 2 === 0 ? arranged.push(e) : arranged.unshift(e)));
    return (
      <div className="flex max-w-[22rem] flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center leading-tight">
        {arranged.map(([v, n]) => (
          <span
            key={v}
            title={t('citiesTab.wordFrequency', {
              count: n,
              word: labelFor ? labelFor(v) : v,
              defaultValue: '{{word}} — {{count}} initiative(s)',
            })}
            className="text-foreground"
            style={{
              fontSize: `${sizeOf(n)}px`,
              opacity: max === min ? 1 : 0.55 + 0.45 * ((n - min) / (max - min)),
            }}
          >
            {labelFor ? labelFor(v) : v}
          </span>
        ))}
      </div>
    );
  };

  /** Unknown population/province renders as an explicit marker, never as 0 (FR-005). */
  const unknown = (
    <span className="text-muted-foreground" title={t('citiesTab.unknown')}>
      {t('citiesTab.unknown')}
    </span>
  );

  const empty = !loading && !error && effectiveSpaceIds.length === 0;

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full min-h-0 flex-col">
        {/* Filter bar — search + a dropdown per categorical column. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-6 py-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('citiesTab.search')}
              className={cn(
                'w-56 rounded-md border border-border bg-card py-1.5 pl-8 pr-3 text-sm text-foreground',
                'placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              )}
            />
          </div>

          {filterDefs
            .filter((f) => f.options.length > 0)
            .map((f) => (
              <label key={f.key} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {t(f.labelKey)}
                <select
                  value={filters[f.key] ?? ALL}
                  onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className={cn(
                    'max-w-44 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  )}
                >
                  <option value={ALL}>{t('citiesTab.filterAll')}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label} ({o.count})
                    </option>
                  ))}
                </select>
              </label>
            ))}

          <span className="ml-auto text-xs text-muted-foreground">
            {t('citiesTab.count', { count: rows.length })}
          </span>
        </div>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && !dataset ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t('citiesTab.loading')}
              </div>
              {currentSpaceLabel && (
                <span className="text-sm font-semibold text-primary" title={currentSpaceLabel}>
                  {currentSpaceLabel}
                </span>
              )}
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              {t('states.error')}: {error}
            </div>
          ) : empty ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('selection.empty')}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('citiesTab.noResults')}
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  <th className="px-6 py-1.5 text-left" rowSpan={2}>
                    {headerBtn('name', t('citiesTab.colName'))}
                  </th>
                  <th className={groupTh} colSpan={2}>
                    {t('citiesTab.groupCity')}
                  </th>
                  <th className={groupTh} colSpan={3}>
                    {t('citiesTab.groupParticipation')}
                  </th>
                  <th className={groupTh} colSpan={3}>
                    {t('citiesTab.groupClassification')}
                  </th>
                </tr>
                <tr className="border-b border-border text-left">
                  <th className="w-36 border-l border-border px-3 py-2.5">
                    {headerBtn('province', t('citiesTab.colProvince'))}
                  </th>
                  <th className="w-28 px-3 py-2.5">
                    {headerBtn('population', t('citiesTab.colPopulation'))}
                  </th>
                  <th className="w-28 border-l border-border px-3 py-2.5">
                    {headerBtn('initiatives', t('citiesTab.colInitiatives'))}
                  </th>
                  <th className="w-20 px-3 py-2.5">
                    {headerBtn('groei', t('citiesTab.colGroei'))}
                  </th>
                  <th className="w-20 px-3 py-2.5">{headerBtn('gd', t('citiesTab.colGd'))}</th>
                  <th className="border-l border-border px-3 py-2.5">
                    {headerBtn('vng2030', t('citiesTab.colVng2030'))}
                  </th>
                  <th className="px-3 py-2.5">{headerBtn('nds', t('citiesTab.colNds'))}</th>
                  <th className="px-3 py-2.5">{headerBtn('themes', t('citiesTab.colThemes'))}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top hover:bg-muted/40">
                    <td className="px-6 py-2.5 font-medium text-foreground">
                      <button
                        type="button"
                        onClick={() => openCity(r.id)}
                        className={cn(
                          'text-left font-medium text-foreground underline-offset-2 hover:text-primary hover:underline',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        )}
                      >
                        {r.name}
                      </button>
                    </td>
                    <td className="border-l border-border px-3 py-2.5 text-muted-foreground">
                      {r.provinceName ?? unknown}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {r.population == null ? unknown : numberFormat.format(r.population)}
                    </td>
                    <td className="border-l border-border px-3 py-2.5 tabular-nums text-muted-foreground">
                      {r.initiativeCount === 0 ? (
                        <span>0</span>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default underline decoration-dotted underline-offset-2">
                              {r.initiativeCount}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <ul className="max-h-60 space-y-0.5 overflow-auto whitespace-normal">
                              {r.initiatives.map((i) => (
                                <li key={i.id}>
                                  {i.name}
                                  <span className="ml-1 text-muted-foreground">
                                    (
                                    {i.kind === 'groei'
                                      ? t('initiativesTab.typeGroei')
                                      : t('initiativesTab.typeGd')}
                                    )
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{r.groeiCount}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{r.gdCount}</td>
                    <td className="border-l border-border px-3 py-2.5">
                      {wordCloud(r, r.vng2030, (i) => i.vng2030, (v) =>
                        t(`categories.vng2030.${v}`, { defaultValue: v }),
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {wordCloud(r, r.nds, (i) => i.nds, (v) =>
                        t(`categories.nds.${v}`, { defaultValue: v }),
                      )}
                    </td>
                    <td className="px-3 py-2.5">{wordCloud(r, r.themes, (i) => i.themes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
