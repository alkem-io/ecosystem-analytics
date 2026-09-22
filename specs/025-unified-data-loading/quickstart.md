# Quickstart: validating Unified Data Loading

**Feature**: 025-unified-data-loading. Contracts: [contracts/](./contracts/). Model: [data-model.md](./data-model.md).

## Prerequisites

- `server/.env` configured for local-against-production (public OIDC client), `pnpm install` at the root.
- Root `pnpm run dev` (BFF :4000, Explorer :5173, VNG :5174, GovTech :5175).
- A signed-in browser session on http://localhost:5174 with the default hub (`vih-test`) selected.
- Server log visible (`tsx watch` output) — the acquisition summary line now ends with `requests=<n> bytes=<n>` per load (R9).

## Automated checks

```bash
cd server && pnpm run test                # activity/organization services, LoadReporter, stream route, counts-from-dataset
cd frontend/shared && pnpm run test       # provider, loader event parsing, derivation memoisation
cd frontend/vng && pnpm run test
pnpm run test:visual -- tests/dashboard-load-once.spec.mjs tests/dashboard-load-strip.spec.mjs
```

Both new Playwright specs run against the dev servers with the shared BFF mock (`tests/fixtures/bff-mock.mjs`, which also backs the updated `tests/vng-*.spec.mjs`). Start the VNG dev server first: `pnpm -C frontend/vng start` (:5174); without it they skip.

**Status (2026-09-21)**: Scenarios 1, 2, 3 and 6 are automated and green (`dashboard-load-once`, `dashboard-load-strip`, the existing dashboard specs). Scenarios 4 and 5 need a signed-in session against Alkemio and are the remaining manual step.

## Scenario 1 — Load once, tour every tab (SC-001, US1)

1. Open the VNG dashboard, select the default hub, wait for the strip to disappear.
2. Open DevTools → Network, filter `api/`. Clear.
3. Click through all nine tabs in any order, then back to the first.
4. **Expected**: zero new `api/` requests; each tab's content visible in < 1 s; strip absent.
5. Add one Space in the panel. **Expected**: exactly one `graph/generate` stream; strip shows `Loading Spaces 22 of 23` → `Processing`; previous content remains visible until the new dataset lands; server log shows `Fetching 1 space(s) from Alkemio`.
6. Toggle GemeenteDelers on, off, on. **Expected**: one stream with a `gd-initiatives` item on the first "on"; nothing on "off"; on the second "on" the stream reports `gd-initiatives` going straight to processing (served from `__gd_initiatives__`).

## Scenario 2 — Joined-up strip (SC-003, US2)

1. Press Refresh on the Dashboard tab; while `Loading Spaces n of 22` is climbing, switch to Graph, then Cities.
2. **Expected**: the same strip on every tab, `n` never resets; tabs render as soon as `coreReady`; the strip disappears on all tabs at the same moment.
3. Open the Initiatives tab. **Expected**: strip shows `Loading activity — requested by Initiatives`; the table renders immediately with activity columns in a loading state, then fills. Switch to Cities during that load: Cities is fully rendered, strip still shows the activity item.
4. Simulate a failure (`ACTIVITY_FAIL=1` dev flag or block `api/graph/activity` in DevTools): **Expected**: strip shows the item as failed with Retry; Initiatives shows "activity unavailable" in those columns; every other tab unaffected.

## Scenario 3 — Reload never hits Alkemio (SC-002a, FR-001a)

1. With a loaded selection, note the server log position. Press browser reload.
2. **Expected**: one `graph/generate` stream whose only stage is `processing`; the acquisition summary reads `requests=0`; no `[Spaces] Fetching` lines.

## Scenario 4 — Platform load halved (SC-004, US3)

1. On `develop` (before this feature): force-refresh the default hub, record `requests=` and `bytes=` from the acquisition summary and the count of `[Dashboard]` classification fetches.
2. On this branch: same viewer, same hub, force refresh.
3. **Expected**: `requests` ≤ 50 % of before (no `organizationByID` on the core path, no activity sweeps, no `SpaceClassifications` on the counts path); `bytes` ≤ 50 %.
4. Open the Initiatives tab once → the activity sweeps run **once**; open Space details for an organisation → `organizationByID` for **that** organisation only, and not again within 24 h.

## Scenario 5 — Explorer unchanged (FR-018)

1. Open http://localhost:5173, generate a graph for the same Spaces.
2. **Expected**: JSON response (no SSE); edges carry `activityTier`; organisation nodes carry `website`/`references`/`description` in the DetailsDrawer; the Explorer's progress poller still works. Second generation of the same Spaces within 24 h: no `organizationByID` in the log.

## Scenario 6 — Nothing lost (SC-006, FR-017)

Run `pnpm run test:visual` (existing VNG/GovTech snapshot specs) — all snapshots unchanged except the header strip region, which is updated deliberately with `pnpm run test:visual:update` once reviewed.
