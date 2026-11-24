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
  visibility: { contentPublic: true, status: 'ACTIVE' },
  classifications: [
    { key: 'nds', present: true, values: ['Data'] },
    { key: 'vng2030', present: true, values: [] },
    { key: 'phase', present: true, values: ['Idee'] },
    { key: 'trl', present: false, values: [] },
  ],
  ...over,
});

const DESIGNATIONS = [
  { key: 'nds', label: 'NDS-prioriteit' },
  { key: 'vng2030', label: 'VNG 2030 thema' },
  { key: 'phase', label: 'Fase' },
  { key: 'trl', label: 'TRL' },
];

const ACCESS = {
  viewers: [PG],
  admins: [PG],
  me: { displayName: 'Mia Manager', viewer: true, manager: true },
  editable: true,
  source: 'config',
  revision: 0,
  updatedAt: null,
  updatedByName: null,
};
const IM = { key: 'innovatiemonitor', displayName: 'Innovatiemonitor', url: 'https://alkem.io/innovatiemonitor', exists: 'yes' };
/** One change of each kind, newest first — the ONE audit log. */
const HISTORY = {
  entries: [
    {
      type: 'access',
      at: '2026-11-12T09:00:00Z',
      actorName: 'Mia Manager',
      from: { viewers: [{ key: 'programmagroei', displayName: 'Kenniscentrum Innovatie' }], admins: [{ key: 'programmagroei', displayName: 'Kenniscentrum Innovatie' }] },
      to: { viewers: [{ key: 'programmagroei', displayName: 'Kenniscentrum Innovatie' }, { key: 'innovatiemonitor', displayName: 'Innovatiemonitor' }], admins: [{ key: 'programmagroei', displayName: 'Kenniscentrum Innovatie' }] },
    },
    { type: 'classification', at: '2026-11-11T09:00:00Z', actorName: 'Sam', spaceNameId: 'signalen', entryLabel: 'Fase', from: ['Idee'], to: ['Pilot'] },
    { type: 'spaces', revision: 3, kind: 'update', at: '2026-11-10T09:00:00Z', actorName: 'Mia Manager', added: ['signalen'], removed: [], note: null },
  ],
  next: null,
  names: { signalen: 'Signalen' },
};
const INCLUDED = {
  revision: 3,
  designations: DESIGNATIONS,
  spaces: [
    space('signalen', 'Signalen', { position: 0 }),
    space('geheim', null, {
      position: 1,
      displayName: null,
      url: null,
      readable: false,
      classificationStatus: null,
      visibility: null,
      classifications: null,
    }),
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
  initiatives: [
    { nameId: 'gd-sub', displayName: 'Slim parkeren', source: 'subspace', url: 'https://alkem.io/gemeentedelers/challenges/gd-sub', nds: ['Data'], vng2030: ['Wonen'] },
    { nameId: 'gd-post', displayName: 'Oud bericht', source: 'post', url: null, nds: ['Data'], vng2030: ['Bestaanszekerheid'] },
  ],
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
      'GET /access': () => json(route, ACCESS),
      'GET /included-spaces': () => json(route, INCLUDED),
      'GET /history': () => json(route, HISTORY),
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
  await expect(page.getByTestId('auth-access-via')).toContainText(/als lid van|as a member of/);
  await expect(page.getByTestId('auth-access-via').getByRole('link', { name: 'Kenniscentrum Innovatie' })).toHaveAttribute('href', PG.url);
  await expect(page.getByTestId('prototype-notice').getByRole('link')).toHaveAttribute('href', 'https://alkem.io/innovatiemonitor');
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
  await expect(page.getByTestId('gd-switch')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('load-strip')).toHaveCount(0, { timeout: 20_000 });
  // The notice's "member of …" line arrives with the access report and can add a line;
  // let the page settle before measuring, so only the switch is under test.
  await expect(page.getByTestId('auth-access-via')).toBeVisible();

  // Nothing on the page moves when the switch is used: not the controls row, not the
  // tabs, not the content (the load strip floats; the chip keeps its width).
  const layout = () =>
    page.evaluate(() =>
      ['gd-switch', 'gd-info', 'header-refresh'].map((id) => {
        const r = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect();
        return [id, Math.round(r.x), Math.round(r.y), Math.round(r.width)];
      }).concat(
        [document.querySelector('[role="tablist"]'), document.querySelector('main')].map((el) => {
          const r = el.getBoundingClientRect();
          return [el.tagName, Math.round(r.x), Math.round(r.y), Math.round(r.width)];
        }),
      ),
    );
  // The knob stays inside its track in both states.
  const knobInside = () =>
    page.evaluate(() => {
      const t = document.querySelector('[data-testid="gd-track"]').getBoundingClientRect();
      const k = document.querySelector('[data-testid="gd-knob"]').getBoundingClientRect();
      return k.left >= t.left && k.right <= t.right && k.top >= t.top && k.bottom <= t.bottom;
    });
  expect(await knobInside()).toBe(true);
  const before = await layout();

  await page.getByTestId('gd-switch').click();
  expect(await layout()).toEqual(before); // while loading
  await expect.poll(() => bodies.at(-1)?.includeInitiatives).toBe(true);
  await expect(page.getByTestId('gd-switch')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('load-strip')).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(300); // the knob's slide
  expect(await layout()).toEqual(before); // and after
  expect(await knobInside()).toBe(true);
  // What GemeenteDelers is lives beside the switch, not on a tab.
  await page.getByTestId('gd-info').click();
  await expect(page.getByTestId('gd-panel')).toContainText('vng.nl/praktijkvoorbeelden');
  const box = await page.getByTestId('gd-panel').boundingBox();
  const vw = page.viewportSize().width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
});

test('a manager reaches every section from the header and can go back', async ({ page }) => {
  await boot(page, { level: 'manage' });
  await page.getByTestId('admin-entry').click();
  await expect(page).toHaveURL(/\/admin$/);
  // Four tabs — Spaces in the monitor, GemeenteDelers, Access, and the change log last.
  await expect(page.getByTestId('admin-section-included')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('admin-section-audit')).toHaveCount(0); // only on its own tab
  for (const id of ['gd', 'audit', 'access']) {
    await page.getByTestId(`admin-tab-${id}`).click();
    await expect(page.getByTestId(`admin-tab-${id}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId(`admin-section-${id}`)).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.getByRole('tab')).toHaveText([/Spaces/, /GemeenteDelers/, /Toegang|Access/, /Wijzigingslog|Change log/]);
  await expect(page).toHaveURL(/\/admin#access$/);
  // The same header as the dashboard, with the user menu, naming the settings area.
  await expect(page.getByTestId('header-area')).toBeVisible();
  await expect(page.getByRole('button', { name: /Gebruikersmenu|User menu/ })).toBeVisible();
  await expect(page.getByTestId('admin-me')).toContainText('Mia Manager');
  await expect(page.getByTestId('admin-viewer-spaces')).toContainText('Kenniscentrum Innovatie');
  await page.getByTestId('admin-tab-included').click();
  // The table shows the actual values and the visibility on Alkemio.
  const first = page.getByTestId('included-row').first();
  await expect(first).toContainText('Data');
  await expect(first).toContainText('Idee');
  await expect(first.getByTestId('included-visibility')).toContainText(/Openbaar|Public/);
  await expect(page.getByTestId('included-designations')).toContainText('NDS-prioriteit');
  await expect(page.getByTestId('included-row')).toHaveCount(2);
  await expect(page.getByTestId('included-unreadable')).toBeVisible();
  // Who changed it and when lives in the change log, not here.
  await expect(page.getByTestId('included-count')).toHaveText(/^2 Spaces$/);

  await page.getByTestId('admin-back').click();
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });
});

test('one failing section does not take down the others, and can be retried', async ({ page }) => {
  let fail = true;
  await boot(page, {
    level: 'manage',
    path: '/admin',
    admin: { 'GET /gd-source': (route) => (fail ? json(route, { error: 'X' }, 502) : json(route, GD)) },
  });
  await expect(page.getByTestId('included-row')).toHaveCount(2);
  await page.getByTestId('admin-tab-gd').click();
  await expect(page.getByTestId('admin-section-gd-error')).toBeVisible({ timeout: 15_000 });
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
  await page.getByLabel(/^(Add a Space|Space toevoegen)$/).fill('open');
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
  await page.getByLabel(/^(Add a Space|Space toevoegen)$/).fill('https://alkem.io/geheim2');
  await page.getByTestId('included-add-link').click();
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
  await page.getByRole('button', { name: /Classificaties van Signalen bewerken|Edit the classifications of Signalen/ }).click();
  const phase = page.getByTestId('classification-phase');
  await expect(phase).toBeVisible();
  await expect(page.getByTestId('classification-trl')).toContainText(/does not have|heeft deze classificatie niet/);
  await phase.getByRole('combobox').selectOption({ label: 'Pilot' });
  await page.getByTestId('classification-save').click();
  await expect(page.getByTestId('classification-phase-result')).toContainText(/Saved|Opgeslagen/);
  const put = calls.find((c) => c.key === 'PUT /initiatives/signalen/classifications');
  expect(put.body).toEqual({ changes: [{ entryId: 'fase', expectedSelectedValueIds: ['f1'], selectedValueIds: ['f2'] }] });

  // The table row now shows the saved value.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('classification-editor')).toHaveCount(0);
  await expect(page.getByTestId('included-row').first()).toContainText('Pilot');

  editable = false;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Classificaties van Signalen bewerken|Edit the classifications of Signalen/ }).click();
  await expect(page.getByTestId('classification-readonly')).toContainText(/may not change|niet wijzigen/);
  await expect(page.getByTestId('classification-save')).toHaveCount(0);
});

test('the GemeenteDelers section shows the counts and when the data was read', async ({ page }) => {
  await boot(page, { level: 'manage', path: '/admin#gd' });
  await expect(page.getByTestId('gd-total')).toHaveText('5');
  await expect(page.getByTestId('gd-subspaces')).toHaveText('3');
  await expect(page.getByTestId('gd-posts')).toHaveText('2');
  await expect(page.getByTestId('gd-migration-complete')).toHaveCount(0);
  // Its own initiatives, apart from the Groei ones: a subspace can be edited, a post not.
  const rows = page.getByTestId('gd-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Slim parkeren' }).getByRole('button')).toBeVisible();
  await expect(rows.filter({ hasText: 'Oud bericht' }).getByRole('button')).toHaveCount(0);
  // A post shows the values read from its tags (as the dashboard places it) — just not editable.
  await expect(rows.filter({ hasText: 'Oud bericht' })).toContainText('Data');
  await expect(rows.filter({ hasText: 'Oud bericht' })).toContainText('Bestaanszekerheid');
  await expect(page.getByTestId('admin-section-included')).toHaveCount(0); // its own tab
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

  // Beside the list, an ⓘ says what the Groei initiatives are — like the GemeenteDelers one.
  await page.getByTestId('scope-info').click();
  const info = page.getByTestId('scope-info-panel');
  await expect(info).toContainText(/Groei/);
  await expect(info).toContainText(/1 van deze Spaces|1 of these Spaces/);
  await expect(info.getByRole('link')).toHaveAttribute('href', 'https://alkem.io/innovatiemonitor');
  const box = await info.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.keyboard.press('Escape');
  await expect(info).toHaveCount(0);
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
  await expect(page.getByTestId('admin-section-included')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('admin-back').click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('tab', { name: 'Gemeenten', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(loads).toBe(before);
  // Back went back in history: one more Back leaves the dashboard rather than reopening admin.
  expect(await page.evaluate(() => window.history.state?.fromDashboard ?? false)).toBe(false);
});

test('the change log is ONE list of every kind of edit, on its own tab', async ({ page }) => {
  await boot(page, { level: 'manage', path: '/admin#audit' });
  const log = page.getByTestId('audit-log');
  await expect(log.getByTestId('audit-entry')).toHaveCount(3, { timeout: 15_000 });
  await expect(log.getByTestId('audit-entry').nth(0)).toHaveAttribute('data-type', 'access');
  await expect(log.getByTestId('audit-entry').nth(0)).toContainText('Innovatiemonitor');
  await expect(log.getByTestId('audit-entry').nth(1)).toContainText(/Sam .*Fase.*Signalen/);
  await expect(log.getByTestId('audit-entry').nth(1)).toContainText('Idee → Pilot');
  await expect(log.getByTestId('audit-entry').nth(2)).toContainText('Signalen');
  // Not repeated inside a section.
  await expect(page.getByTestId('included-history')).toHaveCount(0);
});

test('access: a manager changes who may view and manage; a lockout is refused with the reason', async ({ page }) => {
  let refuse = false;
  const calls = await boot(page, {
    level: 'manage',
    path: '/admin#access',
    admin: {
      'GET /space-search': (route) => json(route, { results: [{ nameId: 'innovatiemonitor', displayName: 'Innovatiemonitor', url: IM.url, included: false }] }),
      'PUT /access': (route, req) =>
        refuse
          ? json(route, { error: 'WOULD_LOCK_OUT' }, 409)
          : json(route, {
              ...ACCESS,
              viewers: [PG, IM],
              source: 'settings',
              revision: 1,
              updatedAt: '2026-11-24T10:00:00Z',
              updatedByName: 'Mia Manager',
            }),
    },
  });
  await expect(page.getByTestId('admin-section-access')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('access-source')).toContainText(/configuratie|configuration/);
  await page.getByTestId('access-edit').click();
  const viewers = page.getByTestId('access-edit-viewers');
  await viewers.getByRole('textbox').fill('innovatie');
  await viewers.getByRole('button', { name: /Innovatiemonitor/ }).click();
  await expect(viewers).toContainText('Innovatiemonitor');

  // Removing every admin Space is caught before saving.
  const admins = page.getByTestId('access-edit-admins');
  await admins.getByRole('button', { name: /Kenniscentrum Innovatie (verwijderen)|Remove Kenniscentrum Innovatie/ }).click();
  await expect(page.getByTestId('access-save')).toBeDisabled();
  await admins.getByRole('textbox').fill('https://alkem.io/programmagroei');
  await admins.getByRole('button', { name: /Toevoegen|^Add$/ }).click();

  // The server refuses a lockout: the reason is shown, nothing changes.
  refuse = true;
  await page.getByTestId('access-save').click();
  await expect(page.getByTestId('access-error')).toContainText(/zelf niet meer kunnen beheren|no longer be able to manage/);
  refuse = false;
  await page.getByTestId('access-save').click();
  await expect(page.getByTestId('access-editor')).toHaveCount(0);
  const put = calls.filter((c) => c.key === 'PUT /access').at(-1);
  expect(put.body).toEqual({
    baseRevision: 0,
    viewers: ['programmagroei', 'innovatiemonitor'],
    admins: ['https://alkem.io/programmagroei'],
  });
  await expect(page.getByTestId('admin-viewer-spaces')).toContainText('Innovatiemonitor');
  await expect(page.getByTestId('access-source')).toContainText(/Wijzigingslog|change log/);
  // Who did it, and when, is in the change log.
  await page.getByTestId('admin-tab-audit').click();
  await expect(page.getByTestId('audit-entry').first()).toHaveAttribute('data-type', 'access');
  expect(calls.some((c) => c.key === 'GET /history')).toBe(true);
});
