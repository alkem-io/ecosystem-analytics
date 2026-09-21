/**
 * MOBILE NAVIGATION AND DISPLAY — the shared dashboard shell (@ea/shared).
 *
 * Drives the REAL VNG dashboard with the BFF mocked at the network layer, exactly like
 * vng-city-perspective.spec.mjs, so it needs no Alkemio login and no backend:
 *
 *     pnpm -C frontend/vng start        # :5174
 *     pnpm run test:visual              # this spec runs; otherwise it SKIPS
 *
 * WHY THIS SPEC EXISTS. Before the mobile work, at an iPhone viewport the shell put an
 * 18rem selection column and an eight-tab row side by side inside 390px. The result was
 * not "cramped": the content column measured 102px, the document scrolled to 1193px, and
 * SEVEN OF THE EIGHT TABS COULD NOT BE CLICKED AT ALL — the app was unnavigable on a
 * phone. Every assertion below is anchored to that: the page must never scroll
 * horizontally, and every tab must be reachable at every width.
 *
 * The three widths are the three layouts, not three arbitrary sizes:
 *   390px  phone      — drawer nav, card lists, disclosure filters
 *   820px  tablet     — still below `lg`, so still drawer + cards
 *   1440px desktop    — static column + inline tabs; asserted so the mobile work cannot
 *                       silently change the layout it was supposed to leave alone.
 */
import { test, expect, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * An iPhone 13 profile minus `defaultBrowserType` — Playwright refuses a browser switch
 * inside a describe block, and the point here is the viewport, the touch pointer and the
 * mobile user agent, not WebKit specifically.
 */
const { defaultBrowserType: _iphoneBrowser, ...IPHONE_13 } = devices['iPhone 13'];

const HERE = dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(readFileSync(resolve(HERE, 'fixtures', 'vng-city-fixtures.json'), 'utf8'));
const VNG_URL = process.env.VNG_URL ?? 'http://localhost:5174';

/** The nine tabs the VNG dashboard opts into, in shell order. */
const TAB_NAMES = [
  'Dashboard',
  'Initiatief informatie',
  'Initiatieven',
  'Gemeente informatie',
  'Gemeenten',
  'Gebruiksverkenner',
  'Funnel',
  'Intake',
  'Ecosysteem',
  'Graph',
];

/** The funnel needs a phase per space; the fixture predates the field (see vng-funnel.spec). */
const PHASES = [
  { key: 'v1', label: 'Pre-intake' },
  { key: 'v2', label: 'Intake' },
  { key: 'v3', label: 'Initiatief' },
  { key: 'v4', label: 'Formalisatie' },
  { key: 'v5', label: 'Beheer' },
];
const PHASED = F.dataset.nodes.filter((n) => n.type === 'SPACE_L0').slice(0, 5);
const dataset = {
  ...F.dataset,
  nodes: F.dataset.nodes.map((n) => {
    const i = PHASED.findIndex((p) => p.id === n.id);
    return i >= 0 ? { ...n, phase: { ...PHASES[i], nr: i } } : n;
  }),
};
const dashboard = {
  ...F.dashboard,
  phaseDistribution: {
    phases: PHASES.map((p, i) => ({
      key: p.key,
      label: p.label,
      nr: i,
      count: 1,
      items: [PHASED[i].label ?? PHASED[i].id],
    })),
    unphasedCount: 1,
    unphasedItems: [],
  },
};

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

async function boot(page) {
  // Registered FIRST, so every specific mock below still wins — Playwright matches the
  // most recently added route. Anything this spec forgot is ABORTED rather than allowed
  // out to a real BFF: a running backend answers an unauthenticated call with 401, and
  // `api.ts` turns a 401 into a redirect to Alkemio's sign-in page. Every assertion below
  // then fails against a page that is not the app at all. Aborting reproduces the
  // no-backend behaviour this spec's header promises, whether or not one is running.
  await page.route('**/api/**', (r) => r.abort());
  await page.route('**/api/auth/me', (r) => json(r, F.me));
  await page.route('**/api/hubs?*', (r) => json(r, F.hubs));
  await page.route('**/api/hubs/*/spaces', (r) => json(r, F.hubSpaces));
  await page.route('**/api/graph/generate', (r) => json(r, dataset));
  await page.route('**/api/graph/progress', (r) =>
    json(r, { step: 'ready', spacesTotal: 6, spacesCompleted: 6 }),
  );
  await page.route('**/api/vng/dashboard', (r) => json(r, dashboard));
  await page.route('**/api/vng/initiatives', (r) => json(r, []));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.route('**/api/meta', (r) => json(r, { environment: 'test' }));
  // Avatars and basemap tiles would hit the network; stub them so nothing hangs.
  await page.route('**/api/image-proxy*', (r) => r.abort());
  await page.route('**://tiles.openfreemap.org/**', (r) => r.abort());

  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist').waitFor({ timeout: 30_000 });
}

/**
 * The document must never scroll sideways. This is the single assertion that would have
 * caught the original defect, and it catches every future one of the same shape: any
 * element too wide for the viewport widens `documentElement.scrollWidth` unless it has
 * been given its own scroll container.
 */
async function expectNoHorizontalPageScroll(page, label) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `page scrolls horizontally on ${label}`).toBeLessThanOrEqual(clientWidth + 1);
}

// ───────────────────────────────────────────────────────────────────────────────
// Phone
// ───────────────────────────────────────────────────────────────────────────────
test.describe('phone (390px)', () => {
  test.use({ ...IPHONE_13 });

  test('every tab is reachable, and no tab makes the page scroll sideways', async ({ page }) => {
    await boot(page);
    // The full set is present — the mobile shell hides no destination.
    expect(await page.getByRole('tab').allTextContents()).toEqual(TAB_NAMES);

    for (const name of TAB_NAMES) {
      const tab = page.getByRole('tab', { name, exact: true });
      // `click` (not `dispatchEvent`) on purpose: this is exactly what failed before —
      // the tab existed in the DOM but was scrolled outside a container with no way to
      // reach it, so Playwright's actionability check timed out.
      await tab.click({ timeout: 10_000 });
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await page.waitForTimeout(700);
      await expectNoHorizontalPageScroll(page, `tab "${name}"`);
    }
  });

  test('the content area gets the viewport, not a sliver of it', async ({ page }) => {
    await boot(page);
    const main = await page.locator('main').boundingBox();
    const viewport = page.viewportSize();
    // Before the drawer, `main` was 102px of a 390px viewport. Anything under ~90% now
    // means a persistent column has crept back in.
    expect(main.width).toBeGreaterThan(viewport.width * 0.9);
  });

  test('the selection panel is a drawer: off-canvas, opened from the header, dismissible', async ({
    page,
  }) => {
    await boot(page);
    const menu = page.getByRole('button', { name: 'Selectie' });
    await expect(menu).toBeVisible();

    // Closed: the panel is `inert` + aria-hidden, so its controls are not reachable.
    const refresh = page.getByRole('button', { name: 'Vernieuwen' });
    await expect(refresh).toHaveCount(0);

    await menu.click();
    await expect(refresh).toBeVisible();

    // Escape dismisses.
    await page.keyboard.press('Escape');
    await expect(refresh).toHaveCount(0);

    // The backdrop dismisses. Tap well clear of the drawer's 85vw width.
    await menu.click();
    await expect(refresh).toBeVisible();
    await page.mouse.click(page.viewportSize().width - 6, page.viewportSize().height / 2);
    await expect(refresh).toHaveCount(0);

    // While open the drawer is modal: the backdrop is what receives a tap aimed at the
    // tabs behind it, and closes. That is deliberate — a half-covered tab row invites
    // taps that land on the wrong destination.
    await menu.click();
    await expect(refresh).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Gemeenten', exact: true }).click({ timeout: 2000 }),
    ).rejects.toThrow();
    await page.keyboard.press('Escape');

    // A tab change the SHELL makes (the graph→details and cities→city bridges) does
    // dismiss it, since no backdrop tap was involved.
    await menu.click();
    await expect(refresh).toBeVisible();
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('vng:openSpace', { detail: { spaceId: 'slimme-stad' } })),
    );
    await expect(refresh).toHaveCount(0);
    expect(
      (await page.locator('[role=tab][aria-selected=true]').textContent())?.trim(),
    ).toBe('Initiatief informatie');
  });

  test('wide tables become card lists that keep their sort and their filters', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'Gemeenten', exact: true }).click();

    // No table at this width — the same rows are re-laid as cards.
    await expect(page.locator('main table')).toHaveCount(0);
    const cards = page.locator('main article');
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    expect(await cards.count()).toBe(F.dashboard.cityPopulation.participating.length);

    // Sorting survives the loss of column headers: the default is participation
    // descending, and reversing it must reverse the list.
    const sortToggle = page.getByRole('button', { name: /gesorteerd/i });
    const firstBefore = await cards.first().locator('h3, button').first().textContent();
    await sortToggle.click();
    await page.waitForTimeout(300);
    const firstAfter = await cards.first().locator('h3, button').first().textContent();
    expect(firstAfter).not.toBe(firstBefore);

    // Filtering survives too: the dropdowns are behind a disclosure that reports how
    // many are active, and picking one narrows the list.
    const before = await cards.count();
    await page.getByRole('button', { name: /Filters/ }).click();
    // By accessible name, not by position: the first <select> in the toolbar is the
    // SORT control, not a filter.
    await page.getByRole('combobox', { name: 'Provincie' }).selectOption({ index: 1 });
    await page.waitForTimeout(300);
    expect(await cards.count()).toBeLessThan(before);
    await expectNoHorizontalPageScroll(page, 'Cities cards, filtered');
  });

  test('a card opens its city, and the destination tab is scrolled into view', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'Gemeenten', exact: true }).click();
    const card = page.locator('main article').first();
    await card.waitFor({ timeout: 20_000 });
    const name = (await card.getByRole('button').first().textContent())?.trim();
    await card.getByRole('button').first().click();
    await page.waitForTimeout(700);

    // FR-018 still holds on a phone: THAT city, not the first one.
    const active = page.locator('[role=tab][aria-selected=true]');
    expect((await active.textContent())?.trim()).toBe('Gemeente informatie');
    expect((await page.locator('main h2').first().textContent())?.trim()).toBe(name);

    // …and the tab the shell switched to is visible in the strip, not scrolled off it.
    const strip = await page.locator('[role=tablist] > div').first().boundingBox();
    const box = await active.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(strip.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(strip.x + strip.width + 1);
  });

  test('touch targets on the navigation chrome are at least 44px', async ({ page }) => {
    await boot(page);
    // WCAG 2.5.5 / iOS HIG. Checked on the controls that navigate, which are the ones a
    // mistap actually costs you something on.
    for (const target of [
      page.getByRole('button', { name: 'Selectie' }),
      page.getByRole('tab', { name: 'Dashboard', exact: true }),
      page.getByRole('tab', { name: 'Graph', exact: true }),
    ]) {
      const box = await target.boundingBox();
      expect(box.height, `${await target.textContent()} is too short to tap`).toBeGreaterThanOrEqual(
        44,
      );
    }
  });

  test('a focused filter input does not trigger iOS zoom (16px minimum)', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'Gemeenten', exact: true }).click();
    const size = await page
      .locator('main input[type=search]')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    // Under 16px, iOS Safari zooms the viewport on focus and never zooms back — which
    // strands the whole layout off-screen for the rest of the session.
    expect(size).toBeGreaterThanOrEqual(16);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Tablet — still below `lg`, so still the compact layout
// ───────────────────────────────────────────────────────────────────────────────
test.describe('tablet (820px)', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('keeps the drawer and the card lists, and never scrolls sideways', async ({ page }) => {
    await boot(page);
    await expect(page.getByRole('button', { name: 'Selectie' })).toBeVisible();

    await page.getByRole('tab', { name: 'Initiatieven', exact: true }).click();
    await expect(page.locator('main table')).toHaveCount(0);
    await expect(page.locator('main article').first()).toBeVisible({ timeout: 20_000 });
    await expectNoHorizontalPageScroll(page, 'tablet Initiatives');
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Desktop — the layout the mobile work must leave untouched
// ───────────────────────────────────────────────────────────────────────────────
test.describe('desktop (1440px)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('keeps the static selection column, the inline tabs and the real tables', async ({
    page,
  }) => {
    await boot(page);
    // No drawer button: the panel is a permanent column, and its controls are reachable
    // without opening anything.
    await expect(page.getByRole('button', { name: 'Selectie' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Vernieuwen' })).toBeVisible();

    await page.getByRole('tab', { name: 'Gemeenten', exact: true }).click();
    await expect(page.locator('main table')).toHaveCount(1);
    await expect(page.locator('main article')).toHaveCount(0);
    await expectNoHorizontalPageScroll(page, 'desktop Cities');
  });
});
