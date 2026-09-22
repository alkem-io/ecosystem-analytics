# Research: Unified Data Loading

**Feature**: 025-unified-data-loading | **Date**: 2026-09-21

Every decision below was checked against the code on `develop` at `68c94301`. File references are project-relative.

## R0 — Baseline: what one dashboard load costs today

Measured by reading the acquisition path (`server/src/services/acquire-service.ts`, `space-service.ts`, `graph-service.ts`, `vng-dashboard-service.ts`, `gd-initiatives-service.ts`) for a selection of *S* Spaces with *U* subspaces, *N* organisations and *M* users, on a cold per-viewer cache:

| Step | Requests to Alkemio | Notes |
|------|--------------------:|-------|
| L0 Space (about + roles + subspace list) | S | `spaceByName` |
| Subspace details (roles + children), recursive | U (+ privilege checks) | `subspaceDetails`; `SpaceAboutOnlyByName` for read-about-only |
| User profiles | 1 | `usersByIDs` (already batched) |
| **Organisation profiles** | **N, sequential** | `organizationByID` one by one, no org-level cache |
| Activity feed, contributions | ⌈(S+U)/10⌉ | `ActivityFeedGrouped`, chunk of 10 |
| Activity feed, MEMBER_JOINED | ⌈(S+U)/10⌉ | second sweep |
| **Dashboard counts** (`/api/<app>/dashboard`) | **S per request** | `SpaceClassifications` per Space, **uncached**, although every dataset node already carries `classificationEntries` |
| GD layer (first time, 1 week TTL) | 1 + 2 × unresolved gemeenten | callouts + `OrganizationByNameId` + `organizationByID` each |
| Gemeente locations (first time, 1 week TTL) | ⌈342/page⌉ | `organizationsPaginated` sweep |

For the default VNG hub (S ≈ 22, N ≈ 60): roughly **22 + U + 1 + 60 + 2·⌈(22+U)/10⌉** on the graph path plus **22 more per dashboard-counts request** (re-issued on every toggle change). Removing the per-org lookups, the activity sweeps and the classification re-query takes the core path to **S + U + 1**, comfortably past SC-004's 50 %.

Browser side (`frontend/shared/src/dashboard/`): nine tabs each mounted only while active (`App.tsx:208-228`), each with its own `useVngGraph` (full `POST /api/graph/generate` per mount), five of them with their own `useGraphProgress` poller (600 ms), and the Dashboard/Funnel tabs additionally calling `useDashboard`. Tabs pass different `includeInitiatives` values, so one selection yields two dataset variants. The BFF's 30 s memo + 24 h per-Space cache means tab switches rarely reach Alkemio, but each one re-transfers and re-parses the whole dataset and re-runs post-cache enrichment.

### R0 — measured (implementation, 2026-09-21)

With the mocked-BFF Playwright harness the browser-side outcomes are pinned: after one load a tour of all nine tabs issues **zero** data requests; `graph/generate` is called **once** per selection and once more per GD toggle / Refresh; activity and gemeente locations are requested **once** each, on first use of their tab (`tests/dashboard-load-once.spec.mjs`). The platform-side counts (SC-004, `requests=`/`bytes=` on the acquisition summary) need a signed-in session against Alkemio and are **still to be recorded** by running quickstart Scenario 4 — by construction the core path now issues `S + U + 1` requests (Spaces, subspaces, one users batch) with no per-organisation lookups, no activity sweeps and no `SpaceClassifications` re-query.

## R1 — Progress transport: request-scoped SSE

**Decision**: `POST /api/graph/generate` negotiates on `Accept`: `text/event-stream` → an SSE response carrying `stage`/`item` progress events and a final `result` (or `error`) event; anything else → today's JSON body. The dashboards use the stream; the Explorer keeps JSON and its existing `GET /api/graph/progress` poller.

**Rationale**:
- Progress must be tied to *the request*, not the user: `progressMap` in `graph-service.ts` is keyed by `userId`, and guests share the `__guest__` principal (feature 023), so two guests loading at once already corrupt each other's indicator. A stream is naturally per request.
- Clarification 1 asks for feedback across *loading and processing* stages; a stream can emit `processing`/`augmenting` steps at zero polling cost, and periodic events double as keep-alives on long cold loads.
- Precedent in the codebase: `POST /api/query/ask` already streams SSE over `fetch` + `ReadableStream` (`frontend/ecosystem-analytics/src/services/query-api.ts`) — the reader moves to `@ea/shared/services/api.ts` as `apiStream()`.
- One provider ⇒ one stream per load; the five per-tab pollers disappear.

**Alternatives considered**:
- *Keep polling, enrich `GraphProgress`*: smallest change, but leaves the per-user key collision and needs a correlation id to fix it — at which point a stream is simpler.
- *WebSocket*: heavier, no precedent, and Traefik/ingress config would need touching.
- *Chunked JSON*: no event framing; reinvents SSE.

**Failure modes**: the stream ends without `result` (proxy cut, server restart) → loader reports `failed` with retry (FR-011). Non-SSE proxies: the JSON path remains as fallback if `EventSource`-style parsing fails on first byte.

## R2 — Organisation profiles: inline core fields, lazy extended profile

**Decision**: extend `communityRolesFragment.graphql` so `organizationsInRole(role: …)` (and `usersInRole`) return the *core* profile inline — `id nameID profile { displayName url avatar: visual(type: AVATAR) { uri } location { country city geoLocation { latitude longitude } } tagsets { name tags type } }`. The core acquisition then makes **no** `organizationByID` calls. The *extended* profile (description, tagline, website, references, contactEmail, associates) becomes an on-demand item: `POST /api/graph/organizations` with ids → per-viewer `__org__:<orgId>` cache rows (24 h), fetched with the existing static `organizationByID` document only for uncached ids.

**Rationale**:
- The Alkemio schema has **no** batch-by-id organisation query (`Query.organizations(filter: ActorFilterInput, limit, shuffle)` filters on credentials only; `organizationsPaginated` is a full sweep). Aliasing many `lookup.organization(ID:)` in one document would be a dynamic document — a Constitution II violation. Inlining in the roles query is the only zero-extra-request route.
- What the dashboards actually render from organisations (checked in `frontend/shared/src/dashboard/`): `displayName`, `avatarUrl`, `location` (maps), `tags`/`commonGround`, and `tagline`/`description` only in `utils/ecosystem.ts:347` for the *profile-based orchestrator guess* (fourth-priority fallback) — acceptable to degrade to name-only there.
- The Explorer's DetailsDrawer shows website/references/description. It keeps them by requesting `includeExtendedProfiles` (default true for the JSON path), served from `__org__` rows after the first fetch — so an organisation is fetched at most once per viewer per 24 h even for the Explorer (FR-013a), instead of once per Space acquisition.

**Alternatives considered**: `organizationsPaginated` sweep cached per viewer as an org index (bounded, but fetches the whole platform's organisations to serve ~60); keep `organizationByID` but parallelise (still N requests). Both rejected.

**Users**: `usersByIDs` is already one batched request; keep it, but trim the document to the rendered fields (`displayName`, `avatar`, `url`, `location`, `tagsets`) — `createdDate` is only used for edge-date estimation on the Explorer's activity path and moves to the activity item.

## R3 — Activity: a separate item with its own cache rows

**Decision**: new `activity-service.ts` owns the two `ActivityFeedGrouped` sweeps and writes per-viewer `__activity__:<spaceId>` rows (24 h). `GraphGenerationRequest.includeActivity` (default **true** on the JSON path so the Explorer's output is byte-for-byte what it is today; the dashboards' stream request sends `false`). The Initiatives tab declares the `activity` extra item; the provider calls `POST /api/graph/activity { spaceIds }` once, and the derivation merges `activityByPeriod` into its rows. Per-Space *relational* rows are written **without** activity-derived fields (`activityTier` on edges, `totalActivityCount`, `spaceActivityTier`, `activityByPeriod`, `activityTimeline`).

**Rationale**: activity is the costliest sweep and only `utils/initiatives.ts` reads it (`activityByPeriod`, lines 134-138). Splitting the cache rows is what makes the split real: today's rows embed activity, so a relational-only request would otherwise still carry it.

**Consequence**: `CACHE_MAINTENANCE_VERSION` 3 → 4 clears pre-split per-Space rows once per environment (same mechanism as feature 020); GEO row kept as before.

## R4 — Dashboard counts: from the dataset, delivered with it

**Decision**: `assembleDashboard` reads classifications from the dataset nodes' `classificationEntries` (already fetched and cached per Space) instead of re-issuing `SpaceClassifications` per Space. The stream's `result` for a dashboard app carries `dashboard: { categories: { base, withGd? }, distribution: { base, withGd? } }` — both GD variants when the GD layer is loaded — so the Dashboard/Funnel tabs' toggles become a browser-side selection, not a request. `POST /api/<app>/dashboard` remains for compatibility but is no longer called by the dashboards.

**Rationale**: FR-015 (counts from the same loaded data), Clarification 1 (server computes), and R0's finding that the counts endpoint costs S platform requests per toggle change.

**Alternative**: compute counts in the browser from `classificationEntries` — rejected: those entries are deliberately internal (`graph-service.ts` strips them before sending), and Clarification 1 keeps processing on the server.

## R5 — Selection changes: one processed dataset per selection

**Decision**: any change of selection (Spaces or GD toggle) is one new load of the whole selection; the BFF serves retained Spaces from its per-viewer cache and re-acquires only the added ones; the browser replaces its loaded data with the new processed dataset. The stream reports `loading` only for Spaces that miss the cache and `processing` for the merge/metrics/enrichment.

**Rationale**: the server owns processing (Clarification 1), so partial datasets cannot be merged client-side without duplicating metrics/enrichment. FR-003's "retained Spaces are kept without reloading" is satisfied at the platform level (zero requests for them) and at the viewer level (they never show a placeholder — the previous dataset stays on screen until the new one arrives, with the strip showing the delta).

**Alternative**: per-Space partial responses merged in the browser — rejected for the reason above.

## R6 — Frontend state and derivations

**Decision**: `DashboardDataProvider` (React context) mounted once in `App.tsx` above the tab row, backed by a small external store read through `useSyncExternalStore`. It owns: the current `Selection`, the `LoadedData` (dataset + per-item state), the `LoadPlan` (stages/items/progress), `refresh()`. Tabs read via `useLoadedData()` / `useLoadPlan()` and declare extras via `useExtraItem('activity')`. Derivations live in `dashboard/data/derive/` as pure functions memoised in a `WeakMap<GraphDataset, Map<inputsKey, result>>`, so two tabs computing "funnel" for the same dataset share one result and nothing recomputes on tab switch (FR-006). Existing pure utils (`utils/funnel.ts`, `utils/ecosystem.ts`, `utils/initiatives.ts`, city rows) are wrapped, not rewritten.

**Rationale**: no new dependency; matches the existing `SelectionContext` pattern; the tabs keep their conditional mounting (which is what makes the strip and the provider necessary in the first place).

**Alternatives**: TanStack Query / SWR (new dependency for one cache key), Zustand (same), keeping data in `SelectionContext` (mixes selection with loading — contradicts FR-005).

## R7 — Ecosystem tab's widened Space set

**Decision**: the provider's `Selection.spaceIds` for the VNG app is `effectiveSpaceIds ∪ orchestratorCandidates` (candidates from the existing `GET /api/ecosystem/orchestrator/:hub`, fetched once per hub by the provider before planning the load). Every tab reads the same dataset; tabs that must not show the widened Spaces (Initiatives, Cities, counts) filter by `effectiveSpaceIds` in their derivation, which is what `EcosystemTab` already does in reverse.

**Rationale**: spec assumption; without it the Ecosystem tab would be the one tab that triggers a second load.

## R8 — Gemeente locations and the GD layer

**Decision**: both remain long-TTL per-viewer items (unchanged services) but become declared extra items in the load plan: `gd-initiatives` when the GD toggle is on (part of the generate request, reported as its own `item`), `gemeente-locations` declared by the Usage Explorer tab (`GET /api/<app>/gemeente-locations`, unchanged). The GD layer's per-gemeente resolution (`OrganizationByNameId` + `organizationByID`) is reduced to one lookup by reading the profile fields it needs from `OrganizationByNameId` directly (extend that static document).

## R9 — Localisation and observability

- Strip wording: keys under `load.*` in `frontend/vng/src/i18n/{en,nl}.json` and `frontend/govtech/src/i18n/{en,nl}.json`; item names are keys, not server strings (server sends `itemKey` + numbers; only the current Space nameId/displayName is passed through as data).
- SC-004 measurement: `createAlkemioSdk` gets a per-request counter (`context: 'Acquire'` summary line already exists — extend it with `requests=<n>` and `bytes=<n>` per load) so before/after can be read from the log. Zero-request reload (SC-002a) is asserted by that same counter being 0.
