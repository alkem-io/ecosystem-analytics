/**
 * Generate the committed Netherlands geography snapshot: the fixed city→province
 * mapping, per-city population, the 12 provinces, and per-province basemap GeoJSON
 * used to render province maps (the same way the whole-NL basemap is rendered).
 *
 *   pnpm -C server run gen:nl-geo
 *
 * Sources (public, open data — fetched at generation time, output committed):
 *   - CBS OData 86247NED "Gebieden in Nederland 2026" → province + population per GM code
 *   - PDOK "gebiedsindelingen" WFS (gemeente_gegeneraliseerd, WGS84) → municipality polygons
 *
 * This is a DATA update, not a logic change — re-run when the municipal layout /
 * population figures change and commit the result. It contains only public
 * reference data (no tokens, no user data).
 *
 * Keying: everything joins on the stable CBS code (`GMxxxx`) already carried by
 * server/src/data/vng/municipalities.json. The two Belgian entries (Brugge, Gent)
 * have a null cbsCode and are intentionally absent from the NL facts — the registry
 * marks them as country 'BE' with no province.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SCRIPT_DIR = import.meta.dirname;
const REPO_ROOT = join(SCRIPT_DIR, '../..');
const SERVER_DATA = join(SCRIPT_DIR, '../src/data/nl');
const MUNICIPALITIES = join(SCRIPT_DIR, '../src/data/vng/municipalities.json');

// Apps that render the NL/province basemaps get a copy of the province GeoJSON in
// their public/maps/provinces/ (served app-relative as /maps/provinces/<slug>.geojson).
const MAP_APP_PUBLIC_DIRS = [
  join(REPO_ROOT, 'frontend/vng/public/maps/provinces'),
  join(REPO_ROOT, 'frontend/govtech/public/maps/provinces'),
  join(REPO_ROOT, 'frontend/ecosystem-analytics/public/maps/provinces'),
];
// The shared basemap manifest consumed by MapOverlay / ForceGraph.
const MANIFEST_TS = join(
  REPO_ROOT,
  'frontend/shared/src/map/province-basemaps.generated.ts',
);

const CBS_URL =
  'https://opendata.cbs.nl/ODataApi/odata/86247NED/TypedDataSet?$format=json' +
  '&$select=Code_1,Naam_2,Code_28,Naam_29,Inwonertal_56';
const PDOK_URL =
  'https://service.pdok.nl/cbs/gebiedsindelingen/2025/wfs/v1_0?request=GetFeature' +
  '&service=WFS&version=2.0.0&typeName=gemeente_gegeneraliseerd' +
  '&outputFormat=application/json&srsName=urn:ogc:def:crs:EPSG::4326';

// The whole-NL basemap reference (see MapOverlay MAP_CENTERS/MAP_SCALES). Province
// scales are derived relative to this so a single province fills the viewport the
// way the whole country does at scale 7000.
const NL_SCALE = 7000;

interface RegistryMunicipality {
  slug: string;
  title: string;
  alkemioNameId: string | null;
  cbsCode: string | null;
}
interface Province {
  code: string; // CBS statcode, e.g. "PV22" — matches the basemap GeoJSON statcode
  slug: string; // ascii kebab, e.g. "drenthe" — the map region id
  name: string; // display name, e.g. "Drenthe"
}
interface MunicipalityFacts {
  provinceCode: string;
  provinceName: string;
  population: number;
}
type GeoJSON = { type: string; features: Feature[]; crs?: unknown };
type Feature = { type: 'Feature'; properties: Record<string, unknown>; geometry: Geometry };
type Geometry = { type: string; coordinates: unknown };

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : v);

/** ascii kebab slug (Fryslân → fryslan). */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function fetchJson(url: string, label: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

/** Recursively walk every [lon, lat] pair in a GeoJSON geometry. */
function forEachCoord(coords: unknown, fn: (lon: number, lat: number) => void): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    fn(coords[0], coords[1] as number);
    return;
  }
  for (const c of coords) forEachCoord(c, fn);
}

type Bounds = { minLon: number; minLat: number; maxLon: number; maxLat: number };
function emptyBounds(): Bounds {
  return { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
}
function extendBounds(b: Bounds, geom: Geometry): void {
  forEachCoord(geom.coordinates, (lon, lat) => {
    if (lon < b.minLon) b.minLon = lon;
    if (lat < b.minLat) b.minLat = lat;
    if (lon > b.maxLon) b.maxLon = lon;
    if (lat > b.maxLat) b.maxLat = lat;
  });
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
}

type Ring = [number, number][];
/** Signed area of a lon/lat ring (positive = counter-clockwise). */
function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}
/**
 * Force outer rings CCW (+) and holes CW (-) to match the whole-NL basemap's
 * winding exactly. The province map masking (white complement filled even-odd) is
 * orientation-sensitive through d3-geo, so a province basemap MUST wind the same
 * way as netherlands.geojson — PDOK's gemeente layer winds them the other way.
 */
function orientRings(rings: Ring[]): Ring[] {
  return rings.map((ring, i) => {
    const wantPositive = i === 0; // first ring = outer, the rest are holes
    return wantPositive === ringArea(ring) > 0 ? ring : [...ring].reverse();
  });
}
function normalizeWinding(geometry: Geometry): Geometry {
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: orientRings(geometry.coordinates as Ring[]) };
  }
  if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: (geometry.coordinates as Ring[][]).map(orientRings) };
  }
  return geometry;
}

async function main(): Promise<void> {
  if (!existsSync(MUNICIPALITIES)) {
    console.error(`municipalities registry not found: ${MUNICIPALITIES}`);
    process.exit(1);
  }
  const registry: RegistryMunicipality[] = JSON.parse(readFileSync(MUNICIPALITIES, 'utf8'));
  const ourCodes = new Set(registry.map((m) => m.cbsCode).filter(Boolean) as string[]);

  console.log('Fetching CBS province + population facts…');
  const cbs = await fetchJson(CBS_URL, 'CBS 86247NED');
  const facts: Record<string, MunicipalityFacts> = {};
  const provinceByCode = new Map<string, string>(); // PV code → name
  for (const row of cbs.value as Record<string, unknown>[]) {
    const gm = s(row.Code_1) as string;
    if (!gm?.startsWith('GM')) continue;
    const pv = s(row.Code_28) as string;
    const pvName = s(row.Naam_29) as string;
    const pop = row.Inwonertal_56;
    if (!pv?.startsWith('PV') || typeof pop !== 'number') continue;
    facts[gm] = { provinceCode: pv, provinceName: pvName, population: pop };
    provinceByCode.set(pv, pvName);
  }

  // Validate coverage before writing anything.
  const missing = [...ourCodes].filter((c) => !facts[c]).sort();
  if (missing.length) {
    console.error(`Refusing to write: ${missing.length} municipalities have no CBS facts:`, missing);
    process.exit(1);
  }
  if (provinceByCode.size !== 12) {
    console.error(`Refusing to write: expected 12 provinces, got ${provinceByCode.size}.`);
    process.exit(1);
  }

  const provinces: Province[] = [...provinceByCode.entries()]
    .map(([code, name]) => ({ code, slug: slugify(name), name }))
    .sort((a, b) => a.code.localeCompare(b.code));

  console.log('Fetching PDOK municipality geometry (WGS84)…');
  const geo: GeoJSON = await fetchJson(PDOK_URL, 'PDOK gemeente_gegeneraliseerd');
  const featByCode = new Map<string, Feature>();
  for (const f of geo.features) featByCode.set(s(f.properties.statcode) as string, f);
  const geomMissing = [...ourCodes].filter((c) => !featByCode.has(c)).sort();
  if (geomMissing.length) {
    console.error(`Refusing to write: ${geomMissing.length} municipalities have no geometry:`, geomMissing);
    process.exit(1);
  }

  // Whole-NL extent (over the municipalities we know about) — the scale reference.
  const nlBounds = emptyBounds();
  for (const code of ourCodes) extendBounds(nlBounds, featByCode.get(code)!.geometry);
  const nlLon = nlBounds.maxLon - nlBounds.minLon;
  const nlLat = nlBounds.maxLat - nlBounds.minLat;

  // Group municipality features by province and build one basemap per province.
  const featuresByProvince = new Map<string, Feature[]>();
  for (const code of ourCodes) {
    const pv = facts[code].provinceCode;
    (featuresByProvince.get(pv) ?? featuresByProvince.set(pv, []).get(pv)!).push(
      featByCode.get(code)!,
    );
  }

  const manifest: { slug: string; code: string; name: string; center: [number, number]; scale: number }[] = [];
  for (const p of provinces) {
    const feats = (featuresByProvince.get(p.code) ?? []).map((f) => ({
      type: 'Feature' as const,
      properties: { statcode: s(f.properties.statcode), statnaam: s(f.properties.statnaam) },
      geometry: normalizeWinding(f.geometry),
    }));
    const collection = { type: 'FeatureCollection', features: feats };
    const filename = `${p.slug}.geojson`;
    for (const dir of MAP_APP_PUBLIC_DIRS) {
      writeFile(join(dir, filename), JSON.stringify(collection) + '\n');
    }

    const b = emptyBounds();
    for (const f of feats) extendBounds(b, f.geometry);
    const center: [number, number] = [
      +((b.minLon + b.maxLon) / 2).toFixed(4),
      +((b.minLat + b.maxLat) / 2).toFixed(4),
    ];
    // Fill the viewport like the whole country does: scale up by how much smaller
    // this province is than NL, constrained by the tighter of the two axes (0.9 pad).
    const ratio = Math.min(nlLon / (b.maxLon - b.minLon), nlLat / (b.maxLat - b.minLat));
    const scale = Math.round(NL_SCALE * ratio * 0.9);
    manifest.push({ slug: p.slug, code: p.code, name: p.name, center, scale });
  }

  // Write server-side fixed data structures.
  const write = (name: string, data: unknown) =>
    writeFile(join(SERVER_DATA, name), JSON.stringify(data, null, 2) + '\n');
  write('provinces.json', provinces);
  write('municipality-facts.json', facts);

  // Write the shared basemap manifest (TS so MapRegion stays a precise union).
  const slugUnion = manifest.map((m) => `'${m.slug}'`).join(' | ');
  const entries = manifest
    .map(
      (m) =>
        `  '${m.slug}': { code: '${m.code}', name: ${JSON.stringify(m.name)}, ` +
        `url: '/maps/provinces/${m.slug}.geojson', center: [${m.center[0]}, ${m.center[1]}], scale: ${m.scale} },`,
    )
    .join('\n');
  const ts =
    `// AUTO-GENERATED by server/scripts/generate-nl-geo.mts — do not edit by hand.\n` +
    `// Per-province basemaps, rendered like the whole-NL map (see MapOverlay/ForceGraph).\n\n` +
    `export type ProvinceRegion = ${slugUnion};\n\n` +
    `export interface ProvinceBasemap {\n` +
    `  /** CBS province statcode, e.g. "PV22" — matches the GeoJSON feature statcode. */\n` +
    `  code: string;\n  name: string;\n  url: string;\n  center: [number, number];\n  scale: number;\n}\n\n` +
    `export const PROVINCE_BASEMAPS: Record<ProvinceRegion, ProvinceBasemap> = {\n${entries}\n};\n`;
  writeFile(MANIFEST_TS, ts);

  console.log(
    `Wrote:\n  ${join(SERVER_DATA, 'provinces.json')} (${provinces.length})\n` +
      `  ${join(SERVER_DATA, 'municipality-facts.json')} (${Object.keys(facts).length})\n` +
      `  ${MANIFEST_TS}\n` +
      `  ${manifest.length} province GeoJSON × ${MAP_APP_PUBLIC_DIRS.length} apps\n` +
      `Belgian (no province): ${registry.filter((m) => !m.cbsCode).map((m) => m.title).join(', ') || 'none'}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
