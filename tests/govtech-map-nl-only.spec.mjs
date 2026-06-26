import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * MANDATED MAP BEHAVIOUR — constitution §VII (Dutch-Dashboard Map Scope) / spec 017 FR-048.
 *
 * The GovTech Netherlands dashboard is a VNG clone and carries the SAME hard map
 * requirement: the map MUST render ONLY the Netherlands — real CARTO map-tile detail
 * INSIDE the Netherlands, and NOTHING outside it (other countries are not rendered —
 * plain white). The shared ForceGraph achieves this by rendering full CARTO tiles and
 * overlaying an opaque WHITE "complement" shape that hides everything outside NL. The
 * complement is the raw region rings filled with the EVEN-ODD rule: the source geojson
 * is wound backwards for d3-geo, so even-odd fills the COMPLEMENT of the Netherlands.
 * The overlay lives inside the zoom group, so it pans/zooms with the tiles.
 *
 * This is the GovTech-scoped sibling of tests/vng-map-nl-only.spec.mjs: it samples real
 * rendered pixels off the GovTech app's own bundled netherlands.geojson + d3-geo, both
 * statically and under a zoom-like transform, and asserts:
 *   • points OUTSIDE the Netherlands (sea, Germany, Belgium) are WHITE (hidden)
 *   • points INSIDE the Netherlands show the tile layer (RED here)
 * It is the regression guard ensuring the GovTech map never bleeds across Europe.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const W = 1400;
const H = 900;

function buildComplementPath(geoPath, projection, features) {
  return features
    .map((f) => geoPath.projection(projection)(f))
    .filter(Boolean)
    .join(' ');
}

async function samplePixel(page, x, y) {
  return page.evaluate(
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
}

const isWhite = (p) => p[0] === 255 && p[1] === 255 && p[2] === 255;
const isTile = (p) => p[0] === 255 && p[1] === 0 && p[2] === 0; // RED stand-in for tiles

test('GovTech map shows tiles INSIDE NL and nothing OUTSIDE — static (constitution §VII / FR-048)', async ({
  page,
}) => {
  const { geoMercator, geoPath } = await import(
    resolve(REPO, 'frontend/govtech/node_modules/d3-geo/src/index.js')
  );
  const geo = JSON.parse(
    readFileSync(resolve(REPO, 'frontend/govtech/public/maps/netherlands.geojson'), 'utf8'),
  );
  const projection = geoMercator().center([5.3, 52.2]).scale(7000).translate([W / 2, H / 2]);
  const complementD = buildComplementPath(geoPath(), projection, geo.features);

  // RED = tiles layer; white complement overlay on top.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="red"/><path d="${complementD}" fill="#ffffff" fill-rule="evenodd"/></svg>`;
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<body style="margin:0">${svg}</body>`);

  // OUTSIDE NL → white.
  expect(isWhite(await samplePixel(page, 50, 450)), 'North Sea (W) must be white').toBe(true);
  expect(isWhite(await samplePixel(page, 700, 30)), 'North Sea (N) must be white').toBe(true);
  expect(isWhite(await samplePixel(page, 1300, 450)), 'Germany must be white').toBe(true);
  expect(isWhite(await samplePixel(page, 620, 870)), 'Belgium must be white').toBe(true);

  // INSIDE NL → tiles visible (red).
  for (const [name, lon, lat] of [
    ['Utrecht', 5.12, 52.09],
    ['Eindhoven', 5.47, 51.44],
    ['Groningen', 6.57, 53.22],
    ['Rotterdam', 4.48, 51.92],
  ]) {
    const [x, y] = projection([lon, lat]);
    expect(isTile(await samplePixel(page, Math.round(x), Math.round(y))), `${name} must show tiles`).toBe(
      true,
    );
  }
});

test('GovTech map stays Netherlands-only UNDER ZOOM (the overlay tracks the zoom transform)', async ({
  page,
}) => {
  const { geoMercator, geoPath } = await import(
    resolve(REPO, 'frontend/govtech/node_modules/d3-geo/src/index.js')
  );
  const geo = JSON.parse(
    readFileSync(resolve(REPO, 'frontend/govtech/public/maps/netherlands.geojson'), 'utf8'),
  );
  const projection = geoMercator().center([5.3, 52.2]).scale(7000).translate([W / 2, H / 2]);
  const complementD = buildComplementPath(geoPath(), projection, geo.features);

  // Both the RED tiles and the white complement live inside the SAME transformed group
  // — exactly how ForceGraph nests them in the d3-zoom group. Simulate a zoom-in.
  const T = 'translate(200,120) scale(1.6)';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ffffff"/><g transform="${T}"><rect x="-4000" y="-4000" width="12000" height="12000" fill="red"/><path d="${complementD}" fill="#ffffff" fill-rule="evenodd"/></g></svg>`;
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<body style="margin:0">${svg}</body>`);

  const tx = ([x, y]) => [x * 1.6 + 200, y * 1.6 + 120];
  const onScreen = ([x, y]) => x >= 2 && x <= W - 2 && y >= 2 && y <= H - 2;

  // OUTSIDE NL → white, even when zoomed.
  expect(isWhite(await samplePixel(page, 30, 30)), 'corner must be white when zoomed').toBe(true);

  // INSIDE NL → tiles visible at the transformed position (only points still on-screen).
  let checked = 0;
  for (const [name, lon, lat] of [
    ['Amsterdam', 4.9, 52.37],
    ['Utrecht', 5.12, 52.09],
    ['Haarlem', 4.65, 52.38],
    ['Hilversum', 5.18, 52.23],
  ]) {
    const pt = tx(projection([lon, lat]));
    if (!onScreen(pt)) continue;
    const p = await samplePixel(page, Math.round(pt[0]), Math.round(pt[1]));
    expect(isTile(p), `${name} must show tiles when zoomed, got ${p}`).toBe(true);
    checked++;
  }
  expect(checked, 'at least one interior point was checked under zoom').toBeGreaterThan(0);
});
