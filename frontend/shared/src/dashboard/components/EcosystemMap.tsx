import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { select, zoom as d3Zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3';
import { proxyImageUrl } from '../../lib/imageProxy.js';
import { isImageFailed, markImageFailed } from '../../lib/badImageCache.js';
import { initials } from '../../lib/initials.js';
import type { EcoOrganisation, EcosystemModel } from '../utils/ecosystem.js';
import type { EcosystemLayout } from '../utils/ecosystem-layout.js';

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
  onActivateSpace: (nameId: string) => void;
  onActivateOrg: (org: EcoOrganisation) => void;
  /** Stored viewport; `null` means "fit the whole map". */
  transform: MapTransform | null;
  onTransformChange: (t: MapTransform) => void;
  /** Bumped by the parent to request a fit-to-view. */
  fitNonce: number;
  labels: {
    lead: string;
    member: string;
    direct: string;
    viaSubspace: string;
    partOf: string;
    connector: string;
  };
}

const ORG_R = 14;
const CONNECTOR_R = 20;
const CARD_W = 168;
const CARD_H = 42;
const ORCH_W = 208;
const ORCH_H = 60;
const DIM = 0.15;

/**
 * The ecosystem map (feature 024).
 *
 * React owns this SVG — unlike `ForceGraph`, which hands its DOM to D3. Everything here
 * is a function of (model, layout, hover, transform), so the picture is reproducible and
 * the Playwright spec can assert against it. D3 is used for exactly one thing: the zoom
 * behaviour, which writes a transform this component renders.
 *
 * NOT a geographic map — no basemap, no projection, no Netherlands mask. Constitution
 * §VII does not apply here and nothing in this file may grow a tile layer.
 */
export function EcosystemMap({
  model,
  layout,
  hoverId,
  onHover,
  onActivateSpace,
  onActivateOrg,
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
      if (e.key === 'Escape') onHover(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onHover]);

  // What the current hover keeps lit: the node itself and everything it touches.
  const lit = useMemo(() => {
    if (!hoverId) return null;
    const ids = new Set<string>([hoverId]);
    const org = model.organisations.find((o) => o.id === hoverId);
    if (org) {
      for (const c of org.connections) ids.add(c.spaceId);
      return ids;
    }
    for (const o of model.organisations) {
      if (o.connections.some((c) => c.spaceId === hoverId)) ids.add(o.id);
    }
    for (const eco of model.ecosystems) {
      for (const link of eco.spaceLinks) {
        if (link.fromId === hoverId) ids.add(link.toId);
        if (link.toId === hoverId) ids.add(link.fromId);
      }
    }
    return ids;
  }, [hoverId, model]);

  const dimmed = (id: string) => (lit && !lit.has(id) ? DIM : 1);
  const edgeOpacity = (a: string, b: string) => (lit && !(lit.has(a) && lit.has(b)) ? DIM : 1);

  const t = transform ?? fitTransform;

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        className="h-full w-full"
        style={{ touchAction: 'none' }}
        role="img"
        aria-label={labels.partOf}
        data-testid="ecosystem-map"
      >
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
                y={region.cy - region.radius - 56}
                textAnchor="middle"
                className="fill-[var(--foreground)]"
                fontSize={18}
                fontWeight={600}
              >
                {region.label}
              </text>
            </g>
          ))}

          {/* part-of links: always drawn, lightest stroke ---------------------- */}
          {model.ecosystems.flatMap((eco) =>
            eco.spaceLinks.map((link) => {
              const a = layout.spaces.get(link.fromId);
              const b = layout.spaces.get(link.toId);
              if (!a || !b) return null;
              return (
                <line
                  key={`${link.fromId}-${link.toId}`}
                  data-edge="partOf"
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--primary)"
                  strokeOpacity={0.3 * edgeOpacity(link.fromId, link.toId)}
                  strokeWidth={1}
                />
              );
            }),
          )}

          {/* organisation connections ----------------------------------------- */}
          {model.organisations.flatMap((org) =>
            org.connections.map((c) => {
              const a = layout.orgs.get(org.id);
              const b = layout.spaces.get(c.spaceId);
              if (!a || !b) return null;
              return (
                <line
                  key={`${org.id}-${c.spaceId}`}
                  data-edge="org"
                  data-strength={c.strength}
                  data-provenance={c.provenance}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--text-secondary)"
                  strokeOpacity={(c.strength === 'lead' ? 0.6 : 0.35) * edgeOpacity(org.id, c.spaceId)}
                  strokeWidth={c.strength === 'lead' ? 2.5 : 1.25}
                  strokeDasharray={c.provenance === 'viaSubspace' ? '5 5' : undefined}
                />
              );
            }),
          )}

          {/* initiatives ------------------------------------------------------- */}
          {model.ecosystems.flatMap((eco) =>
            eco.initiatives.map((initiative) => {
              const p = layout.spaces.get(initiative.id);
              if (!p) return null;
              return (
                <g
                  key={initiative.id}
                  data-space={initiative.nameId}
                  data-role="initiative"
                  tabIndex={0}
                  role="button"
                  aria-label={initiative.name}
                  opacity={dimmed(initiative.id)}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => onHover(initiative.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(initiative.id)}
                  onBlur={() => onHover(null)}
                  onClick={() => onActivateSpace(initiative.nameId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onActivateSpace(initiative.nameId);
                    }
                  }}
                >
                  <rect
                    x={p.x - CARD_W / 2}
                    y={p.y - CARD_H / 2}
                    width={CARD_W}
                    height={CARD_H}
                    rx={8}
                    fill="var(--surface-raised)"
                    stroke="var(--border)"
                    strokeWidth={1}
                  />
                  <text
                    x={p.x}
                    y={initiative.orgCount > 0 ? p.y - 2 : p.y + 4}
                    textAnchor="middle"
                    fontSize={12}
                    className="fill-[var(--foreground)]"
                  >
                    {truncate(initiative.name, 22)}
                  </text>
                  {initiative.orgCount > 0 && (
                    <text
                      x={p.x}
                      y={p.y + 13}
                      textAnchor="middle"
                      fontSize={10}
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
            return (
              <g
                key={orch.id}
                data-space={orch.nameId}
                data-role="orchestrator"
                tabIndex={0}
                role="button"
                aria-label={orch.name}
                opacity={dimmed(orch.id)}
                className="cursor-pointer outline-none"
                onMouseEnter={() => onHover(orch.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(orch.id)}
                onBlur={() => onHover(null)}
                onClick={() => onActivateSpace(orch.nameId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActivateSpace(orch.nameId);
                  }
                }}
              >
                <rect
                  x={p.x - ORCH_W / 2}
                  y={p.y - ORCH_H / 2}
                  width={ORCH_W}
                  height={ORCH_H}
                  rx={10}
                  fill="var(--primary)"
                  stroke="var(--primary)"
                  strokeWidth={2}
                />
                <text
                  x={p.x}
                  y={p.y + 5}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={700}
                  className="fill-[var(--primary-foreground)]"
                >
                  {truncate(orch.name, 24)}
                </text>
              </g>
            );
          })}

          {/* organisations ----------------------------------------------------- */}
          {model.organisations.map((org) => {
            const p = layout.orgs.get(org.id);
            if (!p) return null;
            const r = org.isConnector ? CONNECTOR_R : ORG_R;
            const src = proxyImageUrl(org.logoUrl);
            const showImage = Boolean(src) && !failed[org.id] && !isImageFailed(src ?? org.logoUrl);
            return (
              <g
                key={org.id}
                data-org={org.id}
                data-connector={org.isConnector ? 'true' : 'false'}
                tabIndex={0}
                role="button"
                aria-label={org.name}
                opacity={dimmed(org.id)}
                className="cursor-pointer outline-none"
                onMouseEnter={() => onHover(org.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(org.id)}
                onBlur={() => onHover(null)}
                onClick={() => onActivateOrg(org)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActivateOrg(org);
                  }
                }}
              >
                <title>{org.name}</title>
                <clipPath id={`eco-clip-${org.id}`}>
                  <circle cx={p.x} cy={p.y} r={r - 2} />
                </clipPath>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill="var(--surface-raised)"
                  stroke={org.isConnector ? 'var(--primary)' : 'var(--border)'}
                  strokeWidth={org.isConnector ? 3 : 1.5}
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
                {hoverId === org.id && (
                  <text
                    x={p.x}
                    y={p.y - r - 6}
                    textAnchor="middle"
                    fontSize={12}
                    className="fill-[var(--foreground)]"
                  >
                    {org.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** Keep a card's label inside its rounded rectangle; the full name is on hover. */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
