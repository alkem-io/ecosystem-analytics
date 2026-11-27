import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { cn, proxyImageUrl, useAppConfig, useIsCompact } from '@ea/shared';
import type { GraphDataset, GraphNode } from '@server/types/graph.js';
import type { CityRow } from '../../utils/cities.js';
import type { InitiativeRow } from '../../utils/initiatives.js';
import { Card, TipProvider, useTip } from './primitives.js';
import { shortCat } from './charts.js';
import { BinLegend, binColor, GemeenteMap, useCodeOf, type MapLabel } from './GemeenteMap.js';
import { Switcher } from './Switcher.js';
import { GemeenteMark, InitiativeMark, provinceSlug } from './InitiativeA.js';

const GROEI = 'var(--series-groei)';
const GD = 'var(--series-gd)';
const plain = (n: string) => n.replace(/^gemeente\s+/i, '');

/** Term → how many of the given initiatives carry it, most frequent first. */
function tally(lists: string[][]): [string, number][] {
  const m = new Map<string, number>();
  for (const l of lists) for (const v of new Set(l)) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl'));
}
const ink = (t: number) => `color-mix(in srgb, #1d384a ${Math.round(45 + t * 55)}%, #8496a8)`;

/**
 * A compact word cloud for one table row: the gemeente's top terms, a little larger and
 * darker the more of its initiatives carry them. Long names are cut off; the tooltip has
 * the full name and the count, and "+N" lists the rest.
 */
export function MiniCloud({ terms, max, short }: { terms: [string, number][]; max: number; short?: (s: string) => string }) {
  const { t } = useTranslation();
  const tip = useTip();
  if (!terms.length) return <span className="text-muted-foreground">—</span>;
  const top = terms.slice(0, max);
  const rest = terms.slice(max);
  const hi = top[0][1];
  const lo = top[top.length - 1][1];
  return (
    <span className="flex flex-wrap items-baseline gap-x-2.5 leading-[1.35]">
      {top.map(([v, n]) => {
        const k = hi === lo ? 0.4 : Math.sqrt((n - lo) / (hi - lo));
        return (
          <span
            key={v}
            className="max-w-full cursor-default truncate"
            style={{ fontSize: `${11.5 + k * 2.5}px`, color: ink(k), fontWeight: k > 0.8 ? 650 : 500 }}
            {...tip({ title: v, rows: [[t('dashboard.a.initiatives', { defaultValue: 'Initiatieven' }), n]] })}
          >
            {short ? short(v) : v}
          </span>
        );
      })}
      {rest.length > 0 && (
        <span
          className="cursor-default rounded-full bg-muted px-[7px] text-[11.5px] text-muted-foreground"
          {...tip({ title: t('dashboard.a.also', { defaultValue: 'Ook' }), rows: rest.slice(0, 14).map(([v, n]) => [v, n]) })}
        >
          +{rest.length}
        </span>
      )}
    </span>
  );
}

/** The three per-gemeente clouds (Thema's / NDS / VNG 2030) for the Gemeente page. */
function Clouds({ row, stacked, compact }: { row: CityRow; stacked: boolean; compact: boolean }) {
  const { t } = useTranslation();
  const tip = useTip();
  const groups: [string, [string, number][]][] = [
    [t('citiesTab.colThemes', { defaultValue: 'Thema’s' }), tally(row.initiatives.map((i) => i.themes))],
    [t('dashboard.a.ndsPriority', { defaultValue: 'NDS-prioriteit' }), tally(row.initiatives.map((i) => i.nds))],
    [t('citiesTab.colVng2030', { defaultValue: 'VNG 2030' }), tally(row.initiatives.map((i) => i.vng2030))],
  ];
  const max = compact ? 14 : 30;
  return (
    <div className={cn('grid gap-x-6 gap-y-3.5 rounded-lg bg-muted px-[18px] py-4', stacked || compact ? 'grid-cols-1' : 'grid-cols-3')}>
      {groups.map(([label, terms]) => {
        const top = terms.slice(0, max);
        const hi = top[0]?.[1] ?? 1;
        const lo = top[top.length - 1]?.[1] ?? 1;
        const arranged: [string, number][] = [];
        top.forEach((x, i) => (i % 2 ? arranged.unshift(x) : arranged.push(x)));
        return (
          <div key={label}>
            <h4 className="mb-1 text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">{label}</h4>
            {top.length ? (
              <div className="flex flex-wrap items-baseline justify-center gap-x-2.5 gap-y-0.5 text-center leading-tight">
                {arranged.map(([v, n]) => {
                  const k = hi === lo ? 0.5 : Math.sqrt((n - lo) / (hi - lo));
                  return (
                    <span
                      key={v}
                      className="cursor-default rounded px-1"
                      style={{ fontSize: `${12 + k * (compact ? 6 : 9)}px`, color: ink(k), fontWeight: k > 0.55 ? 650 : 500 }}
                      {...tip({ title: v, rows: [[t('dashboard.a.initiatives', { defaultValue: 'Initiatieven' }), n]] })}
                    >
                      {v}
                    </span>
                  );
                })}
                {terms.length > max && <span className="text-[12.5px] text-muted-foreground">+{terms.length - max} meer</span>}
              </div>
            ) : (
              <span className="text-[12.5px] text-muted-foreground">{t('details.noClassifications', { defaultValue: 'Nog niet ingedeeld' })}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Gemeenten: the table body / phone cards of layout A ───────────────────────── */
export function CitiesTableA({
  rows,
  header,
  onOpen,
  unknown,
  fmt,
}: {
  rows: CityRow[];
  /** The production header row(s), with its sortable buttons. */
  header: ReactNode;
  onOpen: (id: string) => void;
  unknown: ReactNode;
  fmt: (n: number) => string;
}) {
  const compact = useIsCompact();
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map((r) => r.initiativeCount));
  const bar = (r: CityRow, h = 8) => (
    <span className="flex flex-1 gap-0.5" style={{ height: h }}>
      {r.groeiCount > 0 && <i className="block h-full" style={{ width: `${(r.groeiCount / max) * 100}%`, background: GROEI }} />}
      {r.gdCount > 0 && <i className="block h-full rounded-r" style={{ width: `${(r.gdCount / max) * 100}%`, background: GD }} />}
    </span>
  );
  if (compact)
    return (
      <TipProvider>
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="flex w-full flex-col gap-2.5 rounded-[10px] border border-border bg-card px-3.5 py-[13px] text-left">
              <span className="flex items-center gap-2.5">
                <GemeenteMark node={r.node} name={r.name} size={32} />
                <span className="min-w-0 flex-1">
                  <b className="block leading-tight font-semibold text-foreground">{plain(r.name)}</b>
                  <small className="text-[12.5px] text-muted-foreground">
                    {r.provinceName ?? '—'} · {r.population == null ? '—' : fmt(r.population)} {t('dashboard.a.inhabitants', { defaultValue: 'inwoners' }).toLowerCase()}
                  </small>
                </span>
                <span className="flex flex-col items-end text-[11.5px] leading-tight text-muted-foreground">
                  <b className="text-lg font-semibold text-foreground">{r.initiativeCount}</b>
                  {r.initiativeCount === 1 ? 'initiatief' : 'initiatieven'}
                </span>
              </span>
              <span className="flex w-full">{bar(r)}</span>
              <MiniCloud terms={tally(r.initiatives.map((i) => i.themes))} max={4} />
            </button>
          ))}
        </div>
      </TipProvider>
    );
  return (
    <TipProvider>
      <table className="w-full table-fixed border-collapse text-[13.5px]">
        <colgroup>
          {[14, 8.5, 8, 11, 5.5, 5, 14.5, 13, 20.5].map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        {header}
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              tabIndex={0}
              onClick={() => onOpen(r.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(r.id))}
              className="cursor-pointer border-b border-border align-middle hover:bg-[#f8fafc]"
            >
              <td className="sticky left-0 z-[1] bg-card px-5 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <GemeenteMark node={r.node} name={r.name} size={32} />
                  <b className="min-w-0 truncate font-semibold text-foreground" title={plain(r.name)}>{plain(r.name)}</b>
                </span>
              </td>
              <td className="border-l border-border px-3 py-2.5 text-muted-foreground">{r.provinceName ?? unknown}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{r.population == null ? unknown : fmt(r.population)}</td>
              <td className="border-l border-border px-3 py-2.5">
                <span className="flex items-center gap-2">
                  {bar(r)}
                  <em className="min-w-[22px] text-right font-semibold not-italic tabular-nums text-foreground">{r.initiativeCount}</em>
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.groeiCount || '—'}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.gdCount || '—'}</td>
              <td className="border-l border-border px-3 py-2.5">
                <div className="min-w-0">
                  <MiniCloud terms={tally(r.initiatives.map((i) => i.vng2030))} max={3} short={shortCat} />
                </div>
              </td>
              <td className="px-3 py-2.5">
                <div className="min-w-0">
                  <MiniCloud terms={tally(r.initiatives.map((i) => i.nds))} max={3} short={shortCat} />
                </div>
              </td>
              <td className="px-3 py-2.5 pr-5">
                <div className="min-w-0">
                  <MiniCloud terms={tally(r.initiatives.map((i) => i.themes))} max={4} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TipProvider>
  );
}

/* ── Gemeente informatie ─────────────────────────────────────────────────────────── */
export function GemeenteA({
  cities,
  selected,
  onSelect,
  rows,
  dataset,
}: {
  cities: CityRow[];
  selected: string | null;
  onSelect: (id: string) => void;
  rows: InitiativeRow[];
  dataset: GraphDataset | null;
}) {
  const { t, i18n } = useTranslation();
  const { eventPrefix } = useAppConfig();
  const compact = useIsCompact();
  const fmt = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const cur = cities.find((c) => c.id === selected) ?? cities[0];
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const nodeById = useMemo(() => new Map((dataset?.nodes ?? []).map((n) => [n.id, n])), [dataset]);
  const codeOf = useCodeOf(cities);
  const byCode = useMemo(() => new Map(cities.map((c) => [codeOf(c), c] as const).filter((e): e is [string, CityRow] => !!e[0])), [cities, codeOf]);

  const openSpace = (spaceId: string) => window.dispatchEvent(new CustomEvent(`${eventPrefix}:openSpace`, { detail: { spaceId } }));
  const goTab = (tab: string) => window.dispatchEvent(new CustomEvent(`${eventPrefix}:openTab`, { detail: { tab } }));

  // The cloud card goes under the map, at its width, when the initiatives column runs
  // longer than the map; otherwise it spans the page. Measured, not guessed.
  const mapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [under, setUnder] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      const m = mapRef.current;
      const l = listRef.current;
      if (!m || !l || compact) return setUnder(false);
      const side = Math.abs(m.getBoundingClientRect().top - l.getBoundingClientRect().top) < 2;
      setUnder(side && l.offsetHeight > m.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [cur?.id, compact]);

  if (!cur) return null;
  const groei = cur.initiatives.filter((i) => i.kind === 'groei');
  const gd = cur.initiatives.filter((i) => i.kind === 'gd');
  const slug = provinceSlug(cur.provinceName);
  const labels: MapLabel[] = cities.filter((c) => codeOf(c)).map((c) => ({ code: codeOf(c)!, text: plain(c.name), population: c.population ?? 0 }));

  const groups = [
    {
      label: t('switcher.gemeenten', { defaultValue: 'Gemeenten' }),
      items: [...cities]
        .sort((a, b) => plain(a.name).localeCompare(plain(b.name), 'nl'))
        .map((c) => ({
          key: c.id,
          name: plain(c.name),
          sub: `${c.provinceName ?? '—'} · ${c.initiativeCount} ${c.initiativeCount === 1 ? 'initiatief' : 'initiatieven'}`,
          avatar: <GemeenteMark node={c.node} name={c.name} size={30} />,
        })),
    },
  ];

  const cloudCard = (
    <Card
      className={under ? undefined : 'col-span-12'}
      title={t('cityDetailsTab.cloudTitle', { defaultValue: 'Waar werkt {{name}} aan', name: plain(cur.name) })}
      subtitle={t('cityDetailsTab.cloudSub', {
        defaultValue: 'De thema’s en categorieën van de {{count}} initiatieven van deze gemeente. Hoe groter, hoe vaker.',
        count: cur.initiativeCount,
      })}
    >
      {cur.initiativeCount ? (
        <Clouds row={cur} stacked={under} compact={compact} />
      ) : (
        <span className="text-sm text-muted-foreground">{t('cityDetailsTab.cloudEmpty', { defaultValue: 'Nog geen initiatieven, dus nog niets om te tonen.' })}</span>
      )}
    </Card>
  );

  return (
    <TipProvider>
      <div className="mx-auto max-w-[1560px]">
        <Switcher
          crumb={t('tabs.cities', { defaultValue: 'Gemeenten' })}
          onCrumb={() => goTab('cities')}
          groups={groups}
          current={cur.id}
          onPick={onSelect}
          placeholder={t('switcher.searchGemeente', { defaultValue: 'Zoek een gemeente' })}
          noun={t('switcher.gemeentenNoun', { defaultValue: 'gemeenten' })}
        />

        <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
          <div className={cn('flex flex-wrap items-start gap-4 px-6 pt-[18px] pb-5', compact && 'gap-3 px-4 pt-3.5 pb-4')}>
            <GemeenteMark node={cur.node} name={cur.name} size={compact ? 56 : 68} />
            <div className="min-w-0 flex-[1_1_360px]">
              <h1 className="text-2xl font-semibold tracking-[-0.015em] text-foreground">{cur.name}</h1>
              <p className="mt-1 text-[15px] text-muted-foreground">{cur.provinceName}</p>
            </div>
            {cur.node.url && (
              <a href={cur.node.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cbd5e1] bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted">
                {t('details.openOnAlkemio', { defaultValue: 'Open op Alkemio' })}
                <ExternalLink className="h-[15px] w-[15px]" aria-hidden />
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 border-t border-border sm:grid-cols-5">
            {[
              [t('cityDetailsTab.population', { defaultValue: 'Inwoners' }), cur.population == null ? '—' : fmt.format(cur.population)],
              [t('cityDetailsTab.province', { defaultValue: 'Provincie' }), cur.provinceName ?? '—'],
              [t('cityDetailsTab.initiativesTitle', { defaultValue: 'Initiatieven' }), cur.initiativeCount],
              [t('dashboard.groei', { defaultValue: 'Groei' }), cur.groeiCount],
              [t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' }), cur.gdCount],
            ].map(([l, v], i) => (
              <div key={String(l)} className={cn('px-6 py-3 max-lg:px-4', i > 0 && 'border-l border-border max-sm:border-l-0 max-sm:border-t')}>
                <small className="block text-[12.5px] text-muted-foreground">{l}</small>
                <b className="text-xl font-semibold tracking-[-0.02em] text-foreground">{v}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-12 items-start gap-3 lg:gap-4">
          <div className="col-span-12 flex min-w-0 flex-col gap-3 lg:gap-4 xl:col-span-5">
            <div ref={mapRef}>
              <Card title={t('cityDetailsTab.mapTitle', { defaultValue: 'Locatie' })} className="h-[520px]" footer={<BinLegend title={t('dashboard.a.perGemeente', { defaultValue: 'Initiatieven per gemeente' })} />}>
                <GemeenteMap
                  className="min-h-0 flex-1"
                  ariaLabel={t('cityDetailsTab.mapTitle', { defaultValue: 'Locatie' })}
                  province={slug}
                  highlight={codeOf(cur)}
                  zoomable={false}
                  fill={(code) => binColor(byCode.get(code)?.initiativeCount)}
                  tip={(code, n) => {
                    const c = byCode.get(code);
                    return {
                      title: n,
                      image: c?.node.avatarUrl ? proxyImageUrl(c.node.avatarUrl) : null,
                      rows: [
                        [t('dashboard.groei', { defaultValue: 'Groei' }), c?.groeiCount ?? 0],
                        [t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' }), c?.gdCount ?? 0],
                      ],
                    };
                  }}
                  onClick={(code) => {
                    const c = byCode.get(code);
                    if (c) onSelect(c.id);
                  }}
                  labels={labels}
                />
              </Card>
            </div>
            {under && cloudCard}
          </div>
          <div ref={listRef} className="col-span-12 min-w-0 xl:col-span-7">
            <Card
              title={`${t('cityDetailsTab.initiativesTitle', { defaultValue: 'Initiatieven' })} (${cur.initiativeCount})`}
              source={
                gd.length
                  ? `${t('dashboard.a.sourceSpaces', { defaultValue: 'Op basis van de Spaces in de monitor' })} + ${t('dashboard.a.sourceGd', { defaultValue: 'GemeenteDelers-initiatieven' })}`
                  : t('dashboard.a.sourceSpaces', { defaultValue: 'Op basis van de Spaces in de monitor' })
              }
            >
              {cur.initiatives.length ? (
                <div className="-mx-2 flex flex-col">
                  {[...groei.sort((a, b) => (rowById.get(b.id)?.phase?.nr ?? -1) - (rowById.get(a.id)?.phase?.nr ?? -1)), ...gd].map((i) => {
                    const node: GraphNode | undefined = nodeById.get(i.id);
                    const row = rowById.get(i.id);
                    const body = (
                      <>
                        <InitiativeMark node={node} name={i.name} size={32} />
                        <span className="min-w-0 flex-1">
                          <b className="block leading-snug font-semibold text-foreground">{i.name}</b>
                          <small className="block text-[12.5px] leading-snug text-muted-foreground">
                            {i.kind === 'gd' ? `GemeenteDelers` : (node?.tagline ?? t('dashboard.a.groeiInitiative', { defaultValue: 'Groei-initiatief' }))}
                          </small>
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {[...i.vng2030.map((v) => shortCat(v)), ...i.nds.map((v) => shortCat(v))].map((v) => (
                              <span key={v} className="rounded-full bg-muted px-2.5 py-0.5 text-[12.5px] leading-snug text-muted-foreground">
                                {v}
                              </span>
                            ))}
                          </span>
                        </span>
                        {row?.phase && <span className="shrink-0 rounded-full border border-[#cbd5e1] bg-card px-2.5 py-0.5 text-[12.5px] text-muted-foreground">{row.phase.label}</span>}
                      </>
                    );
                    return i.kind === 'groei' ? (
                      <button key={i.id} type="button" onClick={() => openSpace(i.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted">
                        {body}
                      </button>
                    ) : (
                      <div key={i.id} className="flex w-full items-center gap-2.5 px-2 py-2">
                        {body}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">{t('cityDetailsTab.noInitiatives')}</span>
              )}
            </Card>
          </div>
          {!under && cloudCard}
        </div>
      </div>
    </TipProvider>
  );
}
