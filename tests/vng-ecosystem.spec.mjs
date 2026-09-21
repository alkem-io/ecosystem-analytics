/**
 * FEATURE 024 — the ecosystem map.
 *
 * Drives the REAL VNG dashboard with the BFF mocked at the network layer, exactly like
 * vng-funnel.spec.mjs:
 *
 *     pnpm -C frontend/vng start        # :5174
 *     pnpm run test:visual              # this spec runs; otherwise it SKIPS
 *
 * Uses tests/fixtures/vng-ecosystem-fixtures.json, which reproduces the real VIH
 * situation: an orchestrator Space (`programmagroei`) that the hub does NOT list, a role
 * held only on a subspace, one connector and one single-membership organisation.
 *
 * SCOPE: structure only. Organisation POSITIONS come from a relaxation that is
 * deterministic but not meaningful to assert here — the layout's own invariants are
 * unit-tested in frontend/vng/src/dashboard/ecosystem-layout.test.ts. This spec asserts
 * what the SPEC promises: who is at the centre, what is drawn, what the filters do.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(readFileSync(resolve(HERE, 'fixtures', 'vng-ecosystem-fixtures.json'), 'utf8'));
const VNG_URL = process.env.VNG_URL ?? 'http://localhost:5174';

const LISTED = F.hubSpaces.spaces.map((s) => s.nameId);

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

/** Mount the dashboard on the Ecosystem tab with the BFF mocked. */
async function boot(page, { choice = F.orchestratorChoice, onPut } = {}) {
  await page.route('**/api/**', (r) => r.abort());
  await page.route('**/api/auth/me', (r) => json(r, F.me));
  await page.route('**/api/hubs?*', (r) => json(r, F.hubs));
  await page.route('**/api/hubs/*/spaces', (r) => json(r, F.hubSpaces));
  await page.route('**/api/graph/generate', (r) => json(r, F.dataset));
  await page.route('**/api/graph/progress', (r) =>
    json(r, { step: 'ready', spacesTotal: LISTED.length, spacesCompleted: LISTED.length }),
  );
  await page.route('**/api/vng/dashboard', (r) => json(r, F.dashboard));
  await page.route('**/api/vng/initiatives', (r) => json(r, []));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.route('**/api/meta', (r) => json(r, { environment: 'test' }));
  await page.route('**/api/image-proxy*', (r) => r.abort());
  await page.route('**/api/ecosystem/orchestrator/**', (r) => {
    if (r.request().method() !== 'GET' && onPut) return onPut(r);
    return json(r, choice);
  });

  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist').waitFor({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Ecosysteem', exact: true }).click();
}

const map = (page) => page.getByTestId('ecosystem-map');

test('draws one ecosystem with the unlisted orchestrator at its centre', async ({ page }) => {
  const clicked = Date.now();
  await boot(page);

  // SC-003: interactive within 3 seconds when the data is already there.
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 3_000 });
  expect(Date.now() - clicked).toBeLessThan(25_000); // generous page-load budget; the 3s is above

  await expect(map(page).locator('[data-ecosystem]')).toHaveCount(1);

  // FR-003 + the planning addendum: `programmagroei` is NOT in the hub's list and is
  // still the centre of the picture.
  expect(LISTED).not.toContain('programmagroei');
  await expect(map(page).locator('[data-role="orchestrator"][data-space="programmagroei"]')).toHaveCount(1);

  // Every listed space is an initiative, and the orchestrator is not among them.
  await expect(map(page).locator('[data-role="initiative"]')).toHaveCount(LISTED.length);
  await expect(map(page).locator('[data-role="initiative"][data-space="programmagroei"]')).toHaveCount(0);

  // FR-016: one part-of line per initiative, always drawn.
  await expect(map(page).locator('[data-edge="partOf"]')).toHaveCount(LISTED.length);
});

test('draws organisations with role strength, provenance and connector emphasis', async ({ page }) => {
  await boot(page);
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  // FR-005/019: lead reads heavier than member.
  await expect(map(page).locator('[data-edge="org"][data-strength="lead"]').first()).toBeVisible();
  await expect(map(page).locator('[data-edge="org"][data-strength="member"]').first()).toBeVisible();

  // FR-004a: a role held only on a subspace still connects, drawn differently.
  await expect(map(page).locator('[data-edge="org"][data-provenance="viaSubspace"]')).toHaveCount(1);
  expect(await map(page).locator('[data-edge="org"][data-provenance="direct"]').count()).toBeGreaterThan(0);

  // FR-006: the orchestrator+initiative organisation is emphasised.
  expect(await map(page).locator('[data-connector="true"]').count()).toBeGreaterThanOrEqual(1);

  // FR-017: initiative cards carry their organisation count.
  const withCounts = await map(page).locator('[data-role="initiative"] text', { hasText: /^· \d+$/ }).count();
  expect(withCounts).toBeGreaterThan(0);
});

test('hovering an organisation highlights its reach and dims the rest', async ({ page }) => {
  await boot(page);
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  const connector = map(page).locator('[data-connector="true"]').first();
  await connector.hover();

  const dimmed = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-testid="ecosystem-map"] [data-org]')];
    return nodes.filter((n) => Number(n.getAttribute('opacity')) < 0.5).length;
  });
  expect(dimmed).toBeGreaterThan(0);
  await expect(connector).toHaveAttribute('opacity', '1');
});

test('the two filters narrow the map and report what they hid', async ({ page }) => {
  await boot(page);
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  const orgs = () => map(page).locator('[data-org]').count();
  const before = await orgs();
  expect(before).toBeGreaterThan(1);

  // FR-020a (b): only organisations on two or more spaces survive.
  await page.getByTestId('ecosystem-filter-multi').check();
  await expect(page.getByTestId('ecosystem-filter-hidden')).toBeVisible();
  const afterMulti = await orgs();
  expect(afterMulti).toBeLessThan(before);

  // Initiatives, the orchestrator and the part-of lines are untouched.
  await expect(map(page).locator('[data-role="initiative"]')).toHaveCount(LISTED.length);
  await expect(map(page).locator('[data-edge="partOf"]')).toHaveCount(LISTED.length);

  // FR-020a (a) on top: the intersection is smaller still, or equal.
  await page.getByTestId('ecosystem-filter-orchestrator').check();
  expect(await orgs()).toBeLessThanOrEqual(afterMulti);

  await page.getByTestId('ecosystem-filter-clear').click();
  expect(await orgs()).toBe(before);
  await expect(page.getByTestId('ecosystem-filter-hidden')).toHaveCount(0);
});

test('the page never scrolls horizontally at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 15_000 });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

// ── US2: confirming or correcting the orchestrator ──────────────────────────────

test('the orchestrator control is preset from the built-in default and says so', async ({ page }) => {
  await boot(page);
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  await expect(page.getByTestId('ecosystem-orchestrator-select')).toHaveValue('programmagroei');
  await expect(page.getByTestId('ecosystem-orchestrator-source')).toHaveText(/standaard/i);
  // Nothing to revert to yet.
  await expect(page.getByTestId('ecosystem-orchestrator-reset')).toHaveCount(0);
});

test('choosing a different space re-centres the map in under a second and saves the choice', async ({ page }) => {
  const puts = [];
  await boot(page, {
    onPut: (r) => {
      const method = r.request().method();
      if (method === 'PUT') {
        puts.push(JSON.parse(r.request().postData() ?? '{}'));
        return json(r, { ...F.orchestratorChoice, own: 'signalen' });
      }
      return json(r, { ...F.orchestratorChoice, own: null });
    },
  });
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  const started = Date.now();
  await page.getByTestId('ecosystem-orchestrator-select').selectOption('signalen');

  // SC-004: the redraw is immediate, not a round trip away.
  await expect(map(page).locator('[data-role="orchestrator"][data-space="signalen"]')).toHaveCount(1, {
    timeout: 1_000,
  });
  expect(Date.now() - started).toBeLessThan(1_000);

  // The former orchestrator takes its place among the initiatives.
  await expect(map(page).locator('[data-role="initiative"][data-space="programmagroei"]')).toHaveCount(1);
  await expect(map(page).locator('[data-role="initiative"]')).toHaveCount(LISTED.length);

  expect(puts).toEqual([{ spaceNameId: 'signalen' }]);
  await expect(page.getByTestId('ecosystem-orchestrator-source')).toHaveText(/jouw keuze/i);
  await expect(page.getByTestId('ecosystem-orchestrator-reset')).toBeVisible();
});

test('reset withdraws the choice and returns to the preset', async ({ page }) => {
  let stored = 'signalen';
  await boot(page, {
    onPut: (r) => {
      if (r.request().method() === 'DELETE') stored = null;
      return json(r, { ...F.orchestratorChoice, own: stored });
    },
    choice: { ...F.orchestratorChoice, own: 'signalen' },
  });
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });
  await expect(map(page).locator('[data-role="orchestrator"][data-space="signalen"]')).toHaveCount(1);

  await page.getByTestId('ecosystem-orchestrator-reset').click();

  await expect(map(page).locator('[data-role="orchestrator"][data-space="programmagroei"]')).toHaveCount(1);
  expect(stored).toBeNull();
  await expect(page.getByTestId('ecosystem-orchestrator-source')).toHaveText(/standaard/i);
});

test('another viewer’s saved choice becomes the preset, labelled as such', async ({ page }) => {
  await boot(page, {
    choice: {
      ...F.orchestratorChoice,
      own: null,
      community: { spaceNameId: 'signalen', count: 2 },
    },
  });
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  await expect(map(page).locator('[data-role="orchestrator"][data-space="signalen"]')).toHaveCount(1);
  await expect(page.getByTestId('ecosystem-orchestrator-source')).toHaveText(/andere bezoekers/i);
});

test('a built-in default that is not there falls through to the guess, with a notice', async ({ page }) => {
  await boot(page, {
    choice: { ...F.orchestratorChoice, own: null, community: null, builtIn: 'bestaat-niet' },
  });
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  await expect(page.getByTestId('ecosystem-orchestrator-notice')).toBeVisible();
  // Something is still at the centre — the guess — and it is not the missing default.
  await expect(map(page).locator('[data-role="orchestrator"]')).toHaveCount(1);
  await expect(map(page).locator('[data-role="orchestrator"][data-space="bestaat-niet"]')).toHaveCount(0);
});

// ── US3: drilling into the detail tabs, and coming back ─────────────────────────

test('clicking an initiative opens the space details tab, and coming back keeps the map as it was', async ({ page }) => {
  await boot(page);
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  // Set something up worth preserving.
  await page.getByTestId('ecosystem-filter-multi').check();
  await expect(page.getByTestId('ecosystem-filter-hidden')).toBeVisible();

  await map(page).locator('[data-role="initiative"]').first().click();
  await expect(page.getByRole('tab', { name: 'Initiatief informatie', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.getByRole('tab', { name: 'Ecosysteem', exact: true }).click();
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  // FR-025: the filter survived the round trip, and so did the orchestrator.
  await expect(page.getByTestId('ecosystem-filter-multi')).toBeChecked();
  await expect(page.getByTestId('ecosystem-filter-hidden')).toBeVisible();
  await expect(map(page).locator('[data-role="orchestrator"][data-space="programmagroei"]')).toHaveCount(1);
});

test('clicking a gemeente organisation opens the city tab', async ({ page }) => {
  await boot(page);
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  // The fixture gives exactly one gemeente a role in the ecosystem: Den Haag.
  const gemeente = map(page).locator('[data-org="org-gemeente-den-haag"]');
  await expect(gemeente).toHaveCount(1);
  await gemeente.click();

  await expect(page.getByRole('tab', { name: 'Gemeente informatie', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('clicking the orchestrator opens its own space details', async ({ page }) => {
  await boot(page);
  await map(page).locator('[data-ecosystem]').first().waitFor({ timeout: 10_000 });

  await map(page).locator('[data-role="orchestrator"]').click();
  await expect(page.getByRole('tab', { name: 'Initiatief informatie', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
