import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ea/shared';
import { ActivityTier } from '@server/types/graph.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useVngGraph } from '../hooks/useVngGraph.js';
import { useGraphProgress } from '../hooks/useGraphProgress.js';

// Groei initiatives are top-level spaces only — subspaces (L1/L2) are not listed.
const GROEI_TYPE = 'SPACE_L0';
const ALL = '__all__';

type Kind = 'groei' | 'gd';
type SortKey =
  | 'name'
  | 'type'
  | 'gemeentes'
  | 'members'
  | 'leads'
  | 'vng2030'
  | 'nds'
  | 'themes'
  | 'commonGround'
  | 'week'
  | 'month'
  | 'total'
  | 'tier';
type SortDir = 'asc' | 'desc';

interface Row {
  id: string;
  name: string;
  kind: Kind;
  gemeentes: string[];
  /** Distinct provinces of this initiative's gemeentes (feature: provinces). */
  provinces: string[];
  /** Distinct member / lead user counts (null for GD initiatives — no membership). */
  members: number | null;
  leads: number | null;
  themes: string[];
  nds: string[];
  vng2030: string[];
  sdg: string[];
  awards: string[];
  commonGround: boolean;
  /** Activity counts per period — only meaningful for Groei (selected space) rows. */
  activity: { day: number; week: number; month: number; total: number } | null;
  tier: ActivityTier | null;
}

const TIER_LABEL: Record<ActivityTier, string> = {
  [ActivityTier.INACTIVE]: 'initiativesTab.tierInactive',
  [ActivityTier.LOW]: 'initiativesTab.tierLow',
  [ActivityTier.MEDIUM]: 'initiativesTab.tierMedium',
  [ActivityTier.HIGH]: 'initiativesTab.tierHigh',
};

// Tier ordering for the activity-level filter: high → medium → low → inactive.
const TIER_ORDER: ActivityTier[] = [
  ActivityTier.HIGH,
  ActivityTier.MEDIUM,
  ActivityTier.LOW,
  ActivityTier.INACTIVE,
];

// Numeric rank for sorting by tier (higher activity → higher value).
const TIER_RANK: Record<ActivityTier, number> = {
  [ActivityTier.INACTIVE]: 0,
  [ActivityTier.LOW]: 1,
  [ActivityTier.MEDIUM]: 2,
  [ActivityTier.HIGH]: 3,
};

// Activity tier badge colours — a green ramp: inactive grey, then increasingly
// saturated green from low → medium (light green) → high (darker green).
const TIER_CLASS: Record<ActivityTier, string> = {
  [ActivityTier.INACTIVE]: 'bg-muted text-muted-foreground',
  [ActivityTier.LOW]: 'bg-emerald-50 text-emerald-700',
  [ActivityTier.MEDIUM]: 'bg-emerald-200 text-emerald-900',
  [ActivityTier.HIGH]: 'bg-emerald-600 text-white',
};

// Subtle background tint applied across the whole activity cell group, scaled by
// the tier so an initiative's activity level reads at a glance.
const TIER_CELL_BG: Record<ActivityTier, string> = {
  [ActivityTier.INACTIVE]: '',
  [ActivityTier.LOW]: 'bg-emerald-50/70',
  [ActivityTier.MEDIUM]: 'bg-emerald-100/70',
  [ActivityTier.HIGH]: 'bg-emerald-200/70',
};

/**
 * Initiatives tab — a filterable spreadsheet view of the selected nodes, built
 * entirely from the shared graph dataset (no extra fetch). One row per initiative:
 * the selected top-level spaces are the "Groei" initiatives (live Alkemio spaces, so
 * they carry activity), and GemeenteDelers (GD) initiatives are folded in when the
 * "Include GD initiatives" toggle is on. Classification dimensions (themes, NDS,
 * VNG-2030, SDGs, awards, Common Ground) are read straight off the node fields the
 * server resolves during graph generation. Per-column dropdown filters sit above
 * the table.
 */
export function InitiativesTab() {
  const { t } = useTranslation();
  const { effectiveSpaceIds, selectedSpaces, state, refreshNonce } = useSelectionContext();
  const { dataset, loading, error } = useVngGraph(effectiveSpaceIds, {
    includeInitiatives: state.includeInitiatives,
    refreshNonce,
  });

  // Name the space currently being fetched (mirrors the dashboard/graph loading feedback).
  const progress = useGraphProgress(loading && !dataset);
  const currentSpaceLabel = (() => {
    const nameId = progress?.currentSpace;
    if (!nameId) return null;
    return selectedSpaces.find((s) => s.nameId === nameId)?.displayName ?? nameId;
  })();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Flatten the dataset into one row per initiative, reading the classification
  // fields directly off the node and deriving connected gemeentes from edges.
  const allRows = useMemo<Row[]>(() => {
    if (!dataset) return [];
    const gemeenteName = new Map<string, string>();
    // Gemeente node id → its province name (set on gemeente ORG nodes server-side).
    const gemeenteProvince = new Map<string, string>();
    const userIds = new Set<string>();
    for (const n of dataset.nodes) {
      if (n.type === 'ORGANIZATION' && n.isGemeente === true) {
        gemeenteName.set(n.id, n.displayName);
        if (n.provinceName) gemeenteProvince.set(n.id, n.provinceName);
      } else if (n.type === 'USER') userIds.add(n.id);
    }
    const adj = new Map<string, Set<string>>();
    // Distinct member / lead users per space, keyed by space node id.
    const memberUsers = new Map<string, Set<string>>();
    const leadUsers = new Map<string, Set<string>>();
    const link = (map: Map<string, Set<string>>, a: string, b: string) => {
      let s = map.get(a);
      if (!s) map.set(a, (s = new Set()));
      s.add(b);
    };
    for (const e of dataset.edges) {
      link(adj, e.sourceId, e.targetId);
      link(adj, e.targetId, e.sourceId);
      if (e.type === 'MEMBER' || e.type === 'LEAD') {
        const userId = userIds.has(e.sourceId)
          ? e.sourceId
          : userIds.has(e.targetId)
            ? e.targetId
            : null;
        if (userId) {
          const spaceId = userId === e.sourceId ? e.targetId : e.sourceId;
          link(e.type === 'MEMBER' ? memberUsers : leadUsers, spaceId, userId);
        }
      }
    }

    const rows: Row[] = [];
    for (const n of dataset.nodes) {
      const isSpace = n.type === GROEI_TYPE;
      const isInitiative = n.type === 'INITIATIVE';
      if (!isSpace && !isInitiative) continue;

      const neighbours = adj.get(n.id);
      const gemeenteIds = neighbours ? [...neighbours].filter((id) => gemeenteName.has(id)) : [];
      const gemeentes = gemeenteIds
        .map((id) => gemeenteName.get(id) as string)
        .sort((a, b) => a.localeCompare(b));
      const provinces = [
        ...new Set(gemeenteIds.map((id) => gemeenteProvince.get(id)).filter(Boolean) as string[]),
      ].sort((a, b) => a.localeCompare(b));

      rows.push({
        id: n.id,
        name: n.displayName,
        kind: isSpace ? 'groei' : 'gd',
        gemeentes,
        provinces,
        members: isSpace ? (memberUsers.get(n.id)?.size ?? 0) : null,
        leads: isSpace ? (leadUsers.get(n.id)?.size ?? 0) : null,
        themes: n.vngThemes ?? [],
        nds: n.ndsCategories ?? [],
        vng2030: n.vng2030Categories ?? [],
        sdg: n.globalGoals ?? [],
        awards: n.initiativeClassifications ?? [],
        commonGround: n.commonGround === true,
        activity: isSpace
          ? {
              day: n.activityByPeriod?.day ?? 0,
              week: n.activityByPeriod?.week ?? 0,
              month: n.activityByPeriod?.month ?? 0,
              total: n.totalActivityCount ?? n.activityByPeriod?.allTime ?? 0,
            }
          : null,
        tier: isSpace ? (n.spaceActivityTier ?? ActivityTier.INACTIVE) : null,
      });
    }
    return rows;
  }, [dataset]);

  // Distinct values per categorical column, for the dropdown filters above the table.
  const distinct = (pick: (r: Row) => string[]): string[] => {
    const set = new Set<string>();
    for (const r of allRows) for (const v of pick(r)) set.add(v);
    return [...set].sort((a, b) => a.localeCompare(b));
  };

  // Filter definitions — each renders a dropdown above the table and narrows rows
  // to those whose value(s) match the selection. Classification filters lead with
  // VNG 2030, then NDS, then the rest. Each option carries a count, and only filters
  // with options render.
  const filterDefs = useMemo(() => {
    const defs = [
      {
        key: 'type',
        labelKey: 'initiativesTab.filterType',
        options: allRows.some((r) => r.kind === 'gd')
          ? [
              { value: 'groei', label: t('initiativesTab.typeGroei') },
              { value: 'gd', label: t('initiativesTab.typeGd') },
            ]
          : [],
        matches: (r: Row, v: string) => r.kind === v,
      },
      {
        key: 'province',
        labelKey: 'initiativesTab.filterProvince',
        options: distinct((r) => r.provinces).map((v) => ({ value: v, label: v })),
        matches: (r: Row, v: string) => r.provinces.includes(v),
      },
      {
        key: 'gemeente',
        labelKey: 'initiativesTab.filterGemeente',
        options: distinct((r) => r.gemeentes).map((v) => ({ value: v, label: v })),
        matches: (r: Row, v: string) => r.gemeentes.includes(v),
      },
      {
        key: 'vng2030',
        labelKey: 'initiativesTab.filterVng2030',
        options: distinct((r) => r.vng2030).map((v) => ({
          value: v,
          label: t(`categories.vng2030.${v}`, { defaultValue: v }),
        })),
        matches: (r: Row, v: string) => r.vng2030.includes(v),
      },
      {
        key: 'nds',
        labelKey: 'initiativesTab.filterNds',
        options: distinct((r) => r.nds).map((v) => ({
          value: v,
          label: t(`categories.nds.${v}`, { defaultValue: v }),
        })),
        matches: (r: Row, v: string) => r.nds.includes(v),
      },
      {
        key: 'theme',
        labelKey: 'initiativesTab.filterTheme',
        options: distinct((r) => r.themes).map((v) => ({ value: v, label: v })),
        matches: (r: Row, v: string) => r.themes.includes(v),
      },
      {
        key: 'sdg',
        labelKey: 'initiativesTab.filterSdg',
        options: distinct((r) => r.sdg).map((v) => ({ value: v, label: v.toUpperCase() })),
        matches: (r: Row, v: string) => r.sdg.includes(v),
      },
      {
        key: 'award',
        labelKey: 'initiativesTab.filterAward',
        options: distinct((r) => r.awards).map((v) => ({ value: v, label: v })),
        matches: (r: Row, v: string) => r.awards.includes(v),
      },
      {
        key: 'commonGround',
        labelKey: 'initiativesTab.filterCommonGround',
        options: allRows.some((r) => r.commonGround)
          ? [
              { value: 'yes', label: t('initiativesTab.cgYes') },
              { value: 'no', label: t('initiativesTab.cgNo') },
            ]
          : [],
        matches: (r: Row, v: string) => (v === 'yes') === r.commonGround,
      },
      {
        key: 'tier',
        labelKey: 'initiativesTab.filterTier',
        options: TIER_ORDER.filter((tier) => allRows.some((r) => r.tier === tier)).map((v) => ({
          value: v,
          label: t(TIER_LABEL[v]),
        })),
        matches: (r: Row, v: string) => r.tier === v,
      },
    ];
    // Attach a per-option count of how many initiatives carry that value.
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
      return [r.name, ...r.gemeentes, ...r.themes].join(' ').toLowerCase().includes(q);
    });
    // Per-column sort value. Returns null where the column doesn't apply (e.g. GD
    // rows have no activity) so those rows always sink to the bottom.
    const value = (r: Row): string | number | null => {
      switch (sortKey) {
        case 'type':
          return r.kind;
        case 'gemeentes':
          return r.gemeentes.length;
        case 'members':
          return r.members;
        case 'leads':
          return r.leads;
        case 'vng2030':
          return r.vng2030.join(', ');
        case 'nds':
          return r.nds.join(', ');
        case 'themes':
          return r.themes.join(', ');
        case 'commonGround':
          return r.commonGround ? 1 : 0;
        case 'week':
          return r.activity?.week ?? null;
        case 'month':
          return r.activity?.month ?? null;
        case 'total':
          return r.activity?.total ?? null;
        case 'tier':
          return r.tier ? TIER_RANK[r.tier] : null;
        default:
          return r.name;
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: Row, b: Row) => {
      const av = value(a);
      const bv = value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // empty/non-applicable always last
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    };
    return [...filtered].sort(cmp);
  }, [allRows, filterDefs, filters, query, sortKey, sortDir]);

  // Text columns default to A→Z; numeric/boolean columns default to high→low.
  const TEXT_KEYS = new Set<SortKey>(['name', 'type', 'vng2030', 'nds', 'themes']);
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
            placeholder={t('initiativesTab.search')}
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
                <option value={ALL}>{t('initiativesTab.filterAll')}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({o.count})
                  </option>
                ))}
              </select>
            </label>
          ))}

        <span className="ml-auto text-xs text-muted-foreground">
          {t('initiativesTab.count', { count: rows.length })}
        </span>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && !dataset ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('initiativesTab.loading')}
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
            {t('initiativesTab.noResults')}
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                <th className="px-6 py-1.5" rowSpan={2}>
                  {headerBtn('name', t('initiativesTab.colName'))}
                </th>
                <th className="px-3 py-1.5 text-left" rowSpan={2}>
                  {headerBtn('type', t('initiativesTab.colType'))}
                </th>
                <th className={groupTh} colSpan={3}>
                  {t('initiativesTab.groupCommunity')}
                </th>
                <th className={groupTh} colSpan={4}>
                  {t('initiativesTab.groupClassification')}
                </th>
                <th className={groupTh} colSpan={4}>
                  {t('initiativesTab.groupActivity')}
                </th>
              </tr>
              <tr className="border-b border-border text-left">
                <th className="w-28 border-l border-border px-3 py-2.5">
                  {headerBtn('gemeentes', t('initiativesTab.colGemeenteCount'))}
                </th>
                <th className="w-24 px-3 py-2.5">
                  {headerBtn('members', t('initiativesTab.colMembers'))}
                </th>
                <th className="w-24 px-3 py-2.5">
                  {headerBtn('leads', t('initiativesTab.colLeads'))}
                </th>
                <th className="border-l border-border px-3 py-2.5">
                  {headerBtn('vng2030', t('initiativesTab.colVng2030'))}
                </th>
                <th className="px-3 py-2.5">
                  {headerBtn('nds', t('initiativesTab.colNds'))}
                </th>
                <th className="px-3 py-2.5">
                  {headerBtn('themes', t('initiativesTab.colThemes'))}
                </th>
                <th className="px-3 py-2.5">
                  {headerBtn('commonGround', t('initiativesTab.colCommonGround'))}
                </th>
                <th className="w-20 border-l border-border px-3 py-2.5">
                  {headerBtn('week', t('initiativesTab.colActivityWeek'))}
                </th>
                <th className="w-20 px-3 py-2.5">
                  {headerBtn('month', t('initiativesTab.colActivityMonth'))}
                </th>
                <th className="w-20 px-3 py-2.5">
                  {headerBtn('total', t('initiativesTab.colActivityTotal'))}
                </th>
                <th className="w-28 px-3 py-2.5">
                  {headerBtn('tier', t('initiativesTab.colActivityTier'))}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tierBg = r.tier ? TIER_CELL_BG[r.tier] : '';
                return (
                <tr key={r.id} className="border-b border-border align-top hover:bg-muted/40">
                  <td className="px-6 py-2.5 font-medium text-foreground">{r.name}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        r.kind === 'groei'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {r.kind === 'groei'
                        ? t('initiativesTab.typeGroei')
                        : t('initiativesTab.typeGd')}
                    </span>
                  </td>
                  <td className="border-l border-border px-3 py-2.5 tabular-nums text-muted-foreground">
                    {r.gemeentes.length === 0 ? (
                      <span>0</span>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default underline decoration-dotted underline-offset-2">
                            {r.gemeentes.length}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <div className="max-h-60 overflow-auto whitespace-normal">
                            {r.gemeentes.join(', ')}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {r.members == null ? '—' : r.members}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {r.leads == null ? '—' : r.leads}
                  </td>
                  <td className="border-l border-border px-3 py-2.5">
                    {chips(r.vng2030, (v) => t(`categories.vng2030.${v}`, { defaultValue: v }))}
                  </td>
                  <td className="px-3 py-2.5">
                    {chips(r.nds, (v) => t(`categories.nds.${v}`, { defaultValue: v }))}
                  </td>
                  <td className="px-3 py-2.5">{chips(r.themes)}</td>
                  <td className="px-3 py-2.5">
                    {r.commonGround ? (
                      <Check className="h-4 w-4 text-primary" aria-label={t('initiativesTab.cgYes')} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={cn('border-l border-border px-3 py-2.5 tabular-nums text-muted-foreground', tierBg)}>
                    {r.activity == null ? '—' : r.activity.week}
                  </td>
                  <td className={cn('px-3 py-2.5 tabular-nums text-muted-foreground', tierBg)}>
                    {r.activity == null ? '—' : r.activity.month}
                  </td>
                  <td className={cn('px-3 py-2.5 tabular-nums text-muted-foreground', tierBg)}>
                    {r.activity == null ? '—' : r.activity.total}
                  </td>
                  <td className={cn('px-3 py-2.5', tierBg)}>
                    {r.tier == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          TIER_CLASS[r.tier],
                        )}
                      >
                        {t(TIER_LABEL[r.tier])}
                      </span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}
