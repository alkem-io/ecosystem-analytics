/**
 * Initiatives tab — XLSX export.
 *
 * Drives the REAL VNG dashboard with the BFF mocked at the network layer (same harness
 * and fixtures as vng-city-perspective.spec.mjs), so it needs no Alkemio login and no
 * backend — just the VNG dev server:
 *
 *     pnpm -C frontend/vng start        # :5174
 *     pnpm run test:visual              # this spec runs; otherwise it SKIPS
 *
 * The export is the one part of the tab a typecheck cannot reach: it only exists once a
 * real browser has run the lazy `exceljs` import, produced a Blob and fired the download.
 * So the spec takes the actual downloaded file, parses it back with exceljs, and asserts
 * the sheet against the table — including that the export is the FULL set: narrowing the
 * table with a filter must not narrow the file, or a partial dataset ships looking like a
 * complete one.
 */
import { test, expect } from '@playwright/test';
import { generateJson, activityJson } from './fixtures/bff-mock.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// `exceljs` is a dependency of the frontend workspaces, not of the repo root where
// Playwright runs, so resolve it from the package that actually declares it — the same
// library the app uses to WRITE the file reads it back here.
const ExcelJS = createRequire(import.meta.url)(
  createRequire(import.meta.url).resolve('exceljs', {
    paths: [new URL('../frontend/vng/', import.meta.url).pathname],
  }),
);

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
  await page.route('**/api/**', (r) => r.abort());
  await page.route('**/api/auth/me', (r) => json(r, F.me));
  await page.route('**/api/hubs?*', (r) => json(r, F.hubs));
  await page.route('**/api/hubs/*/spaces', (r) => json(r, F.hubSpaces));
  await page.route('**/api/graph/generate', (r) => generateJson(r, F.dataset, F.dashboard));
  await page.route('**/api/graph/activity', (r) => activityJson(r, F.dataset));
  await page.route('**/api/graph/progress', (r) =>
    json(r, { step: 'ready', spacesTotal: 6, spacesCompleted: 6 }),
  );
  await page.route('**/api/vng/initiatives', (r) => json(r, []));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.route('**/api/meta', (r) => json(r, { environment: 'test' }));
  await page.route('**/api/image-proxy*', (r) => r.abort());
}

async function openInitiatives(page) {
  await mockBff(page);
  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist').waitFor({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Initiatieven' }).click();
  await page.locator('table tbody tr').first().waitFor({ timeout: 20_000 });
}

/** Click Download XLSX, capture the file, and parse the first worksheet back. */
async function downloadSheet(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByRole('button', { name: 'Download XLSX' }).click(),
  ]);
  const path = await download.path();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return { download, sheet: wb.worksheets[0] };
}

/** The data rows of the exported sheet: row 1 is the title, 2 blank, 3 the header. */
const dataRows = (sheet) => {
  const out = [];
  sheet.eachRow((row, n) => {
    if (n > 3) out.push(row.values.slice(1).map((v) => (v == null ? '' : v)));
  });
  return out;
};

test('exports every initiative as an .xlsx, in the table\'s current order', async ({ page }) => {
  await openInitiatives(page);

  const names = await page.locator('table tbody tr td:first-child').allTextContents();
  const { download, sheet } = await downloadSheet(page);

  // Named for the dashboard and dated, so two exports never collide in ~/Downloads.
  expect(download.suggestedFilename()).toMatch(/^vng-dashboard-initiatives-\d{4}-\d{2}-\d{2}\.xlsx$/);

  // Header: the table's columns plus the ones the screen abbreviates (the full gemeente
  // list, which is only a tooltip, and the SDG / award columns that are filters only).
  const header = sheet.getRow(3).values.slice(1);
  expect(header).toEqual([
    'Initiatief',
    'Type',
    'Aantal gemeenten',
    'Gemeenten',
    'Provincie',
    'Leden',
    'Leads',
    'VNG 2030',
    'NDS',
    "Thema's",
    'SDG',
    'Prijs',
    'Common Ground',
    'Afgelopen week',
    'Afgelopen maand',
    'Alle tijd',
    'Activiteitsniveau',
  ]);

  // Unfiltered, the sheet is exactly the table: same rows, same order.
  const rows = dataRows(sheet);
  expect(rows.map((r) => r[0])).toEqual(names.map((n) => n.trim()));

  // The gemeente count is a NUMBER, not text — an export you cannot sum is a screenshot.
  for (const r of rows) expect(typeof r[2]).toBe('number');
});

test('a filtered table still exports every row', async ({ page }) => {
  await openInitiatives(page);

  const before = await page.locator('table tbody tr').count();
  // The province dropdown — picked by its accessible name rather than by position.
  await page.getByLabel('Provincie').selectOption({ index: 1 });
  await page.waitForTimeout(200);
  const after = await page.locator('table tbody tr').count();
  expect(after).toBeLessThan(before);

  // The filter narrowed the SCREEN, not the file.
  const { sheet } = await downloadSheet(page);
  expect(dataRows(sheet).length).toBe(before);
});

test('the export follows the sort, not the filter', async ({ page }) => {
  await openInitiatives(page);

  // Sort by gemeente count descending, then filter the table down to one province.
  await page.getByRole('button', { name: 'Aantal gemeenten' }).click();
  await page.waitForTimeout(200);
  await page.getByLabel('Provincie').selectOption({ index: 1 });
  await page.waitForTimeout(200);

  const { sheet } = await downloadSheet(page);
  const counts = dataRows(sheet).map((r) => r[2]);
  expect(counts.length).toBeGreaterThan(await page.locator('table tbody tr').count());
  expect([...counts].sort((a, b) => b - a)).toEqual(counts);
});
