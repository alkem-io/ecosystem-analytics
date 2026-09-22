/**
 * FEATURE 025 — shared BFF mock for the dashboard Playwright specs.
 *
 * Mirrors the per-spec route setup in vng-ecosystem.spec.mjs / vng-funnel.spec.mjs, and
 * adds what feature 025 introduces:
 *
 *   - `POST /api/graph/generate` answers **SSE** when the request carries
 *     `Accept: text/event-stream` (a configurable sequence of `stage` events, then the
 *     terminal `result`), and plain JSON otherwise — exactly the contract in
 *     specs/025-unified-data-loading/contracts/api-graph-generate-stream.md.
 *   - `POST /api/graph/activity` and `POST /api/graph/organizations` (the on-demand items).
 *
 * Every mocked call is recorded in `calls` so a spec can assert "zero requests" (SC-001)
 * or "exactly one" (US1 scenarios) without touching Playwright's HAR machinery.
 */

/** Serialise one SSE frame. */
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * Build the SSE body for one generate call. `stages` default to a two-step loading run
 * followed by processing, which is enough for the strip to render each stage once.
 */
export function sseBody({ dataset, dashboard, stages, gd = false, fail = null }) {
  const total = dataset.cacheInfo?.length ?? dataset.metadata?.spaceCount ?? 1;
  const steps =
    stages ??
    [
      { type: 'stage', item: 'spaces', stage: 'loading', done: 0, total },
      { type: 'stage', item: 'spaces', stage: 'loading', done: total, total },
      { type: 'stage', item: 'spaces', stage: 'processing' },
      ...(gd
        ? [
            { type: 'stage', item: 'gd-initiatives', stage: 'loading' },
            { type: 'item', item: 'gd-initiatives', stage: 'done' },
          ]
        : []),
      { type: 'item', item: 'spaces', stage: 'done' },
    ];
  let body = steps.map((e) => frame(e.type, e)).join('');
  body += fail
    ? frame('error', { type: 'error', error: fail })
    : frame('result', { type: 'result', dataset, dashboard });
  return body;
}

/**
 * Install the BFF mock on a page.
 *
 * @param page Playwright page
 * @param F fixture object: { me, hubs, hubSpaces, dataset, dashboard?, bundle?, activity?, organizations?, orchestratorChoice? }
 * @param opts { app: 'vng'|'govtech', sse?: { stages?, fail? }, activityFail?: boolean, delayMs?: number, jsonOnly?: boolean (answer JSON even to a stream request — the older specs' shape) }
 * @returns { calls } — array of { method, path, body } for every mocked request
 */
export async function mockBff(page, F, opts = {}) {
  const app = opts.app ?? 'vng';
  const calls = [];
  const record = (route) => {
    const req = route.request();
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      /* not JSON */
    }
    calls.push({ method: req.method(), path: new URL(req.url()).pathname, body });
  };
  const json = (route, body, status = 200) => {
    record(route);
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  };

  await page.route('**/api/**', (r) => r.abort());
  await page.route('**/api/auth/me', (r) => json(r, F.me));
  await page.route('**/api/hubs?*', (r) => json(r, F.hubs));
  await page.route('**/api/hubs/*/spaces', (r) => json(r, F.hubSpaces));
  await page.route('**/api/features', (r) => json(r, {}));
  await page.route('**/api/meta', (r) => json(r, { environment: 'test' }));
  await page.route('**/api/image-proxy*', (r) => r.abort());
  await page.route(`**/api/${app}/dashboard`, (r) => json(r, F.dashboard ?? {}));
  await page.route(`**/api/${app}/initiatives`, (r) => json(r, F.gdInitiatives ?? []));
  await page.route(`**/api/${app}/gemeente-locations`, (r) =>
    json(r, F.gemeenteLocations ?? { locations: [], partial: false }),
  );
  await page.route('**/api/ecosystem/orchestrator/**', (r) => {
    if (r.request().method() !== 'GET') return json(r, { ok: true });
    return json(r, F.orchestratorChoice ?? { nameId: null, source: null });
  });
  await page.route('**/api/graph/progress', (r) =>
    json(r, { step: 'ready', spacesTotal: 0, spacesCompleted: 0 }),
  );

  await page.route('**/api/graph/generate', async (r) => {
    record(r);
    const req = r.request();
    const accept = req.headers()['accept'] ?? '';
    const body = req.postDataJSON?.() ?? {};
    const dashboard = bundleOf(F);
    if (opts.delayMs) await new Promise((res) => setTimeout(res, opts.delayMs));
    if (accept.includes('text/event-stream') && !opts.jsonOnly) {
      return r.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: sseBody({
          dataset: F.dataset,
          dashboard,
          gd: !!body.includeInitiatives,
          stages: opts.sse?.stages,
          fail: opts.sse?.fail ?? null,
        }),
      });
    }
    if (req.headers()['x-ea-bundle'] === '1') {
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ dataset: F.dataset, dashboard }),
      });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(F.dataset) });
  });

  await page.route('**/api/graph/activity', (r) => {
    if (opts.activityFail) return json(r, { error: 'ACTIVITY_FAILED', message: 'nope' }, 502);
    return json(r, F.activity ?? { bySpace: {}, fetchedAt: new Date().toISOString(), unavailable: [] });
  });
  await page.route('**/api/graph/organizations', (r) =>
    json(r, F.organizations ?? { organizations: {}, missing: [] }),
  );

  return { calls };
}

/**
 * For the older per-spec route blocks: fulfil `/api/graph/generate` with the bundle the
 * dashboards read since feature 025 (`{ dataset, dashboard }`), and `/api/graph/activity`
 * with an activity item derived from the fixture dataset's per-Space activity fields.
 */
export const generateJson = (route, dataset, dashboard) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ dataset, dashboard: bundleOf({ dashboard }) }),
  });

export const activityJson = (route, dataset) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(activityOf(dataset)) });

/** An activity item read off the dataset nodes (what the BFF used to embed). */
export function activityOf(dataset) {
  const bySpace = {};
  for (const n of dataset.nodes ?? []) {
    if (!n.type?.startsWith('SPACE') || !n.activityByPeriod) continue;
    const p = n.activityByPeriod;
    bySpace[n.id] = { day: p.day ?? 0, week: p.week ?? 0, month: p.month ?? 0, total: n.totalActivityCount ?? p.allTime ?? 0, tier: n.spaceActivityTier ?? 'INACTIVE' };
  }
  return { bySpace, fetchedAt: new Date().toISOString(), unavailable: [] };
}

/** The counts bundle: `F.bundle` if the fixture has one, else derived from `F.dashboard`. */
export function bundleOf(F) {
  if (F.bundle) return F.bundle;
  if (!F.dashboard) return undefined;
  const { gemeenteDistribution, cityPopulation, ...categories } = F.dashboard;
  return {
    categories: { base: categories, withGd: { ...categories, gdIncluded: true } },
    distribution: {
      base: { gemeenteDistribution, cityPopulation },
      withGd: { gemeenteDistribution, cityPopulation },
    },
  };
}

/** Count recorded calls whose path ends with `suffix` (e.g. '/api/graph/generate'). */
export const countCalls = (calls, suffix) => calls.filter((c) => c.path.endsWith(suffix)).length;
