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

async function boot(page, { withPhases = true } = {}) {
  await page.route('**/api/auth/me', (r) => json(r, F.me));
  await page.route('**/api/hubs?*', (r) => json(r, F.hubs));
  await page.route('**/api/hubs/*/spaces', (r) => json(r, F.hubSpaces));
  await page.route('**/api/graph/generate', (r) => json(r, withPhases ? dataset : F.dataset));
  await page.route('**/api/graph/progress', (r) =>
    json(r, { step: 'ready', spacesTotal: 6, spacesCompleted: 6 }),
  );
  await page.route('**/api/vng/dashboard', (r) => json(r, withPhases ? dashboard : F.dashboard));
  await page.route('**/api/vng/initiatives', (r) => json(r, []));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.route('**/api/meta', (r) => json(r, { environment: 'test' }));
  await page.route('**/api/image-proxy*', (r) => r.abort());

  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist').waitFor({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Trechter' }).click();
  // With no phase vocabulary there is deliberately no funnel to wait for (FR-025).
  if (withPhases) await page.locator('main svg').first().waitFor({ timeout: 25_000 });
}

test('the funnel tab is reachable and draws the whole frame', async ({ page }) => {
  await boot(page);

  // FR-002: a GemeenteDelers mouth followed by one stage per authored phase.
  for (const label of ['GemeenteDelers', ...PHASES.map((p) => p.label)]) {
    await expect(page.locator('main svg text', { hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
  }

  // FR-005: two curved bounding bars enclose the sequence.
  await expect(page.locator('main svg path[stroke-width="2.5"]')).toHaveCount(2);

  // FR-006: the whole funnel fits — the SVG is no taller than its container.
  const fits = await page.evaluate(() => {
    const svg = document.querySelector('main svg');
    const box = svg.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom <= window.innerHeight + 1;
  });
  expect(fits).toBe(true);
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
