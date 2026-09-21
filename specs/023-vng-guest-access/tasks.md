# Tasks: VNG Guest Access

**Input**: Design documents from `/specs/023-vng-guest-access/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (3 files), quickstart.md

**Tests**: Included — plan.md and quickstart.md call for Vitest unit tests (server + `frontend/vng`)
and one Playwright spec; the spec's SC-009 requires existing E2E specs to pass unchanged.

**Organization**: Grouped by user story. US1 (guest door) and US2 (guest experience) are P1; US3
(failure containment) is P2; US4 (isolation) is P3. Phase 2 (Foundational) carries the server guest
principal that every story needs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- All paths are repository-relative

## Path Conventions

Web app: `server/src/` (BFF), `frontend/shared/src/` (`@ea/shared` dashboard shell),
`frontend/vng/src/` (VNG wrapper), `tests/` (Playwright). `frontend/govtech/` is **not** touched.

---

## Phase 1: Setup (Configuration)

**Purpose**: Config keys and the one new GraphQL query, so every later phase compiles against them.

- [ ] T001 Add `guestAccess: boolean` (default `false`) and `guestRateLimitPerMinute: number` (default `120`) to `DashboardAppConfig` in `server/src/config.ts`, parsed from `guest_access` / `guest_rate_limit_per_minute` per dashboard profile; export `GUEST_USER_ID = '__guest__'` constant from a new `server/src/auth/guest.ts` (cookie helpers land in T005)
- [ ] T002 [P] Add `guest_access: ${VNG_GUEST_ACCESS}:true` + `guest_rate_limit_per_minute: ${VNG_GUEST_RATE_LIMIT_PER_MINUTE}:120` under `vng:` and `guest_access: ${GOVTECH_GUEST_ACCESS}:false` under `govtech:` in `server/analytics.yml`, with a comment explaining host-only guest cookie semantics; add the three env vars (commented, with defaults) to `server/.env.default`
- [ ] T003 [P] Extend `server/src/config.test.ts` to assert `dashboards.vng.guestAccess === true`, `dashboards.govtech.guestAccess === false`, and the rate-limit default
- [ ] T004 [P] Create `server/src/graphql/queries/spaceAboutByName.graphql` (`query spaceAboutByName($nameId: NameID!) { lookupByName { space(NAMEID: $nameId) { id nameID visibility about { ...spaceAboutFragment profile { displayName tagline url avatar: visual(type: AVATAR) { uri } } } } } }` — **no** `community`), run `cd server && pnpm run codegen`, commit `server/src/graphql/generated/`

---

## Phase 2: Foundational (Guest principal in the BFF)

**Purpose**: The session-less guest principal, its cookie, middleware, token-less SDK and the error
classifier. **Blocks every user story** — US1 needs the endpoints, US2/US4 need guest-eligible
routes, US3 needs the error codes.

**⚠️ CRITICAL**: T005–T012 must be complete (and `cd server && npx tsc --noEmit` green) before any
story phase starts.

- [ ] T005 Implement `server/src/auth/guest.ts`: `GUEST_COOKIE = 'ea_guest'`, `guestCookieOptions()` (httpOnly, `secure`/`sameSite` copied from `session.ts` rules, **no `domain`**, **no `maxAge`/`expires`**, `path: '/'`), `clearGuestCookieOptions()`, `readGuestApp(req): DashboardAppId | null` (cookie value must be a key of `config.dashboards` with `guestAccess === true`, else null), `setGuestCookie(res, app)`, `clearGuestCookie(res)`
- [ ] T006 Convert `AuthContext` in `server/src/auth/middleware.ts` to the discriminated union from data-model.md §1.1 (`MemberAuthContext { kind: 'member', session, userId, displayName? }` | `GuestAuthContext { kind: 'guest', app, userId: typeof GUEST_USER_ID }`); make `authMiddleware` populate `kind: 'member'` and keep its 401 behaviour byte-for-byte; add `guestAwareAuth` implementing the precedence in `contracts/api-auth-guest.md` (session → member; else valid `ea_guest` → guest; else 401 + clear stale `ea_session`); make `invalidateAndReject` a no-op-with-403 `GUEST_FORBIDDEN` when `req.auth?.kind === 'guest'`
- [ ] T007 Update `server/src/auth/resolve-user.ts` to accept both kinds (only checks `userId`) and to log `Guest request (app=…)` at debug for guests — never a cookie value
- [ ] T008 Update `createAlkemioSdk(auth)` in `server/src/graphql/client.ts`: on `auth.kind === 'guest'` return `getSdk(new GraphQLClient(endpoint))` with **no** `Authorization` header (no refresh, no decrypt); member branch unchanged
- [ ] T009 Create `server/src/routes/errors.ts` exporting `classifyUpstreamError(err): 'unreachable' | 'auth' | 'other'` (fetch/socket errors and GraphQL HTTP status ≥ 500 → `unreachable`; `isAlkemioAuthError(err)` or `FORBIDDEN_POLICY` extension code → `auth`) and `respondUpstreamError(req, res, err, fallback: { status: number; error: string; message: string })` implementing `contracts/api-error-codes.md`: `unreachable` → `503 ALKEMIO_UNREACHABLE`; `auth` + guest → `403 GUEST_FORBIDDEN`; `auth` + member → `invalidateAndReject`; otherwise the route's fallback (existing 502)
- [ ] T010 Fix every compile error the union produces: `server/src/routes/image-proxy.ts`, `server/src/services/acquire-service.ts`, `server/src/services/hub-service.ts`, `server/src/services/gemeente-geo-service.ts`, `server/src/services/gd-initiatives-service.ts`, `server/src/services/vng-dashboard-service.ts`, `server/src/routes/query.ts`, `server/src/routes/spaces.ts` — services must only pass `auth` through to `createAlkemioSdk`; routes that stay member-only narrow with `if (req.auth!.kind !== 'member')` → `403 GUEST_FORBIDDEN`; run `cd server && npx tsc --noEmit` until clean
- [ ] T011 Create `server/src/auth/guest-rate-limit.ts`: in-process per-IP token bucket (`guestRateLimit(limitPerMinute)` Express middleware; key `req.ip`; refill continuously; on exhaustion `429 { error: 'RATE_LIMITED', message }` + `Retry-After` header; buckets pruned when idle > 5 min); applied only when `req.auth?.kind === 'guest'`
- [ ] T012 [P] Write `server/src/auth/middleware.guest.test.ts`: (a) `ea_session` valid + `ea_guest` present → member; (b) no session + `ea_guest=vng` → guest with `userId === '__guest__'`; (c) `ea_guest=govtech` (disabled) → 401 and cookie cleared; (d) `ea_guest=bogus` → 401; (e) `authMiddleware` never yields guest; (f) `guestCookieOptions()` has no `domain` and no `maxAge`/`expires`; plus `server/src/auth/guest-rate-limit.test.ts` (burst to limit → 429 with `Retry-After`; refill after time advance) and `server/src/routes/errors.test.ts` (classification table from the contract)

**Checkpoint**: Guest principal exists and is testable in isolation; no route admits it yet.

---

## Phase 3: User Story 1 — Choose to explore without signing in (Priority: P1) 🎯 MVP

**Goal**: The VNG login screen offers "Explore as guest" with the data-completeness warning; choosing
it enters the dashboard without any redirect; sign-in path unchanged; GovTech unchanged.

**Independent Test**: Private window on :5174 → both options + warning visible; click guest → shell
renders with no navigation; :5175 (GovTech) shows today's screen. After a cancelled OIDC sign-in the
guest option is still there.

### Server

- [ ] T013 [US1] Add `POST /api/auth/guest`, `GET /api/auth/guest`, `DELETE /api/auth/guest` to `server/src/routes/auth.ts` exactly per `contracts/api-auth-guest.md` (400 `INVALID_REQUEST`, 403 `GUEST_ACCESS_DISABLED`, 409 `ALREADY_SIGNED_IN`/`kind: 'member'` when a session resolves, 204 + cookie clear on GET-miss and DELETE); no Alkemio call in any of them
- [ ] T014 [P] [US1] Extend `GET /api/features` in `server/src/app.ts` with `guestAccess: { vng: boolean, govtech: boolean }` derived from `config.dashboards`
- [ ] T015 [P] [US1] Write `server/src/routes/auth.guest.test.ts` covering every row of the three endpoint tables in `contracts/api-auth-guest.md` (supertest against `createApp`), asserting the `Set-Cookie` header has `HttpOnly`, `Path=/`, no `Domain=`, no `Max-Age`/`Expires`

### Frontend

- [ ] T016 [P] [US1] Add `guestAccess?: boolean` to `AppConfig` in `frontend/shared/src/app/AppConfig.tsx` (doc comment: opt-in like `usageExplorer`; both this flag and `/api/features.guestAccess[app]` must be true) and set `guestAccess: true` in `frontend/vng/src/appConfig.ts`
- [ ] T017 [P] [US1] Add `enterGuest(app): Promise<{ kind: 'guest'; app: string }>`, `fetchGuest(): Promise<{ app: string } | null>` (null on 204/409/error) and `leaveGuest(): Promise<void>` to `frontend/shared/src/services/auth.ts` (plain `fetch`, `credentials: 'include'`); export them from `frontend/shared/src/index.ts`
- [ ] T018 [US1] Create `frontend/shared/src/dashboard/hooks/AuthContext.tsx`: `AuthState` union (`loading | member | guest | anonymous`, data-model.md §2.2), `AuthProvider` that runs `fetchMe()` → else (if `appConfig.guestAccess`) `fetchGuest()` → else `anonymous`; exposes `useAuth()` returning state + `becomeGuest(app)`, `leave()`, `setAnonymous()`, `recheck()`; calls a module-level `setAuthMode('member'|'guest'|'anonymous')` exported from `frontend/shared/src/services/api.ts` (add that setter + `getAuthMode()` now; behaviour change of 401 handling is T034)
- [ ] T019 [US1] Refactor the gate in `frontend/shared/src/dashboard/App.tsx`: wrap in `AuthProvider`; `loading` → `LoadingScreen`; `anonymous` → `LoginScreen`; `member` and `guest` → `SelectionProvider` + `AppShell`; keep `scopeImageCacheBustToUser` behaviour for members (call it with `'__guest__'` for guests)
- [ ] T020 [US1] Update `frontend/shared/src/dashboard/components/LoginScreen.tsx` per `contracts/ui-guest-and-failure-states.md`: read `guestAccess` from `useAppConfig()` **and** from the existing `/api/features` fetch (extend `useEnvironment` to return `guestAccess?.[appId]`); when both true render the `login.or` divider, secondary outline button `login.guestCta` (spinner while pending), and the always-visible warning paragraph `login.guestWarning` beneath it; on click `useAuth().becomeGuest(appId)`; on 403 `GUEST_ACCESS_DISABLED` hide the option and show `login.guestDisabled`; the OIDC error alert stays above both options
- [ ] T021 [P] [US1] Add i18n keys to `frontend/vng/src/i18n/nl.json` and `frontend/vng/src/i18n/en.json`: `login.or`, `login.guestCta`, `login.guestWarning`, `login.guestDisabled` (Dutch copy first-class; English mirrors it; warning must name Spaces, initiatives, people and figures as potentially missing — FR-002)
- [ ] T022 [US1] Create `tests/vng-guest-access.spec.mjs` (route-mocked like `tests/vng-funnel.spec.mjs`; mock `/api/features` with `guestAccess: { vng: true, govtech: false }`, `/api/auth/me` → 401, `/api/auth/guest` GET → 204 then POST → 200) with assertions 1–2 of the UI contract: VNG login shows sign-in + guest + warning; GovTech (:5175 or the govtech dev server) shows no guest option; clicking guest renders the shell with `page.url()` unchanged; with `?error=cancelled` the guest option is still present

**Checkpoint**: A visitor can enter the VNG dashboard as a guest. Data routes still 401 for guests
until Phase 4 — the shell shows failure states, which is acceptable for validating US1 in isolation
(and is what Phase 5 polishes).

---

## Phase 4: User Story 2 — Explore as a guest, always aware of what is missing (Priority: P2 ordering, P1 priority)

**Goal**: Every guest-eligible route serves anonymous Alkemio data; restricted top-level spaces are
rendered as restricted instead of vanishing; a persistent guest notice with Sign-in return-to; guest
user menu; cross-tab sign-in detection; browser-session-only guest choice.

**Independent Test**: As guest select the VNG hub → 3 public spaces with full data, ~20 restricted
(lock) still counted in NDS/VNG-2030/phase panels and the funnel, GD initiatives and gemeente map
fully loaded; notice on all 8 tabs; Sign in from the Funnel tab returns to Funnel with the same
selection and no notice; user menu shows Guest / Sign in / Leave.

### Server — guest-eligible routes

- [ ] T023 [US2] Switch `server/src/routes/hubs.ts` from `authMiddleware` to `guestAwareAuth` + `guestRateLimit`; replace the catch blocks with `respondUpstreamError(req, res, err, { status: 502, error: 'HUB_LIST_FAILED' | 'HUB_SPACES_FAILED', … })`
- [ ] T024 [US2] Switch `server/src/routes/dashboard.ts` to `guestAwareAuth` + `guestRateLimit`; use `respondUpstreamError` in all three handlers (`DASHBOARD_FAILED`, `GD_LIST_FAILED`, `GEMEENTE_LOCATIONS_UNAVAILABLE` keeps 503); pass `req.auth!.userId` (now `'__guest__'` for guests) unchanged into `generateGraph` / `assembleGemeenteDistribution` / `assembleCityPopulation` / `getGemeenteLocations`
- [ ] T025 [US2] Switch `server/src/routes/graph.ts` to `guestAwareAuth` + `guestRateLimit`: in `POST /generate` set `body.forceRefresh = false` when guest; `DELETE /cache` → `403 GUEST_FORBIDDEN` for guests; `GET /progress` and `generateGraph` use a progress key `progressKeyFor(req)` = `userId` for members, `` `__guest__:${req.get('X-EA-Client-Id') ?? ''}` `` for guests (add `progressKey` parameter to `generateGraph`/`getProgress` in `server/src/services/graph-service.ts`, defaulting to `userId`); catch → `respondUpstreamError` with `GENERATION_FAILED` fallback
- [ ] T026 [US2] Switch `server/src/routes/image-proxy.ts` to `guestAwareAuth`; when guest, fetch the Alkemio visual with **no** `Authorization` header (public visuals) and pass through the upstream status as today
- [ ] T027 [P] [US2] Write `server/src/routes/guest-routes.test.ts`: with a mocked SDK, `ea_guest=vng` reaches `GET /api/hubs`, `GET /api/hubs/x/spaces`, `POST /api/graph/generate`, `GET /api/graph/progress`, `POST /api/vng/dashboard`, `GET /api/vng/initiatives`, `GET /api/vng/gemeente-locations`, `GET /api/image-proxy`; `DELETE /api/graph/cache` → 403 `GUEST_FORBIDDEN`; `GET /api/spaces` and `POST /api/query` → 401/403 (never guest); `forceRefresh` ignored for guests (memo not invalidated — spy on `invalidateDatasetMemo`); upstream `FORBIDDEN_POLICY` on a guest request → 403 `GUEST_FORBIDDEN` and **no** `Set-Cookie` clearing `ea_session`

### Server — restricted top-level spaces (research R4)

- [ ] T028 [US2] In `server/src/services/acquire-service.ts` add an L0 privilege probe before `fetchSpaceByName`: call `sdk.spaceAboutByName({ nameId })`; if null → `spaceFailures.push({ nameId, reason: 'not_found' })`; if `about.membership.myPrivileges` includes `READ` → existing path; if it includes only `READ_ABOUT` → build a restricted L0 space object (`restricted: true`, about + classifications from the probe, `subspaces: []`, no community) and push it into `spacesL0` without any further query; if neither → `spaceFailures.push({ nameId, reason: 'restricted' })`; on throw → `reason: 'failed'` (keep the existing `errors` string too); return `spaceFailures` on `AcquiredData`
- [ ] T029 [US2] In `server/src/services/acquire-service.ts` skip the `ActivityFeedGrouped` call entirely when `auth.kind === 'guest'` and record one `{ nameId, reason: 'activity_unavailable' }` per acquired space; for members, a `FORBIDDEN_POLICY` on activity also maps to `activity_unavailable` rather than a bare error string
- [ ] T030 [US2] Add `SpaceFailure` / `SpaceFailureReason` and `GraphDataset.spaceFailures?: SpaceFailure[]` to `server/src/types/graph.ts` (data-model.md §1.5); in `server/src/services/graph-service.ts` assemble `spaceFailures` from acquisition (omit when empty), make restricted L0 spaces produce a `GraphNode` with `restricted: true` (reuse the subspace restricted-node path in `server/src/transform/`), and skip `datasetMemo.set` when any failure has `reason: 'failed'`
- [ ] T031 [P] [US2] Write `server/src/services/acquire-l0-privileges.test.ts` (mock SDK: READ → community fetched; READ_ABOUT → restricted L0 node, `spaceByName` **not** called, classifications preserved; none → `restricted` failure; throw → `failed`; guest → no `ActivityFeedGrouped` call, `activity_unavailable` recorded) and extend `server/src/services/graph-memo.test.ts` (dataset with a `failed` entry is not memoised; with only `restricted` it is)

### Frontend — guest experience

- [ ] T032 [US2] Create `frontend/shared/src/dashboard/components/GuestNotice.tsx`: same shell/collapse behaviour as `AuthorizationWarning.tsx` (`role="alert"`, full text in a11y tree, `useIsCompact()` collapse), content `guest.title` / `guest.body`, `[guest.signIn]` button calling `login(window.location.origin + '/?tab=' + activeTab)` (receive `activeTab` as a prop); in `frontend/shared/src/dashboard/App.tsx` render `<GuestNotice/>` instead of `<AuthorizationWarning/>` when `useAuth().status === 'guest'`
- [ ] T033 [US2] In `frontend/shared/src/dashboard/App.tsx`: on mount read `?tab=<key>` (validate against the tab list), set it active and `history.replaceState` it away; add a `visibilitychange`/`focus` listener that, in guest mode, calls `useAuth().recheck()` and on member → re-mounts `SelectionProvider` (key on `status`) so data reloads
- [ ] T034 [US2] Update `frontend/shared/src/dashboard/components/UserMenu.tsx`: when `useAuth().status === 'guest'` render a generic avatar + `guest.menuLabel`, language switch, `guest.signIn` (same `login(...)` with `?tab=`), `guest.leave` (→ `leaveGuest()` then `useAuth().setAnonymous()`), and **no** sign-out; member rendering unchanged
- [ ] T035 [US2] Update `apiFetch` in `frontend/shared/src/services/api.ts` so that on `401`: member mode → redirect exactly as today; guest/anonymous mode → dispatch a `window` event `ea:auth-lost` (which `AuthProvider` handles by `setAnonymous()`) and throw `RequiresSignInError` (class introduced here with `NetworkError`; full taxonomy in T041); also send `X-EA-Client-Id` on every request (id generated once per tab into `sessionStorage['ea_client_id']`)
- [ ] T036 [P] [US2] Add i18n keys `guest.title`, `guest.body`, `guest.signIn`, `guest.leave`, `guest.menuLabel`, `failure.spacesRestrictedGuest`, `failure.nothingPublic` to `frontend/vng/src/i18n/nl.json` and `frontend/vng/src/i18n/en.json`
- [ ] T037 [US2] In `frontend/shared/src/dashboard/pages/GraphTab.tsx`, `FunnelTab.tsx`, `DashboardTab.tsx`, `CitiesTab.tsx`, `InitiativesTab.tsx`: when the dataset's `spaceFailures` contains `restricted`/`not_found` entries render a one-line `failure.spacesRestrictedGuest` (guest) / existing restricted wording (member) with a Sign-in link in guest mode; when **every** selected space is restricted and the visitor is a guest render the `failure.nothingPublic` empty state instead of "no data" (FR-013, edge case "every selected Space is unreadable")
- [ ] T038 [US2] Extend `tests/vng-guest-access.spec.mjs` with UI-contract assertion 2: after entering as guest, iterate all eight tabs asserting the guest notice `role="alert"` is present; open the user menu and assert Guest / Sign in / Leave and no Sign out; assert the Sign-in button's navigation target contains `returnTo=` with `?tab=funnel` when clicked from the Funnel tab (intercept navigation); mock a dataset with `spaceFailures: [{nameId:'atlas', reason:'restricted'}]` and assert the restricted line renders

**Checkpoint**: The guest dashboard is fully usable with public data and honest about gaps.

---

## Phase 5: User Story 3 — Data retrieval failures are contained and recoverable (Priority: P2)

**Goal**: One error taxonomy, one failure component, per-area Retry, slow-request Cancel, structured
partial failures with Retry, consolidated "service unavailable" banner — for guests and members, in
the shared shell (GovTech benefits).

**Independent Test**: With a multi-Space selection, block/override one backing request at a time
(quickstart "Failure-handling drills") — only the dependent area fails, Retry restores it without
reload, no raw error text, guest 403 never redirects, member 401 still does.

### Server

- [ ] T039 [US3] Audit every remaining `res.status(5xx)` catch in `server/src/routes/hubs.ts`, `dashboard.ts`, `graph.ts`, `spaces.ts`, `query.ts` to go through `respondUpstreamError` so transport/5xx failures uniformly become `503 ALKEMIO_UNREACHABLE` while route-specific 502 codes are preserved as fallbacks; ensure no `message` contains upstream error text (log it, don't return it)

### Frontend — taxonomy and primitives

- [ ] T040 [US3] Complete the `ApiFailure` hierarchy in `frontend/shared/src/services/api.ts` (data-model.md §2.3): `UpstreamUnavailableError` (503 `ALKEMIO_UNREACHABLE`), `RequestFailedError` (`.status`, `.code` from the envelope, never exposing `message` as user copy), `RequiresSignInError` for 403 `GUEST_FORBIDDEN`; accept an optional `AbortSignal` in `api.get/post`; export all classes from `frontend/shared/src/index.ts`
- [ ] T041 [P] [US3] Create `frontend/shared/src/dashboard/hooks/useDataArea.ts` (data-model.md §2.4): generic `useDataArea<T>(load: (signal) => Promise<T>, deps, { slowAfterMs = 30000, enabled })` returning `DataAreaState<T>` + `reload()`; `slow` flips after the threshold; `cancel()` aborts and moves to `failed` with the `AbortError`; registers `reload` with `UpstreamStatusContext` on mount; never auto-retries
- [ ] T042 [P] [US3] Create `frontend/shared/src/dashboard/hooks/UpstreamStatusContext.tsx` (data-model.md §2.5): registry of area `reload`s and their latest error; `unavailable === true` when every currently-failed area's error is `UpstreamUnavailableError`; `retryAll()`; cleared when any area reports success
- [ ] T043 [P] [US3] Create `frontend/shared/src/dashboard/components/DataAreaFailure.tsx` implementing the error→copy→actions table in `contracts/ui-guest-and-failure-states.md` (props: `error`, `onRetry?`, `compact?`; Sign-in action for `RequiresSignInError` uses `login(origin + '/?tab=' + tab)`; renders `failure.seeBanner` one-liner when `UpstreamStatus.unavailable`); `console.error` the raw cause once
- [ ] T044 [P] [US3] Create `frontend/shared/src/dashboard/components/UnavailableBanner.tsx` (`failure.unavailableBanner` + `[failure.retryAll]`), mounted in `frontend/shared/src/dashboard/App.tsx` below the header/notice slot when `UpstreamStatus.unavailable`
- [ ] T045 [P] [US3] Add i18n keys `failure.network`, `failure.requiresSignIn`, `failure.unavailable`, `failure.unavailableBanner`, `failure.seeBanner`, `failure.rateLimited`, `failure.generic`, `failure.retry`, `failure.retryAll`, `failure.slow`, `failure.cancel`, `failure.spacesPartial` (`{{failed}}` / `{{total}}`) to `frontend/vng/src/i18n/nl.json`, `frontend/vng/src/i18n/en.json` **and** the GovTech locale files under `frontend/govtech/src/i18n/` (GovTech gets the robustness copy; no guest keys)

### Frontend — migrate the data hooks and tabs

- [ ] T046 [US3] Migrate `frontend/shared/src/dashboard/hooks/useHubs.ts` to `useDataArea` (typed `error: ApiFailure | null`, `reload`), keeping `fetchHubSpaces` and `defaultHubNameId` semantics
- [ ] T047 [P] [US3] Migrate `frontend/shared/src/dashboard/hooks/useDashboard.ts` and `frontend/shared/src/dashboard/hooks/useGdInitiatives.ts` to `useDataArea` (both gain `reload`; typed errors)
- [ ] T048 [P] [US3] Migrate `frontend/shared/src/dashboard/hooks/useGemeenteLocations.ts` to `useDataArea` (keep its module-level promise de-dup; typed errors; `reload` clears the memo)
- [ ] T049 [US3] Migrate `frontend/shared/src/dashboard/hooks/useVngGraph.ts` to `useDataArea`: expose `spaceFailures` (typed) instead of string `warnings`, `slow`/`cancel` from the area state alongside the existing `useGraphProgress` text, and `retryFailed()` = `reload()` (server does not memoise datasets with `failed`; cached spaces are not refetched)
- [ ] T050 [US3] Replace every verbatim error render — `{t('states.error')}: {error}` in `frontend/shared/src/dashboard/pages/DashboardTab.tsx`, `CitiesTab.tsx`, `InitiativesTab.tsx`, `CityDetailsTab.tsx`, `GraphTab.tsx`, `FunnelTab.tsx` (`<Centered>{error}</Centered>`), `UsageExplorerTab.tsx`, and the hub/space errors in `components/SelectedSpacesPanel.tsx` / `components/HubSelector.tsx` — with `<DataAreaFailure error={…} onRetry={reload} />`; keep the surrounding layout so unaffected panels on the same tab still render (FR-014)
- [ ] T051 [US3] In the tabs that consume the graph dataset (`GraphTab.tsx`, `FunnelTab.tsx`, `CitiesTab.tsx`, `InitiativesTab.tsx`, `DashboardTab.tsx`) render the partial-failure line `failure.spacesPartial` with **Retry** (→ `retryFailed`) when `spaceFailures` has `reason: 'failed'` entries, and the slow state (`failure.slow` + `[failure.cancel]`) under the existing progress text when `slow === true`
- [ ] T052 [P] [US3] Write `frontend/vng/src/services/api.test.ts` (Vitest + `fetch` mock; add `jsdom` environment if `frontend/vng/vitest.config.*` lacks it): 401 in member mode → `location.href` assigned to `/api/auth/login?...`; 401 in guest mode → `RequiresSignInError` + `ea:auth-lost` event, **no** navigation; 403 `GUEST_FORBIDDEN` → `RequiresSignInError`; 503 `ALKEMIO_UNREACHABLE` → `UpstreamUnavailableError`; 502 → `RequestFailedError` with `.code`; network throw → `NetworkError`; `X-EA-Client-Id` present and stable across calls
- [ ] T053 [P] [US3] Write `frontend/vng/src/hooks/useDataArea.test.tsx` (`@testing-library/react`, fake timers): loading → ready; failure → `failed` with `retry` that re-invokes `load` exactly once; `slow` flips at `slowAfterMs`; `cancel` aborts the signal; no automatic retry after failure
- [ ] T054 [US3] Extend `tests/vng-guest-access.spec.mjs` with UI-contract assertions 3–6: 503 on `/api/vng/dashboard` with graph OK → banner + Graph tab renders; restore mock + Retry all → banner gone; 403 `GUEST_FORBIDDEN` on `/api/vng/initiatives` → "requires signing in" and `page.url()` unchanged; `spaceFailures: [{reason:'failed'}]` → partial line with Retry, clean after Retry; member mode (mock `/api/auth/me` 200) + 401 on `/api/hubs` → navigation to `/api/auth/login?returnTo=…`

**Checkpoint**: Every data area fails independently with plain-language copy and Retry; guests never
loop; members' expiry behaviour unchanged.

---

## Phase 6: User Story 4 — Guests and members stay isolated (Priority: P3)

**Goal**: Guest data is cached and memoised under `__guest__` only; guests can never reach
member-only capabilities; no personal data stored for guests.

**Independent Test**: Member loads a private Space; fresh browser as guest loads it → public view
only; sign in in that browser → full view; guest cannot call `/api/query`, `/api/spaces`, cache
clear, or `forceRefresh`.

- [ ] T055 [US4] Write `server/src/cache/guest-scoping.test.ts`: `setCacheEntry('__guest__', s)` and `setCacheEntry('<actor>', s)` coexist; `getCacheEntry('__guest__', s)` never returns the actor's row and vice versa; `clearUserCache('__guest__')` leaves member rows; `runDeploymentCacheMaintenance` treats guest rows like any other
- [ ] T056 [P] [US4] Write `server/src/services/graph-memo.guest.test.ts`: two concurrent guest `generateGraph` calls for the same selection (different `X-EA-Client-Id`) share one in-flight build (SDK `spaceByName` called once per space); a member call for the same selection does **not** hit the guest memo entry
- [ ] T057 [P] [US4] Extend `server/src/routes/guest-routes.test.ts` (T027) with the member-only matrix from `contracts/api-auth-guest.md`: `POST /api/query`, `GET /api/query/*`, `GET /api/spaces`, `GET /api/spaces/related`, `DELETE /api/graph/cache` all refuse guests; assert the guest branch never calls `ensureFreshAccessToken`/`decrypt` (spy)
- [ ] T058 [US4] Audit `server/src/logging/` usage on the guest path: `guestAwareAuth`, `guest.ts`, `guest-rate-limit.ts` must never log cookie values or IPs at info level (IP only in the limiter's debug log, hashed or truncated); add a unit assertion in `server/src/auth/middleware.guest.test.ts` that the logger spy receives no `ea_guest` value
- [ ] T059 [P] [US4] Add a `frontend/vng/src/hooks/AuthContext.test.tsx` covering the transition table in data-model.md §2.2 (loading→member, loading→guest, loading→anonymous, guest→anonymous on `ea:auth-lost`, guest→member on `recheck()` success, `leave()` → anonymous)

**Checkpoint**: Isolation and capability gating are proven by tests, not by inspection.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T060 [P] Run all existing Playwright specs unchanged — `tests/mobile-navigation.spec.mjs` (no horizontal page scroll at 390/820/1440 with the guest notice and banner mounted), `tests/vng-funnel.spec.mjs`, `tests/vng-city-perspective.spec.mjs`, `tests/vng-map-nl-only.spec.mjs`, `tests/govtech-map-nl-only.spec.mjs`, `tests/nl-only-composited.spec.mjs` — and fix any regression in the shell (SC-009, constitution VII)
- [ ] T061 [P] `npx tsc --noEmit` in `server/`, `frontend/shared/`, `frontend/vng/`, `frontend/govtech/`, `frontend/ecosystem-analytics/`; `pnpm test` in `server/` and `frontend/vng/`; `pnpm run build` in `frontend/vng` and `frontend/govtech`
- [ ] T062 [P] Run the manual walkthrough and failure drills in `specs/023-vng-guest-access/quickstart.md` against the live acceptance/production endpoint and record results (3 public / ~20 restricted spaces in the VNG hub; GD corpus and map load as guest; browser restart returns to login)
- [ ] T063 [P] Update `CLAUDE.md` architecture section with one paragraph on the guest-access pattern (host-only `ea_guest` cookie, `guestAwareAuth` allow-list, `__guest__` cache principal, `guestAccess` opt-in per dashboard) and add `023-vng-guest-access` to Recent Changes
- [ ] T064 Propose the constitution MINOR amendment from research R10 via `/speckit.constitution` (Principle I/IV + Security Requirements: per-dashboard opt-in anonymous guest access to Alkemio-public content; no token; shared guest cache principal; member-only capabilities excluded) and record the version bump in `.specify/memory/constitution.md`
- [ ] T065 Verify the Docker image and k8s manifests need no change beyond the optional `VNG_GUEST_ACCESS` env var (`Dockerfile`, `k8s/` — document the var where the other `VNG_*` vars are documented)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first (types), then T002–T004 in parallel.
- **Foundational (Phase 2)**: T005 → T006 → T007/T008/T009 (parallel) → T010 (compile fix-up) → T011; T012 in parallel with T010/T011. **Blocks all stories.**
- **US1 (Phase 3)**: after Phase 2. Server T013–T015 parallel with frontend T016–T017; T018 → T019 → T020; T021 parallel; T022 last.
- **US2 (Phase 4)**: after Phase 2 (and after T018/T019 for the frontend half). Server route tasks T023–T026 parallel with acquisition T028–T030 (T030 after T028/T029); T027/T031 tests after their implementations. Frontend T032–T037 after US1's `AuthContext`/gate; T038 last.
- **US3 (Phase 5)**: after Phase 2 for T039–T045; T046–T051 after T040–T042; T052/T053 parallel with migration; T054 last. Independent of US1/US2 (works for members alone) — but T037/T051 share tab files: coordinate edits, do T037 (US2) before T051 (US3) or merge them.
- **US4 (Phase 6)**: after Phase 2 and T023–T025 (routes to test). Test-only; can run in parallel with US3.
- **Polish (Phase 7)**: after all desired stories.

### User Story Dependencies

- **US1** (guest door): only Phase 2. Independently demonstrable (guest enters; data routes still 401 until US2).
- **US2** (guest experience): Phase 2 + US1's `AuthContext`/gate (T018–T019). Contains the server route enablement that makes US1 useful.
- **US3** (failure containment): Phase 2 only; deliverable to members on its own.
- **US4** (isolation): Phase 2 + US2 server routes; test-only.

### Parallel Opportunities

- Phase 1: T002, T003, T004 together.
- Phase 2: T007, T008, T009 together; T012 alongside T010/T011.
- Phase 3: {T013, T014, T015} ‖ {T016, T017, T021}.
- Phase 4: {T023, T024, T025, T026} ‖ {T028, T029} ‖ {T032, T034, T036}; tests T027, T031 as soon as their targets land.
- Phase 5: {T041, T042, T043, T044, T045} together after T040; {T047, T048} ‖ T046; {T052, T053} alongside migrations.
- Phase 6: T055, T056, T057, T059 together.
- Phase 7: T060–T063 together.

---

## Parallel Example: Phase 2 → US1

```bash
# After T005–T006 land:
Task: "T007 resolve-user accepts both kinds — server/src/auth/resolve-user.ts"
Task: "T008 token-less SDK for guests — server/src/graphql/client.ts"
Task: "T009 classifyUpstreamError / respondUpstreamError — server/src/routes/errors.ts"

# US1 server and frontend halves in parallel:
Task: "T013 /api/auth/guest endpoints — server/src/routes/auth.ts"
Task: "T014 /api/features.guestAccess — server/src/app.ts"
Task: "T016 AppConfig.guestAccess + VNG appConfig"
Task: "T017 enterGuest/fetchGuest/leaveGuest — frontend/shared/src/services/auth.ts"
Task: "T021 VNG i18n login.guest* keys"
```

---

## Implementation Strategy

### MVP First (Phase 1 → 2 → US1)

1. Setup + Foundational: the guest principal exists server-side and type-checks; nothing admits it.
2. US1: login screen offers guest, shell enters guest mode. **Validate**: private window, both
   options + warning, no navigation, GovTech unchanged.

### Incremental Delivery

3. US2: enable guest routes + restricted L0 spaces + notice/menu/return-to → **the real guest
   dashboard**. Validate with the quickstart walkthrough (3 public / ~20 restricted spaces).
4. US3: failure containment across the shell → validate with the failure drills; GovTech benefits.
5. US4: isolation proven by tests.
6. Polish: regressions, type checks, docs, constitution amendment.

### Suggested split for two developers

- Dev A: Phase 2 → US1 server (T013–T015) → US2 server (T023–T031) → US4.
- Dev B (after T006/T009 land): US3 primitives (T040–T045) → US1 frontend (T016–T022) → US2 frontend
  (T032–T038) → US3 migrations (T046–T054).

---

## Notes

- The `AuthContext` union (T006) is intentionally the compile-time checklist for every call site
  that touches a token: do not add `session?:` shortcuts.
- Never render `message` from the error envelope; key on `status` + `error` (contract).
- No automatic retries anywhere (FR-018); Retry is always a visitor action.
- `frontend/govtech/` receives only the `failure.*` i18n keys (T045) — no guest keys, no config flag.
- Commit `server/src/graphql/generated/` with T004.

---

## Added by feature 024 (VNG Ecosystem Map), 2026-09-21

Feature 024 shipped `/api/ecosystem/orchestrator/:hubNameId` (GET/PUT/DELETE) behind
`authMiddleware` + `resolveUser`. Its contract already specifies guest behaviour; these two tasks
implement it when the guest principal lands. Until then the frontend hook treats a refusal as
"the server will not remember this" and keeps the choice in `sessionStorage` for the visit, so
nothing breaks in the meantime.

- [ ] T066 [US2] Admit the guest principal to `GET /api/ecosystem/orchestrator/:hubNameId` in `server/src/routes/ecosystem.ts`: answer `own: null` (a guest has no stored choice), `builtIn` as usual, and `community` still filtered through `canReadSpace` with the guest's own (anonymous) access — a guest must never see a Space nameID they could not otherwise read.
- [ ] T067 [US2] Refuse guest writes: `PUT` and `DELETE` on that route answer `403 GUEST_FORBIDDEN` for a guest principal. Guest choices MUST NOT reach `orchestrator_choices` — guests are anonymous and cannot be de-duplicated, so counting them would let one visitor's repeat visits swing the community preset. Verify `frontend/shared/src/dashboard/hooks/useOrchestratorChoice.ts` still falls back to `sessionStorage` on that 403 (`isRefusal`).
