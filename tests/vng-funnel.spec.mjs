/**
 * FEATURE 022 — the innovation funnel.
 *
 * Drives the REAL VNG dashboard with the BFF mocked at the network layer, exactly like
 * vng-city-perspective.spec.mjs:
 *
 *     pnpm -C frontend/vng start        # :5174
 *     pnpm run test:visual              # this spec runs; otherwise it SKIPS
 *
 * Reuses tests/fixtures/vng-city-fixtures.json and augments it in flight with the two
 * things the funnel needs and that fixture predates: a `phase` on the SPACE_L0 nodes and
 * a `phaseDistribution` on the dashboard payload. Augmenting here rather than
 * regenerating keeps one fixture as the single source of truth for the VNG dataset.
 *
 * NOTE ON SCOPE (spec A-012): dot POSITIONS are settled by collision relaxation and are
 * not reproducible, so this spec asserts the FRAME and structural facts only — stage
 * count, labels, dot counts, hover behaviour. There is deliberately no screenshot of the
 * dot layer. The layout invariants themselves are unit-tested in
 * frontend/vng/src/dashboard/funnel.test.ts.
 */
import { test, expect } from '@playwright/test';
import { generateJson, activityJson, scopeOf } from './fixtures/bff-mock.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(readFileSync(resolve(HERE, 'fixtures', 'vng-city-fixtures.json'), 'utf8'));
const VNG_URL = process.env.VNG_URL ?? 'http://localhost:5174';

/** The VNG pipeline, in authored order. */
const PHASES = [
  { key: 'v1', label: 'Pre-intake' },
  { key: 'v2', label: 'Intake' },
  { key: 'v3', label: 'Initiatief' },
  { key: 'v4', label: 'Formalisatie' },
  { key: 'v5', label: 'Beheer' },
];

/**
 * Give five of the six spaces a phase and leave the sixth unphased, so the run exercises
 * both a populated funnel and the "no phase" holding area.
 */
const L0 = F.dataset.nodes.filter((n) => n.type === 'SPACE_L0');
const PHASED = L0.slice(0, 5);
const UNPHASED = L0.slice(5);

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
      items: [PHASED[i].displayName],
    })),
    total: PHASED.length,
  },
};

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

async function boot(page, { withPhases = true, dashboardDelayMs = 0 } = {}) {
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
  // Feature 027: VNG reads its Spaces from the monitor scope, not a hub.
  await page.route('**/api/vng/scope', (r) => json(r, scopeOf(F)));
  // Feature 025: the counts (phase vocabulary) travel WITH the dataset; the two sources
  // can no longer land in either order, so `dashboardDelayMs` just delays the one load.
  await page.route('**/api/graph/generate', async (r) => {
    if (dashboardDelayMs) await new Promise((done) => setTimeout(done, dashboardDelayMs));
    return generateJson(r, withPhases ? dataset : F.dataset, withPhases ? dashboard : F.dashboard);
  });
  await page.route('**/api/graph/activity', (r) => activityJson(r, withPhases ? dataset : F.dataset));
  await page.route('**/api/graph/progress', (r) =>
    json(r, { step: 'ready', spacesTotal: 6, spacesCompleted: 6 }),
  );
  await page.route('**/api/vng/initiatives', (r) => json(r, []));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.route('**/api/meta', (r) => json(r, { environment: 'test' }));
  await page.route('**/api/image-proxy*', (r) => r.abort());

  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist').waitFor({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Funnel', exact: true }).click();
  // With no phase vocabulary there is deliberately no funnel to wait for (FR-025).
  // The funnel itself: the first `main svg` can be an icon in the legend above it.
  if (withPhases) await page.locator('main svg[role="group"]').waitFor({ timeout: 25_000 });
}

test('the funnel tab is reachable and draws the whole frame', async ({ page }) => {
  await boot(page);

  // FR-002: the Formation stage leads, followed by one stage per authored phase. Each
  // is drawn as a header box above the funnel.
  for (const label of ['Formation', ...PHASES.map((p) => p.label)]) {
    await expect(page.locator('main svg text', { hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
  }
  await expect(page.locator('main svg rect[rx="5"]')).toHaveCount(PHASES.length + 1);

  // FR-005: two curved bounding bars enclose the sequence.
  await expect(page.locator('main svg path[stroke-width="2.5"]')).toHaveCount(2);

  // The funnel is drawn taller than its box so the mouth can open properly
  // (MOUTH_BOOST in FunnelTab), and its own panel scrolls for the remainder. What must
  // still hold is that the funnel is fully drawn and that the PAGE never scrolls — a
  // page-level scrollbar means the panel failed to contain it.
  const geometry = await page.evaluate(() => {
    const svg = document.querySelector('main svg[role="group"]'); // the funnel, not a legend icon
    const box = svg.getBoundingClientRect();
    const panel = svg.closest('[class*="overflow-y-auto"]');
    return {
      drawn: box.width > 0 && box.height > 0,
      scrollablePanel: !!panel && panel.scrollHeight > panel.clientHeight,
      pageScrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    };
  });
  expect(geometry.drawn).toBe(true);
  expect(geometry.scrollablePanel).toBe(true);
  expect(geometry.pageScrolls).toBe(false);
});

test('the NDS and VNG-2030 filters narrow the funnel to one classification', async ({ page }) => {
  await boot(page);

  const countsNow = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('main svg g > text:nth-child(3)')].map((t) => Number(t.textContent)),
    );
  const before = await countsNow();
  const total = before.reduce((a, b) => a + b, 0);
  expect(total).toBeGreaterThan(0);

  // Both filters default to "all" — the funnel starts unfiltered.
  const nds = page.getByRole('combobox', { name: 'NDS' });
  await expect(nds).toHaveValue('__all__');

  // Selecting a single value can only ever remove initiatives, never add any.
  await nds.selectOption({ index: 1 });
  await page.waitForTimeout(400);
  const after = await countsNow();
  expect(after.reduce((a, b) => a + b, 0)).toBeLessThan(total);

  // Back to "all" restores the full pipeline.
  await nds.selectOption('__all__');
  await page.waitForTimeout(400);
  expect(await countsNow()).toEqual(before);
});

test('the dots can be coloured by NDS or VNG 2030, with a legend that highlights one value', async ({ page }) => {
  await boot(page);
  const colours = () =>
    page.evaluate(() => [...document.querySelectorAll('[data-funnel-dot]')].map((c) => c.getAttribute('data-funnel-colors')));
  const bySource = await colours();
  expect(bySource.length).toBeGreaterThan(0);
  await expect(page.getByTestId('funnel-category-legend')).toHaveCount(0);
  // Every colouring has a legend — by source too — ABOVE the funnel, on screen without
  // scrolling past the dots and the list of names.
  const sourceLegend = page.getByTestId('funnel-source-legend');
  await expect(sourceLegend).toBeVisible();
  await expect(sourceLegend.getByTestId('funnel-legend-item').first()).toContainText('Groei');
  await expect(sourceLegend).toBeInViewport();
  const legendBox = await sourceLegend.boundingBox();
  const svgBox = await page.locator('svg[role="group"]').boundingBox();
  expect(legendBox.y + legendBox.height).toBeLessThanOrEqual(svgBox.y);

  const colorBy = page.getByTestId('funnel-color-by');
  await expect(colorBy).toHaveValue('source');
  await colorBy.selectOption('nds');
  const legend = page.getByTestId('funnel-category-legend');
  await expect(legend).toBeVisible();
  await expect(legend).toBeInViewport();
  const items = legend.getByTestId('funnel-legend-item');
  expect(await items.count()).toBeGreaterThan(0);
  // Every dot now wears category colours (or the "other"/"none" greys), not the source hues.
  const byNds = await colours();
  expect(byNds).toHaveLength(bySource.length);
  expect(byNds.every((c) => /var\(--cat-/.test(c))).toBe(true);
  // The legend counts add up to at least one per dot (a dot with two values counts twice).
  const counts = await items.evaluateAll((els) => els.map((e) => Number(e.lastElementChild.textContent)));
  expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(byNds.length);

  // Clicking a value highlights it: its dots stay, the others fade.
  await items.first().click();
  await expect(items.first()).toHaveAttribute('aria-pressed', 'true');
  const opacities = await page.evaluate(() =>
    [...document.querySelectorAll('[data-funnel-dot]')].map((c) => Number(c.getAttribute('fill-opacity'))),
  );
  expect(opacities.some((o) => o > 0.5)).toBe(true);
  // With names shown, each name fades or stays with its own dot.
  const showNames = page.getByRole('checkbox', { name: /Namen tonen|Show names/ });
  await showNames.check();
  const paired = await page.evaluate(() =>
    [...document.querySelectorAll('[data-funnel-name]')].map((n) => {
      const dot = document.querySelector(`[data-funnel-dot="${n.getAttribute('data-funnel-name')}"]`);
      return { dotFaded: Number(dot.getAttribute('fill-opacity')) < 0.2, nameFaded: Number(n.getAttribute('opacity')) < 0.5 };
    }),
  );
  expect(paired).toHaveLength(opacities.length);
  expect(paired.some((p) => p.nameFaded)).toBe(true);
  expect(paired.every((p) => p.dotFaded === p.nameFaded)).toBe(true);
  await showNames.uncheck();
  await items.first().click();
  await expect(items.first()).toHaveAttribute('aria-pressed', 'false');

  await colorBy.selectOption('source');
  expect(await colours()).toEqual(bySource);
});

/** One Space per status, in fixture order: active, quiet, dormant, none — the rest not visible. */
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const LAST_AT = Object.fromEntries([daysAgo(5), daysAgo(60), daysAgo(200), null].map((at, i) => [L0[i].id, at]));

async function bootWithHandelen(page) {
  const calls = [];
  await boot(page);
  // Registered last, so it wins over boot()'s mock.
  await page.route('**/api/graph/activity', (r) => {
    calls.push(1);
    return activityJson(r, { ...dataset, lastAt: LAST_AT });
  });
  return calls;
}

test('the dots can be coloured by handelen, which is only asked for then', async ({ page }) => {
  const calls = await bootWithHandelen(page);
  expect(calls).toHaveLength(0);
  await page.getByTestId('funnel-color-by').selectOption('handelen');
  const legend = page.getByTestId('funnel-handelen-legend');
  await expect(legend).toBeInViewport();
  const items = legend.getByTestId('funnel-legend-item');
  const text = await items.allInnerTexts();
  expect(text[0]).toMatch(/^(Actief|Active) \(≤ 30/);
  expect(text[1]).toMatch(/^(Stil|Quiet) \(31–90/);
  expect(text[2]).toMatch(/^(Slapend|Dormant) \(> 90/);
  expect(text[3]).toMatch(/^(Geen handelen bekend|No activity recorded)/);
  expect(text[4]).toMatch(/^(Handelen niet zichtbaar|Activity not visible)/);
  expect(calls).toHaveLength(1);
  const dots = await page.locator('[data-funnel-dot]').count();
  const counts = await items.evaluateAll((els) => els.map((e) => Number(e.lastElementChild.textContent)));
  expect(counts.reduce((a, b) => a + b, 0)).toBe(dots); // one status per dot
  await expect(page.locator(`[data-funnel-dot="${L0[0].id}"]`)).toHaveAttribute('data-funnel-colors', 'var(--handelen-active)');
  await page.locator(`[data-funnel-dot="${L0[0].id}"]`).focus();
  await expect(page.getByRole('tooltip')).toContainText(/Laatste handeling|Last activity/);
  // Back and again: no second request.
  await page.getByTestId('funnel-color-by').selectOption('source');
  await page.getByTestId('funnel-color-by').selectOption('handelen');
  await expect(legend).toBeVisible();
  expect(calls).toHaveLength(1);
});

test('a failed handelen load says so and claims nothing', async ({ page }) => {
  await boot(page);
  await page.route('**/api/graph/activity', (r) => r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"ACTIVITY_FAILED","message":"x"}' }));
  await page.getByTestId('funnel-color-by').selectOption('handelen');
  await expect(page.getByTestId('funnel-handelen-status')).toContainText(/niet beschikbaar|not available/);
  expect(await page.locator('[data-funnel-colors^="var(--handelen"]').count()).toBe(0);
});

test('the phase chart splits by handelen only when its checkbox is on (default off)', async ({ page }) => {
  const calls = await bootWithHandelen(page);
  // Two initiatives (one active, one quiet) in the same phase, so their segments stack.
  const stacked = {
    ...dataset,
    nodes: dataset.nodes.map((n) => (n.id === L0[1].id ? { ...n, phase: { ...PHASES[0], nr: 0 } } : n)),
  };
  await page.route('**/api/graph/generate', (r) => generateJson(r, stacked, dashboard));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Dashboard', exact: true }).click();
  const toggle = page.getByTestId('phase-handelen-toggle');
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId('phase-handelen-legend')).toHaveCount(0);
  expect(calls).toHaveLength(0);

  await toggle.check();
  const legend = page.getByTestId('phase-handelen-legend');
  await expect(legend.getByRole('listitem')).toHaveCount(5);
  expect(calls).toHaveLength(1);
  // The segments of a status stack to its legend count; the phase totals stay labelled.
  await expect(page.locator('.phase-handelen-active path').first()).toBeVisible();
  await expect(page.locator('.phase-handelen-quiet path').first()).toBeVisible();
  // Each segment is labelled with its OWN count (1), not the stack's running total.
  const labels = await page.locator('[data-segment]').allTextContents();
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every((l) => l === '1')).toBe(true);

  await toggle.uncheck();
  await expect(legend).toHaveCount(0);
  await expect(page.locator('[class*="phase-handelen-"]')).toHaveCount(0);
});

test('one dot per initiative, and the unphased one is held outside the funnel', async ({ page }) => {
  await boot(page);

  // FR-017: every initiative is drawn — 6 spaces + 3 GD initiatives in this fixture.
  const dots = page.locator('main svg [data-funnel-dot]');
  await expect(dots).toHaveCount(F.dataset.nodes.filter((n) =>
    ['SPACE_L0', 'INITIATIVE'].includes(n.type),
  ).length);

  // FR-024/FR-024a: the holding area exists and names its count.
  await expect(page.locator('main svg text', { hasText: /Nog geen fase \(1\)/ })).toHaveCount(1);
});

test('hovering a dot reveals the initiative, including its classifications', async ({ page }) => {
  await boot(page);

  await page.locator('main svg [data-funnel-dot]').first().hover();
  const card = page.getByRole('tooltip');
  await expect(card).toBeVisible();
  // FR-018: source, participation and phase are all named.
  await expect(card).toContainText('Deelnemende gemeenten');
  await expect(card).toContainText('Fase');
  await expect(card).toContainText('Bron');

  // FR-020: the detail clears when the pointer leaves.
  await page.locator('main h2').first().hover();
  await expect(card).toHaveCount(0);
});

test('says it is loading — not "no phase classification" — while the payload is in flight', async ({
  page,
}) => {
  // The regression: the funnel guarded its loading state on the GRAPH alone, but the
  // phase vocabulary arrives with the DASHBOARD payload. With the graph cached (the
  // normal case) it landed first, and for the gap between the two responses the funnel
  // told the user their phase classification was not configured.
  const booted = boot(page, { dashboardDelayMs: 2500 });

  await page.getByRole('tablist').waitFor({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Funnel', exact: true }).click();

  // While only the graph has answered: the loading message, and NOT the empty state.
  await expect(page.getByText('Funnel wordt opgebouwd…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Geen fase-classificatie ingesteld')).toHaveCount(0);

  // …and once the payload lands, the funnel draws.
  await booted;
  await expect(page.locator('main svg').first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText('Geen fase-classificatie ingesteld')).toHaveCount(0);
});

test('explains itself when no phase classification is configured', async ({ page }) => {
  await boot(page, { withPhases: false });
  // FR-025: an explanatory empty state, not an empty frame.
  await expect(page.getByText('Geen fase-classificatie ingesteld')).toBeVisible();
});

test('renders no raw i18n keys', async ({ page }) => {
  await boot(page);
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
  expect(raw).toEqual([]);
});
