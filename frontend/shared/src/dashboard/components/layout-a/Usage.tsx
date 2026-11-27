import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { cn, proxyImageUrl, useAppConfig, useIsCompact } from '@ea/shared';
import { useCityRows, useCoreLoadState, useGraphDataset } from '../../data/derive/index.js';
import { useSelectionContext } from '../../hooks/SelectionContext.js';
import type { CityRow } from '../../utils/cities.js';
import { Card, TipProvider } from './primitives.js';
import { BinLegend, binColor, GemeenteMap, useCodeOf, type MapLabel } from './GemeenteMap.js';
import { CITY_LABELS, GemeenteMark, InitiativeMark } from './InitiativeA.js';

const GROEI = 'var(--series-groei)';
const GD = 'var(--series-gd)';
const plain = (n: string) => n.replace(/^gemeente\s+/i, '');
type Show = 'all' | 'groei' | 'gd';

const PROVINCES: [string, string][] = [
  ['groningen', 'Groningen'],
  ['fryslan', 'Fryslân'],
  ['drenthe', 'Drenthe'],
  ['overijssel', 'Overijssel'],
  ['flevoland', 'Flevoland'],
  ['gelderland', 'Gelderland'],
  ['utrecht', 'Utrecht'],
  ['noord-holland', 'Noord-Holland'],
  ['zuid-holland', 'Zuid-Holland'],
  ['zeeland', 'Zeeland'],
  ['noord-brabant', 'Noord-Brabant'],
  ['limburg', 'Limburg'],
];

/**
 * Layout A Gebruiksverkenner: every gemeente shaded by how many initiatives it takes part
 * in (Alle / Groei / GemeenteDelers), zoomable, with the side list ranking the initiatives
 * in use in the area on screen. Clicking a gemeente focuses it: the list then shows its
 * initiatives and a way to its profile. Derived from the same city rows as the Gemeenten
 * table, so the numbers agree everywhere.
 */
export function UsageA() {
  const { t } = useTranslation();
  const { eventPrefix } = useAppConfig();
  const compact = useIsCompact();
  const { state } = useSelectionContext();
  const cities = useCityRows();
  const dataset = useGraphDataset();
  const { loading } = useCoreLoadState();
  const [show, setShow] = useState<Show>('all');
  const [province, setProvince] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [inView, setInView] = useState<Set<string>>(new Set());
  const [resetKey, setResetKey] = useState(0);

  const openSpace = (spaceId: string) => window.dispatchEvent(new CustomEvent(`${eventPrefix}:openSpace`, { detail: { spaceId } }));
  const openCity = (cityId: string) => window.dispatchEvent(new CustomEvent(`${eventPrefix}:openCity`, { detail: { cityId } }));

  const keep = (kind: 'groei' | 'gd') => show === 'all' || show === kind;
  const codeOf = useCodeOf(cities);
  const byCode = useMemo(() => new Map(cities.map((c) => [codeOf(c), c] as const).filter((e): e is [string, CityRow] => !!e[0])), [cities, codeOf]);
  const count = (c: CityRow | undefined) => (c ? c.initiatives.filter((i) => keep(i.kind)).length : 0);
  const nodes = useMemo(() => new Map((dataset?.nodes ?? []).map((n) => [n.id, n])), [dataset]);

  const visible = [...inView];
  const participating = visible.filter((code) => count(byCode.get(code)) > 0).length;

  // Initiatives in use in the area on screen, by how many gemeenten in view use them.
  const ranking = useMemo(() => {
    const m = new Map<string, { id: string; name: string; kind: 'groei' | 'gd'; n: number }>();
    for (const code of inView) {
      const c = byCode.get(code);
      if (!c) continue;
      for (const i of c.initiatives) {
        if (!keep(i.kind)) continue;
        const e = m.get(i.id) ?? { id: i.id, name: i.name, kind: i.kind, n: 0 };
        e.n++;
        m.set(i.id, e);
      }
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'nl'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, byCode, show]);

  const focused = focus ? byCode.get(focus) : undefined;
  const labels: MapLabel[] = cities
    .filter((c) => codeOf(c))
    .map((c) => ({ code: codeOf(c)!, text: plain(c.name), always: CITY_LABELS.includes(plain(c.name)), population: c.population ?? 0 }));

  const reset = () => {
    setProvince('');
    setShow('all');
    setFocus(null);
    setResetKey((k) => k + 1);
  };

  const segBtn = (key: Show, label: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={show === key}
      onClick={() => setShow(key)}
      className={cn('h-7 rounded-md px-[11px] text-[13px] font-medium whitespace-nowrap', show === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground', compact && 'h-10 flex-1')}
    >
      {label}
    </button>
  );

  const list = focused ? (
    <>
      <div className="mb-3.5 flex items-start gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <GemeenteMark node={focused.node} name={focused.name} size={32} />
          <span className="min-w-0">
            <h3 className="text-[14.5px] font-semibold text-foreground">{plain(focused.name)}</h3>
            <small className="text-[12.5px] text-muted-foreground">
              {focused.provinceName} · {focused.population?.toLocaleString('nl-NL') ?? '—'} {t('dashboard.a.inhabitants', { defaultValue: 'inwoners' }).toLowerCase()}
            </small>
          </span>
        </span>
        <button type="button" onClick={() => setFocus(null)} className="h-[30px] rounded-md border border-[#cbd5e1] bg-card px-2.5 text-[13px] font-medium hover:bg-muted">
          {t('usageExplorer.a.clear', { defaultValue: 'Wissen' })}
        </button>
      </div>
      <button type="button" onClick={() => openCity(focused.id)} className="mb-3 inline-flex h-9 items-center self-start rounded-lg border border-[#cbd5e1] bg-card px-3.5 text-sm font-medium hover:bg-muted">
        {t('usageExplorer.a.openProfile', { defaultValue: 'Gemeenteprofiel openen' })}
      </button>
      <div className="-mx-2 flex flex-col">
        {focused.initiatives.filter((i) => keep(i.kind)).length ? (
          focused.initiatives
            .filter((i) => keep(i.kind))
            .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'nl') : a.kind === 'groei' ? -1 : 1))
            .map((i) => (
              <Row key={i.id} name={i.name} sub={i.kind === 'groei' ? 'Groei' : 'GemeenteDelers'} node={nodes.get(i.id)} onClick={i.kind === 'groei' ? () => openSpace(i.id) : undefined} />
            ))
        ) : (
          <span className="px-2 text-sm text-muted-foreground">{t('usageExplorer.a.none', { defaultValue: 'Deze gemeente doet in de huidige selectie aan geen enkel initiatief mee.' })}</span>
        )}
      </div>
    </>
  ) : (
    <>
      <div className="mb-3.5">
        <h3 className="text-[14.5px] font-semibold text-foreground">{t('usageExplorer.a.inUse', { defaultValue: 'Initiatieven in gebruik in dit gebied' })}</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{t('usageExplorer.a.inUseSub', { defaultValue: 'Zoom of verschuif de kaart om het gebied te wijzigen.' })}</p>
      </div>
      <div className="-mx-2 flex flex-col">
        {ranking.slice(0, 50).map((r) => (
          <Row
            key={r.id}
            name={r.name}
            sub={`${r.n} van ${visible.length} in beeld`}
            node={nodes.get(r.id)}
            onClick={r.kind === 'groei' ? () => openSpace(r.id) : undefined}
            bar={<span className="block h-3.5 w-14 shrink-0"><i className="block h-full rounded-r" style={{ width: `${(r.n / (ranking[0]?.n || 1)) * 100}%`, background: r.kind === 'groei' ? GROEI : GD }} /></span>}
          />
        ))}
        {!ranking.length && <span className="px-2 text-sm text-muted-foreground">{t('usageExplorer.a.empty', { defaultValue: 'In het zichtbare gebied zijn geen initiatieven in gebruik.' })}</span>}
        {ranking.length > 50 && <p className="px-2 py-2 text-[12.5px] text-muted-foreground">+{ranking.length - 50} meer</p>}
      </div>
    </>
  );

  return (
    <TipProvider>
      <div className="mx-auto max-w-[1560px]">
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-[1_1_320px]">
            <h1 className="text-2xl font-semibold tracking-[-0.015em] text-foreground">{t('tabs.usage', { defaultValue: 'Gebruiksverkenner' })}</h1>
            <p className="mt-0.5 text-[14px] text-muted-foreground">
              {visible.length} {t('usageExplorer.a.inView', { defaultValue: 'gemeenten in beeld' })} · {participating} {t('usageExplorer.a.participate', { defaultValue: 'doen mee' })}
            </p>
          </div>
          <div className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-2', compact && 'w-full')}>
            {state.includeInitiatives && (
              <div className={cn('inline-flex gap-0.5 rounded-lg bg-[#e8eef5] p-[3px]', compact && 'flex w-full')} role="group" aria-label={t('usageExplorer.a.show', { defaultValue: 'Toon' })}>
                {segBtn('all', t('usageExplorer.a.all', { defaultValue: 'Alle initiatieven' }))}
                {segBtn('groei', t('dashboard.groei', { defaultValue: 'Groei' }))}
                {segBtn('gd', t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' }))}
              </div>
            )}
            <label className={cn('flex items-center gap-2 text-[13px] text-muted-foreground', compact && 'flex-1')}>
              {t('usageExplorer.a.province', { defaultValue: 'Provincie' })}
              <select
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value);
                  setFocus(null);
                }}
                className={cn('h-[34px] rounded-md border border-border bg-card px-2 text-[13px] text-foreground', compact && 'h-11 flex-1 text-[15px]')}
              >
                <option value="">{t('usageExplorer.a.allProvinces', { defaultValue: 'Heel Nederland' })}</option>
                {PROVINCES.map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={reset} className={cn('inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-card px-3 text-[13px] font-medium hover:bg-muted', compact && 'h-11')}>
              <RotateCcw className="h-[15px] w-[15px]" aria-hidden />
              {t('usageExplorer.a.reset', { defaultValue: 'Weergave herstellen' })}
            </button>
          </div>
        </div>

        <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_336px]')}>
          <Card
            className={cn(compact ? 'h-[500px]' : 'h-[calc(100dvh-230px)] min-h-[600px]')}
            title={t('usageExplorer.a.mapTitle', { defaultValue: 'Initiatieven per gemeente' })}
            footer={
              <>
                <BinLegend title={t('dashboard.a.perGemeente', { defaultValue: 'Initiatieven per gemeente' })} />
                <span className="flex-1" />
                {!compact && <span>{t('dashboard.a.zoomHint', { defaultValue: 'Gebruik ⌘ + scrollen om in te zoomen' })}</span>}
              </>
            }
          >
            {loading && !dataset ? (
              <div className="grid flex-1 place-items-center text-sm text-muted-foreground">{t('states.loading', { defaultValue: 'Laden…' })}</div>
            ) : (
              <GemeenteMap
                key={resetKey}
                className="min-h-0 flex-1"
                ariaLabel={t('usageExplorer.a.mapTitle', { defaultValue: 'Initiatieven per gemeente' })}
                province={province || null}
                highlight={focus}
                fill={(code) => binColor(count(byCode.get(code)))}
                tip={(code, name) => {
                  const c = byCode.get(code);
                  return {
                    title: name,
                    image: c?.node.avatarUrl ? proxyImageUrl(c.node.avatarUrl) : null,
                    initial: name[0],
                    lines: [c?.provinceName ?? ''].filter(Boolean),
                    rows: [
                      [t('dashboard.groei', { defaultValue: 'Groei' }), c?.groeiCount ?? 0],
                      ...(state.includeInitiatives ? ([[t('dashboard.gemeenteDelers', { defaultValue: 'GemeenteDelers' }), c?.gdCount ?? 0]] as [string, number][]) : []),
                      [t('dashboard.a.inhabitants', { defaultValue: 'Inwoners' }), c?.population?.toLocaleString('nl-NL') ?? '—'],
                    ],
                  };
                }}
                onClick={(code) => setFocus((f) => (f === code ? null : code))}
                labels={labels}
                onView={setInView}
              />
            )}
          </Card>
          <section className={cn('flex min-w-0 flex-col rounded-[10px] border border-border bg-card px-5 py-[18px]', !compact && 'h-[calc(100dvh-230px)] min-h-[600px] overflow-y-auto')}>
            {list}
          </section>
        </div>
      </div>
    </TipProvider>
  );
}

function Row({ name, sub, node, onClick, bar }: { name: string; sub: string; node: ReturnType<Map<string, import('@server/types/graph.js').GraphNode>['get']>; onClick?: () => void; bar?: React.ReactNode }) {
  const body = (
    <>
      <InitiativeMark node={node} name={name} size={32} />
      <span className="min-w-0 flex-1">
        <b className="block leading-snug font-semibold text-foreground">{name}</b>
        <small className="block text-[12.5px] text-muted-foreground">{sub}</small>
      </span>
      {bar}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted">
      {body}
    </button>
  ) : (
    <div className="flex w-full items-center gap-2.5 px-2 py-2">{body}</div>
  );
}
