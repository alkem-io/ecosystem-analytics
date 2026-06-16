# Tasks: Redirect-Based Alkemio OIDC Login (Hosted + Local-Against-Production)

**Input**: Design documents from `/specs/015-oidc-auth/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/auth-api.md ✅

**Tests**: INCLUDED — the plan's Testing section mandates contract tests for `/api/auth/*`, unit tests (crypto, session lifecycle, state/nonce, refresh), and a full redirect→callback→session integration test; quickstart.md lists them as verification gates.

**Organization**: Tasks are grouped by user story. US1 and US2 are both P1 (co-equal MVP — the dual-deployment requirement shapes the architecture and cannot be retrofitted).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1–US4 (Setup/Foundational/Polish carry no story label)
- Exact file paths included. Tests are co-located `*.test.ts` (Vitest default; no `test/` dir exists yet).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies + configuration surface before any code.

- [ ] T001 Install `openid-client` v6 and `cookie-parser` (+`@types/cookie-parser`) in `server/` via `pnpm add`; verify `server/package.json` records them
- [ ] T002 [P] Add `oidc` + `session` config blocks (issuer, client_id, client_secret, token_endpoint_auth_method, redirect_uri, scopes, audience; cookie_domain, idle_timeout_hours, enc_key) with `${ENV}:default` substitution to `server/analytics.yml`
- [ ] T003 [P] Add OIDC/session env vars with both hosted (confidential) and local-against-production (public, no secret) example blocks to `server/.env.default`

**Checkpoint**: Dependencies installed, config keys declared.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Store, crypto, OIDC client, config, and middleware wiring that every user story builds on.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [ ] T004 Extend the typed config loader in `server/src/config.ts` to parse + validate the `oidc`/`session` blocks; fail-fast if `enc_key` is absent or not 32 bytes base64, or if `token_endpoint_auth_method=client_secret_basic` without a secret (FR-018/FR-019)
- [ ] T005 [P] Add `oidc_sessions` + `oidc_auth_tx` tables and their indexes (per data-model.md) to `server/src/cache/db.ts`; extend the existing `purgeExpired` sweep to drop expired auth-tx and dead/idle sessions
- [ ] T006 [P] Implement AES-256-GCM `encrypt`/`decrypt` (`iv‖authTag‖ciphertext`, key from config) in `server/src/auth/oidc/crypto.ts` (FR-018a)
- [ ] T007 Implement parameterized prepared-statement CRUD for both new tables in `server/src/cache/session-store.ts` (insert/get/delete auth-tx; insert/get/touch/delete session) — depends on T005
- [ ] T008 Implement `openid-client` discovery + confidential-vs-public client selection driven purely by config in `server/src/auth/oidc/client.ts` (one code path; FR-006/FR-019) — depends on T004
- [ ] T009 Add `cookie-parser` and tighten CORS from `origin: true` to the configured deployment origin(s) with `credentials: true` in `server/src/app.ts` — depends on T004

**Checkpoint**: Store + crypto + OIDC client ready; user stories can begin.

---

## Phase 3: User Story 1 - Sign in through Alkemio (Priority: P1) 🎯 MVP

**Goal**: An unauthenticated visitor is redirected to Alkemio's hosted login, authenticates by any method, and returns to EA signed in (own EA session), landing on their requested page with data scoped to their Alkemio permissions.

**Independent Test**: Open EA with no session → redirected to Alkemio login (not an in-app form) → authenticate → returned signed-in to the originally requested page → spaces/graph load (spec AS1-1…1-5).

### Tests for User Story 1 ⚠️ (write first, must FAIL before implementation)

- [ ] T010 [P] [US1] Contract test for `GET /api/auth/login` and `GET /api/auth/oidc/callback` (302 to Hydra; success→session+302 returnTo; missing claim→/not-authorized; forged/replayed→400) in `server/src/auth/oidc/callback.test.ts`
- [ ] T011 [P] [US1] Unit test for `state`/`nonce`/PKCE `code_verifier` generation + timing-safe `state` comparison + `returnTo` allow-list validation in `server/src/auth/oidc/login.test.ts`
- [ ] T012 [P] [US1] Integration test of the full redirect→callback→session loop against a mocked Hydra discovery + `/oauth2/token` endpoint in `server/src/auth/oidc/flow.integration.test.ts`

### Implementation for User Story 1

- [ ] T013 [US1] Implement session create/read in `server/src/auth/session.ts` (opaque CSPRNG id, encrypt tokens via crypto, persist identity via session-store) — depends on T006, T007
- [ ] T014 [US1] Implement `GET /api/auth/login` in `server/src/auth/oidc/login.ts` (validate `returnTo` allow-list, generate state/nonce/PKCE, insert `oidc_auth_tx`, set `ea_preauth` cookie, 302 to Hydra `/oauth2/auth`) — depends on T007, T008
- [ ] T015 [US1] Implement `GET /api/auth/oidc/callback` in `server/src/auth/oidc/callback.ts` (read `ea_preauth`, load+single-use-delete `oidc_auth_tx`, timing-safe `state`, exchange `code` w/ `code_verifier`, validate ID token incl. `nonce`+`alkemio_actor_id`, create session, set `ea_session`, 302 to `return_to`; Hydra error→`/login?error=cancelled`; missing claim→`/not-authorized`; forged/expired→400) — depends on T013, T014
- [ ] T016 [US1] Update `server/src/auth/resolve-user.ts` to source identity from the session/ID-token claims instead of a per-request `me()` (FR-011); ensure the cache scoping key `user_id` is taken from the session's stable Alkemio identity (`alkemio_actor_id` claim) and that the read-time owner check in `server/src/cache/` still rejects a mismatched session (FR-010 / Constitution IV — cache access-control verified at read time)
- [ ] T017 [US1] Rewrite `server/src/auth/middleware.ts` to resolve the session from the `ea_session` cookie (was `Authorization: Bearer`); missing/invalid → 401 — depends on T013
- [ ] T018 [US1] Update `GET /api/auth/me` in `server/src/auth/me.ts` to return `{userId, displayName, avatarUrl}` from the session row (never tokens) — depends on T017
- [ ] T019 [US1] Update `server/src/graphql/client.ts` to take the session and authorize with its decrypted access token; remove the legacy `cookie` mode branch — depends on T013
- [ ] T020 [US1] Wire `login` / `oidc/callback` / `me` routes in `server/src/routes/auth.ts`; remove the password + sso routes — depends on T014, T015, T018
- [ ] T021 [US1] Delete legacy `server/src/auth/login.ts`, `server/src/auth/sso.ts`, `server/src/auth/kratos-url.ts` and fix any imports
- [ ] T022 [P] [US1] Rewrite `frontend/src/services/auth.ts` — drop localStorage token; session is the `ea_session` cookie; expose `login()`/`logout()` redirects and a `/api/auth/me` check
- [ ] T023 [P] [US1] Update `frontend/src/services/api.ts` — send `credentials: 'include'`, drop the `Authorization` header, on `401` redirect to `/api/auth/login`
- [ ] T024 [P] [US1] Rewrite `frontend/src/pages/LoginPage.tsx` — remove credential form; render "Sign in with Alkemio" plus "not authorized" and "sign in to continue" states (FR-002/FR-015)
- [ ] T025 [US1] Update the auth guard in `frontend/src/App.tsx` to check the session via `/api/auth/me` instead of localStorage — depends on T022
- [ ] T026 [US1] Add a `/not-authorized` route + minimal page (FR-015) in `frontend/src/App.tsx` / `frontend/src/pages/`

**Checkpoint**: A visitor can sign in via Alkemio and load data — MVP demonstrable.

---

## Phase 4: User Story 2 - One sign-in that works hosted and locally against production (Priority: P1)

**Goal**: The identical build authenticates and loads production data both hosted at `ecosystem-analytics.alkem.io` and run locally against production — differing only by configuration (FR-006/FR-019).

**Independent Test**: With local `.env` pointed at production Alkemio (public client, no secret), complete login → land on the local app signed in → production data scoped to your own account; confirm the hosted `.env` drives the same code path with zero code changes (spec AS2-1…2-4).

### Tests for User Story 2 ⚠️

- [ ] T027 [P] [US2] Integration test asserting the public-client config path (`token_endpoint_auth_method=none`, no secret, PKCE-only) completes code exchange against the mocked token endpoint — no secret required (FR-019) in `server/src/auth/oidc/client.public.test.ts`
- [ ] T028 [P] [US2] Unit test that the `ea_session`/`ea_preauth` cookie attributes (host-only vs `cookie_domain`-scoped, `httpOnly`/`Secure`/`SameSite=Lax`) are config-driven in `server/src/auth/session.cookie.test.ts`

### Implementation for User Story 2

- [ ] T029 [US2] Make the `ea_session`/`ea_preauth` cookie `domain`/host scope and `Secure` flag derive from `session.cookie_domain` config (works for `localhost` and `.alkem.io`) in `server/src/auth/session.ts` — depends on T013
- [ ] T030 [US2] Confirm/extend `server/src/auth/oidc/client.ts` so confidential vs public selection requires no per-deployment code branch beyond config (verify against T008); add a guard that a hosted build refuses to start without a secret (FR-018) — depends on T008
- [ ] T031 [US2] Harden `returnTo` + redirect-URI handling in `server/src/auth/oidc/login.ts` so a wrong-environment / untrusted return fails cleanly (open-redirect guard, FR-013 / AS2-4) — depends on T014
- [ ] T032 [P] [US2] Document the hosted vs local-against-production `.env` matrices and the enc-key generation step in `specs/015-oidc-auth/quickstart.md` cross-check; ensure `server/.env.default` comments mark the production secret as backend-only (FR-019)

**Checkpoint**: Same build runs in both deployments via config only.

---

## Phase 5: User Story 3 - Seamless single sign-on for already-logged-in users (Priority: P2)

**Goal**: A visitor already authenticated with Alkemio in the same browser reaches hosted EA signed-in without re-entering credentials, and stays signed in across refreshes/tabs with short-lived access tokens renewed transparently (FR-007/FR-008).

**Independent Test**: In a browser already logged into Alkemio, open hosted EA → reach the app without a credential prompt; over the session, repeated data requests succeed across an access-token expiry with no visible interruption (spec AS3-1…3-3).

### Tests for User Story 3 ⚠️

- [ ] T033 [P] [US3] Unit test transparent refresh: when access is expired but the refresh grant is valid, a rotating refresh persists the newest token + new expiries and yields a fresh access token, in `server/src/auth/oidc/refresh.test.ts`

### Implementation for User Story 3

- [ ] T034 [US3] Implement transparent access-token refresh via the `refresh_token` grant (rotation → overwrite `refresh_token_enc` + `access_expires_at`/`refresh_expires_at`) in `server/src/auth/oidc/refresh.ts` — depends on T007, T008
- [ ] T035 [US3] Wire lazy refresh into `server/src/graphql/client.ts`: before each GraphQL call, refresh when access is at/near expiry while the refresh grant is valid (FR-008) — depends on T019, T034
- [ ] T036 [US3] Add `touch()` updating `last_seen_at` on authenticated activity (feeds the idle timeout) in `server/src/auth/session.ts`, called from middleware — depends on T013, T017
- [ ] T037 [US3] Ensure `GET /api/auth/login` relies on Hydra's existing session for silent SSO (no forced `prompt=login`) so an already-authenticated hosted visitor returns without a prompt (FR-007) in `server/src/auth/oidc/login.ts` — depends on T014

**Checkpoint**: Hosted SSO is silent; sessions survive token expiry transparently.

---

## Phase 6: User Story 4 - Session expiry and sign-out (Priority: P3)

**Goal**: When the session ends (refresh no longer possible, idle timeout, or explicit sign-out) EA cleanly routes back to Alkemio login instead of showing errors; explicit sign-out revokes EA's tokens at Hydra and deletes the session record (FR-009/FR-009a/FR-012/FR-012a).

**Independent Test**: While signed in, delete the `oidc_sessions` row or wait out idle timeout → next action → clean redirect to login (no error page). Separately, use sign-out → session gone, tokens revoked at Hydra, next visit requires sign-in (spec AS4-1…4-3).

### Tests for User Story 4 ⚠️

- [ ] T038 [P] [US4] Contract test for `POST /api/auth/logout` (deletes row, best-effort revoke, clears cookie, `204` and idempotent on no/invalid session) in `server/src/auth/oidc/logout.test.ts`
- [ ] T039 [P] [US4] Unit test that idle-timeout expiry and refresh-grant expiry both render a session invalid → unauthenticated routing (FR-009/FR-009a) in `server/src/auth/session.expiry.test.ts`

### Implementation for User Story 4

- [ ] T040 [US4] Implement `POST /api/auth/logout` in `server/src/auth/oidc/logout.ts` — delete session row first, best-effort revoke access+refresh at Hydra's revocation endpoint, clear `ea_session`, return `204` (idempotent) — depends on T007, T008
- [ ] T041 [US4] Enforce validity = `now < refresh_expires_at` AND `now - last_seen_at < idle_timeout` in `server/src/auth/session.ts` / `middleware.ts`; invalid → 401 (FR-009a) — depends on T013, T017
- [ ] T042 [US4] On an Alkemio `401` that a refresh cannot resolve, invalidate the session and return `401` in `server/src/graphql/client.ts` (drives FR-009 re-auth) — depends on T035
- [ ] T043 [US4] Wire the `logout` route in `server/src/routes/auth.ts` — depends on T020, T040
- [ ] T044 [P] [US4] Add a sign-out control calling `POST /api/auth/logout` then redirecting to login in `frontend/src/services/auth.ts` + the app shell — depends on T022
- [ ] T045 [US4] Ensure `frontend/src/services/api.ts` 401 handling routes cleanly to login with no error page and consistent multi-tab behavior (edge cases) — depends on T023

**Checkpoint**: Expiry and sign-out are graceful; all four stories functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T046 [P] Audit all auth/graphql logging paths to guarantee no session-ids, cookies, tokens, `code_verifier`, `state`, or client secret are ever logged (FR-014); add a regression test
- [ ] T047 [P] Update `CLAUDE.md` (auth data-flow + Active Technologies) and remove stale Kratos/Bearer references now that the password flow is gone
- [ ] T048 Run the `specs/015-oidc-auth/quickstart.md` smoke test end-to-end, including: the SC-004 DevTools check (no token/secret anywhere browser-side, only `ea_session`); the **SC-008 performance check** — a cold sign-in completes in ≤ 2 redirects and < 30 s visitor-perceived time (count redirects in the Network tab, time login→first data render); and a **FR-016 regression smoke path** (space select → graph generate → filter → search → detail panel) confirming all pre-OIDC capabilities still work once signed in
- [ ] T049 [P] Run `cd server && pnpm run build` and `cd frontend && pnpm run build` (tsc strict) + both `pnpm run test` suites; fix any breakage
- [ ] T050 Update Playwright visual snapshots for the new login / not-authorized / redirecting states via root `pnpm run test:visual:update`
- [ ] T051 **GOVERNANCE GATE (verify — already applied)**: confirm `.specify/memory/constitution.md` already redefines Principle I (Kratos → OIDC) at **v4.0.0** with a Sync Impact Report, per plan.md Constitution Check. The MAJOR bump (3.1.0 → 4.0.0) is **done** — do NOT re-run `/speckit.constitution` (it would bump to 5.0.0). Just verify the committed text matches the feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: no dependencies — start immediately.
- **Foundational (P2)**: depends on Setup — **BLOCKS all user stories**.
- **User Stories (P3–P6)**: all depend on Foundational. US1 is the MVP. US2 depends on US1's login/callback existing (extends them). US3 depends on US1 (refresh extends the session + graphql client). US4 depends on US1 (and US3's refresh for the refresh-failure path).
- **Polish (P7)**: depends on all targeted stories.

### Critical path

T001→T004→{T005,T006}→T007→T008 → T013 → T014/T015 → T020 (US1 MVP) → T034/T035 (US3) → T040/T042 (US4) → T048/T049.

### Within each story

- Tests written first and failing before implementation (T010–T012, T027–T028, T033, T038–T039).
- Store/crypto before session; session before routes; backend routes before frontend wiring.

### Parallel Opportunities

- Setup: T002, T003 in parallel after T001.
- Foundational: T005 and T006 in parallel; T007 waits on T005, T008 waits on T004.
- US1 tests T010/T011/T012 in parallel; frontend T022/T023/T024 in parallel (different files).
- Once Foundational is done, separate developers can take US1 / (US2 after US1 login) in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel — different files):
Task: "Contract test /api/auth/login + callback in server/src/auth/oidc/callback.test.ts"
Task: "Unit test state/nonce/PKCE + returnTo allow-list in server/src/auth/oidc/login.test.ts"
Task: "Integration test full flow vs mocked Hydra in server/src/auth/oidc/flow.integration.test.ts"

# Frontend wiring (parallel — different files):
Task: "Rewrite frontend/src/services/auth.ts (cookie session)"
Task: "Update frontend/src/services/api.ts (credentials:'include', 401→login)"
Task: "Rewrite frontend/src/pages/LoginPage.tsx (Sign in with Alkemio)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL — blocks everything).
2. Phase 3 US1 → **STOP and VALIDATE**: sign in via Alkemio, load data.
3. Demo. This is the shippable core.

### Incremental Delivery

US1 (MVP) → US2 (dual deployment, config-only) → US3 (silent SSO + transparent refresh) → US4 (expiry + sign-out) → Polish. Each adds value without breaking the previous.

### Blocking gate

T051 (constitution amendment) MUST land before this branch merges — the feature intentionally redefines Principle I and that deviation is spec-sanctioned but must be recorded.
