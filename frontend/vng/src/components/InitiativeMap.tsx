import { useEffect, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { proxyImageUrl } from '@ea/shared';
import type { GraphNode } from '@server/types/graph.js';

const W = 680;
const H = 560;
const R = 11; // marker radius

/**
 * Mini Netherlands map plotting the participating gemeentes as circular avatar
 * markers at their geo-location. Self-contained: loads the NL basemap and fits a
 * Mercator projection to it. Used in the initiative details view.
 */
export function InitiativeMap({ gemeentes }: { gemeentes: GraphNode[] }) {
  const [geo, setGeo] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    fetch('/maps/netherlands.geojson')
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => active && setGeo(g))
      .catch(() => active && setGeo(null));
    return () => {
      active = false;
    };
  }, []);

  if (!geo) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
        …
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoAny = geo as any;
  const projection = geoMercator().fitSize([W, H], geoAny);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pathGen = geoPath(projection as any);

  const markers = gemeentes
    .map((g) => {
      const loc = g.location;
      if (!loc || loc.latitude == null || loc.longitude == null) return null;
      const p = projection([loc.longitude, loc.latitude]);
      return p ? { node: g, x: p[0], y: p[1] } : null;
    })
    .filter((m): m is { node: GraphNode; x: number; y: number } => m != null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-auto w-full max-w-2xl" role="img" aria-label="Kaart">
      <defs>
        {markers.map((m) => (
          <clipPath key={m.node.id} id={`gm-${m.node.id}`} clipPathUnits="userSpaceOnUse">
            <circle cx={m.x} cy={m.y} r={R} />
          </clipPath>
        ))}
      </defs>

      {/* Basemap */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {geoAny.features.map((f: any, i: number) => (
        <path key={i} d={pathGen(f) ?? ''} fill="#eef2f7" stroke="#cbd5e1" strokeWidth={0.6} />
      ))}

      {/* Gemeente markers */}
      {markers.map((m) => (
        <g key={m.node.id}>
          {m.node.avatarUrl ? (
            <>
              <circle cx={m.x} cy={m.y} r={R} fill="#ffffff" />
              <image
                href={proxyImageUrl(m.node.avatarUrl) ?? undefined}
                x={m.x - R}
                y={m.y - R}
                width={2 * R}
                height={2 * R}
                clipPath={`url(#gm-${m.node.id})`}
                preserveAspectRatio="xMidYMid slice"
              />
              <circle cx={m.x} cy={m.y} r={R} fill="none" stroke="#1d384a" strokeWidth={1.2} />
            </>
          ) : (
            <circle cx={m.x} cy={m.y} r={5} fill="#1d384a" stroke="#ffffff" strokeWidth={1} />
          )}
          <title>{m.node.displayName}</title>
        </g>
      ))}
    </svg>
  );
}
