import { useEffect, useId, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { proxyImageUrl } from '@ea/shared';
import type { GraphNode } from '@server/types/graph.js';

const W = 680;
const H = 560;
const R = 16; // marker radius (avatars sized to match the GraphTab map)
const TILE_Z = 9; // web-mercator tile zoom for the basemap detail (roads/towns)

// Fixed projection (NOT fitSize — the NL provinces geojson has a degenerate
// geoBounds that breaks fitSize). Same center+scale family as the shared map.
const PROJECTION = geoMercator().center([5.45, 52.15]).scale(4500).translate([W / 2, H / 2]);
const PATH = geoPath(PROJECTION);

function lon2tile(lon: number, z: number) {
  return ((lon + 180) / 360) * 2 ** z;
}
function lat2tile(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}
function tile2lon(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}
function tile2lat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Tiles covering the Netherlands extent (lon 3.2–7.3, lat 50.6–53.7). */
const TILES = (() => {
  const xMin = Math.floor(lon2tile(3.2, TILE_Z));
  const xMax = Math.floor(lon2tile(7.4, TILE_Z));
  const yMin = Math.floor(lat2tile(53.7, TILE_Z));
  const yMax = Math.floor(lat2tile(50.6, TILE_Z));
  const out: { x: number; y: number }[] = [];
  for (let x = xMin; x <= xMax; x++) for (let y = yMin; y <= yMax; y++) out.push({ x, y });
  return out;
})();

/**
 * Static Netherlands-only map for the initiative-details tab (constitution §VII /
 * FR-048): light blue-grey NL silhouette, faint CARTO tile detail CLIPPED to the
 * NL boundary (nothing outside NL), province borders, and gemeente avatars at their
 * geo-locations. In a static SVG (no d3-zoom) a clipPath clips reliably.
 */
export function InitiativeMap({ gemeentes }: { gemeentes: GraphNode[] }) {
  const clipId = useId();
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
  const features: any[] = (geo as any).features ?? [geo];
  const regionD = features.map((f) => PATH(f)).filter(Boolean).join(' ');

  const markers = gemeentes
    .map((g) => {
      const loc = g.location;
      if (!loc || loc.latitude == null || loc.longitude == null) return null;
      const p = PROJECTION([loc.longitude, loc.latitude]);
      return p ? { node: g, x: p[0], y: p[1] } : null;
    })
    .filter((m): m is { node: GraphNode; x: number; y: number } => m != null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-auto w-full max-w-2xl" role="img" aria-label="Kaart">
      <defs>
        <clipPath id={`nl-${clipId}`}>
          <path d={regionD} />
        </clipPath>
        {markers.map((m) => (
          <clipPath key={m.node.id} id={`gm-${clipId}-${m.node.id}`} clipPathUnits="userSpaceOnUse">
            <circle cx={m.x} cy={m.y} r={R} />
          </clipPath>
        ))}
      </defs>

      {/* OUTSIDE the Netherlands = plain white (other countries are NOT rendered). */}
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />

      {/* Netherlands ONLY: white base + map-tile detail, both clipped to the NL boundary. */}
      <g clipPath={`url(#nl-${clipId})`}>
        <path d={regionD} fill="#ffffff" />
        {TILES.map(({ x, y }) => {
          const pTL = PROJECTION([tile2lon(x, TILE_Z), tile2lat(y, TILE_Z)]);
          const pBR = PROJECTION([tile2lon(x + 1, TILE_Z), tile2lat(y + 1, TILE_Z)]);
          if (!pTL || !pBR) return null;
          const sub = ['a', 'b', 'c', 'd'][(x + y) % 4];
          return (
            <image
              key={`${x}-${y}`}
              href={`https://${sub}.basemaps.cartocdn.com/light_nolabels/${TILE_Z}/${x}/${y}.png`}
              x={pTL[0]}
              y={pTL[1]}
              width={pBR[0] - pTL[0]}
              height={pBR[1] - pTL[1]}
              preserveAspectRatio="none"
            />
          );
        })}
      </g>

      {/* Province borders (faint), only within NL */}
      <g clipPath={`url(#nl-${clipId})`}>
        {features.map((f, i) => (
          <path key={i} d={PATH(f) ?? ''} fill="none" stroke="#c4ccd4" strokeWidth={0.7} />
        ))}
      </g>

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
                clipPath={`url(#gm-${clipId}-${m.node.id})`}
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
