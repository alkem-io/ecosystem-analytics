/**
 * FEATURE 025 — one joined-up progress indicator (spec US2, SC-003, FR-009/010/011).
 *
 * Same harness as dashboard-load-once.spec.mjs (tests/fixtures/bff-mock.mjs; SKIPS
 * without a VNG dev server). The BFF mock streams the generate response slowly so the
 * strip can be observed across tab switches.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockBff } from './fixtures/bff-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(readFileSync(resolve(HERE, 'fixtures', 'vng-ecosystem-fixtures.json'), 'utf8'));
const VNG_URL = process.env.VNG_URL ?? 'http://localhost:5174';

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

const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const strip = (page) => page.getByTestId('load-strip');

test('the same strip, with continuing progress, on every tab; gone everywhere at once', async ({ page }) => {
  // A slow stream: the mock delays the whole response, and the strip shows the plan
  // (queued → loading …) while it waits.
  await mockBff(page, F, { app: 'vng', delayMs: 2500 });
  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist').waitFor({ timeout: 20_000 });

  await expect(strip(page)).toBeVisible();
  const before = await strip(page).textContent();
  await tab(page, 'Graph').click();
  await expect(strip(page)).toBeVisible();
  await tab(page, 'Gemeenten').click();
  await expect(strip(page)).toBeVisible();
  // Never reset by a tab switch: the item is still "Initiatieven" in the same stage or later.
  expect(await strip(page).textContent()).toContain('Initiatieven');
  expect(before).toContain('Initiatieven');

  await expect(strip(page)).toHaveCount(0, { timeout: 20_000 });
  await tab(page, 'Dashboard').click();
  await expect(strip(page)).toHaveCount(0);
});

test('a failed extra item shows Retry in the strip and isolates to its own tab (FR-010/011)', async ({ page }) => {
  await mockBff(page, F, { app: 'vng', activityFail: true });
  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist').waitFor({ timeout: 20_000 });
  await expect(strip(page)).toHaveCount(0, { timeout: 20_000 });

  await tab(page, 'Initiatieven').click();
  const item = page.getByTestId('load-item-activity');
  await expect(item).toHaveAttribute('data-stage', 'failed', { timeout: 10_000 });
  await expect(item.getByRole('button', { name: /opnieuw|retry/i })).toBeVisible();
  // The table itself rendered (core data is there); only activity is unavailable.
  await expect(page.getByRole('table').or(page.getByTestId('record-cards')).first()).toBeVisible();

  // Every other tab is untouched by the failure.
  await tab(page, 'Gemeenten').click();
  await expect(page.getByTestId('ecosystem-error')).toHaveCount(0);
  await expect(item).toHaveAttribute('data-stage', 'failed'); // still reported, on every tab
});
