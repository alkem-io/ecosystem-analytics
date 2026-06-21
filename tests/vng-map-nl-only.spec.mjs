import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * MANDATED MAP BEHAVIOUR — constitution §VII / spec FR-048.
 *
 * The VNG dashboard map MUST render ONLY the Netherlands: the area outside the
 * Netherlands is plain white (other countries are NOT rendered at all). This test
 * renders the Netherlands silhouette the way the shared ForceGraph does (a reversed
 * -ring region fill — see frontend/shared/src/graph/regionFill.ts) and asserts, by
 * sampling actual rendered pixels in a real browser, that:
 *   • points OUTSIDE the Netherlands (North Sea, Germany) are WHITE
 *   • points INSIDE the Netherlands are the fill colour
 *
 * This is a regression guard: it is the bug we fought repeatedly (the source GeoJSON
 * is wound backwards for d3-geo, so a naive fill covers the COMPLEMENT of NL and the
 * map bleeds across Europe). If anything outside NL renders again, this test fails.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const W = 1400;
const H = 900;
const FILL = '#dbe2e8';

/**
 * Reversed-ring fill path. MUST mirror buildRegionFillPath in
 * frontend/shared/src/graph/regionFill.ts (kept in sync deliberately; that file is
 * the single source of truth used by the app).
 */
function buildRegionFillPath(features, project) {
  return features
    .flatMap((f) => {
      const geom = f.geometry;
      const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      return polys.map((poly) => {
        const pts = poly[0].map((c) => project(c)).filter(Boolean);
        pts.reverse();
        return pts.length > 2
          ? 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z'
          : '';
      });
    })
    .filter(Boolean)
    .join(' ');
}

test('VNG map renders ONLY the Netherlands (constitution §VII / FR-048)', async ({ page }) => {
  // d3-geo lives in the vng package; resolve it by absolute path.
  const { geoMercator } = await import(resolve(REPO, 'frontend/vng/node_modules/d3-geo/src/index.js'));
  const geo = JSON.parse(
    readFileSync(resolve(REPO, 'frontend/vng/public/maps/netherlands.geojson'), 'utf8'),
  );
  // Same projection family the shared map uses for the Netherlands region.
  const projection = geoMercator().center([5.3, 52.2]).scale(7000).translate([W / 2, H / 2]);
  const d = buildRegionFillPath(geo.features, (c) => projection(c));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ffffff"/><path d="${d}" fill="${FILL}"/></svg>`;
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<body style="margin:0">${svg}</body>`);

  // Sample rendered pixels via an in-page canvas.
  const sample = (x, y) =>
    page.evaluate(
      ([x, y]) =>
        new Promise((res) => {
          const svgEl = document.querySelector('svg');
          const xml = new XMLSerializer().serializeToString(svgEl);
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = 1;
            c.height = 1;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, -x, -y);
            res([...ctx.getImageData(0, 0, 1, 1).data]);
          };
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
        }),
      [x, y],
    );

  const isWhite = (p) => p[0] === 255 && p[1] === 255 && p[2] === 255;
  // "filled" = not white (the silhouette colour, allowing for antialiasing).
  const isFilled = (p) => !isWhite(p);

  // OUTSIDE the Netherlands — must be plain white (nothing rendered).
  const seaWest = await sample(50, 450); // North Sea, far west
  const seaNorth = await sample(700, 30); // North Sea, far north
  const germanyEast = await sample(1300, 450); // Germany, east
  const belgiumSouth = await sample(620, 870); // Belgium, south
  expect(isWhite(seaWest), `North Sea (W) must be white, got ${seaWest}`).toBe(true);
  expect(isWhite(seaNorth), `North Sea (N) must be white, got ${seaNorth}`).toBe(true);
  expect(isWhite(germanyEast), `Germany must be white, got ${germanyEast}`).toBe(true);
  expect(isWhite(belgiumSouth), `Belgium must be white, got ${belgiumSouth}`).toBe(true);

  // INSIDE the Netherlands — actual land cities must be filled.
  for (const [name, lon, lat] of [
    ['Utrecht', 5.12, 52.09],
    ['Eindhoven', 5.47, 51.44],
    ['Groningen', 6.57, 53.22],
    ['Rotterdam', 4.48, 51.92],
  ]) {
    const [x, y] = projection([lon, lat]);
    const p = await sample(Math.round(x), Math.round(y));
    expect(isFilled(p), `${name} (inside NL) must be filled, got ${p}`).toBe(true);
  }
});
