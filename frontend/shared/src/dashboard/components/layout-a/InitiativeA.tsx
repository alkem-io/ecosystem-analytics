import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { cn, proxyImageUrl, SafeImage, useAppConfig, useIsCompact } from '@ea/shared';
import type { GraphDataset, GraphNode } from '@server/types/graph.js';
import type { InitiativeRow } from '../../utils/initiatives.js';
import type { CityRow } from '../../utils/cities.js';
import { Card, Legend, TipProvider } from './primitives.js';
import { GemeenteMap, useCodeOf, type MapLabel } from './GemeenteMap.js';
import { Switcher } from './Switcher.js';

const SPACE_TYPES = new Set(['SPACE_L0', 'SPACE_L1', 'SPACE_L2']);
const LEAD = '#1b3560';

export const initialsOf = (name: string) =>
  name
    .replace(/^gemeente\s+/i, '')
    .replace(/\(.*\)/, '')
    .replace(/[^\p{L}\d ]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Square-ish initiative mark: the Space avatar, else its initials. */
export function InitiativeMark({ node, name, size = 30, className }: { node?: GraphNode | null; name: string; size?: number; className?: string }) {
  const src = node?.avatarUrl ? proxyImageUrl(node.avatarUrl) : null;
  const box = { width: size, height: size };
  return (
    <SafeImage
      src={src}
      alt=""
      entityUrl={node?.url ?? null}
      entityName={name}
      entityType={node?.type ?? 'SPACE_L0'}
      className={cn('shrink-0 rounded-[7px] border border-border bg-card object-cover', className)}
      style={box}
      fallback={
        <span
          className={cn('grid shrink-0 place-items-center rounded-[7px] bg-[#e7edf7] font-semibold text-[#2c4f8a]', className)}
          style={{ ...box, fontSize: size * 0.36 }}
        >
          {initialsOf(name)}
        </span>
      }
    />
  );
}

/** Round gemeente logo, else its first letter. */
export function GemeenteMark({ node, name, size = 30 }: { node?: GraphNode | null; name: string; size?: number }) {
  const src = node?.avatarUrl ? proxyImageUrl(node.avatarUrl) : null;
  return (
    <SafeImage
      src={src}
      alt=""
      entityUrl={node?.url ?? null}
      entityName={name}
      entityType="ORGANIZATION"
      className="shrink-0 rounded-full border border-border bg-card object-cover"
      style={{ width: size, height: size }}
      fallback={
        <span className="grid shrink-0 place-items-center rounded-full bg-[#eef2f6] font-semibold text-[#4a6072]" style={{ width: size, height: size, fontSize: size * 0.4 }}>
          {name.replace(/^gemeente\s+/i, '')[0]}
        </span>
      }
    />
  );
}

/** Big Dutch cities: always labelled on the national map. */
export const CITY_LABELS = ['Amsterdam', 'Rotterdam', 'Den Haag', "'s-Gravenhage", 'Utrecht', 'Eindhoven', 'Groningen', 'Leeuwarden', 'Zwolle', 'Maastricht', 'Arnhem', 'Middelburg', 'Assen', 'Lelystad'];

export function InitiativeA({
  spaces,
  selected,
  onSelect,
  dataset,
  node,
  gemeentes,
  rows,
  cityRows,
  loading,
}: {
  spaces: { nameId: string; displayName: string }[];
  selected: string | null;
  onSelect: (nameId: string) => void;
  dataset: GraphDataset | null;
  node: GraphNode | null;
  gemeentes: GraphNode[];
  rows: InitiativeRow[];
  cityRows: CityRow[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const { eventPrefix } = useAppConfig();
  const compact = useIsCompact();
  const [province, setProvince] = useState<string>('');

  const openCity = (cityId: string) => window.dispatchEvent(new CustomEvent(`${eventPrefix}:openCity`, { detail: { cityId } }));
  const goTab = (tab: string) => window.dispatchEvent(new CustomEvent(`${eventPrefix}:openTab`, { detail: { tab } }));

  const nodeByNameId = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of dataset?.nodes ?? []) if (SPACE_TYPES.has(n.type) && n.nameId) m.set(n.nameId, n);
    return m;
  }, [dataset]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const cityById = useMemo(() => new Map(cityRows.map((c) => [c.id, c])), [cityRows]);

  // Trekkers: gemeenten holding the LEAD role on this initiative.
  const leads = useMemo(() => {
    const s = new Set<string>();
    if (!dataset || !node) return s;
    for (const e of dataset.edges)
      if (e.type === 'LEAD') {
        if (e.sourceId === node.id) s.add(e.targetId);
        if (e.targetId === node.id) s.add(e.sourceId);
      }
    return s;
  }, [dataset, node]);

  const row = node ? rowById.get(node.id) : undefined;
  const name = spaces.find((s) => s.nameId === selected)?.displayName ?? node?.displayName ?? '';
  const provinces = useMemo(() => {
    const m = new Map<string, { slug: string; name: string; n: number }>();
    for (const g of gemeentes) {
      const c = cityById.get(g.id);
      const slug = provinceSlug(g.provinceName);
      if (!slug || !c) continue;
      const e = m.get(slug) ?? { slug, name: g.provinceName!, n: 0 };
      e.n++;
      m.set(slug, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  }, [gemeentes, cityById]);
  const shown = province ? gemeentes.filter((g) => provinceSlug(g.provinceName) === province) : gemeentes;
  const inh = shown.reduce((s, g) => s + (cityById.get(g.id)?.population ?? 0), 0);

  // Map: which CBS code is which gemeente node.
  const cityCode = useCodeOf(cityRows);
  const codeOf = (g: GraphNode) => {
    const c = cityById.get(g.id);
    return c ? cityCode(c) : null;
  };
  const participants = new Map<string, GraphNode>();
  for (const g of gemeentes) {
    const c = codeOf(g);
    if (c) participants.set(c, g);
  }
  const groeiFill = 'var(--series-groei)';
  const labels: MapLabel[] = cityRows
    .filter((c) => cityCode(c))
    .map((c) => {
      const text = c.name.replace(/^gemeente\s+/i, '');
      return { code: cityCode(c)!, text, always: CITY_LABELS.includes(text), population: c.population ?? 0 };
    });

  const groups = [
    {
      label: t('switcher.groei', { defaultValue: 'Groei-initiatieven' }),
      items: spaces
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'nl'))
        .map((s) => {
          const n = nodeByNameId.get(s.nameId);
          const r = n ? rowById.get(n.id) : undefined;
          return {
            key: s.nameId,
            name: s.displayName,
            sub: `${r?.phase?.label ?? t('switcher.noPhase', { defaultValue: 'Geen fase' })} · ${r?.gemeentes.length ?? 0} ${t('dashboard.a.gemeenten', { defaultValue: 'gemeenten' }).toLowerCase()}`,
            avatar: <InitiativeMark node={n} name={s.displayName} />,
          };
        }),
    },
  ];

  return (
    <TipProvider>
      <div className="mx-auto max-w-[1560px]">
        <Switcher
          crumb={t('tabs.initiatives', { defaultValue: 'Initiatieven' })}
          onCrumb={() => goTab('initiatives')}
          groups={groups}
          current={selected}
          onPick={onSelect}
          placeholder={t('switcher.searchInitiative', { defaultValue: 'Zoek een initiatief' })}
          noun={t('switcher.initiatives', { defaultValue: 'initiatieven' })}
        />

        {/* Hero */}
        <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
          {node?.bannerUrl && (
            <div className="aspect-[6/1] max-h-[200px] w-full bg-[#e8eef5] bg-cover bg-center" style={{ backgroundImage: `url(${proxyImageUrl(node.bannerUrl)})` }} />
          )}
          <div className={cn('flex flex-wrap items-start gap-4 px-6 pt-[18px] pb-5', compact && 'gap-3 px-4 pt-3.5 pb-4')}>
            <InitiativeMark
              node={node}
              name={name}
              size={compact ? 56 : 68}
              className={cn('rounded-[14px]', node?.bannerUrl && (compact ? '-mt-[42px]' : '-mt-12'), node?.bannerUrl && 'border-[3px] border-white shadow')}
            />
            <div className="min-w-0 flex-[1_1_360px]">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-[-0.015em] text-foreground">{name}</h1>
                <span className="rounded-full bg-[#e7edf7] px-2.5 py-0.5 text-[12.5px] text-[#2c4f8a]">{t('dashboard.groei', { defaultValue: 'Groei' })}</span>
              </div>
              {node?.tagline && <p className="mt-1 max-w-[70ch] text-[15px] text-muted-foreground">{node.tagline}</p>}
            </div>
            {node?.url && (
              <a href={node.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cbd5e1] bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted">
                {t('details.openOnAlkemio', { defaultValue: 'Open op Alkemio' })}
                <ExternalLink className="h-[15px] w-[15px]" aria-hidden />
              </a>
            )}
          </div>
          <div className="grid grid-cols-3 border-t border-border">
            <Fact label={t('details.factGemeenten', { defaultValue: 'Deelnemende gemeenten' })} value={String(gemeentes.length)} first />
            <Fact
              label={t('dashboard.a.inhabitants', { defaultValue: 'Inwoners' })}
              value={inh ? `${(gemeentes.reduce((s, g) => s + (cityById.get(g.id)?.population ?? 0), 0) / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln` : '—'}
            />
            <Fact label={t('details.factMembers', { defaultValue: 'Leden' })} value={row?.members != null ? String(row.members) : '—'} />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3 lg:gap-4">
          <Card
            className="col-span-12 min-h-[640px] xl:col-span-9"
            title={t('details.mapTitle', { defaultValue: 'Deelnemende gemeenten op de kaart' })}
            subtitle={`${shown.length} ${shown.length === 1 ? 'gemeente' : 'gemeenten'}${province ? ` in ${provinces.find((p) => p.slug === province)?.name ?? ''}` : ''}`}
            tools={
              provinces.length > 0 && (
                <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  {t('details.filterProvince', { defaultValue: 'Provincie' })}
                  <select value={province} onChange={(e) => setProvince(e.target.value)} className="h-[34px] rounded-md border border-border bg-card px-2 text-[13px] text-foreground">
                    <option value="">{t('details.allProvinces', { defaultValue: 'Alle provincies' })}</option>
                    {provinces.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name} ({p.n})
                      </option>
                    ))}
                  </select>
                </label>
              )
            }
            footer={
              <>
                <Legend items={[...(leads.size ? [{ label: t('details.lead', { defaultValue: 'Trekker' }), color: LEAD }] : []), { label: t('details.participant', { defaultValue: 'Deelnemer' }), color: groeiFill }]} />
                <span className="flex-1" />
                {!compact && <span>{t('dashboard.a.zoomHint', { defaultValue: 'Gebruik ⌘ + scrollen om in te zoomen' })}</span>}
              </>
            }
          >
            {loading ? (
              <div className="grid flex-1 place-items-center text-sm text-muted-foreground">{t('details.loading')}</div>
            ) : (
              <GemeenteMap
                className={cn('flex-1', compact ? 'min-h-[440px]' : 'min-h-[540px]')}
                ariaLabel={t('details.mapTitle', { defaultValue: 'Deelnemende gemeenten op de kaart' })}
                province={province || null}
                fill={(code) => {
                  const g = participants.get(code);
                  return g ? (leads.has(g.id) ? LEAD : groeiFill) : '#e9eef3';
                }}
                tip={(code, n) => {
                  const g = participants.get(code);
                  return { title: n, lines: [g ? (leads.has(g.id) ? 'Trekker' : 'Deelnemer') : 'Doet niet mee'] };
                }}
                onClick={(code) => {
                  const g = participants.get(code);
                  if (g) openCity(g.id);
                  else {
                    const c = cityRows.find((x) => cityCode(x) === code);
                    if (c) openCity(c.id);
                  }
                }}
                markers={shown
                  .filter((g) => codeOf(g))
                  .map((g) => ({
                    code: codeOf(g)!,
                    image: g.avatarUrl ? proxyImageUrl(g.avatarUrl) : null,
                    initial: g.displayName.replace(/^gemeente\s+/i, '')[0] ?? '?',
                    emphasis: leads.has(g.id),
                    tip: {
                      title: g.displayName.replace(/^gemeente\s+/i, ''),
                      image: g.avatarUrl ? proxyImageUrl(g.avatarUrl) : null,
                      lines: [g.provinceName ?? '', leads.has(g.id) ? 'Trekker' : 'Deelnemer'].filter(Boolean),
                    },
                    onClick: () => openCity(g.id),
                  }))}
                labels={province ? labels : []}
              />
            )}
          </Card>

          <Card className="col-span-12 xl:col-span-3" title={t('details.classifications', { defaultValue: 'Classificaties' })}>
            <Classifications node={node} row={row} compact={compact} />
          </Card>

          <Card className="col-span-12" title={`${t('details.gemeentesTitle', { defaultValue: 'Deelnemende gemeenten' })} (${shown.length})`}>
            {shown.length ? (
              <div className="grid grid-cols-1 gap-x-3.5 sm:grid-cols-[repeat(auto-fill,minmax(188px,1fr))]">
                {shown.map((g) => (
                  <button key={g.id} type="button" onClick={() => openCity(g.id)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                    <GemeenteMark node={g} name={g.displayName} size={32} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-semibold text-foreground">{g.displayName.replace(/^gemeente\s+/i, '')}</b>
                      <small className="block text-[12.5px] text-muted-foreground">{leads.has(g.id) ? t('details.lead', { defaultValue: 'Trekker' }) : g.provinceName}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{t('details.noGemeentes')}</span>
            )}
          </Card>
        </div>
      </div>
    </TipProvider>
  );
}

function Fact({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <div className={cn('px-6 py-3 max-lg:px-4', !first && 'border-l border-border')}>
      <small className="block text-[12.5px] text-muted-foreground">{label}</small>
      <b className="text-xl font-semibold tracking-[-0.02em] text-foreground">{value}</b>
    </div>
  );
}

function Classifications({ node, row, compact }: { node: GraphNode | null; row: InitiativeRow | undefined; compact: boolean }) {
  const { t } = useTranslation();
  const groups = node?.classifications ?? [];
  const phase = row?.phase;
  return (
    <div className="flex flex-col gap-3">
      {phase && (
        <div className={cn('mb-1', compact && 'mb-0')}>
          <div className="flex gap-1">
            {Array.from({ length: Math.max(5, phase.nr + 1) }).map((_, i) => (
              <i key={i} className={cn('block h-1.5 flex-1 rounded-[3px]', i < phase.nr ? 'bg-[#a9bac7]' : i === phase.nr ? 'bg-primary' : 'bg-[#e8eef5]')} />
            ))}
          </div>
          <span className="mt-1.5 block text-center text-xs font-semibold text-foreground">{phase.label}</span>
        </div>
      )}
      <dl className="flex flex-col gap-2.5 text-[13.5px]">
        {groups.map((g) => (
          <div key={g.id}>
            <dt className="text-muted-foreground">{g.label}</dt>
            <dd className="mt-0.5 flex flex-wrap gap-1.5">
              {g.values.length ? (
                g.values.map((v) => (
                  <span key={v.id} className="rounded-full bg-muted px-2.5 py-0.5 text-[12.5px] leading-snug text-muted-foreground">
                    {v.label}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
        ))}
        {!groups.length && <span className="text-muted-foreground">{t('details.noClassifications', { defaultValue: 'Nog niet ingedeeld' })}</span>}
      </dl>
    </div>
  );
}

const PROVINCES: Record<string, string> = {
  Groningen: 'groningen',
  Fryslân: 'fryslan',
  Friesland: 'fryslan',
  Drenthe: 'drenthe',
  Overijssel: 'overijssel',
  Flevoland: 'flevoland',
  Gelderland: 'gelderland',
  Utrecht: 'utrecht',
  'Noord-Holland': 'noord-holland',
  'Zuid-Holland': 'zuid-holland',
  Zeeland: 'zeeland',
  'Noord-Brabant': 'noord-brabant',
  Limburg: 'limburg',
};
export const provinceSlug = (name: string | null | undefined) => (name ? (PROVINCES[name] ?? null) : null);
