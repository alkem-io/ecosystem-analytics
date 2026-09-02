import { test, expect } from '@playwright/test';

/**
 * Map-mode interaction (feature 021, US6 / FR-017a).
 *
 * Handing the camera to MapLibre meant the SVG had to stop swallowing pointer events, and
 * everything that used to hang off d3-zoom had to be re-hung off the new camera. The first
 * cut of that change silently broke BOTH: every node listener was dead because the
 * `pointer-events: auto` opt-in was described in a comment but never written, and
 * level-of-detail froze at the initial zoom because nothing called it any more.
 *
 * Neither showed up in any test, because nothing tested interaction. This spec is that
 * test. It is deliberately automated rather than left as a manual sweep — a checklist item
 * that says "verify hover still works" is what allowed the regression through.
 */

const HARNESS = 'http://127.0.0.1:5199/harness/index.html';

async function mountMap(page, query = '') {
  await page.goto(`${HARNESS}?surface=forcegraph${query}`, { waitUntil: 'load' });
  await page.locator('[data-testid="map-container"]').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => document.querySelectorAll('path.nl-complement').length > 0,
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(2000);
}

test.describe('map mode keeps every interaction it had', () => {
  test('gestures reach the basemap, but nodes are still hit-testable', async ({ page }) => {
    await mountMap(page);

    const hits = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.nodes > *')]
        .map((n) => ({ n, b: n.getBoundingClientRect() }))
        .filter((o) => o.b.width > 2)
        .slice(0, 5);
      return nodes.map(({ b }) => {
        const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return { insideSvg: !!hit?.closest('svg'), isCanvas: hit?.tagName === 'CANVAS' };
      });
    });

    expect(hits.length, 'the fixture must render nodes to test against').toBeGreaterThan(0);
    for (const h of hits) {
      // If this fails, `pointer-events: none` on the SVG root has no per-node opt-in and
      // every hover, click, selection and drag handler in map mode is dead.
      expect(h.insideSvg, 'a node must be hit-testable, not covered by the canvas').toBe(true);
      expect(h.isCanvas).toBe(false);
    }
  });

  test('empty map area falls through to the basemap canvas', async ({ page }) => {
    await mountMap(page);
    // A corner is outside the country: no node there, so the gesture must reach MapLibre.
    const hit = await page.evaluate(() => {
      const el = document.elementFromPoint(40, 40);
      return { tag: el?.tagName ?? null, isCanvas: el?.tagName === 'CANVAS' };
    });
    expect(hit.isCanvas, `expected the canvas, got ${hit.tag}`).toBe(true);
  });

  test('the overlay follows the camera on zoom — the transform actually changes', async ({
    page,
  }) => {
    await mountMap(page);
    const read = () => page.evaluate(() => document.querySelector('svg > g')?.getAttribute('transform'));

    const before = await read();
    const box = await page.locator('[data-testid="map-container"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(1200);
    const after = await read();

    // If these match, the camera handover is inert: MapLibre is not receiving the gesture,
    // or `onSync` is not wired, and the markers would sit still while the imagery moves.
    expect(after, 'zooming must change the overlay transform').not.toBe(before);
  });

  test('switching region reframes the map and keeps it masked', async ({ page }) => {
    await mountMap(page);
    const national = await page.evaluate(() =>
      document.querySelector('path.nl-complement')?.getAttribute('d')?.length ?? 0,
    );

    await mountMap(page, '&region=utrecht');
    const province = await page.evaluate(() =>
      document.querySelector('path.nl-complement')?.getAttribute('d')?.length ?? 0,
    );

    expect(national, 'the national mask must be drawn').toBeGreaterThan(0);
    expect(province, 'the province mask must be drawn').toBeGreaterThan(0);
    expect(province, 'a different region must produce a different mask').not.toBe(national);
  });
});
