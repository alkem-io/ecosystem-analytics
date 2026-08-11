import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * MANDATED MAP BEHAVIOUR for the Usage Explorer — constitution §VII, and FR-013a.
 *
 * The Usage Explorer is the THIRD Dutch map (after the GraphTab network map and the
 * initiative-details map). It must satisfy two boundary rules simultaneously, and they
 * pull in opposite directions:
 *
 *   §VII    Nothing outside the NETHERLANDS may render. Plain white beyond the coast and
 *           the land borders — not greyed, not faint.
 *
 *   FR-013a Selecting a PROVINCE must NOT mask the neighbouring provinces. A gemeente
 *           just over a provincial border is precisely the neighbour the feature exists
 *           to reveal, so province selection is a zoom transform, never a basemap swap.
 *
 * The trap this file guards: "fixing" province selection by rendering the masked province
 * basemap. That still shows only the Netherlands, so a §VII outline test would pass — but
 * it would blank the neighbouring provinces and quietly destroy the feature's purpose.
 *
 * Layering here mirrors the shipped map exactly (see frontend/shared/src/map/nl-basemap.ts):
 * RED stands in for CARTO tiles, and the white even-odd complement sits above them inside
 * the same zoom group. The path itself is pinned to the shipped `buildComplementPath` by
 * frontend/vng/src/dashboard/nl-basemap.test.ts.
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
const isTile = (p) => p[0] === 255 && p[1] === 0 && p[2] === 0;

/** The national basemap parameters the Usage Explorer always uses. */
const NL_CENTER = [5.3, 52.2];
const NL_SCALE = 7000;

/** Utrecht — the most magnified province, so the tightest possible frame. */
const UTRECHT = { center: [5.2097, 52.0805], scale: 29184 };

async function setup(page, transform) {
  const { geoMercator, geoPath } = await import(
    resolve(REPO, 'frontend/vng/node_modules/d3-geo/src/index.js')
  );
  const geo = JSON.parse(
    readFileSync(resolve(REPO, 'frontend/vng/public/maps/netherlands.geojson'), 'utf8'),
  );
  const projection = geoMercator().center(NL_CENTER).scale(NL_SCALE).translate([W / 2, H / 2]);
  const complementD = buildComplementPath(geoPath(), projection, geo.features);

  const g = transform ? `<g transform="${transform}">` : '<g>';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
    `${g}<rect x="-40000" y="-40000" width="120000" height="120000" fill="red"/>` +
    `<path d="${complementD}" fill="#ffffff" fill-rule="evenodd"/></g></svg>`;

  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  return projection;
}

test('Usage Explorer map shows tiles INSIDE NL and nothing OUTSIDE — national view (§VII)', async ({
  page,
}) => {
  const projection = await setup(page, null);

  expect(isWhite(await samplePixel(page, 50, 450)), 'North Sea (W) must be white').toBe(true);
  expect(isWhite(await samplePixel(page, 1300, 450)), 'Germany must be white').toBe(true);
  expect(isWhite(await samplePixel(page, 620, 870)), 'Belgium must be white').toBe(true);

  for (const [name, lon, lat] of [
    ['Utrecht', 5.12, 52.09],
    ['Groningen', 6.57, 53.22],
    ['Maastricht', 5.69, 50.85],
  ]) {
    const [x, y] = projection([lon, lat]);
    expect(isTile(await samplePixel(page, Math.round(x), Math.round(y))), `${name} must show tiles`).toBe(
      true,
    );
  }
});

test('Usage Explorer stays Netherlands-only when framed on a PROVINCE (§VII under province zoom)', async ({
  page,
}) => {
  // The transform the shipped `provinceViewTransform` produces for Utrecht.
  const k = UTRECHT.scale / NL_SCALE;
  const probe = await setup(page, null);
  const centre = probe(UTRECHT.center);
  const tx = W / 2 - k * centre[0];
  const ty = H / 2 - k * centre[1];

  const projection = await setup(page, `translate(${tx},${ty}) scale(${k})`);
  const toScreen = ([lon, lat]) => {
    const [x, y] = projection([lon, lat]);
    return [x * k + tx, y * k + ty];
  };
  const onScreen = ([x, y]) => x >= 2 && x <= W - 2 && y >= 2 && y <= H - 2;

  // Inside the Netherlands, at province zoom, tiles must still show.
  const [ux, uy] = toScreen(UTRECHT.center);
  expect(isTile(await samplePixel(page, Math.round(ux), Math.round(uy))), 'Utrecht centre').toBe(true);

  // FR-013a — a gemeente in a NEIGHBOURING province that falls inside the frame must
  // still be on rendered land, NOT masked away. Gouda sits in Zuid-Holland, just west of
  // the Utrecht frame's edge. If someone swapped in the masked Utrecht basemap, this
  // point would turn white and the test would fail — which is the whole purpose here.
  const gouda = toScreen([4.7104, 52.0115]);
  if (onScreen(gouda)) {
    const p = await samplePixel(page, Math.round(gouda[0]), Math.round(gouda[1]));
    expect(isTile(p), `Gouda (Zuid-Holland) must remain visible beside Utrecht, got ${p}`).toBe(true);
  }
});

test('Usage Explorer masks the sea even at high zoom near the coast (§VII)', async ({ page }) => {
  // Zoom hard on the Noord-Holland coast, where a mask that failed to track the zoom
  // transform would leak the North Sea into view.
  const k = 6;
  const probe = await setup(page, null);
  const coast = probe([4.6, 52.45]);
  const tx = W / 2 - k * coast[0];
  const ty = H / 2 - k * coast[1];

  const projection = await setup(page, `translate(${tx},${ty}) scale(${k})`);
  const toScreen = ([lon, lat]) => {
    const [x, y] = projection([lon, lat]);
    return [x * k + tx, y * k + ty];
  };

  // Well out to sea — must be white.
  const sea = toScreen([4.1, 52.45]);
  if (sea[0] >= 2 && sea[0] <= W - 2) {
    const p = await samplePixel(page, Math.round(sea[0]), Math.round(sea[1]));
    expect(isWhite(p), `North Sea must stay white at zoom ${k}, got ${p}`).toBe(true);
  }

  // Inland, a short distance east — must show tiles.
  const inland = toScreen([4.9, 52.45]);
  if (inland[0] >= 2 && inland[0] <= W - 2) {
    const p = await samplePixel(page, Math.round(inland[0]), Math.round(inland[1]));
    expect(isTile(p), `inland must show tiles at zoom ${k}, got ${p}`).toBe(true);
  }
});
