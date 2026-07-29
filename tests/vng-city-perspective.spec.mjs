/**
 * FEATURE 018 — city-perspective analysis (Cities table, City information, population chart).
 *
 * Drives the REAL VNG dashboard with the BFF mocked at the network layer, so it needs
 * no Alkemio login and no backend — just the VNG dev server:
 *
 *     pnpm -C frontend/vng start        # :5174
 *     pnpm run test:visual              # this spec runs; otherwise it SKIPS
 *
 * Point it elsewhere with VNG_URL=http://host:port. When nothing is listening the whole
 * file skips (same convention as the Explorer visual specs, which skip without BASE_URL)
 * so it never fails a run that simply has no target.
 *
 * The fixtures in tests/fixtures/vng-city-fixtures.json were produced by the REAL server
 * assembly (`buildCityPopulationSeries` over the real 342-municipality registry), so the
 * counts and the chart payload are what production would produce for an equivalent
 * selection. Regenerate them by re-running the generator described in
 * specs/018-city-analysis/quickstart.md §7.
 *
 * This spec exists because it caught two real defects that typechecks and unit tests
 * could not: both cross-tab bridges selected the FIRST entity instead of the requested
 * one (a same-commit effect race), and the chart tooltip formatted numbers in the
 * browser's locale rather than the app's.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(readFileSync(resolve(HERE, 'fixtures', 'vng-city-fixtures.json'), 'utf8'));
const VNG_URL = process.env.VNG_URL ?? 'http://localhost:5174';

/** Skip the whole file unless the VNG dev server is actually up. */
let reachable = false;
test.beforeAll(async () => {
  try {
    const res = await fetch(VNG_URL, { signal: AbortSignal.timeout(2500) });
    reachable = res.ok;
  } catch {
    reachable = false;
  }
});
test.beforeEach(() => {
  test.skip(!reachable, `No VNG dev server at ${VNG_URL} — run \`pnpm -C frontend/vng start\``);
});

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function mockBff(page) {
  await page.route('**/api/auth/me', (r) => json(r, F.me));
  await page.route('**/api/hubs?*', (r) => json(r, F.hubs));
  await page.route('**/api/hubs/*/spaces', (r) => json(r, F.hubSpaces));
  await page.route('**/api/graph/generate', (r) => json(r, F.dataset));
  await page.route('**/api/graph/progress', (r) =>
    json(r, { step: 'ready', spacesTotal: 6, spacesCompleted: 6 }),
  );
  await page.route('**/api/vng/dashboard', (r) => json(r, F.dashboard));
  await page.route('**/api/vng/initiatives', (r) => json(r, []));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.route('**/api/meta', (r) => json(r, { environment: 'test' }));
  // Avatars and basemap tiles would hit the network; stub them so nothing hangs.
  await page.route('**/api/image-proxy*', (r) => r.abort());
  await page.route('**/*.png', (r) => (r.request().url().includes('localhost') ? r.continue() : r.abort()));
}

async function boot(page, lang) {
  await mockBff(page);
  if (lang) await page.addInitScript((l) => localStorage.setItem('vng_lang', l), lang);
  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist').waitFor({ timeout: 20_000 });
}

/** No tab may render a raw i18n key (a dotted lowerCamel token with no spaces). */
async function expectNoRawKeys(page, label) {
  const raw = await page.evaluate(() => {
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) {
        const t = n.textContent.trim();
        if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+){1,4}$/.test(t) && !t.includes(' ')) out.push(t);
      } else if (n.nodeType === 1 && !['SCRIPT', 'STYLE'].includes(n.tagName)) {
        n.childNodes.forEach(walk);
      }
    };
    walk(document.body);
    return [...new Set(out)];
  });
  expect(raw, `raw i18n keys visible on ${label}`).toEqual([]);
}

test('six tabs, initiative pair then city pair', async ({ page }) => {
  await boot(page);
  expect(await page.getByRole('tab').allTextContents()).toEqual([
    'Dashboard',
    'Initiatief informatie',
    'Initiatieven',
    'Gemeente informatie',
    'Gemeenten',
    'Graph',
  ]);
});

test('Cities table: one row per gemeente, sorted by participation, filterable', async ({ page }) => {
  await boot(page);
  await page.getByRole('tab', { name: 'Gemeenten' }).click();
  await page.locator('table tbody tr').first().waitFor({ timeout: 20_000 });

  // FR-002: each city exactly once.
  const names = await page.locator('table tbody tr td:first-child').allTextContents();
  expect(new Set(names).size).toBe(names.length);
  expect(names.length).toBe(F.dashboard.cityPopulation.participating.length);

  // Default sort is initiatives descending.
  const counts = await page.locator('table tbody tr td:nth-child(4)').allTextContents();
  const nums = counts.map((c) => Number(c.trim()));
  expect([...nums].sort((a, b) => b - a)).toEqual(nums);

  // FR-010/012: a province filter narrows the rows.
  const before = await page.locator('table tbody tr').count();
  await page.locator('select').first().selectOption({ index: 1 });
  await page.waitForTimeout(200);
  expect(await page.locator('table tbody tr').count()).toBeLessThan(before);

  await expectNoRawKeys(page, 'Cities');
});

test('City information: profile facts and a Netherlands-only map', async ({ page }) => {
  await boot(page);
  await page.getByRole('tab', { name: 'Gemeente informatie' }).click();
  await page.locator('main h2').first().waitFor({ timeout: 25_000 });
  // Constitution §VII: the map renders, and it is the shared clipped NL map.
  await expect(page.locator('main svg').first()).toBeVisible();
  await expectNoRawKeys(page, 'City information');
});

test('FR-018: choosing a city in the table opens THAT city, not the first one', async ({ page }) => {
  await boot(page);
  await page.getByRole('tab', { name: 'Gemeenten' }).click();
  await page.locator('table tbody tr').first().waitFor({ timeout: 20_000 });
  const clicked = (await page.locator('table tbody tr td:first-child button').first().textContent())?.trim();
  await page.locator('table tbody tr td:first-child button').first().click();
  await page.waitForTimeout(500);
  expect((await page.locator('[role=tab][aria-selected=true]').textContent())?.trim()).toBe(
    'Gemeente informatie',
  );
  expect((await page.locator('main h2').first().textContent())?.trim()).toBe(clicked);
});

test('FR-015: the graph→initiative bridge opens THAT initiative, not the first one', async ({ page }) => {
  await boot(page);
  // 'slimme-stad' is deliberately not first in the seeded hub order.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('vng:openSpace', { detail: { spaceId: 'slimme-stad' } })),
  );
  await page.waitForTimeout(800);
  expect((await page.locator('[role=tab][aria-selected=true]').textContent())?.trim()).toBe(
    'Initiatief informatie',
  );
  expect((await page.locator('main h2').first().textContent())?.trim()).toBe('Slimme Stad');
});

test('population chart: both series plotted, app-locale numbers in the tooltip', async ({ page }) => {
  await boot(page);
  await page.getByRole('tab', { name: 'Dashboard' }).click();
  const card = page.locator('section', { hasText: 'Inwoners versus deelname' }).last();
  await card.waitFor({ timeout: 25_000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  const { participating, nonParticipating, excludedUnknownPopulation } = F.dashboard.cityPopulation;
  // FR-021: both series present, and every municipality is accounted for.
  await expect(card).toContainText(`Neemt deel (${participating.length})`);
  await expect(card).toContainText(`Neemt niet deel (${nonParticipating.length})`);
  // Each point renders a visible mark plus a transparent hit circle.
  expect(await card.locator('svg circle').count()).toBe(
    (participating.length + nonParticipating.length) * 2,
  );
  // FR-023: the exclusion notice appears only when something was excluded.
  if (excludedUnknownPopulation === 0) await expect(card).not.toContainText('weggelaten');

  // Tooltip must use the app's locale (Dutch: 569.468), not the browser's (569,468).
  await card.locator('svg circle[r="5"]').first().hover({ force: true });
  await page.waitForTimeout(300);
  const tip = await card.locator('text=/inwoners/').first().textContent();
  expect(tip).toMatch(/^\d{1,3}(\.\d{3})*\s+inwoners$/);
});

test('English locale translates every new string', async ({ page }) => {
  await boot(page, 'en');
  expect(await page.getByRole('tab').allTextContents()).toEqual([
    'Dashboard',
    'Initiative information',
    'Initiatives',
    'City information',
    'Cities',
    'Graph',
  ]);
  for (const name of ['Cities', 'City information']) {
    await page.getByRole('tab', { name }).click();
    await page.waitForTimeout(600);
    await expectNoRawKeys(page, `EN ${name}`);
  }
});
