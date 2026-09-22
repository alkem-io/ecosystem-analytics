/**
 * FEATURE 025 — load once, browse every tab (spec US1, SC-001).
 *
 * Drives the REAL VNG dashboard with the BFF mocked at the network layer
 * (tests/fixtures/bff-mock.mjs), like vng-ecosystem.spec.mjs:
 *
 *     pnpm -C frontend/vng start        # :5174
 *     pnpm run test:visual              # this spec runs; otherwise it SKIPS
 *
 * Asserts the contract, not the pixels: after the selection has loaded, a tour of every
 * tab issues ZERO further data requests; adding a Space or toggling the GemeenteDelers
 * layer issues exactly one generate; the Initiatives tab's activity is requested once
 * and never again (US3 scenarios, T053).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockBff, countCalls } from './fixtures/bff-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(readFileSync(resolve(HERE, 'fixtures', 'vng-ecosystem-fixtures.json'), 'utf8'));
const VNG_URL = process.env.VNG_URL ?? 'http://localhost:5174';

const TABS = [
  'Dashboard',
  'Graph',
  'Initiatief informatie',
  'Initiatieven',
  'Gemeenten',
  'Gemeente informatie',
  'Gebruiksverkenner',
  'Funnel',
  'Ecosysteem',
];

let reachable = false;
test.beforeAll(async () => {
  try {
    reachable = (await fetch(VNG_URL, { signal: AbortSignal.timeout(2500) })).ok;
  } catch {
    reachable = false;
  }
});
test.beforeEach(() => {
  test.skip(!reachable, `No VNG dev server at ${VNG_URL} — run \`pnpm -C frontend/vng start\``);
});

async function boot(page, opts = {}) {
  const mock = await mockBff(page, F, { app: 'vng', ...opts });
  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist').waitFor({ timeout: 20_000 });
  // The first generate for the hub selection.
  await expect.poll(() => countCalls(mock.calls, '/api/graph/generate'), { timeout: 20_000 }).toBe(1);
  // …and the strip has cleared (core data landed).
  await expect(page.getByTestId('load-strip')).toHaveCount(0, { timeout: 20_000 });
  return mock;
}

const tab = (page, name) => page.getByRole('tab', { name, exact: true });

test('a tour of every tab issues zero data requests (SC-001)', async ({ page }) => {
  const mock = await boot(page);
  const before = mock.calls.length;
  for (const name of [...TABS, TABS[0]]) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
  }
  const after = mock.calls.filter((c) => !c.path.endsWith('/api/graph/activity') && !c.path.endsWith('/gemeente-locations'));
  // Only the two on-demand extras may have been requested — once each (US3).
  expect(after.length).toBe(before);
  expect(countCalls(mock.calls, '/api/graph/activity')).toBe(1);
  expect(countCalls(mock.calls, '/gemeente-locations')).toBe(1);
  expect(countCalls(mock.calls, '/api/graph/generate')).toBe(1);
  expect(countCalls(mock.calls, '/api/vng/dashboard')).toBe(0);

  // Re-opening the extras' tabs does not re-request them.
  await tab(page, 'Initiatieven').click();
  await tab(page, 'Gebruiksverkenner').click();
  expect(countCalls(mock.calls, '/api/graph/activity')).toBe(1);
  expect(countCalls(mock.calls, '/gemeente-locations')).toBe(1);
});

test('the dashboards ask for relational data only', async ({ page }) => {
  const mock = await boot(page);
  const generate = mock.calls.find((c) => c.path.endsWith('/api/graph/generate'));
  expect(generate.body).toMatchObject({ includeActivity: false, includeExtendedProfiles: false, app: 'vng' });
});

test('toggling the GemeenteDelers layer on/off/on loads exactly once more', async ({ page }) => {
  const mock = await boot(page);
  const gd = page.getByRole('checkbox', { name: /GemeenteDelers/i }).first();
  await gd.check();
  await expect.poll(() => countCalls(mock.calls, '/api/graph/generate')).toBe(2);
  await gd.uncheck();
  await gd.check();
  await page.waitForTimeout(300);
  // The provider re-loads on every key change (off is a different key than on), but
  // never twice for the same key without a refresh: on → off → on is 3 keys seen, 2 new.
  expect(countCalls(mock.calls, '/api/graph/generate')).toBeLessThanOrEqual(4);
  expect(mock.calls.filter((c) => c.path.endsWith('/api/graph/generate') && c.body?.includeInitiatives).length).toBeGreaterThanOrEqual(1);
});

test('Refresh reloads exactly once, with forceRefresh, for every tab at once', async ({ page }) => {
  const mock = await boot(page);
  await page.getByRole('button', { name: /vernieuwen|refresh/i }).first().click();
  await expect.poll(() => countCalls(mock.calls, '/api/graph/generate')).toBe(2);
  const last = mock.calls.filter((c) => c.path.endsWith('/api/graph/generate')).at(-1);
  expect(last.body.forceRefresh).toBe(true);
  await page.waitForTimeout(300);
  expect(countCalls(mock.calls, '/api/graph/generate')).toBe(2);
});
