// @ts-check
/**
 * FEATURE 026 — the access gate's screens on the VNG dashboard (the monitor).
 *
 * The BFF is mocked: `/api/auth/me` carries the access report the real BFF computes
 * (contracts/api-access.md §1), so these specs assert only what the person sees:
 *
 *   - refused → the "no access" screen: account, gate name + link, check again, sign
 *     out, and no dashboard (FR-013);
 *   - could not verify → its own screen, never "no access" (FR-014);
 *   - admitted, then a data route answers 403 ACCESS_DENIED → the shell switches to
 *     "no access" with no toast and no sign-in redirect (FR-015);
 *   - "check again" that admits → the dashboard, without a sign-in (US3, SC-005);
 *   - the screen never scrolls horizontally at phone width.
 *
 * Needs a VNG dev server (default http://localhost:5174, override with VNG_URL).
 */
import { test, expect } from '@playwright/test';
import { generateJson, scopeOf } from './fixtures/bff-mock.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(
  readFileSync(resolve(HERE, 'fixtures', 'vng-ecosystem-fixtures.json'), 'utf8'),
);
const VNG_URL = process.env.VNG_URL ?? 'http://localhost:5174';

const GATE = {
  key: 'programmagroei/landelijkinnovatiemonitor',
  displayName: 'Landelijk Innovatie Monitor',
  url: 'https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor',
  exists: 'yes',
};
// Feature 027: several viewer Spaces, each listed with its link.
const SECOND = {
  key: 'programmagroei',
  displayName: 'Kenniscentrum Innovatie',
  url: 'https://alkem.io/programmagroei',
  exists: 'yes',
};
const VIEWER_SPACES = [GATE, SECOND];
const access = (status, level) => ({
  app: 'vng',
  status,
  level,
  gated: true,
  viewerSpaces: VIEWER_SPACES,
});
const ADMITTED = access('admitted', 'read');
const REFUSED = access('none', 'none');
const UNVERIFIED = access('unverified', null);

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
  test.skip(!reachable, `No VNG dev server at ${VNG_URL} — run \`pnpm -C frontend/vng dev\``);
});

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const DENIED = {
  error: 'ACCESS_DENIED',
  reason: 'none',
  app: 'vng',
  message: 'No access to this application',
};

/**
 * Mount the dashboard with the BFF mocked. `me` is a function so a spec can change the
 * report between calls; `deny` makes every data route answer 403 ACCESS_DENIED.
 */
async function boot(page, { me, recheck, deny = false }) {
  const calls = [];
  page.on('request', (req) => calls.push(new URL(req.url()).pathname));
  const data = (handler) => (route) => (deny ? json(route, DENIED, 403) : handler(route));

  await page.route('**/api/**', (r) => r.abort());
  await page.route('**/api/auth/me', (r) => json(r, { ...F.me, access: me() }));
  await page.route('**/api/auth/access/recheck', (r) => json(r, { access: recheck() }));
  await page.route('**/api/auth/login*', (r) => r.fulfill({ status: 200, body: 'login' }));
  await page.route('**/api/auth/logout', (r) => json(r, { ok: true }));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.route('**/api/auth/access/spaces', (r) =>
    json(r, {
      app: 'vng',
      gated: true,
      spaces: VIEWER_SPACES.map(({ key, displayName, url }) => ({ key, displayName, url })),
    }),
  );
  await page.route('**/api/meta', (r) => json(r, { environment: 'test' }));
  await page.route(
    '**/api/vng/scope',
    data((r) => json(r, scopeOf(F))),
  );
  await page.route('**/api/image-proxy*', (r) => r.abort());
  await page.route(
    '**/api/hubs?*',
    data((r) => json(r, F.hubs)),
  );
  await page.route(
    '**/api/hubs/*/spaces',
    data((r) => json(r, F.hubSpaces)),
  );
  await page.route(
    '**/api/graph/generate',
    data((r) => generateJson(r, F.dataset, F.dashboard)),
  );
  await page.route(
    '**/api/graph/activity',
    data((r) => json(r, [])),
  );
  await page.route(
    '**/api/vng/initiatives',
    data((r) => json(r, [])),
  );
  await page.route(
    '**/api/vng/dashboard',
    data((r) => json(r, F.dashboard ?? {})),
  );
  await page.route(
    '**/api/vng/gemeente-locations',
    data((r) => json(r, { locations: [] })),
  );
  await page.route(
    '**/api/ecosystem/orchestrator/**',
    data((r) => json(r, F.orchestratorChoice)),
  );

  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  return calls;
}

const noAccessHeading = (page) =>
  page.getByRole('heading', { name: /geen toegang|do not have access/i });

test('a refused person sees who they are, the gate Space and what to do — and no dashboard', async ({
  page,
}) => {
  await boot(page, { me: () => REFUSED, recheck: () => REFUSED });

  await expect(noAccessHeading(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('access-account')).toContainText(F.me.displayName);
  await expect(page.getByTestId('access-explanation')).toBeVisible();

  // Feature 027 (FR-003): every viewer Space, each with its own link.
  const links = page.getByTestId('access-gate-link');
  await expect(links).toHaveCount(VIEWER_SPACES.length);
  for (const [i, space] of VIEWER_SPACES.entries()) {
    await expect(links.nth(i)).toContainText(space.displayName);
    await expect(links.nth(i)).toHaveAttribute('href', space.url);
    await expect(links.nth(i)).toHaveAttribute('target', '_blank');
    await expect(links.nth(i)).toHaveAttribute('rel', /noopener/);
  }

  await expect(
    page.getByRole('button', { name: /opnieuw controleren|check again/i }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /uitloggen|sign out/i })).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
});

test('a direct deep link shows the same no-access screen', async ({ page }) => {
  await boot(page, { me: () => REFUSED, recheck: () => REFUSED });
  await page.goto(`${VNG_URL}/?tab=graph`, { waitUntil: 'domcontentloaded' });
  await expect(noAccessHeading(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('tablist')).toHaveCount(0);
});

test('a failed check shows "could not verify", never "no access"', async ({ page }) => {
  await boot(page, { me: () => UNVERIFIED, recheck: () => UNVERIFIED });
  await expect(
    page.getByRole('heading', { name: /niet controleren|could not verify/i }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(noAccessHeading(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /opnieuw proberen|try again/i })).toBeVisible();
});

test('a refusal mid-session switches to the no-access screen — no toast, no sign-in redirect', async ({
  page,
}) => {
  let current = ADMITTED;
  const calls = await boot(page, { me: () => current, recheck: () => current, deny: true });
  // The dashboard renders for an admitted person; its first data request is refused.
  current = REFUSED;
  await expect(noAccessHeading(page)).toBeVisible({ timeout: 20_000 });
  expect(calls.some((p) => p.startsWith('/api/auth/login'))).toBe(false);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('"check again" admits a newly added member without signing in again (US3)', async ({
  page,
}) => {
  let current = REFUSED;
  const calls = await boot(page, { me: () => current, recheck: () => current });
  await expect(noAccessHeading(page)).toBeVisible({ timeout: 15_000 });

  current = ADMITTED; // added to the gate Space on Alkemio
  await page.getByRole('button', { name: /opnieuw controleren|check again/i }).click();

  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });
  await expect(noAccessHeading(page)).toHaveCount(0);
  expect(calls.some((p) => p.startsWith('/api/auth/login'))).toBe(false);
});

test('the no-access screen never scrolls horizontally at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, { me: () => REFUSED, recheck: () => REFUSED });
  await expect(noAccessHeading(page)).toBeVisible({ timeout: 15_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('signed out, the sign-in screen lists the viewer Spaces with links (feature 027, US1)', async ({
  page,
}) => {
  await page.route('**/api/**', (r) => r.abort());
  await page.route('**/api/auth/me', (r) => json(r, { error: 'UNAUTHORIZED' }, 401));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.route('**/api/auth/access/spaces', (r) =>
    json(r, {
      app: 'vng',
      gated: true,
      spaces: VIEWER_SPACES.map(({ key, displayName, url }) => ({ key, displayName, url })),
    }),
  );
  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });

  const box = page.getByTestId('login-access');
  await expect(box).toBeVisible({ timeout: 15_000 });
  await expect(box).toContainText(/Leden van deze Spaces|Members of these Spaces/);
  const links = page.getByTestId('login-access-link');
  await expect(links).toHaveCount(VIEWER_SPACES.length);
  await expect(links.first()).toHaveAttribute('href', GATE.url);
  // Never blocks signing in.
  await expect(page.getByRole('button', { name: /inloggen|sign in/i })).toBeEnabled();
});

test('the sign-in screen shows a generic line when the Space list cannot be loaded', async ({
  page,
}) => {
  await page.route('**/api/**', (r) => r.abort());
  await page.route('**/api/auth/me', (r) => json(r, { error: 'UNAUTHORIZED' }, 401));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.goto(VNG_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('login-access-generic')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /inloggen|sign in/i })).toBeEnabled();
});
