import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * CONSTITUTION §VII — THE COMPOSITED GUARD (feature 021, FR-001…FR-005).
 *
 * This is the only check that looks at what the user actually sees.
 *
 * The sibling specs (vng-map-nl-only, govtech-map-nl-only, vng-usage-explorer-nl-only)
 * rebuild the layering inside the test with a red rectangle standing in for the map,
 * and sample by serialising `document.querySelector('svg')`. That proves the mask's
 * GEOMETRY is right — genuinely useful — but it can only ever see the SVG. The moment
 * the imagery lives in a layer beneath the SVG (a canvas), those specs keep passing
 * while the imagery underneath could be showing Germany.
 *
 * This spec closes that hole. It loads the SHIPPED component on the harness page and
 * screenshots the CONTAINER, so every layer is composited exactly as the browser
 * paints it for a user, then samples real pixels out of that image.
 *
 * Two assertions, and both are load-bearing:
 *   • OUTSIDE points must be EXACTLY the page background — no colour tolerance. A
 *     tolerance is precisely what a faint or partial leak would hide behind.
 *   • INSIDE points must NOT be the background. This is what stops a BLANK map
 *     passing: if the basemap fails to load, everything is background and an
 *     outside-only guard would report success — the exact failure this feature exists
 *     to eliminate. Never weaken this assertion.
 */

const HARNESS = 'http://127.0.0.1:5199/harness/index.html';
// The map surface, excluding the attribution line beneath it. Every sample coordinate
// below was derived by measuring an actual render at this size — see the note in
// specs/021-openfreemap-basemap/tasks.md about why they cannot be assumed.
const W = 1400;
const H = 882;

/** The page background — what "outside the Netherlands" must be, exactly. */
const BACKGROUND = { r: 255, g: 255, b: 255 };

/**
 * Points known to be OUTSIDE the Netherlands, in container coordinates for the
 * default whole-country view. Inherited from the pixel-verified sibling specs, and
 * kept a margin clear of the coastline so the antialiased border seam is never
 * sampled (FR-002b).
 */
const OUTSIDE = [
  { name: 'North Sea (west)', x: 60, y: 440 },
  { name: 'Germany (east)', x: 1240, y: 440 },
  { name: 'Belgium (south)', x: 620, y: 660 },
  { name: 'open sea (north)', x: 700, y: 60 },
];

/**
 * Points known to be INSIDE the Netherlands. Chosen well within the landmass, again
 * with margin, so they cannot land on the seam.
 */
const INSIDE = [
  { name: 'centre of the country', x: 830, y: 340 },
  { name: 'east', x: 840, y: 430 },
  { name: 'south-west', x: 540, y: 510 },
];

async function grab(page, { region = 'netherlands', disableMask = false, surface = 'forcegraph' } = {}) {
  const url =
    `${HARNESS}?surface=${surface}&region=${region}` + (disableMask ? '&disableMask=1' : '');
  // 'load', not 'networkidle': a map keeps fetching tiles as it settles, so networkidle
  // can never arrive. The explicit waits below are what actually gate the sample.
  await page.goto(url, { waitUntil: 'load' });
  const container = page.locator('[data-testid="map-container"]');
  await container.waitFor({ state: 'visible' });
  // The basemap draws once its region GeoJSON resolves; wait for the mask (or, when
  // the harness has removed it, for the harness to say so) before sampling.
  await page.waitForFunction(
    () =>
      document.body.dataset.harness === 'mask-disabled' ||
      document.querySelectorAll('path.nl-complement').length > 0,
    undefined,
    { timeout: 20_000 },
  );
  // Let the basemap settle so INSIDE points have imagery to show.
  await page.waitForTimeout(2500);
  // `page.screenshot({ clip })`, not `locator.screenshot()`: the basemap renders
  // continuously, so the element is never "stable" and locator.screenshot waits forever.
  const box = await container.boundingBox();
  return PNG.sync.read(await page.screenshot({ clip: box, animations: 'disabled' }));
}

function pixel(png, x, y) {
  const i = (png.width * y + x) << 2;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2], a: png.data[i + 3] };
}

const isBackground = (p) => p.r === BACKGROUND.r && p.g === BACKGROUND.g && p.b === BACKGROUND.b;

/**
 * Drag the map by `dx,dy` and sample WHILE the gesture is still in flight.
 *
 * This is the assertion that catches an overlay wired to MapLibre's `move` event instead
 * of `render`: at rest the two are indistinguishable, mid-gesture the overlay runs a frame
 * ahead of the imagery and the mask slides off what it is meant to cover.
 */
async function sampleMidDrag(page, container, dx, dy) {
  const box = await container.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
  // Deliberately NOT mouse.up() — the drag is still active as we sample.
  const png = PNG.sync.read(await page.screenshot({ clip: box, animations: 'disabled' }));
  await page.mouse.up();
  return png;
}

test.describe('§VII — the composited map renders only the Netherlands', () => {
  test('outside the border is exactly the page background; inside is not', async ({ page }) => {
    const png = await grab(page);
    // The sample coordinates are container-relative, so a layout change that resizes the
    // map surface invalidates them. Assert the size the points were derived against.
    expect(png.width, 'container width').toBe(W);
    expect(png.height, 'container height').toBe(H);

    for (const p of OUTSIDE) {
      expect(isBackground(pixel(png, p.x, p.y)), `${p.name} must be plain background`).toBe(true);
    }

    // Proof the map actually rendered — without this a blank canvas passes.
    for (const p of INSIDE) {
      expect(isBackground(pixel(png, p.x, p.y)), `${p.name} must show map detail`).toBe(false);
    }
  });

  /**
   * KNOWN FAILING — a real §VII violation, pre-dating this feature.
   *
   * A province basemap's GeoJSON (`public/maps/provinces/*.geojson`) contains that
   * province's MUNICIPALITIES — 26 of them for Utrecht — not one dissolved province
   * outline. `buildComplementPath` joins them and fills even-odd, which alternates across
   * their shared borders, so the mask comes out inverted and patchy: imagery everywhere,
   * province blank.
   *
   * It was invisible before feature 021 because the old <image> tile layer did not span
   * the viewport, so there was little outside the region for a broken mask to fail to
   * hide. A canvas basemap covers everything, and this exposed it.
   *
   * Switching the fill to `nonzero` recovers most of it (measured: 6.9% → 78.8% of the
   * viewport correctly blank, 2 of 3 outside points correct) but is not a fix. The real
   * fix is to dissolve each province's municipalities into a single outline in
   * `server/scripts/generate-nl-geo.mts`. Deliberately NOT patched here: the mask is
   * constitutional, pixel-verified and pinned, and this is out of feature 021's scope.
   *
   * `test.fail()` keeps the suite honest — this flips to a failure the moment it is fixed.
   */
  test('holds for a single province — the rest of the country is blank', async ({ page }) => {
    test.fail(); // see the note above — real §VII violation, pre-dating this feature
    // A province basemap masks everything but that province, so the whole-country
    // interior points must now be background too. Only the province itself survives.
    const png = await grab(page, { region: 'utrecht' });
    for (const p of OUTSIDE) {
      expect(isBackground(pixel(png, p.x, p.y)), `${p.name} must be plain background`).toBe(true);
    }
    // Somewhere in the province still shows imagery — proof the province rendered at all.
    const anyImagery = INSIDE.some((p) => !isBackground(pixel(png, p.x, p.y)));
    expect(anyImagery, 'the framed province must show map detail somewhere').toBe(true);
  });

  test('holds while a pan is IN FLIGHT, not just once it settles', async ({ page }) => {
    await page.goto(`${HARNESS}?region=netherlands`, { waitUntil: 'load' });
    const container = page.locator('[data-testid="map-container"]');
    await container.waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.querySelectorAll('path.nl-complement').length > 0,
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(2500);

    // Drag east, towards Germany — the direction a leak surfaces first.
    const png = await sampleMidDrag(page, container, -260, 0);
    for (const p of OUTSIDE) {
      expect(
        isBackground(pixel(png, p.x, p.y)),
        `${p.name} must stay plain background mid-drag — if it does not, the overlay and ` +
          `the imagery are a frame apart`,
      ).toBe(true);
    }
  });

  /**
   * The Usage Explorer is a SECOND consumer of the same basemap module, and the module's
   * stated purpose is that the surfaces cannot drift apart. Asserting the identical points
   * on both is what makes that claim checkable rather than aspirational — the two consumers
   * answered camera ownership differently at one point in this feature's history, and only
   * a test that samples both would have caught it.
   */
  test('holds on the Usage Explorer surface too', async ({ page }) => {
    const png = await grab(page, { surface: 'usagemap' });
    expect(png.width, 'container width').toBe(W);
    expect(png.height, 'container height').toBe(H);
    for (const p of OUTSIDE) {
      expect(isBackground(pixel(png, p.x, p.y)), `${p.name} must be plain background`).toBe(true);
    }
    const anyImagery = INSIDE.some((p) => !isBackground(pixel(png, p.x, p.y)));
    expect(anyImagery, 'the map must show detail inside the country').toBe(true);
  });

  /**
   * The degraded state is still a masked state (FR-021, invariant I-10).
   *
   * With no imagery every pixel is background, so the INSIDE assertion correctly does not
   * apply here — which is exactly why it must never be weakened in the main test: it is
   * what stops this state passing as a working map.
   */
  test('stays inside the border when the basemap cannot load', async ({ page }) => {
    await page.route('**tiles.openfreemap.org/**', (r) => r.abort());
    await page.goto(`${HARNESS}?region=netherlands`, { waitUntil: 'load' });
    const container = page.locator('[data-testid="map-container"]');
    await container.waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.querySelectorAll('path.nl-complement').length > 0,
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(2000);

    // The user is told the map is degraded rather than left with an unexplained outline.
    await expect(page.locator('[data-testid="map-fallback"]')).toHaveCount(1);
    // …and the licence credit survives the degradation.
    await expect(page.locator('[data-testid="map-attribution"]')).toHaveCount(1);

    const box = await container.boundingBox();
    const png = PNG.sync.read(await page.screenshot({ clip: box, animations: 'disabled' }));
    for (const p of OUTSIDE) {
      expect(isBackground(pixel(png, p.x, p.y)), `${p.name} must be background`).toBe(true);
    }
  });

  /**
   * The guard's own sensitivity. With the mask removed the outside points MUST stop
   * being background. If this test ever starts failing, the guard has gone blind and
   * every other §VII assertion in the repo is worthless.
   */
  test('FAILS to find a clean border when the mask is removed (guard sensitivity)', async ({
    page,
  }) => {
    const png = await grab(page, { disableMask: true });
    const leaked = OUTSIDE.filter((p) => !isBackground(pixel(png, p.x, p.y)));
    // EVERY outside point must leak, not merely one. An earlier version of the harness
    // removed the mask only once, so a rebuild silently restored it and a `> 0` check
    // passed intermittently against a fully-masked map. Requiring all of them makes a
    // partially-effective strip a failure rather than a coin toss.
    expect(
      leaked.map((p) => p.name).sort(),
      `with the mask removed, imagery must leak at EVERY outside point — otherwise the ` +
        `guard cannot detect a §VII regression`,
    ).toEqual(OUTSIDE.map((p) => p.name).sort());
  });
});
