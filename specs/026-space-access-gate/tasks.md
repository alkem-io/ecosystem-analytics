---
description: "Task list for 026-space-access-gate"
---

# Tasks: Space-Based Access Gate

**Input**: Design documents from `/specs/026-space-access-gate/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-access.md,
contracts/config-access.md, quickstart.md

**Tests**: Included. The spec requires the shared access logic to be verifiable on its own (FR-018c),
and plan/research R11 defines the testing strategy. Write tests before their implementation and
watch them fail.

**Organization**: Grouped by user story (spec.md: US1 P1, US2 P1, US3 P2, US4 P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task serves (US1–US4)

## Path Conventions

pnpm workspace: BFF in `server/src/`, SPAs in `frontend/{shared,ecosystem-analytics,vng,govtech}/src/`,
Playwright specs in `tests/`. All access logic goes in `server/src/access/` and all access UI in
`frontend/shared/src/access/` (FR-018a). Do **not** add access logic anywhere else.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: configuration, typed queries and dev parity that every story needs.

- [X] T001 Add the `access:` block to `server/analytics.yml` exactly as in `contracts/config-access.md`: `explorer: ${EXPLORER_ACCESS_GATE}:none`, `vng: ${VNG_ACCESS_GATE}:programmagroei/landelijkinnovatiemonitor`, `govtech: ${GOVTECH_ACCESS_GATE}:none`, `vng_display_name: ${VNG_ACCESS_GATE_NAME}:Landelijk Innovatie Monitor`, `check_timeout_ms: ${ACCESS_CHECK_TIMEOUT_MS}:5000`; add the same env vars, commented with their meaning, to `server/.env.default`
- [X] T002 [P] Create `server/src/graphql/queries/accessGate.graphql`: one query per depth (`AccessGateL0($space: NameID!)`, `AccessGateL1($space, $sub)`, `AccessGateL2($space, $sub, $subsub)`), each walking `lookupByName { space(NAMEID) { subspaceByNameID(NAMEID) … } }` to the gate and selecting only `id` and `authorization { myPrivileges }` on the gate Space (research R3: use `authorization.myPrivileges`, **not** `about.membership.myPrivileges`)
- [X] T003 [P] Create `server/src/graphql/queries/accessGateProbe.graphql` with the same three depths (`AccessGateProbeL0/L1/L2`), selecting on the gate Space `id`, `authorization { myPrivileges }`, `about { isContentPublic profile { displayName url } }` (research R6)
- [X] T004 Run `pnpm -C server run codegen` and commit the regenerated `server/src/graphql/generated/` (Constitution II); confirm the six new operations appear on `getSdk`
- [X] T005 [P] Change the default dev proxy target in `frontend/vng/vite.config.ts` to `http://localhost:4101` and in `frontend/govtech/vite.config.ts` to `http://localhost:4102`, keeping the `VITE_PROXY_TARGET` override and updating the console message (research R2); leave `frontend/ecosystem-analytics/vite.config.ts` on 4100

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the reusable access module, its persistence, and the per-app wiring. No story can start
until this phase is complete.

### Pure core (tests first)

- [X] T006 [P] Write `server/src/access/policy.test.ts` covering: `parseGateRef` accepts `none` → `null`; `space`, `space/sub`, `space/sub/subsub` → `path` of length 1–3 and `key = path.join('/')`; `https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor` → `['programmagroei','landelijkinnovatiemonitor']` (host ignored, `challenges`/`opportunities` dropped); empty string, 4+ segments, `nope///`, and invalid nameID characters throw. `levelFromPrivileges`: no `READ` → `'none'` (even with `UPDATE`); `READ` only → `'read'`; `READ`+`UPDATE` → `'manage'`. `admits`: ungated policy → `true` for every level; gated `required:'read'` admits `read` and `manage` but not `none`; `required:'manage'` admits only `manage`
- [X] T007 [P] Write `server/src/access/request-apps.test.ts` covering `appsForRequest(listenerApp, req)`: always includes the listener; adds `vng`/`govtech` from a `/api/vng/…` / `/api/govtech/…` path, from `?app=` on `/api/hubs`, and from `body.app` on `/api/graph/*`; ignores unknown app names; never adds an app for `/api/ecosystem/*`; de-duplicates (contract `api-access.md` §3 table)
- [X] T008 Implement `server/src/access/policy.ts` to pass T006: export `AppId = 'explorer' | 'vng' | 'govtech'` and `APP_IDS`, `GateRef { path: string[]; key: string }`, `AccessLevel = 'none' | 'read' | 'manage'` with rank `none < read < manage`, `AccessPolicy = { app; gate: null } | { app; gate: GateRef; required: 'read' | 'manage' }`, `parseGateRef`, `levelFromPrivileges`, `admits`. Pure, no I/O
- [X] T009 Implement `server/src/access/request-apps.ts` to pass T007 (pure, takes `{ path, query, body }`)
- [X] T010 [P] Create `server/src/types/access.ts` re-exporting `AppId`, `AccessLevel`, `AccessPolicy` and defining `AccessReport { app: AppId; status: 'admitted' | 'none' | 'unverified'; level: AccessLevel | null; gated: boolean; gate: { displayName: string; url: string } | null }` (data-model.md), for `@server/types/access.js`

### Configuration

- [X] T011 Add `AccessConfig { apps: Record<AppId, { gate: GateRef | null; displayNameFallback?: string }>; checkTimeoutMs: number }` to `ServerConfig.access` in `server/src/config.ts`. Parse each `access.<app>` with `parseGateRef`; a **missing or empty key or an unparseable value throws** `Error('access.<app>: …')` so start-up fails (FR-003); read `<app>_display_name` as the fallback. Add cases to the existing config tests (or create `server/src/config.access.test.ts`)

### Persistence

- [X] T012 Add table `access_decisions (session_id TEXT NOT NULL, app_id TEXT NOT NULL, gate_key TEXT NOT NULL, level TEXT NOT NULL CHECK (level IN ('none','read','manage')), decided_at INTEGER NOT NULL, PRIMARY KEY (session_id, app_id))` to `initDatabase` in `server/src/cache/db.ts`
- [X] T013 [P] Write `server/src/access/decision-store.test.ts`: put/get round trip; one row per `(session_id, app_id)` (a second put replaces it); a row whose `gate_key` differs from the requested key is returned as `null`; `clearForSession` removes every app's row; `'unverified'` cannot be stored (type-level and runtime guard); orphans (session gone) are removed by `purgeExpired`
- [X] T014 Implement `server/src/access/decision-store.ts` (`getDecision(sessionId, appId, gateKey)`, `putDecision(...)` via parameterised `INSERT … ON CONFLICT(session_id, app_id) DO UPDATE`, `clearDecision(sessionId, appId)`, `clearForSession(sessionId)`) to pass T013
- [X] T015 Delete a session's decisions when the session is deleted — *done in `deleteSession` (`server/src/cache/session-store.ts`) instead of `destroySession`, because `resolveSession` deletes expired sessions directly and would otherwise leave decisions behind*, and in `purgeExpired` in `server/src/cache/cache-service.ts` add `DELETE FROM access_decisions WHERE session_id NOT IN (SELECT session_id FROM oidc_sessions)` after the session purge

### Alkemio access

- [X] T016 Add `createAnonymousAlkemioSdk()` to `server/src/graphql/client.ts`: the same `getSdk` over a `GraphQLClient` on `config.alkemioGraphqlEndpoint` with **no** `Authorization` header and a request timeout of `config.access.checkTimeoutMs`
- [X] T017 [P] Write `server/src/access/determine.test.ts` with a faked SDK covering every row of research R7: privileges → level; null space/subspace or a GraphQL `FORBIDDEN`/`ENTITY_NOT_FOUND` error **when the probe found the gate** → `'none'`; the same when the probe has not confirmed the gate → `'unverified'`; `isAlkemioAuthError` → rethrown (caller does `invalidateAndReject`); network error, timeout or 5xx → `'unverified'`; the L0/L1/L2 query is chosen from `gate.path.length`
- [X] T018 Implement `server/src/access/determine.ts`: `determineLevel(auth: AuthContext, gate: GateRef, gateExists: 'yes' | 'no' | 'unknown'): Promise<AccessLevel | 'unverified'>` using `createAlkemioSdk(auth)` and the T002 operations, with a `checkTimeoutMs` abort, to pass T017
- [X] T019 [P] Write `server/src/access/probe.test.ts` (faked anonymous SDK): found → `GateInfo { displayName, url, exists: 'yes', publiclyReadable }`, where `publiclyReadable` is true when anonymous `myPrivileges` contains `READ` or `isContentPublic`, and a `warn` is logged naming the app and the gate path (FR-020); not found → `exists: 'no'` and an `error` log; unreachable → `exists: 'unknown'`, a display name from `displayNameFallback` or else the last nameID, and a URL built from `alkemioServerUrl` + `/<space>/challenges/<sub>[/opportunities/<subsub>]`
- [X] T020 Implement `server/src/access/probe.ts` (`probeGate(app, gate, fallback)` plus an in-memory `getGateInfo(app)` registry; while `exists === 'unknown'`, retry every 60 s with an unref'd timer) to pass T019

### Service and wiring

- [X] T021 Implement `server/src/access/access-service.ts`: `policyFor(app): AccessPolicy` (from config, `required: 'read'`); `decide(auth, app, { force?: boolean }): Promise<AccessLevel | 'unverified'>` (ungated → `'read'`; otherwise use the held decision from the store unless `force`; else `determineLevel`; store the result **unless `'unverified'`**); `report(auth, app): Promise<AccessReport>` per the table in `contracts/api-access.md` §1; logs every `none`/`unverified` outcome with `userId`, `app` and reason only, **never** tokens, session id or cookie (FR-019)
- [X] T022 [P] Write `server/src/access/access-service.test.ts`: the held decision is reused (determine called once per session×app); `force` re-determines and replaces it; `unverified` is never held (next call re-determines); a gate-key change re-determines; an ungated app never calls Alkemio; decisions for `vng` and `govtech` are independent within one session (FR-003a)
- [X] T023 Change `createApp(staticDir)` to `createApp(appId: AppId, staticDir)` in `server/src/app.ts` and stamp `res.locals.appId = appId` in the first middleware; update the three calls in `server/src/index.ts` to `createApp('explorer', …)`, `createApp('vng', …)`, `createApp('govtech', …)` and update every test that calls `createApp`
- [X] T024 In `server/src/index.ts`, after `loadConfig()`: log each app's gate status (`[Access] <app>: UNGATED (explicit)` / `[Access] <app>: gated by <key> (read)`), then `void probeGate(...)` for each gated app (non-blocking; listeners start regardless)

**Checkpoint**: the access module is complete and unit-tested, and each request knows its listener app. Nothing is enforced yet.

---

## Phase 3: User Story 1 — A member signs in and uses the application (P1) 🎯 MVP part 1

**Goal**: a person with READ on the gate Space gets in with no extra step, and their data is unchanged.

**Independent Test**: sign in to VNG as a member → lands on the requested page; `GET /api/auth/me` on the VNG listener reports `access.status: 'admitted'`, `level: 'read'`; every tab loads as before.

### Tests for User Story 1

- [X] T025 [P] [US1] Add cases to `server/src/auth/me.test.ts` (create it if absent) asserting `/api/auth/me` returns `access` per `contracts/api-access.md` §1 for an ungated app (`admitted`/`read`/`gated:false`/`gate:null`) and for a gated app with a member (`admitted`/`read`/`gated:true`/gate object); and that `/me` still answers 401 with no session
- [X] T026 [P] [US1] Add `frontend/shared/src/dashboard/App.access.test.tsx`: with `fetchMe` resolving `access.status: 'admitted'`, the dashboard shell renders exactly as before (no access screen, no extra step) — *done as pure tests of `accessScreenFor` in `frontend/vng/src/dashboard/access.test.ts`: the workspace has no DOM test environment and the feature adds no dependency; rendering is covered by T033*

### Implementation for User Story 1

- [X] T027 [US1] Extend `meHandler` in `server/src/auth/me.ts` to add `access: await report(req.auth, res.locals.appId)`; if `report` rethrows an Alkemio auth error, keep the existing `invalidateAndReject` behaviour
- [X] T028 [P] [US1] Add `access: AccessReport` to `MeResponse` in `frontend/shared/src/services/auth.ts` (import the type from `@server/types/access.js`) and to the Explorer's `frontend/ecosystem-analytics/src/services/auth.ts`
- [X] T029 [US1] In `frontend/shared/src/dashboard/App.tsx` (auth branch around `if (!me) return <LoginScreen />`), render the dashboard only when `me.access.status === 'admitted'`. For other statuses render a placeholder for now; US2 replaces it

**Checkpoint**: members are unaffected, and the frontend now knows each person's access.

---

## Phase 4: User Story 2 — A non-member is turned away clearly (P1) 🎯 MVP part 2

**Goal**: a signed-in person without READ sees a clear "no access" page, and no gated data can be obtained through any listener.

**Independent Test**: sign in to VNG as an outsider → "no access" page with account name, gate name + link and sign out; direct URLs show the same page; `curl` to `/api/vng/dashboard` on **both** :4101 and :4100 → 403 `ACCESS_DENIED`; the Explorer keeps working for them (FR-012a).

### Tests for User Story 2

- [X] T030 [P] [US2] Write `server/src/access/middleware.test.ts` (HTTP-level, building each listener with `createApp(app, …)` and a stubbed `access-service`) for every row of the `contracts/api-access.md` §3 example table, plus: exempt paths `/api/auth/*`, `/api/health`, `/api/features` and `/api/meta` are never refused; no session → 401 (not 403); a refused `POST /api/graph/generate` with `Accept: text/event-stream` returns JSON 403 and **never** a `text/event-stream` content type; the 403 body is `{ error: 'ACCESS_DENIED', reason, app, message }`; no cache read happens before refusal (spy on `getCacheEntry`, FR-011)
- [X] T031 [P] [US2] Write `frontend/shared/src/access/NoAccessScreen.test.tsx` and `AccessCheckFailedScreen.test.tsx`: the no-access screen shows the signed-in display name, the gate display name, a link to `gate.url` opening in a new tab with `rel="noopener noreferrer"`, a "Check again" button and a "Sign out" button; the check-failed screen shows the could-not-verify copy and a "Try again" button and **never** the no-access copy (FR-014) — *screen rendering is asserted in `tests/vng-access-gate.spec.mjs` (no DOM unit-test environment); both screens live in one file, `frontend/shared/src/access/AccessScreens.tsx`*
- [X] T032 [P] [US2] Write `frontend/shared/src/services/api.access.test.ts`: a 403 `ACCESS_DENIED` from `apiFetch` and from both the stream and JSON paths of `graph-loader` calls `signalAccessDenied` once (guarded across parallel requests) and **does not** call `redirectToLogin`; a 401 still redirects to sign-in — *written as `frontend/vng/src/dashboard/access.test.ts` (shared code is tested from the VNG package)*
- [X] T033 [P] [US2] Create `tests/vng-access-gate.spec.mjs` (Playwright, mocked BFF like `tests/vng-ecosystem.spec.mjs`): `/api/auth/me` with `access.status: 'none'` → no-access screen with the gate name and link, no tab bar; `'unverified'` → check-failed screen; `'admitted'`, then a data route returning 403 `ACCESS_DENIED` → switches to the no-access screen with no error toast and no navigation to `/api/auth/login`; layout has no horizontal scroll at 390 px

### Implementation for User Story 2

- [X] T034 [US2] Implement `server/src/access/middleware.ts`: `accessGate` (app-level), which skips exempt paths; reads the `ea_session` cookie and `resolveSession` **without** `touchSession`; if there is no valid session it calls `next()` (the route's `authMiddleware` then 401s); otherwise for each app in `appsForRequest(res.locals.appId, req)` it calls `decide` and `admits(policyFor(app), level)`, and on the first refusal responds 403 `{ error: 'ACCESS_DENIED', reason: level === 'unverified' ? 'unverified' : 'none', app, message: 'No access to this application' }`. An Alkemio auth error → clear the session and respond 401 as `invalidateAndReject` does. Also export `requireAccess(policy)` for route-level use (built on the same `decide`/`admits`)
- [X] T035 [US2] Mount `accessGate` in `server/src/app.ts` after `express.json()` and **before** the first `app.use('/api/…', router)`, so every router, including the SSE stream, sits behind it
- [X] T036 [P] [US2] Create `frontend/shared/src/access/access-signal.ts`: `signalAccessDenied(reason)` (once-guarded per page, like `redirectToLogin`), `onAccessDenied(listener)` and `resetAccessSignal()`
- [X] T037 [US2] Handle 403 `ACCESS_DENIED` in `frontend/shared/src/services/api.ts` (`apiFetch` and the second fetch path near line 124) and in `frontend/shared/src/services/graph-loader.ts` (the JSON path near line 74 and the stream path): parse the body, call `signalAccessDenied(body.reason)`, then throw an `AccessDeniedError`. The existing 401 handling stays unchanged
- [X] T038 [P] [US2] Create `frontend/shared/src/access/NoAccessScreen.tsx`: props `{ me: MeResponse; onCheckAgain(): void; onSignOut(): void; checking: boolean; strings }`. It reuses `LoginScreen`'s card layout and tokens (`frontend/shared/src/dashboard/components/LoginScreen.tsx`) and shows the account display name and avatar, the explanation that access is granted through membership of the named Space, an external link to `me.access.gate.url`, "Check again" (disabled while `checking`) and "Sign out". It must be responsive at 390 px (FR-013, FR-016) — *in `frontend/shared/src/access/AccessScreens.tsx`*
- [X] T039 [P] [US2] Create `frontend/shared/src/access/AccessCheckFailedScreen.tsx` (same layout): could-not-verify copy, "Try again" and "Sign out" (FR-014) — *in `frontend/shared/src/access/AccessScreens.tsx`*
- [X] T040 [US2] Export the two screens and the signal from `frontend/shared/src/index.ts`; in `frontend/shared/src/dashboard/App.tsx`, replace the T029 placeholder: `'none'` → `NoAccessScreen`, `'unverified'` → `AccessCheckFailedScreen`; subscribe to `onAccessDenied` and on a signal re-run `fetchMe()` and switch screens (FR-015; no toast, no redirect)
- [X] T041 [P] [US2] Add the access-screen strings under an `access.*` key group (title, explanation with `{{space}}`, `openSpace`, `checkAgain`, `checking`, `signOut`, `signedInAs`, `unverifiedTitle`, `unverifiedBody`, `tryAgain`) in Dutch and English to `frontend/vng/src/i18n/nl.json`, `frontend/vng/src/i18n/en.json`, `frontend/govtech/src/i18n/nl.json` and `frontend/govtech/src/i18n/en.json`
- [X] T042 [US2] Make the Explorer gateable by config (FR-001): in `frontend/ecosystem-analytics/src/App.tsx`, after `fetchMe()`, render the shared `NoAccessScreen` / `AccessCheckFailedScreen` with English strings when `me.access.status !== 'admitted'`, and subscribe to `onAccessDenied` the same way; also handle 403 `ACCESS_DENIED` in `frontend/ecosystem-analytics/src/services/` wherever it handles 401. Leave the existing OIDC `NotAuthorizedPage` untouched (different concern)

**Checkpoint**: the gate is enforced server-side on every listener, and refused people see a clear, actionable page. US1 and US2 together are the MVP.

---

## Phase 5: User Story 3 — Access follows membership changes on Alkemio (P2)

**Goal**: "Check again" admits a newly added person immediately. Removal takes effect at the next sign-in. A failed check is never held.

**Independent Test**: outsider on the no-access page → added on Alkemio → "Check again" → enters without signing in again. A member removed mid-session keeps access until they sign out, then is refused.

### Tests for User Story 3

- [X] T043 [P] [US3] Add to `server/src/access/middleware.test.ts` (or `server/src/routes/auth.access.test.ts`): `POST /api/auth/access/recheck` returns `{ access: AccessReport }`, calls `decide` with `force: true`, is reachable by a refused session, answers 401 without a session, and within 5 s returns the held report without calling Alkemio again (rate limit per session × app)
- [X] T044 [P] [US3] Add to `server/src/access/access-service.test.ts`: after a stored `read` decision, a privilege change on the faked SDK is **not** seen by later requests in that session (held decision); a new session sees it (FR-006, FR-015)

### Implementation for User Story 3

- [X] T045 [US3] Add `POST /access/recheck` to `server/src/routes/auth.ts` (behind `authMiddleware`; handler `server/src/access/recheck-handler.ts` calling `decide(auth, res.locals.appId, { force: true })` then `report`), with an in-process last-recheck map keyed `sessionId:appId` enforcing the 5 s window from `contracts/api-access.md` §2
- [X] T046 [P] [US3] Add `recheckAccess(): Promise<AccessReport>` to `frontend/shared/src/services/auth.ts` (POST `/api/auth/access/recheck`, `credentials: 'include'`)
- [X] T047 [US3] Wire "Check again" and "Try again" in `frontend/shared/src/dashboard/App.tsx` and `frontend/ecosystem-analytics/src/App.tsx`: set `checking`, call `recheckAccess()`, replace `me.access` with the result, and when it is `admitted`, call `resetAccessSignal()` and render the app without a page reload — *via the shared `useAccessControl` hook (`frontend/shared/src/access/useAccessControl.ts`)*
- [X] T048 [P] [US3] Extend `tests/vng-access-gate.spec.mjs`: no-access screen → "Check again" with the recheck mock returning `admitted` → the dashboard renders and `/api/auth/login` is never requested

**Checkpoint**: membership changes on Alkemio are followed with no administration in Ecosystem Analytics.

---

## Phase 6: User Story 4 — The management access level is known to the application (P3)

**Goal**: the Manage level (READ + UPDATE) is reported now, and a future route can require it with one declaration.

**Independent Test**: a READ-only account gets `access.level: 'read'` and a READ+UPDATE account gets `'manage'` from `/api/auth/me` on the VNG listener; both use the dashboard identically.

### Tests for User Story 4

- [X] T049 [P] [US4] Add to `server/src/auth/me.test.ts`: READ+UPDATE → `level: 'manage'`, `status: 'admitted'`; UPDATE without READ → `level: 'none'`, `status: 'none'`
- [X] T050 [P] [US4] Add to `server/src/access/middleware.test.ts`: a throwaway router guarded by `requireAccess({ app: 'vng', gate, required: 'manage' })` returns 403 `ACCESS_DENIED` for a `read` session and 200 for a `manage` session, and reuses the held decision (no extra Alkemio call), which proves FR-018b — *`requireAccess` takes `{ app, required }` and uses that app's configured gate (contracts §4), so a route cannot declare a gate that collides with the one-decision-per-app store*

### Implementation for User Story 4

- [X] T051 [US4] Confirm `report()` in `server/src/access/access-service.ts` passes `manage` through as `level` (status stays `admitted`), and document in a JSDoc on `requireAccess` in `server/src/access/middleware.ts` how the management area declares `{ required: 'manage' }`. No management route, page or UI is added (FR-018)

**Checkpoint**: all four stories work and can be tested independently.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T052 [P] Add `server/src/access/README.md`: the Access Policy model, how to gate a new dashboard or area (declare a policy only, FR-018b), what a request belongs to (listener ∪ named apps, research R1), the outcome table (R7), and the **public-gate precondition** (R4)
- [X] T053 [P] Update `CLAUDE.md` Architecture with one bullet on the access gate (module path, per-app policy in `access:`, listener ∪ named-app rule, once-per-session decision in `access_decisions`, dev proxy ports 4100/4101/4102) and add a `Recent Changes` line for 026; add the `access:` keys to the Configuration section
- [X] T054 [P] Update the "add a dashboard" steps in `.specify/memory/constitution.md` Development Workflow to include "declare `access.<app>` in `analytics.yml` (`none` or a gate path)", as a PATCH bump with a Sync Impact Report entry
- [X] T055 Grep `server/src` for log calls in `server/src/access/` and confirm none interpolate `session`, `sessionId`, tokens or cookies (Constitution IV, FR-019)
- [X] T056 Run `pnpm -C server exec tsc --noEmit`, `pnpm -C server test`, `pnpm -C frontend/shared test`, and `tsc --noEmit` for `frontend/vng`, `frontend/govtech` and `frontend/ecosystem-analytics`; then `pnpm run test:visual -- tests/vng-access-gate.spec.mjs tests/mobile-navigation.spec.mjs` — *all green except: no ESLint/Prettier is installed in the workspace (new files formatted with `pnpm dlx prettier@3.3.3`); `tests/vng-initiatives-export.spec.mjs` header test fails on a PRE-EXISTING gap (expects no Groeifase/TRL columns), unrelated to this feature*
- [ ] T057 Walk through `specs/026-space-access-gate/quickstart.md` §2–§4 against a private test subspace, and record the result of the §"Release precondition" `curl` against production in the PR description — *PARTIAL: §2 start-up behaviour verified (empty and invalid `VNG_ACCESS_GATE` stop start-up; defaults log the per-app policy; the live anonymous probe of production reports the gate PUBLICLY READABLE). §3 rows needing real member/outsider sign-ins and §4 remain for a run against a private test subspace.*

---

## Phase 8: Revision — roles, not privileges (product decision 2026-11-13)

**Purpose**: decide access on the person's community **roles** on the gate Space instead of their
privileges. READ on a public Space is granted to everyone, and the production gate is public.

- [X] T058 Update spec FR-004, US1–US4 scenarios, edge cases, FR-018a/c, FR-020, Key Entities, Assumptions and Dependencies to the role rule: Read = `MEMBER`; Manage = `MEMBER` + `ADMIN`; `ADMIN` or `LEAD` without `MEMBER` = none; drop the public-gate warning; add the Clarifications entry in `specs/026-space-access-gate/spec.md`
- [X] T059 Select `community { roleSet { myRoles } }` (fragment `AccessGateRoles`) in `server/src/graphql/queries/accessGate.graphql`; drop `authorization`/`isContentPublic` from `server/src/graphql/queries/accessGateProbe.graphql`; re-run codegen
- [X] T060 Replace `levelFromPrivileges` with `levelFromRoles` in `server/src/access/policy.ts`; read `community.roleSet.myRoles` in `server/src/access/determine.ts`; remove `publiclyReadable` and the public-gate warning from `server/src/access/probe.ts`; update `policy.test.ts`, `determine.test.ts`, `probe.test.ts`, `server/src/auth/me.test.ts`
- [X] T061 Update research R3/R4/R6/R7, plan, data-model, contracts, quickstart, `server/src/access/README.md`, `server/analytics.yml`, `server/.env.default` and `CLAUDE.md` to the role rule

- [X] T062 Change the production VNG gate from `programmagroei/landelijkinnovatiemonitor` to the L0 Space `programmagroei` ("Kenniscentrum Innovatie"): `server/analytics.yml` default + display-name fallback, `server/.env.default`, `server/src/config.access.test.ts`, `server/src/auth/me.test.ts`, spec FR-002/Assumptions/Clarifications, plan, research R9, contracts, quickstart, README and `CLAUDE.md`

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T005)**: none. T004 depends on T002 and T003.
- **Foundational (T006–T024)**: depends on Setup and **blocks every story**.
  - T008 ← T006 · T009 ← T007 · T011 ← T008 · T014 ← T012, T013 · T015 ← T014 · T018 ← T004, T008, T016, T017 · T020 ← T004, T016, T019 · T021 ← T011, T014, T018, T020 · T022 ← T021 · T023 ← T008 · T024 ← T011, T020, T023
- **US1 (T025–T029)**: after Foundational.
- **US2 (T030–T042)**: after Foundational. T040 needs T029 (it replaces the placeholder), so do US1 before US2.
- **US3 (T043–T048)**: after US2 (it wires buttons on the US2 screens). T045 ← T021.
- **US4 (T049–T051)**: after Foundational and T034 (`requireAccess`); independent of US3.
- **Polish (T052–T057)**: after the stories you intend to ship.

### Story completion order

```text
Setup → Foundational → US1 → US2 ─┬→ US3
                                  └→ US4
                                       └→ Polish
```

## Parallel Examples

```text
# Setup
T002 accessGate.graphql  ‖  T003 accessGateProbe.graphql  ‖  T005 vite proxy ports

# Foundational: tests first, all different files
T006 policy.test  ‖  T007 request-apps.test  ‖  T010 types/access.ts  ‖  T013 decision-store.test
then  T017 determine.test  ‖  T019 probe.test   (after T004/T016)

# US2: once T034–T035 are under way
T031 screen tests  ‖  T032 api 403 tests  ‖  T033 Playwright  ‖  T036 access-signal  ‖  T038 NoAccessScreen  ‖  T039 AccessCheckFailedScreen  ‖  T041 i18n

# US3 and US4 can proceed side by side after US2
T043/T044 (US3 tests)  ‖  T049/T050 (US4 tests)
```

## Implementation Strategy

### MVP = Setup + Foundational + US1 + US2

US1 alone gates nothing: it only proves members are unaffected. The gate delivers value only when
US2's server-side enforcement and no-access page are in place. Ship US1 and US2 together, then
validate with quickstart §3 rows 1–6 and 11.

### Then

1. **US3**: "Check again" and once-per-session semantics (quickstart rows 7–10).
2. **US4**: Manage level reported; `requireAccess({ required: 'manage' })` ready for the management area.
3. **Polish**: docs, constitution PATCH, full test and type run.

### Roles, not privileges (revision, Phase 8)

The gate was first built on the READ/UPDATE privileges. The production gate subspace is public, and
READ on a public Space is granted to everyone, so the product owner decided to check **roles**
(research R4). A public gate Space is now harmless and needs no action on Alkemio.
