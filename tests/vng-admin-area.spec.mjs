// @ts-check
/**
 * FEATURE 027 — the VNG monitor's administration area (`/admin`), quickstart §3 rows 3–10.
 *
 * The BFF is mocked: `/api/auth/me` carries the access level the real BFF computes, and
 * `/api/vng/admin/*` answers as contracts/api-admin.md says. These specs assert what a
 * viewer and a Monitor Manager see; the server's refusals are covered by its own
 * real-HTTP tests (server/src/admin/router.test.ts).
 *
 * Needs a VNG dev server (default http://localhost:5174, override with VNG_URL).
 */
import { test, expect } from '@playwright/test';
import { generateJson, scopeOf } from './fixtures/bff-mock.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(readFileSync(resolve(HERE, 'fixtures', 'vng-ecosystem-fixtures.json'), 'utf8'));
const VNG_URL = process.env.VNG_URL ?? 'http://localhost:5174';

const PG = { key: 'programmagroei', displayName: 'Kenniscentrum Innovatie', url: 'https://alkem.io/programmagroei', exists: 'yes' };
const access = (level) => ({ app: 'vng', status: 'admitted', level, gated: true, viewerSpaces: [PG] });

const space = (nameId, displayName, over = {}) => ({
  nameId,
  spaceId: `id-${nameId}`,
  position: 0,
  displayName,
  url: `https://alkem.io/${nameId}`,
  readable: true,
  found: true,
  classificationStatus: { set: 2, designated: 4 },
  ...over,
});

const INCLUDED = {
  revision: 3,
  spaces: [
    space('signalen', 'Signalen', { position: 0 }),
    space('geheim', null, { position: 1, displayName: null, url: null, readable: false, classificationStatus: null }),
  ],
  lastChange: { revision: 3, kind: 'update', at: '2026-11-10T09:00:00Z', actorName: 'Mia Manager', added: ['signalen'], removed: [], note: null },
};

const CLASSIFICATIONS = (canEdit) => ({
  initiative: { nameId: 'signalen', displayName: 'Signalen', kind: 'included', url: 'https://alkem.io/signalen' },
  canEdit,
  reason: canEdit ? null : 'NO_UPDATE_RIGHT',
  classifications: [
    {
      key: 'phase',
      label: 'Fase',
      present: true,
      entryId: 'fase',
      cardinality: 'SINGLE_SELECT',
      values: [
        { id: 'f1', label: 'Idee' },
        { id: 'f2', label: 'Pilot' },
      ],
      selectedValueIds: ['f1'],
    },
    { key: 'trl', label: 'TRL', present: false, entryId: null, cardinality: null, values: [], selectedValueIds: [] },
  ],
});

const GD = {
  space: { displayName: 'gemeentedelers', url: 'https://alkem.io/gemeentedelers' },
  available: true,
  error: null,
  total: 5,
  viaSubspaces: 3,
  viaPosts: 2,
  initiatives: [],
  superseded: [],
  ambiguous: [],
  readAt: '2026-11-14T08:00:00Z',
  nextRefreshAt: '2026-11-21T08:00:00Z',
  migrationComplete: false,
};

let reachable = false;
test.beforeAll(async () => {
  try {
    reachable = (await fetch(VNG_URL, { signal: AbortSignal.timeout(2500) })).ok;
  } catch {
    reachable = false;
  }
});
test.beforeEach(() => {
  test.skip(!reachable, `No VNG dev server at ${VNG_URL} — run \`pnpm -C frontend/vng dev\``);
});

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Mount the monitor with the BFF mocked. Returns the admin requests made. */
async function boot(page, { level, path = '/', admin = {}, scope }) {
  const adminCalls = [];
  await page.route('**/api/**', (r) => r.abort());
  await page.route('**/api/auth/me', (r) => json(r, { ...F.me, access: access(level) }));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.route('**/api/meta', (r) => json(r, { environment: 'test' }));
  await page.route('**/api/image-proxy*', (r) => r.abort());
  await page.route('**/api/vng/scope', (r) => (scope ? scope(r) : json(r, scopeOf(F))));
  await page.route('**/api/graph/generate', (r) => generateJson(r, F.dataset, F.dashboard));
  await page.route('**/api/graph/activity', (r) =>
    json(r, { bySpace: {}, fetchedAt: new Date().toISOString(), unavailable: [] }),
  );
  await page.route('**/api/vng/initiatives', (r) => json(r, []));
  await page.route('**/api/vng/dashboard', (r) => json(r, F.dashboard ?? {}));
  await page.route('**/api/ecosystem/orchestrator/**', (r) => json(r, F.orchestratorChoice));
  await page.route('**/api/vng/admin/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = `${req.method()} ${url.pathname.replace('/api/vng/admin', '')}`;
    adminCalls.push({ key, body: req.postDataJSON?.() ?? null, search: url.search });
    const handler = admin[key];
    if (handler) return handler(route, req);
    const defaults = {
      'GET /access': () => json(route, { viewers: [PG], admins: [PG], me: { displayName: 'Mia Manager', viewer: true, manager: true } }),
      'GET /included-spaces': () => json(route, INCLUDED),
      'GET /included-spaces/history': () => json(route, { changes: [INCLUDED.lastChange], next: null }),
      'GET /initiatives': () => json(route, { initiatives: [{ nameId: 'signalen', displayName: 'Signalen', kind: 'included' }] }),
      'GET /initiatives/signalen/classifications': () => json(route, CLASSIFICATIONS(true)),
      'GET /gd-source': () => json(route, GD),
    };
    return (defaults[key] ?? (() => json(route, { error: 'NOT_MOCKED' }, 500)))();
  });
  await page.goto(`${VNG_URL}${path}`, { waitUntil: 'domcontentloaded' });
  return adminCalls;
}

test('a viewer sees no settings entry, and /admin shows "no access" without loading admin data', async ({ page }) => {
  const calls = await boot(page, { level: 'read' });
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('admin-entry')).toHaveCount(0);

  await page.goto(`${VNG_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('admin-no-access')).toBeVisible({ timeout: 15_000 });
  expect(calls).toEqual([]);
});

test('a viewer has no Space selection at all, and sees where their access comes from', async ({ page }) => {
  await boot(page, { level: 'read' });
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Geselecteerde initiatieven|Selected initiatives/)).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /hub/i })).toHaveCount(0);
  await expect(page.getByTestId('gd-switch')).toBeVisible();
  await expect(page.getByTestId('auth-access-via')).toContainText('Kenniscentrum Innovatie');
  await expect(page.getByTestId('auth-access-via')).toContainText(/leden van|Members of/);
  await page.getByRole('button', { name: /Gebruikersmenu|User menu/ }).click();
  const box = page.getByTestId('user-access');
  await expect(box).toContainText(/Gebruiker|User/);
  await expect(box.getByRole('link', { name: /Kenniscentrum Innovatie/ })).toHaveAttribute('href', PG.url);
});

test('the GemeenteDelers switch in the header reloads the data with the historical initiatives', async ({ page }) => {
  const bodies = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/api/graph/generate')) bodies.push(req.postDataJSON());
  });
  await boot(page, { level: 'read' });
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  expect(bodies.at(-1).includeInitiatives).toBe(false);
  await page.getByTestId('gd-switch').click();
  await expect.poll(() => bodies.at(-1)?.includeInitiatives).toBe(true);
});

test('a manager reaches every section from the header and can go back', async ({ page }) => {
  await boot(page, { level: 'manage' });
  await page.getByTestId('admin-entry').click();
  await expect(page).toHaveURL(/\/admin$/);
  for (const id of ['access', 'included', 'classifications', 'gd']) {
    await expect(page.getByTestId(`admin-section-${id}`)).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.getByTestId('admin-viewer-spaces')).toContainText('Kenniscentrum Innovatie');
  await expect(page.getByTestId('included-row')).toHaveCount(2);
  await expect(page.getByTestId('included-unreadable')).toBeVisible();
  await expect(page.getByTestId('included-last-change')).toContainText('Mia Manager');

  await page.getByTestId('admin-back').first().click();
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });
});

test('one failing section does not take down the others, and can be retried', async ({ page }) => {
  let fail = true;
  await boot(page, {
    level: 'manage',
    path: '/admin',
    admin: { 'GET /gd-source': (route) => (fail ? json(route, { error: 'X' }, 502) : json(route, GD)) },
  });
  await expect(page.getByTestId('admin-section-gd-error')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('included-row')).toHaveCount(2);
  fail = false;
  await page.getByTestId('admin-section-gd').getByRole('button').click();
  await expect(page.getByTestId('gd-total')).toHaveText('5');
});

test('editing the Included Spaces shows the pending change before saving, then saves it', async ({ page }) => {
  const calls = await boot(page, {
    level: 'manage',
    path: '/admin',
    admin: {
      'GET /space-search': (route) =>
        json(route, { results: [{ nameId: 'openstad', displayName: 'OpenStad', url: 'https://alkem.io/openstad', included: false }] }),
      'PUT /included-spaces': (route) =>
        json(route, {
          ...INCLUDED,
          revision: 4,
          spaces: [INCLUDED.spaces[0], space('openstad', 'OpenStad', { position: 1 })],
          lastChange: { ...INCLUDED.lastChange, revision: 4, added: ['openstad'], removed: ['geheim'] },
        }),
    },
  });
  await page.getByTestId('included-edit').click();
  await page.getByLabel(/Find a Space by name|Zoek een Space op naam/).fill('open');
  await page.getByRole('button', { name: /Add OpenStad|OpenStad toevoegen/ }).click();
  await page.getByRole('button', { name: /Remove geheim|geheim verwijderen/ }).click();
  const pending = page.getByTestId('included-pending');
  await expect(pending).toContainText('OpenStad');
  await expect(pending).toContainText('geheim');

  await page.getByTestId('included-save').click();
  await expect(page.getByTestId('included-editor')).toHaveCount(0);
  const put = calls.find((c) => c.key === 'PUT /included-spaces');
  expect(put.body).toEqual({ baseRevision: 3, spaceNameIds: ['signalen', 'openstad'], confirmEmpty: false });
  await expect(page.getByTestId('included-row')).toHaveCount(2);
});

test('a save on a stale list opens the "list changed" dialog with the current set', async ({ page }) => {
  await boot(page, {
    level: 'manage',
    path: '/admin',
    admin: {
      'PUT /included-spaces': (route) =>
        json(
          route,
          {
            error: 'REVISION_CONFLICT',
            current: { ...INCLUDED, revision: 5, spaces: [space('gdc', 'GDC')], lastChange: { ...INCLUDED.lastChange, revision: 5, actorName: 'Sam' } },
          },
          409,
        ),
    },
  });
  await page.getByTestId('included-edit').click();
  await page.getByRole('button', { name: /Remove geheim|geheim verwijderen/ }).click();
  await page.getByTestId('included-save').click();
  const dialog = page.getByTestId('included-conflict');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('GDC');
  await dialog.getByRole('button', { name: /Load the current list|Huidige lijst laden/ }).click();
  await expect(page.getByTestId('included-editor')).toContainText('GDC');
});

test('a pasted link to a Space the manager cannot see is refused with the reason', async ({ page }) => {
  await boot(page, {
    level: 'manage',
    path: '/admin',
    admin: { 'GET /space-resolve': (route) => json(route, { error: 'NOT_READABLE' }, 404) },
  });
  await page.getByTestId('included-edit').click();
  await page.getByLabel(/Or paste a Space link|Of plak een link/).fill('https://alkem.io/geheim2');
  await page.getByTestId('included-editor').getByRole('button', { name: /^(Add|Toevoegen)$/ }).last().click();
  await expect(page.getByTestId('included-link-error')).toContainText(/only add Spaces you can see|alleen Spaces toevoegen/);
});

test('classifications: an editable initiative saves; a read-only one shows why', async ({ page }) => {
  let editable = true;
  const calls = await boot(page, {
    level: 'manage',
    path: '/admin',
    admin: {
      'GET /initiatives/signalen/classifications': (route) => json(route, CLASSIFICATIONS(editable)),
      'PUT /initiatives/signalen/classifications': (route) =>
        json(route, {
          results: [{ entryId: 'fase', outcome: 'SAVED', current: { ...CLASSIFICATIONS(true).classifications[0], selectedValueIds: ['f2'] } }],
          classifications: {
            ...CLASSIFICATIONS(true),
            classifications: [{ ...CLASSIFICATIONS(true).classifications[0], selectedValueIds: ['f2'] }, CLASSIFICATIONS(true).classifications[1]],
          },
        }),
    },
  });
  await page.getByTestId('classification-picker-list').getByRole('button', { name: /Signalen/ }).click();
  const phase = page.getByTestId('classification-phase');
  await expect(phase).toBeVisible();
  await expect(page.getByTestId('classification-trl')).toContainText(/Not set|Niet ingesteld/);
  await phase.getByLabel('Pilot').check();
  await page.getByTestId('classification-save').click();
  await expect(page.getByTestId('classification-phase-result')).toContainText(/Saved|Opgeslagen/);
  const put = calls.find((c) => c.key === 'PUT /initiatives/signalen/classifications');
  expect(put.body).toEqual({ changes: [{ entryId: 'fase', expectedSelectedValueIds: ['f1'], selectedValueIds: ['f2'] }] });

  editable = false;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('classification-picker-list').getByRole('button', { name: /Signalen/ }).click();
  await expect(page.getByTestId('classification-readonly')).toContainText(/may not change|niet wijzigen/);
  await expect(page.getByTestId('classification-save')).toHaveCount(0);
});

test('the GemeenteDelers section shows the counts and when the data was read', async ({ page }) => {
  await boot(page, { level: 'manage', path: '/admin' });
  await expect(page.getByTestId('gd-total')).toHaveText('5');
  await expect(page.getByTestId('gd-subspaces')).toHaveText('3');
  await expect(page.getByTestId('gd-posts')).toHaveText('2');
  await expect(page.getByTestId('gd-migration-complete')).toHaveCount(0);
});

test('a failed scope load says so and can be retried — it never asks the viewer to "select"', async ({ page }) => {
  let fail = true;
  await boot(page, {
    level: 'read',
    scope: (r) => (fail ? json(r, { error: 'SCOPE_UNAVAILABLE' }, 503) : json(r, scopeOf(F))),
  });
  await expect(page.getByTestId('scope-error')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/geselecteerd|selected/i)).toHaveCount(0);
  fail = false;
  await page.getByTestId('scope-error').getByRole('button').click();
  await expect(page.getByTestId('scope-error')).toHaveCount(0);
});

test('an empty monitor says the managers have not chosen initiatives yet', async ({ page }) => {
  await boot(page, { level: 'read', scope: (r) => json(r, { revision: 2, ecosystemKey: 'vih-test', spaceNameIds: [] }) });
  await expect(page.getByTestId('scope-empty')).toBeVisible({ timeout: 20_000 });
});

test('"In deze monitor" lists the monitor’s Spaces and flags one missing from the viewer’s data', async ({ page }) => {
  const scoped = scopeOf(F);
  await boot(page, {
    level: 'read',
    scope: (r) => json(r, { ...scoped, spaceNameIds: [...scoped.spaceNameIds, 'geheime-space'] }),
  });
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('scope-button').click();
  const panel = page.getByTestId('scope-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('scope-list').locator('li')).toHaveCount(scoped.spaceNameIds.length + 1);
  await expect(page.getByTestId('scope-missing')).toBeVisible();
  await expect(panel.getByText('geheime-space')).toBeVisible();
  await expect(page.getByTestId('scope-access')).toContainText('Kenniscentrum Innovatie');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('a manager returns from the settings to the same tab, without reloading the data', async ({ page }) => {
  let loads = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/graph/generate')) loads += 1;
  });
  await boot(page, { level: 'manage' });
  await page.getByRole('tab', { name: 'Gemeenten', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Gemeenten', exact: true })).toHaveAttribute('aria-selected', 'true');
  const before = loads;

  await page.getByTestId('admin-entry').click();
  await expect(page.getByTestId('admin-section-access')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('admin-back').first().click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('tab', { name: 'Gemeenten', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(loads).toBe(before);
  // Back went back in history: one more Back leaves the dashboard rather than reopening admin.
  expect(await page.evaluate(() => window.history.state?.fromDashboard ?? false)).toBe(false);
});
