import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Download, Loader2 } from 'lucide-react';
import {
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useAppConfig,
  useIsCompact,
} from '@ea/shared';
import { RecordCard, RecordCardList, RecordSortControl } from '../components/RecordCards.js';
import { TableFilterBar, FILTER_ALL } from '../components/TableFilterBar.js';
import { ActivityTier } from '@server/types/graph.js';
import { buildInitiativeRows, type InitiativeRow } from '../utils/initiatives.js';
import { exportTableXlsx, type ChartTable } from '../utils/exportDashboard.js';
import { useSelectionContext } from '../hooks/SelectionContext.js';
import { useVngGraph } from '../hooks/useVngGraph.js';
import { useGraphProgress } from '../hooks/useGraphProgress.js';

const ALL = FILTER_ALL;

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

/**
 * The same sort keys the column headers expose, in column order — used by the card
 * view's sort control, which has no headers to hang them off. Kept as one list so a
 * new sortable column cannot end up sortable on a desktop and not on a phone.
 */
const SORT_OPTIONS: SortKey[] = [
  'name',
  'type',
  'gemeentes',
  'members',
  'leads',
  'vng2030',
  'nds',
  'themes',
  'commonGround',
  'week',
  'month',
  'total',
  'tier',
];
const SORT_LABEL_KEYS: Record<SortKey, string> = {
  name: 'initiativesTab.colName',
  type: 'initiativesTab.colType',
  gemeentes: 'initiativesTab.colGemeenteCount',
  members: 'initiativesTab.colMembers',
  leads: 'initiativesTab.colLeads',
  vng2030: 'initiativesTab.colVng2030',
  nds: 'initiativesTab.colNds',
  themes: 'initiativesTab.colThemes',
  commonGround: 'initiativesTab.colCommonGround',
  week: 'initiativesTab.colActivityWeek',
  month: 'initiativesTab.colActivityMonth',
  total: 'initiativesTab.colActivityTotal',
  tier: 'initiativesTab.colActivityTier',
};

/**
 * A table row IS an initiative row (feature 022): the derivation moved to
 * `utils/initiatives.ts` so the Initiatives table and the Funnel cannot disagree about
 * what an initiative is, or about how many gemeentes take part in it.
 */
type Row = InitiativeRow;

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
  // Below `lg` the thirteen-column table is re-laid as one card per initiative.
  const compact = useIsCompact();
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

  // One row per initiative, from the shared builder (feature 022). Kept as a useMemo so
  // the table's filter/sort work below is not redone on every render.
  const allRows = useMemo<Row[]>(() => buildInitiativeRows(dataset), [dataset]);

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
          label: v,
        })),
        matches: (r: Row, v: string) => r.vng2030.includes(v),
      },
      {
        key: 'nds',
        labelKey: 'initiativesTab.filterNds',
        options: distinct((r) => r.nds).map((v) => ({
          value: v,
          label: v,
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

  /**
   * The active sort as a comparator, separate from the filtering below because the
   * export applies it to the UNFILTERED set: the spreadsheet is every initiative, but
   * still in the order the user put the table in.
   */
  const sortRows = useMemo(() => {
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
    return (list: Row[]) => [...list].sort(cmp);
  }, [sortKey, sortDir]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = filterDefs.filter((f) => filters[f.key] && filters[f.key] !== ALL);
    const filtered = allRows.filter((r) => {
      for (const f of active) if (!f.matches(r, filters[f.key])) return false;
      if (!q) return true;
      return [r.name, ...r.gemeentes, ...r.themes].join(' ').toLowerCase().includes(q);
    });
    return sortRows(filtered);
  }, [allRows, filterDefs, filters, query, sortRows]);

  const { exportCreator, exportFilenameStem } = useAppConfig();
  const [exporting, setExporting] = useState(false);

  /**
   * The spreadsheet is EVERY initiative, not the filtered view: the filters are a way to
   * read the table on screen, and an export that silently dropped whatever was filtered
   * out would be a partial dataset that looks like a complete one. The current sort is
   * still applied, so the file opens in the order the user left the table in. The columns
   * the screen abbreviates are written out in full — the gemeente list the table only
   * shows in a tooltip, and the SDG/award columns that exist as filters but not as columns.
   */
  const buildExportTable = (): ChartTable => ({
    columns: [
      t('initiativesTab.colName'),
      t('initiativesTab.colType'),
      t('initiativesTab.colGemeenteCount'),
      t('initiativesTab.colGemeentes'),
      t('export.province'),
      t('initiativesTab.colMembers'),
      t('initiativesTab.colLeads'),
      t('initiativesTab.colVng2030'),
      t('initiativesTab.colNds'),
      t('initiativesTab.colThemes'),
      t('initiativesTab.colSdg'),
      t('initiativesTab.filterAward'),
      t('initiativesTab.colCommonGround'),
      t('initiativesTab.colActivityWeek'),
      t('initiativesTab.colActivityMonth'),
      t('initiativesTab.colActivityTotal'),
      t('initiativesTab.colActivityTier'),
    ],
    rows: sortRows(allRows).map((r) => [
      r.name,
      r.kind === 'groei' ? t('initiativesTab.typeGroei') : t('initiativesTab.typeGd'),
      r.gemeentes.length,
      r.gemeentes.join(', '),
      r.provinces.join(', '),
      // GD initiatives have no membership — leave the cell empty rather than writing a
      // 0 that would sum into a total and read as "nobody", which is a different claim.
      r.members ?? '',
      r.leads ?? '',
      r.vng2030.join(', '),
      r.nds.join(', '),
      r.themes.join(', '),
      r.sdg.map((v) => v.toUpperCase()).join(', '),
      r.awards.join(', '),
      r.commonGround ? t('initiativesTab.cgYes') : t('initiativesTab.cgNo'),
      r.activity?.week ?? '',
      r.activity?.month ?? '',
      r.activity?.total ?? '',
      r.tier ? t(TIER_LABEL[r.tier]) : '',
    ]),
  });

  const onExport = async () => {
    setExporting(true);
    try {
      await exportTableXlsx({
        title: t('tabs.initiatives'),
        table: buildExportTable(),
        creator: exportCreator,
        filename: `${exportFilenameStem}-initiatives-${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: t('export.sheetData', { defaultValue: 'Data' }),
      });
    } finally {
      setExporting(false);
    }
  };

  // Text columns default to A→Z; numeric/boolean columns default to high→low.
  const TEXT_KEYS = new Set<SortKey>(['name', 'type', 'vng2030', 'nds', 'themes']);
  /**
   * Clicking a column header re-sorts by it, and clicking the ACTIVE header flips
   * the direction. The card view's sort <select> must not flip: re-picking the
   * option you are already on has to be a no-op, not a reversal — hence `pick`.
   */
  const toggleSort = (key: SortKey, pick = false) => {
    if (key === sortKey) {
      if (!pick) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(TEXT_KEYS.has(key) ? 'asc' : 'desc');
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
      {/* Filter bar — search + a dropdown per categorical column. Below `lg` the
          dropdowns move behind a disclosure and the card view's sort joins them. */}
      <TableFilterBar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={t('initiativesTab.search')}
        filters={filterDefs}
        values={filters}
        onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        allLabel={t('initiativesTab.filterAll')}
        countLabel={t('initiativesTab.count', { count: rows.length })}
        sortControl={
          <RecordSortControl
            options={SORT_OPTIONS.map((k) => ({ key: k, label: t(SORT_LABEL_KEYS[k]) }))}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortKey={(k) => toggleSort(k, true)}
            onToggleDir={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          />
        }
        actions={
          <button
            type="button"
            onClick={onExport}
            disabled={exporting || allRows.length === 0}
            data-touch-target
            title={t('export.downloadXlsx')}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground',
              'transition-colors hover:bg-muted disabled:opacity-60',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            )}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden />
            )}
            {t('export.downloadXlsx')}
          </button>
        }
      />

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
          compact ? (
            <RecordCardList>
              {rows.map((r) => (
                <RecordCard
                  key={r.id}
                  title={
                    <span className="flex flex-wrap items-baseline gap-2">
                      {r.name}
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
                    </span>
                  }
                  fields={[
                    {
                      label: t('initiativesTab.colGemeenteCount'),
                      value: <span className="tabular-nums">{r.gemeentes.length}</span>,
                    },
                    {
                      label: `${t('initiativesTab.colMembers')} / ${t('initiativesTab.colLeads')}`,
                      value: (
                        <span className="tabular-nums">
                          {r.members ?? '—'} / {r.leads ?? '—'}
                        </span>
                      ),
                    },
                    {
                      label: t('initiativesTab.colActivityTier'),
                      value:
                        r.tier == null ? (
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
                        ),
                    },
                    {
                      label: t('initiativesTab.colCommonGround'),
                      value: r.commonGround ? (
                        <Check
                          className="h-4 w-4 text-primary"
                          aria-label={t('initiativesTab.cgYes')}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      ),
                    },
                    {
                      // Week / month / total on one line: three separate cards' worth
                      // of label for three small numbers is all chrome and no data.
                      label: `${t('initiativesTab.colActivityWeek')} / ${t('initiativesTab.colActivityMonth')} / ${t('initiativesTab.colActivityTotal')}`,
                      value: (
                        <span className="tabular-nums">
                          {r.activity == null
                            ? '—'
                            : `${r.activity.week} / ${r.activity.month} / ${r.activity.total}`}
                        </span>
                      ),
                      full: true,
                    },
                    { label: t('initiativesTab.colVng2030'), value: chips(r.vng2030), full: true },
                    { label: t('initiativesTab.colNds'), value: chips(r.nds), full: true },
                    { label: t('initiativesTab.colThemes'), value: chips(r.themes), full: true },
                  ]}
                />
              ))}
            </RecordCardList>
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
                      {chips(r.vng2030, (v) => v)}
                    </td>
                    <td className="px-3 py-2.5">
                      {chips(r.nds, (v) => v)}
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
          )
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}
