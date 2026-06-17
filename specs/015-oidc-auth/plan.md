# Implementation Plan: Redirect-Based Alkemio OIDC Login (Hosted + Local-Against-Production)

**Branch**: `015-oidc-auth` | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-oidc-auth/spec.md`

## Summary

Replace EA's Kratos username/password BFF login (and `ory_kratos_session` cookie detection) with a redirect-based OpenID Connect Authorization Code + PKCE-S256 flow in which EA is its own registered Alkemio OAuth2/OIDC client (Ory Hydra). The BFF orchestrates the entire flow server-side: it builds the authorization redirect (stashing `state` + `nonce` + PKCE `code_verifier` in a short-lived pre-auth record), handles the callback, exchanges the code for tokens at Hydra's `/oauth2/token`, validates the ID token, and establishes EA's own server-side session. Hydra-issued access/refresh tokens are stored **encrypted at rest** in the existing SQLite store, keyed by an opaque session id; the browser receives only an `httpOnly` session-id cookie. Alkemio GraphQL calls are authorized with the Hydra JWT (refreshed transparently). Hosted (`ecosystem-analytics.alkem.io`) and local-against-production deployments differ only by configuration: the hosted deployment uses the **confidential** `ecosystem-analytics` client (backend-only secret); local development uses a **separate public** client (PKCE-only, no secret) so the production secret never lands on a developer machine.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, ESM), Node 24
**Primary Dependencies**: Express 5, `openid-client` v6 (OIDC RP: discovery, PKCE, code exchange, refresh, revocation), `cookie-parser` (session-id + pre-auth cookies), Node built-in `crypto` (AES-256-GCM token encryption at rest), `better-sqlite3` (existing), `graphql-request` + codegen SDK (existing); frontend React 19 + Vite 7 + react-router 7 (existing)
**Storage**: Existing SQLite (`better-sqlite3`, WAL). Two new tables — `oidc_sessions` (encrypted access/refresh tokens + identity + timestamps, keyed by opaque session id) and `oidc_auth_tx` (pre-auth `state`/`nonce`/`code_verifier`/`returnTo`, short TTL). No change to `cache_entries`/`query_feedback` schemas; cache scoping key (`user_id`) now sourced from the session record.
**Testing**: Vitest (`server/`, `frontend/`), Playwright visual regression (root). Contract tests for `/api/auth/*` routes; unit tests for token encryption, session lifecycle, state/nonce validation, refresh; integration test of the full redirect→callback→session loop against a mocked Hydra discovery + token endpoint.
**Target Platform**: Linux server (Docker → k8s), modern evergreen browsers
**Project Type**: Web — BFF (`server/`) + React SPA (`frontend/`), single origin in production
**Performance Goals**: SC-008 — a cold sign-in completes in ≤ 2 redirects and < 30 s perceived; access-token refresh is transparent (no visible interruption while the refresh grant is valid)
**Constraints**: Client secret and all tokens stay behind the BFF; browser holds only an opaque, deployment-scoped session-id cookie (FR-018/FR-018a). Production confidential secret MUST NOT be present on developer machines (FR-019). Session validity bounded by Hydra refresh-grant lifetime (14 d, rotating) + configurable idle timeout (default 8 h, FR-009a). Shared SQLite session store (no per-replica in-memory state, FR-018a). No tokens/secrets/session-ids in logs (FR-014).
**Scale/Scope**: Internal analytics tool; low concurrent user count; single shared SQLite backing store. Auth code touches `server/src/auth/`, `server/src/graphql/client.ts`, `server/src/cache/`, config, and the frontend auth/api/login surfaces.

### OIDC provider facts (Ory Hydra, per Alkemio integration)

- **Issuer (per env)**: prod `https://identity.alkem.io/`, sandbox `https://identity.sandbox-alkem.io/`, local `http://localhost:3000/`. Discovery at `/.well-known/openid-configuration`.
- **Endpoints**: `/oauth2/auth`, `/oauth2/token`, `/userinfo`, `/.well-known/jwks.json`, RP-initiated logout `/oauth2/sessions/logout`, plus the token-revocation endpoint advertised by discovery.
- **Client**: `client_id=ecosystem-analytics`, hosted auth method `client_secret_basic`; scopes `openid profile email offline_access alkemio` (the `alkemio` scope is REQUIRED — it emits the `alkemio_actor_id` claim the Alkemio API checks); grants `authorization_code` + `refresh_token`; access/ID token ~10 min, refresh ~14 d rotating.
- **Alkemio API authorization**: send `Authorization: Bearer <hydra-access-jwt>` to the GraphQL endpoint; Alkemio validates RS256 against Hydra JWKS, checks the `aud` allow-list (includes `ecosystem-analytics`) and presence of `alkemio_actor_id`.
- **Callback URIs (pre-registered with Alkemio)**: hosted `https://ecosystem-analytics.alkem.io/api/auth/oidc/callback`; a distinct local-dev callback for the local public client.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Alkemio OIDC Authentication (Authorization Code + PKCE via BFF)** | ✅ **Amendment applied (v4.0.0)** | Principle I was redefined from the Kratos username/password BFF flow to redirect-based OIDC with EA as its own registered client, server-side encrypted token storage, and an opaque session cookie. The amendment is committed in `.specify/memory/constitution.md` (v3.1.0 → v4.0.0, Sync Impact Report at top). The spec (§Dependencies → Governance) gate is therefore satisfied. See Complexity Tracking for the recorded deviation rationale. |
| **II. Typed GraphQL Contract** | ✅ Pass | No raw query strings; continue using codegen SDK. No `.graphql` changes anticipated beyond reuse of `me`. |
| **III. BFF Boundary** | ✅ **Strengthened** | Frontend still talks only to the BFF; OIDC moves *more* secret material server-side (tokens leave the browser entirely). |
| **IV. Data Sensitivity** | ✅ **Strengthened** | Per-user/per-Space cache scoping retained (FR-010); tokens now encrypted-at-rest and never logged (FR-014); parameterized SQL retained. `user_id` now sourced from the server-side session, still per-user. |
| **V. Graceful Degradation** | ✅ Pass | Cancelled/failed/expired login routes to a clean "sign in" state, not errors (FR-009, edge cases). |
| **VI. Design Fidelity** | ✅ Pass | Login form is removed in favor of a redirect; the only new UI is a minimal "redirecting…", "not authorized", and "sign in to continue" state — no method-specific UI (FR-002). |

**Required amendment (APPLIED — v4.0.0)**: Principle I has been redefined from "Kratos API Flow (username/password via BFF)" to "Alkemio OIDC Authorization Code + PKCE via BFF as a registered client; tokens held server-side encrypted, browser holds only an opaque session cookie." This redefinition of an existing principle was a **MAJOR** version bump (3.1.0 → 4.0.0), recorded in the constitution's Sync Impact Report with rationale. The consequent edits to Principles III/IV and Security Requirements (no Bearer-from-browser, token-encryption-at-rest, shared session-store clauses) are in place. **No further `/speckit.constitution` run is required** — the spec-sanctioned deviation is recorded and the gate is satisfied; re-running would erroneously bump the version a second time.

## Project Structure

### Documentation (this feature)

```text
specs/015-oidc-auth/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── auth-api.md       # /api/auth/* route contracts
├── checklists/          # (existing) requirements checklists
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
server/src/
├── auth/
│   ├── oidc/
│   │   ├── client.ts         # NEW: openid-client config discovery; confidential vs public selection
│   │   ├── login.ts          # NEW: GET /api/auth/login → build authz redirect (state/nonce/PKCE, returnTo)
│   │   ├── callback.ts       # NEW: GET /api/auth/oidc/callback → validate state, exchange code, create session
│   │   ├── logout.ts         # NEW: POST /api/auth/logout → revoke tokens, delete session, RP-initiated logout
│   │   ├── refresh.ts        # NEW: transparent access-token refresh via refresh_token grant
│   │   └── crypto.ts         # NEW: AES-256-GCM encrypt/decrypt for tokens at rest
│   ├── session.ts            # NEW: session create/read/touch/delete; idle-timeout enforcement
│   ├── middleware.ts         # CHANGED: resolve session from cookie (was Bearer header)
│   ├── resolve-user.ts       # CHANGED: identity from session/ID-token claims (avoid per-request me() if claims suffice)
│   ├── me.ts                 # CHANGED: GET /api/auth/me reads session identity
│   ├── login.ts              # REMOVED (Kratos password flow)
│   ├── sso.ts                # REMOVED (ory_kratos_session detection)
│   └── kratos-url.ts         # REMOVED
├── graphql/client.ts         # CHANGED: token from session (with refresh), drop cookie-mode branch
├── cache/
│   ├── db.ts                 # CHANGED: add oidc_sessions + oidc_auth_tx tables
│   └── session-store.ts      # NEW: parameterized CRUD for the two new tables
├── routes/auth.ts            # CHANGED: wire login/callback/logout/me; remove password+sso routes
├── config.ts                 # CHANGED: add OIDC config (issuer, client id/secret, redirect uri, scopes, cookie scope, idle ttl, session enc key)
└── app.ts                    # CHANGED: add cookie-parser; tighten CORS to known origin(s)

frontend/src/
├── services/auth.ts          # CHANGED: drop localStorage token; session is cookie-based; expose login()/logout() redirects + /me check
├── services/api.ts           # CHANGED: send credentials:'include'; drop Authorization header; 401 → redirect to /api/auth/login
├── pages/LoginPage.tsx       # CHANGED: no credential form; "Sign in with Alkemio" + not-authorized/continue states
└── (router)                  # CHANGED: auth guard checks session via /api/auth/me, not localStorage
```

**Structure Decision**: Existing two-package web layout is retained. New auth logic is grouped under `server/src/auth/oidc/` to keep the OIDC RP concerns cohesive and the legacy Kratos files cleanly removed. The SQLite store is extended (not replaced) with two purpose-built tables; the existing cache tables and their per-user scoping are preserved.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Redefines Constitution Principle I (Kratos → OIDC)** | Alkemio retired Kratos password API in favor of OIDC (Hydra); EA is a registered client. The old flow no longer works against production, and the spec mandates redirect-based OIDC with dual-deployment support. | Keeping the Kratos API flow is impossible — the provider-side capability is gone. No simpler in-app option exists; method selection now lives entirely on Alkemio's hosted page. |
| **Two OAuth2 client registrations (confidential hosted + public local)** | FR-019: the production confidential secret must never reach a developer laptop, yet local-against-production must use the identical code path. | A single confidential client would force shipping the production secret to every developer; a single public client would weaken the hosted deployment's confidential-client security. Mirrors Alkemio's own `alkemio-web` public-client pattern. |
| **Server-side encrypted token store + two new tables** | FR-018a: tokens must persist server-side encrypted, in a shared store, keyed by opaque session id; pre-auth state must be isolated from session state to prevent CSRF/replay. | In-memory session storage breaks multi-replica hosting (FR-018a). A single combined table conflates short-lived CSRF material with long-lived session tokens, complicating expiry and increasing replay surface. |
