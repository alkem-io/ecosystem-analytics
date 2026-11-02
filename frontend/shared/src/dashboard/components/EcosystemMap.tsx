import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { arc, select, zoom as d3Zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3';
import { proxyImageUrl } from '../../lib/imageProxy.js';
import { isImageFailed, markImageFailed } from '../../lib/badImageCache.js';
import { initials } from '../../lib/initials.js';
import type { EcoOrganisation, EcosystemModel } from '../utils/ecosystem.js';
import { INVOLVEMENT_TIERS, type EcosystemLayout, type InvolvementTier } from '../utils/ecosystem-layout.js';

export interface MapTransform {
  k: number;
  x: number;
  y: number;
}

export interface EcosystemMapProps {
  model: EcosystemModel;
  layout: EcosystemLayout;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  /** The sticky focus, set by clicking or by keyboard activation. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Stored viewport; `null` means "fit the whole map". */
  transform: MapTransform | null;
  onTransformChange: (t: MapTransform) => void;
  /** Bumped by the parent to request a fit-to-view. */
  fitNonce: number;
  labels: {
    title: string;
    lead: string;
    member: string;
    direct: string;
    viaSubspace: string;
    partOf: string;
    connector: string;
    /** How to move around the map without a pointer; read out on entering it. */
    keyboard: string;
    /** Ring names, drawn on the map when rings of involvement are on. */
    tiers: Record<InvolvementTier, string>;
  };
}

const ORG_R = 17;
const CONNECTOR_R = 26;
const CARD_W = 216;
const CARD_H = 58;
const ORCH_W = 236;
const ORCH_H = 68;
/** What an unrelated node and an unrelated edge fade to while something else has focus. */
const DIM_NODE = 0.12;
const DIM_EDGE = 0.05;
/** Resting opacities — faint enough that the shape reads before the wiring does. */
const REST_LEAD = 0.34;
const REST_MEMBER = 0.14;
const REST_PART_OF = 0.32;

/**
 * Cluster hues. Colour is a SECONDARY cue here and never the only one: the grouping is
 * carried by position (each cluster owns an angular sector), and edge types are told
 * apart by stroke width and dash pattern, not by colour (accessibility).
 */
const CLUSTER_HUES = [210, 28, 152, 280, 340, 48, 188, 320];

/**
 * The ecosystem map (feature 024).
 *
 * React owns this SVG — unlike `ForceGraph`, which hands its DOM to D3. Everything here
 * is a function of (model, layout, focus, transform), so the picture is reproducible and
 * the Playwright spec can assert against it. D3 is used for exactly two things: the zoom
 * behaviour, which writes a transform this component renders, and `arc` for the cluster
 * wedges.
 *
 * Reading order is deliberate and is what keeps 150 organisations legible:
 *
 *   1. clouds and cluster wedges — grouping, before anything is read
 *   2. edges, bundled and faint — the shape of the wiring, not its detail
 *   3. Spaces, then organisations — the things you actually click
 *   4. labels for whatever has focus — detail on demand, never all at once
 *
 * NOT a geographic map — no basemap, no projection, no Netherlands mask. Constitution
 * §VII does not apply here and nothing in this file may grow a tile layer.
 */
export function EcosystemMap({
  model,
  layout,
  hoverId,
  onHover,
  selectedId,
  onSelect,
  transform,
  onTransformChange,
  fitNonce,
  labels,
}: EcosystemMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState<Record<string, true>>({});

  // Measure so "fit to view" has real pixels to fit into.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(1, Math.floor(entry.contentRect.width)),
        height: Math.max(1, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitTransform = useMemo((): MapTransform => {
    const { minX, minY, maxX, maxY } = layout.bounds;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    if (size.width === 0 || size.height === 0) return { k: 1, x: 0, y: 0 };
    const k = Math.min(size.width / w, size.height / h, 2);
    return {
      k,
      x: (size.width - w * k) / 2 - minX * k,
      y: (size.height - h * k) / 2 - minY * k,
    };
  }, [layout.bounds, size.width, size.height]);

  // d3-zoom owns the gesture; React renders whatever transform it produces.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const behaviour = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        const t = event.transform;
        onTransformChange({ k: t.k, x: t.x, y: t.y });
      });
    zoomRef.current = behaviour;
    select(el).call(behaviour);
    return () => {
      select(el).on('.zoom', null);
      zoomRef.current = null;
    };
  }, [onTransformChange]);

  const applyTransform = useCallback((t: MapTransform) => {
    const el = svgRef.current;
    const behaviour = zoomRef.current;
    if (!el || !behaviour) return;
    select(el).call(behaviour.transform, zoomIdentity.translate(t.x, t.y).scale(t.k));
  }, []);

  // A stored viewport (returning from a detail tab) wins over the fit; otherwise fit
  // once the size is known.
  const restored = useRef(false);
  useEffect(() => {
    if (size.width === 0) return;
    if (transform && !restored.current) {
      restored.current = true;
      applyTransform(transform);
      return;
    }
    if (!transform) applyTransform(fitTransform);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, fitTransform, applyTransform]);

  // Parent-requested fit (the toolbar button).
  useEffect(() => {
    if (fitNonce > 0) applyTransform(fitTransform);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onHover(null);
      onSelect(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onHover, onSelect]);

  // ── keyboard ─────────────────────────────────────────────────────────────────
  // One Tab stop for the whole map (roving tabindex): 150 organisations as 150 Tab
  // presses would make the rest of the page unreachable. Inside, the arrows follow the
  // picture — along a ring by angle, and inward/outward to the nearest node of the
  // next ring.
  const nav = useMemo(() => buildNav(model, layout), [model, layout]);
  const [tabStop, setTabStop] = useState<string | null>(null);
  const [keyboardId, setKeyboardId] = useState<string | null>(null);
  const currentStop = tabStop && nav.byId.has(tabStop) ? tabStop : nav.first;
  const descId = useId();

  const focusNode = useCallback((id: string) => {
    const el = svgRef.current?.querySelector<SVGGElement>(`[data-nav-id="${CSS.escape(id)}"]`);
    el?.focus();
  }, []);

  const t = transform ?? fitTransform;

  // Keyboard focus that lands off-screen pans the map to it — otherwise arrowing along
  // a ring walks the focus out of sight.
  const reveal = useCallback(
    (id: string) => {
      const p = layout.spaces.get(id) ?? layout.orgs.get(id);
      if (!p || size.width === 0) return;
      const sx = t.x + p.x * t.k;
      const sy = t.y + p.y * t.k;
      const margin = 48;
      if (sx >= margin && sx <= size.width - margin && sy >= margin && sy <= size.height - margin) return;
      applyTransform({ k: t.k, x: size.width / 2 - p.x * t.k, y: size.height / 2 - p.y * t.k });
    },
    [layout, size.width, size.height, t.k, t.x, t.y, applyTransform],
  );

  const nodeHandlers = (id: string, onActivate: () => void) => ({
    'data-nav-id': id,
    tabIndex: id === currentStop ? 0 : -1,
    onMouseEnter: () => onHover(id),
    onMouseLeave: () => onHover(null),
    onFocus: (e: React.FocusEvent<SVGGElement>) => {
      setTabStop(id);
      onHover(id);
      if (e.currentTarget.matches(':focus-visible')) {
        setKeyboardId(id);
        reveal(id);
      }
    },
    onBlur: () => {
      onHover(null);
      setKeyboardId(null);
    },
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
        return;
      }
      const next = step(nav, id, e.key);
      if (next === undefined) return;
      e.preventDefault();
      if (next && next !== id) focusNode(next);
    },
  });

  // A sticky selection outranks a passing hover, so the reader can study one node's
  // neighbourhood while the pointer wanders off to read a label.
  const focusId = selectedId ?? hoverId;

  // What the current focus keeps lit: the node itself and everything it touches.
  const lit = useMemo(() => {
    if (!focusId) return null;
    const ids = new Set<string>([focusId]);
    const org = model.organisations.find((o) => o.id === focusId);
    if (org) {
      for (const c of org.connections) ids.add(c.spaceId);
      return ids;
    }
    for (const o of model.organisations) {
      if (o.connections.some((c) => c.spaceId === focusId)) ids.add(o.id);
    }
    for (const eco of model.ecosystems) {
      for (const link of eco.spaceLinks) {
        if (link.fromId === focusId) ids.add(link.toId);
        if (link.toId === focusId) ids.add(link.fromId);
      }
    }
    return ids;
  }, [focusId, model]);

  const isLit = (id: string) => !lit || lit.has(id);
  const dimmed = (id: string) => (isLit(id) ? 1 : DIM_NODE);
  const edgeAlpha = (a: string, b: string, rest: number) => {
    if (!lit) return rest;
    return lit.has(a) && lit.has(b) ? Math.min(1, rest * 3 + 0.5) : DIM_EDGE;
  };

  const activate = useCallback(
    (id: string) => onSelect(selectedId === id ? null : id),
    [onSelect, selectedId],
  );

  // Clicking anywhere that is not a node clears the selection — the same gesture every
  // graph view uses to mean "never mind".
  const onBackgroundClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!(e.target instanceof Element)) return;
      if (!e.target.closest('[data-node]')) onSelect(null);
    },
    [onSelect],
  );

  const wedge = useMemo(
    () =>
      arc<{ innerRadius: number; outerRadius: number; startAngle: number; endAngle: number }>()
        .innerRadius((d) => d.innerRadius)
        .outerRadius((d) => d.outerRadius)
        .startAngle((d) => d.startAngle + Math.PI / 2)
        .endAngle((d) => d.endAngle + Math.PI / 2)
        .padAngle(0.012)
        .cornerRadius(10),
    [],
  );

  const regionById = useMemo(
    () => new Map(layout.regions.map((r) => [r.id, r])),
    [layout.regions],
  );
  const orgById = useMemo(
    () => new Map(model.organisations.map((o) => [o.id, o])),
    [model.organisations],
  );

  /** Labels that would be unreadable when zoomed out are simply not drawn. */
  const showDetail = t.k >= 0.45;

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        className="h-full w-full"
        style={{ touchAction: 'none' }}
        role="group"
        aria-label={labels.title}
        aria-describedby={descId}
        data-testid="ecosystem-map"
        onClick={onBackgroundClick}
      >
        <desc id={descId}>{labels.keyboard}</desc>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {/* clouds ------------------------------------------------------------ */}
          {layout.regions.map((region) => (
            <g key={region.id} data-ecosystem={region.id}>
              {/*
                Theme-adaptive on purpose: `--primary` is the VNG navy, which all but
                disappears against the dark canvas (#0f172a). `--surface` and
                `--text-secondary` are both redefined per theme, so the cloud reads in
                either one (FR-022).
              */}
              <path
                className="eco-cloud"
                d={region.cloudPath}
                fill="var(--surface)"
                fillOpacity={0.7}
                stroke="var(--text-secondary)"
                strokeOpacity={0.45}
                strokeWidth={2}
                strokeDasharray="10 8"
              />
              <text
                x={region.cx}
                y={region.cy - regionTop(region, layout) - 32}
                textAnchor="middle"
                className="fill-[var(--foreground)]"
                fontSize={22}
                fontWeight={600}
              >
                {region.label}
              </text>
            </g>
          ))}

          {/* cluster wedges: the grouping, read before any single node ---------- */}
          {layout.clusters.map((cluster) => {
            const region = regionById.get(cluster.regionId);
            if (!region || cluster.orgIds.length === 0) return null;
            const hue = CLUSTER_HUES[cluster.colorIndex % CLUSTER_HUES.length];
            const focused = !lit || cluster.orgIds.some((id) => lit.has(id));
            const mid = (cluster.startAngle + cluster.endAngle) / 2;
            const deg = (mid * 180) / Math.PI;
            const flipped = deg > 90 || deg < -90;
            return (
              <g
                key={cluster.id}
                data-cluster={cluster.id}
                transform={`translate(${region.cx},${region.cy})`}
                opacity={focused ? 1 : 0.35}
              >
                <path
                  d={
                    wedge({
                      innerRadius: cluster.innerRadius,
                      outerRadius: cluster.outerRadius,
                      startAngle: cluster.startAngle,
                      endAngle: cluster.endAngle,
                    }) ?? undefined
                  }
                  fill={`hsl(${hue} 65% 52%)`}
                  fillOpacity={0.08}
                  stroke={`hsl(${hue} 65% 52%)`}
                  strokeOpacity={0.3}
                  strokeWidth={1}
                />
                {showDetail && cluster.orgIds.length >= 2 && (
                  <text
                    transform={`rotate(${deg}) translate(${cluster.outerRadius + 16},0)${
                      flipped ? ' rotate(180)' : ''
                    }`}
                    textAnchor={flipped ? 'end' : 'start'}
                    dominantBaseline="middle"
                    fontSize={13}
                    fontWeight={600}
                    fill={`hsl(${hue} 55% 45%)`}
                  >
                    {`${truncate(cluster.label, 26)} · ${cluster.orgIds.length}`}
                  </text>
                )}
              </g>
            );
          })}

          {/* rings of involvement: a guide per ring, named at the top ------------- */}
          {layout.regions.flatMap((region) =>
            region.tierRings.map(({ tier, radius }) => {
              // The guide runs through the gap in front of the ring, not through its
              // nodes; the name sits in the same gap, straight above the centre.
              const guide = radius - ROW_GAP_HINT;
              return (
                <g key={`${region.id}-${tier}`} data-tier={tier} pointerEvents="none">
                  <circle
                    cx={region.cx}
                    cy={region.cy}
                    r={guide}
                    fill="none"
                    stroke="var(--text-secondary)"
                    strokeOpacity={0.35}
                    strokeWidth={1}
                    strokeDasharray="3 7"
                  />
                  {showDetail && (
                    <text
                      x={region.cx}
                      y={region.cy - guide + 4}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={600}
                      letterSpacing="0.08em"
                      paintOrder="stroke"
                      stroke="var(--background)"
                      strokeWidth={5}
                      strokeLinejoin="round"
                      className="fill-[var(--text-secondary)] uppercase"
                    >
                      {labels.tiers[tier]}
                    </text>
                  )}
                </g>
              );
            }),
          )}

          {/* part-of links: always drawn, lightest stroke ---------------------- */}
          {model.ecosystems.flatMap((eco) =>
            eco.spaceLinks.map((link) => {
              const d = layout.spaceEdges.get(`${link.fromId}|${link.toId}`);
              if (!d) return null;
              return (
                <path
                  key={`${link.fromId}-${link.toId}`}
                  data-edge="partOf"
                  d={d}
                  fill="none"
                  stroke="var(--primary)"
                  strokeOpacity={edgeAlpha(link.fromId, link.toId, REST_PART_OF)}
                  strokeWidth={1.25}
                />
              );
            }),
          )}

          {/*
            Organisation connections, bundled. Two passes so a focused edge is never
            painted over by a faded one: everything at rest first, then whatever the
            focus lights up, on top.
          */}
          {[false, true].map((pass) =>
            model.organisations.flatMap((org) =>
              org.connections.map((c) => {
                const d = layout.orgEdges.get(`${org.id}|${c.spaceId}`);
                if (!d) return null;
                const on = Boolean(lit && lit.has(org.id) && lit.has(c.spaceId));
                if (on !== pass) return null;
                const rest = c.strength === 'lead' ? REST_LEAD : REST_MEMBER;
                return (
                  <path
                    key={`${pass}-${org.id}-${c.spaceId}`}
                    data-edge="org"
                    data-strength={c.strength}
                    data-provenance={c.provenance}
                    d={d}
                    fill="none"
                    stroke={c.strength === 'lead' ? 'var(--primary)' : 'var(--text-secondary)'}
                    strokeOpacity={edgeAlpha(org.id, c.spaceId, rest)}
                    strokeWidth={c.strength === 'lead' ? 2.5 : 1.25}
                    strokeLinecap="round"
                    strokeDasharray={c.provenance === 'viaSubspace' ? '6 6' : undefined}
                  />
                );
              }),
            ),
          )}

          {/* initiatives ------------------------------------------------------- */}
          {model.ecosystems.flatMap((eco) =>
            eco.initiatives.map((initiative) => {
              const p = layout.spaces.get(initiative.id);
              if (!p) return null;
              const on = focusId === initiative.id;
              const lines = wrap(initiative.name, 24, 2);
              return (
                <g
                  key={initiative.id}
                  data-node="space"
                  data-space={initiative.nameId}
                  data-role="initiative"
                  role="button"
                  aria-pressed={selectedId === initiative.id}
                  aria-label={initiative.name}
                  opacity={dimmed(initiative.id)}
                  className="cursor-pointer outline-none"
                  {...nodeHandlers(initiative.id, () => activate(initiative.id))}
                >
                  <rect
                    x={p.x - CARD_W / 2}
                    y={p.y - CARD_H / 2}
                    width={CARD_W}
                    height={CARD_H}
                    rx={10}
                    fill="var(--surface-raised)"
                    stroke={on ? 'var(--primary)' : 'var(--border)'}
                    strokeWidth={on ? 3 : 1}
                  />
                  {lines.map((lineText, i) => (
                    <text
                      key={lineText + i}
                      x={p.x}
                      y={p.y + 4 + (i - (lines.length - 1) / 2) * 16 - (initiative.orgCount > 0 ? 7 : 0)}
                      textAnchor="middle"
                      fontSize={14}
                      fontWeight={600}
                      className="fill-[var(--foreground)]"
                    >
                      {lineText}
                    </text>
                  ))}
                  {initiative.orgCount > 0 && (
                    <text
                      x={p.x}
                      y={p.y + CARD_H / 2 - 8}
                      textAnchor="middle"
                      fontSize={11}
                      className="fill-[var(--text-secondary)]"
                    >
                      {`· ${initiative.orgCount}`}
                    </text>
                  )}
                </g>
              );
            }),
          )}

          {/* orchestrator ------------------------------------------------------ */}
          {model.ecosystems.map((eco) => {
            if (!eco.orchestrator) return null;
            const p = layout.spaces.get(eco.orchestrator.id);
            if (!p) return null;
            const orch = eco.orchestrator;
            const on = focusId === orch.id;
            const lines = wrap(orch.name, 22, 2);
            return (
              <g
                key={orch.id}
                data-node="space"
                data-space={orch.nameId}
                data-role="orchestrator"
                role="button"
                aria-pressed={selectedId === orch.id}
                aria-label={orch.name}
                opacity={dimmed(orch.id)}
                className="cursor-pointer outline-none"
                {...nodeHandlers(orch.id, () => activate(orch.id))}
              >
                <rect
                  x={p.x - ORCH_W / 2}
                  y={p.y - ORCH_H / 2}
                  width={ORCH_W}
                  height={ORCH_H}
                  rx={12}
                  fill="var(--primary)"
                  stroke={on ? 'var(--foreground)' : 'var(--primary)'}
                  strokeWidth={on ? 3 : 2}
                />
                {lines.map((lineText, i) => (
                  <text
                    key={lineText + i}
                    x={p.x}
                    y={p.y + 6 + (i - (lines.length - 1) / 2) * 19}
                    textAnchor="middle"
                    fontSize={16}
                    fontWeight={700}
                    className="fill-[var(--primary-foreground)]"
                  >
                    {lineText}
                  </text>
                ))}
              </g>
            );
          })}

          {/* organisations ----------------------------------------------------- */}
          {model.organisations.map((org) => {
            const p = layout.orgs.get(org.id);
            if (!p) return null;
            const on = focusId === org.id;
            const r = org.isConnector ? CONNECTOR_R : ORG_R;
            const src = proxyImageUrl(org.logoUrl);
            const showImage = Boolean(src) && !failed[org.id] && !isImageFailed(src ?? org.logoUrl);
            // A Verbinder is named even at rest: it is the node the reader is looking
            // for, and hunting for it by hovering defeats the purpose.
            const named = on || (lit?.has(org.id) ?? false) || (org.isConnector && showDetail);
            return (
              <g
                key={org.id}
                data-node="org"
                data-org={org.id}
                data-connector={org.isConnector ? 'true' : 'false'}
                role="button"
                aria-pressed={selectedId === org.id}
                aria-label={orgAriaLabel(org, labels)}
                opacity={dimmed(org.id)}
                className="cursor-pointer outline-none"
                {...nodeHandlers(org.id, () => activate(org.id))}
              >
                <title>{org.name}</title>
                <clipPath id={`eco-clip-${org.id}`}>
                  <circle cx={p.x} cy={p.y} r={r - 2} />
                </clipPath>
                {org.isConnector && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 6}
                    fill="var(--primary)"
                    fillOpacity={on ? 0.28 : 0.14}
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill="var(--surface-raised)"
                  stroke={
                    on
                      ? 'var(--foreground)'
                      : org.isConnector
                        ? 'var(--primary)'
                        : 'var(--border)'
                  }
                  strokeWidth={on ? 3.5 : org.isConnector ? 3 : 1.5}
                />
                {showImage ? (
                  <image
                    href={src ?? undefined}
                    x={p.x - (r - 2)}
                    y={p.y - (r - 2)}
                    width={(r - 2) * 2}
                    height={(r - 2) * 2}
                    clipPath={`url(#eco-clip-${org.id})`}
                    preserveAspectRatio="xMidYMid slice"
                    onError={() => {
                      markImageFailed(src ?? org.logoUrl, {
                        displayName: org.name,
                        entityType: 'ORGANIZATION',
                        entityUrl: null,
                      });
                      setFailed((f) => ({ ...f, [org.id]: true }));
                    }}
                  />
                ) : (
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    className="fill-[var(--text-secondary)]"
                  >
                    {initials(org.name)}
                  </text>
                )}
                {named && (
                  <NodeLabel
                    x={p.x}
                    y={p.y + r + 6}
                    text={org.name}
                    strong={on}
                    org={orgById.get(org.id)}
                  />
                )}
              </g>
            );
          })}

          {/* keyboard focus, drawn last so nothing paints over it ------------- */}
          {keyboardId && <FocusRing id={keyboardId} model={model} layout={layout} />}
        </g>
      </svg>
    </div>
  );
}

/**
 * How far above its centre a region's drawing reaches — the title goes above that, or
 * it lands on the Verbinder band and the rings' names.
 */
function regionTop(region: EcosystemLayout['regions'][number], layout: EcosystemLayout): number {
  let top = region.connectorRing + CONNECTOR_R + 12;
  for (const c of layout.clusters) {
    if (c.regionId === region.id && c.orgIds.length > 0) top = Math.max(top, c.outerRadius);
  }
  return top;
}

/** Half the row gap: where a ring's guide runs, clear of the ring's own nodes. */
const ROW_GAP_HINT = 36;

/** Name plus role summary, so a screen reader hears what the line styles show. */
function orgAriaLabel(org: EcoOrganisation, labels: EcosystemMapProps['labels']): string {
  const leads = org.connections.filter((c) => c.strength === 'lead').length;
  const members = org.connections.length - leads;
  const via = org.connections.filter((c) => c.provenance === 'viaSubspace').length;
  const parts = [org.name];
  if (org.isConnector) parts.push(labels.connector);
  if (leads) parts.push(`${labels.lead} ×${leads}`);
  if (members) parts.push(`${labels.member} ×${members}`);
  if (via) parts.push(`${labels.viaSubspace} ×${via}`);
  return parts.join(', ');
}

/** The arrow-key graph: every node's ring and angle, rings ordered inside-out. */
interface Nav {
  first: string | null;
  byId: Map<string, { ring: string; angle: number }>;
  /** Ring key → node ids sorted clockwise. */
  rings: Map<string, string[]>;
  /** Region id → its ring keys, innermost first. */
  order: Map<string, string[]>;
}

function buildNav(model: EcosystemModel, layout: EcosystemLayout): Nav {
  const byId = new Map<string, { ring: string; angle: number }>();
  const rings = new Map<string, string[]>();
  const levels = new Map<string, Set<number>>();
  const add = (regionId: string, level: number, id: string, p: { x: number; y: number } | undefined) => {
    const region = layout.regions.find((r) => r.id === regionId) ?? layout.regions[0];
    if (!p || !region) return;
    const ring = `${region.id}|${level}`;
    // Clockwise from 12 o'clock, so "right" means what it looks like.
    const angle = (Math.atan2(p.y - region.cy, p.x - region.cx) + Math.PI * 2.5) % (Math.PI * 2);
    byId.set(id, { ring, angle });
    const list = rings.get(ring);
    if (list) list.push(id);
    else rings.set(ring, [id]);
    let set = levels.get(region.id);
    if (!set) levels.set(region.id, (set = new Set()));
    set.add(level);
  };

  for (const eco of model.ecosystems) {
    if (eco.orchestrator) add(eco.id, 0, eco.orchestrator.id, layout.spaces.get(eco.orchestrator.id));
    for (const i of eco.initiatives) add(eco.id, 1, i.id, layout.spaces.get(i.id));
  }
  for (const o of model.organisations) {
    const regionId = o.ecosystemIds[0] ?? layout.regions[0]?.id ?? '';
    const region = layout.regions.find((r) => r.id === regionId);
    let level = 3;
    if (o.isConnector) level = 2;
    else if (region && region.tierRings.length > 0) {
      const p = layout.orgs.get(o.id);
      const d = p ? Math.hypot(p.x - region.cx, p.y - region.cy) : 0;
      // The deepest ring whose start this organisation has reached.
      const tier = [...region.tierRings].reverse().find((r) => d >= r.radius - 1);
      level = 3 + (tier ? INVOLVEMENT_TIERS.indexOf(tier.tier) : 0);
    }
    add(regionId, level, o.id, layout.orgs.get(o.id));
  }

  for (const list of rings.values()) {
    list.sort((a, b) => byId.get(a)!.angle - byId.get(b)!.angle || (a < b ? -1 : 1));
  }
  const order = new Map<string, string[]>();
  for (const [regionId, set] of levels) {
    order.set(regionId, [...set].sort((a, b) => a - b).map((l) => `${regionId}|${l}`));
  }
  const firstRegion = layout.regions[0]?.id;
  const firstRing = firstRegion ? order.get(firstRegion)?.[0] : undefined;
  return { first: firstRing ? (rings.get(firstRing)?.[0] ?? null) : null, byId, rings, order };
}

/**
 * Where an arrow key goes from `id`. `undefined` means "not a navigation key" (let the
 * browser have it); `null` means "a navigation key with nowhere to go".
 */
function step(nav: Nav, id: string, key: string): string | null | undefined {
  const here = nav.byId.get(id);
  if (!here) return undefined;
  const list = nav.rings.get(here.ring) ?? [];
  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    const i = list.indexOf(id);
    const delta = key === 'ArrowRight' ? 1 : -1;
    return list[(i + delta + list.length) % list.length] ?? null;
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const regionId = here.ring.slice(0, here.ring.lastIndexOf('|'));
    const order = nav.order.get(regionId) ?? [];
    const target = order[order.indexOf(here.ring) + (key === 'ArrowDown' ? 1 : -1)];
    if (!target) return null;
    let best: string | null = null;
    let bestGap = Infinity;
    for (const other of nav.rings.get(target) ?? []) {
      const d = Math.abs(nav.byId.get(other)!.angle - here.angle);
      const gap = Math.min(d, Math.PI * 2 - d);
      if (gap < bestGap) {
        best = other;
        bestGap = gap;
      }
    }
    return best;
  }
  if (key === 'Home') return nav.first;
  return undefined;
}

/** A visible keyboard focus in the node's own shape — the SVG has no native outline. */
function FocusRing({ id, model, layout }: { id: string; model: EcosystemModel; layout: EcosystemLayout }) {
  const common = {
    fill: 'none',
    stroke: 'var(--border-focus)',
    strokeWidth: 3,
    pointerEvents: 'none' as const,
    'data-focus-ring': id,
  };
  const orgPoint = layout.orgs.get(id);
  if (orgPoint) {
    const org = model.organisations.find((o) => o.id === id);
    const r = (org?.isConnector ? CONNECTOR_R + 6 : ORG_R) + 6;
    return <circle cx={orgPoint.x} cy={orgPoint.y} r={r} {...common} />;
  }
  const p = layout.spaces.get(id);
  if (!p) return null;
  const isOrch = model.ecosystems.some((e) => e.orchestrator?.id === id);
  const w = (isOrch ? ORCH_W : CARD_W) + 12;
  const h = (isOrch ? ORCH_H : CARD_H) + 12;
  return <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={14} {...common} />;
}

/**
 * An organisation's name, on a plate so it stays readable over a cluster wedge or a
 * bundle of edges. Untruncated — the point of showing it at all is to identify the node.
 */
function NodeLabel({
  x,
  y,
  text,
  strong,
  org,
}: {
  x: number;
  y: number;
  text: string;
  strong: boolean;
  org?: EcoOrganisation;
}) {
  const width = text.length * 6.6 + 14;
  return (
    <g pointerEvents="none">
      <rect
        x={x - width / 2}
        y={y}
        width={width}
        height={18}
        rx={5}
        fill="var(--surface-raised)"
        fillOpacity={0.92}
        stroke={strong ? 'var(--primary)' : 'var(--border)'}
        strokeWidth={strong ? 1.5 : 0.75}
      />
      <text
        x={x}
        y={y + 13}
        textAnchor="middle"
        fontSize={12}
        fontWeight={org?.isConnector ? 600 : 400}
        className="fill-[var(--foreground)]"
      >
        {text}
      </text>
    </g>
  );
}

/** Break a label onto at most `maxLines` lines of roughly `max` characters. */
function wrap(value: string, max: number, maxLines: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= max || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  const consumed = lines.join(' ').length;
  const tail = consumed > 0 ? value.slice(consumed + 1) : value;
  lines.push(truncate(tail.trim() || current, max));
  return lines.slice(0, maxLines);
}

/** Keep a label inside its plate; the full name is always in the details panel. */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
