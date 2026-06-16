# Phase 0 Research: Redirect-Based Alkemio OIDC Login

All NEEDS CLARIFICATION items from Technical Context are resolved below. Provider facts are sourced from the Alkemio OIDC migration (Ory Hydra) and the project's existing code map.

---

## 1. OIDC RP library

- **Decision**: `openid-client` v6 (Filip Skokan) as the server-side Relying Party library.
- **Rationale**: Certified OIDC RP; first-class discovery (`/.well-known/openid-configuration`), Authorization Code + PKCE-S256, refresh-token grant, RP-initiated logout, and token revocation. Supports both confidential (`client_secret_basic`) and public (`token_endpoint_auth_method=none`) clients from the same API — exactly the hosted/local split FR-019 requires. ESM-native, Node 24 compatible, no heavyweight framework coupling (unlike Passport strategies).
- **Alternatives considered**: (a) Hand-rolled fetch against Hydra endpoints — rejected: re-implements PKCE, JWKS validation, and discovery correctly is error-prone and security-sensitive. (b) `passport` + `passport-openidconnect` — rejected: pulls in session/strategy middleware we don't want, weaker PKCE/refresh ergonomics. (c) `@alkemio/client-lib` — rejected: it wraps the retired Kratos password flow, not OIDC RP.

## 2. Confidential vs. public client (FR-019 mechanism)

- **Decision**: Two registrations selected by configuration. **Hosted** uses the confidential `ecosystem-analytics` client (`client_secret_basic`, secret only in the k8s Secret `ecosystem-analytics-client-secret`). **Local-against-production** uses a **separate public client** registered with `token_endpoint_auth_method=none`, PKCE-S256 as the sole client-auth factor, no secret, with its own pre-registered local callback URI.
- **Rationale**: Directly satisfies FR-019 ("production secret never lands on a laptop") while keeping FR-006 ("configuration-only, no code change") true — the code path is identical; only `client_id`, the presence/absence of a secret, the `token_endpoint_auth_method`, and the redirect URI differ by config. This mirrors Alkemio's own `alkemio-web`, which ships as a public PKCE client.
- **Alternatives considered**: (a) Single confidential client shared everywhere — rejected: forces the production secret onto every developer machine. (b) Single public client everywhere — rejected: needlessly weakens the hosted deployment, which can and should be confidential. (c) Device-code or password grant for local — rejected: password grant is exactly what we're removing; device code adds UX friction with no benefit here.
- **Quirk noted**: Even a public Hydra client may need a placeholder `Secret` reference so hydra-maester can pin the `client_id`; it is unused at runtime under PKCE.

## 3. Server-side flow orchestration

- **Decision**: The BFF orchestrates the full flow (no token ever in the browser):
  1. `GET /api/auth/login?returnTo=…` — validate `returnTo` against an allow-list of trusted EA paths; generate `state`, `nonce`, PKCE `code_verifier`/`code_challenge`; persist them in an `oidc_auth_tx` record keyed by a one-time pre-auth id set as a short-lived `httpOnly` cookie; 302 to Hydra `/oauth2/auth` with `scope=openid profile email offline_access alkemio`, `code_challenge`, `state`, `nonce`, and `audience` as required.
  2. `GET /api/auth/oidc/callback?code&state` — read pre-auth cookie, look up `oidc_auth_tx`, timing-safe compare `state`, then exchange `code` at `/oauth2/token` with the `code_verifier`; validate the ID token (`iss`, `aud`, `exp`/`nbf`/`iat`, `nonce`); create an `oidc_sessions` record (encrypted tokens + identity); set the opaque session-id cookie; delete the `oidc_auth_tx` row; 302 to the validated `returnTo`.
- **Rationale**: Matches the proven Alkemio server pattern (state+nonce+verifier stashed pre-auth, validated on return). Keeps PKCE and token handling entirely server-side (FR-018). One-time-use pre-auth records + state comparison satisfy FR-013 (anti-forgery/replay).
- **Alternatives considered**: SPA-driven PKCE (tokens in browser) — rejected outright by FR-018/SC-004 (no tokens in public browser code).

## 4. Session model & storage

- **Decision**: Opaque session id (CSPRNG, ≥128-bit) set as an `httpOnly`, `Secure`, `SameSite=Lax` cookie; the cookie domain/host is configuration (`.alkem.io`-scoped hosted vs `localhost` local). Session record persisted in SQLite (`oidc_sessions`), holding encrypted access + refresh tokens, the Alkemio identity (`alkemio_actor_id`, display name, avatar), `created_at`, `last_seen_at`, and the refresh-grant expiry. Validity = min(Hydra refresh-grant lifetime, idle timeout). Idle timeout configurable, default 8 h; `last_seen_at` updated on activity.
- **Rationale**: FR-018a (shared server-side store, encrypted at rest, opaque id to browser, multi-replica safe). `SameSite=Lax` permits the top-level redirect return from Hydra while blocking CSRF on data routes. Idle timeout bounds replay of a stolen session id (FR-009a).
- **Alternatives considered**: (a) Signed JWT session cookie carrying tokens — rejected: would place tokens (or token-equivalents) in the browser, violating FR-018; also can't be revoked server-side. (b) In-memory session store — rejected: breaks multi-replica hosting (FR-018a). (c) Redis — rejected: SQLite already exists and is shared; no new infra needed for this scale.

## 5. Token encryption at rest

- **Decision**: AES-256-GCM via Node's built-in `crypto`. A 32-byte key supplied as base64 in config (`OIDC_SESSION_ENC_KEY`); per-record random 96-bit IV; store `iv || authTag || ciphertext`. Encrypt access + refresh tokens before insert; decrypt on read.
- **Rationale**: FR-018a "encrypted at rest." AES-GCM gives authenticated encryption (tamper-evident) with no extra dependency. Key stays in backend config/secret, never in the DB or browser.
- **Alternatives considered**: (a) SQLCipher / encrypted DB file — rejected: heavier, changes the `better-sqlite3` build, and encrypts everything uniformly rather than the sensitive columns; key management is similar. (b) libsodium/`tweetnacl` — rejected: extra dependency for what Node `crypto` already does well.

## 6. Alkemio API authorization & transparent refresh

- **Decision**: `createAlkemioSdk` is given the session (not a raw header). Before each GraphQL call it ensures a live access token: if the stored access token is near/at expiry, perform the `refresh_token` grant at `/oauth2/token`, persist the rotated tokens (refresh rotation), and use the new access token as `Authorization: Bearer`. On an Alkemio 401/`alkemio_actor_id`-missing rejection that a refresh can't fix, treat the session as expired (FR-009). The legacy `cookie` mode in `client.ts` is removed.
- **Rationale**: FR-008 (transparent refresh) and FR-009/FR-009a (expiry routing). Alkemio remains source of truth — its rejection drives re-auth (per Clarifications). Refresh-rotation means the newest refresh token must always be persisted.
- **Alternatives considered**: Refresh on a timer/background job — rejected: lazy refresh-on-demand is simpler, avoids storms, and naturally aligns with request activity (also feeds the idle timeout).

## 7. Identity resolution & cache scoping

- **Decision**: Source the stable user id from the ID-token `alkemio_actor_id` claim (and display name/avatar from `profile` claims or `/userinfo`), stored on the session at creation. `resolveUser` reads it from the session instead of calling `me()` per request. Cache scoping key (`user_id`) becomes this stable actor id.
- **Rationale**: Avoids a GraphQL round-trip per request (perf) and keeps FR-010 per-user cache isolation intact. `alkemio_actor_id` is the durable identifier the Alkemio API itself keys on.
- **Alternatives considered**: Continue calling `me()` each request — rejected: unnecessary latency now that claims are available; `me()` can still be used lazily for richer profile display (FR-011) and cached on the session.

## 8. Cookies, CORS, and origin

- **Decision**: Add `cookie-parser`. Hosted: single origin → cookie host-scoped, CORS effectively same-origin. Local: frontend `:5173` proxies `/api` to backend `:4000` (existing Vite proxy), so requests are same-origin to the browser; cookies work without cross-site relaxation. Tighten the current `cors({ origin: true })` to the known deployment origin(s) from config and keep `credentials: true`.
- **Rationale**: `SameSite=Lax` + same-origin (direct or via dev proxy) avoids third-party-cookie pitfalls. The wide-open `origin: true` is unnecessary once the browser only carries a cookie and is a needless surface.
- **Alternatives considered**: `SameSite=None; Secure` cross-site cookies — rejected: not needed given the single-origin/proxy model and broadens CSRF exposure.

## 9. Sign-out & revocation

- **Decision**: `POST /api/auth/logout` — local-cleanup-first: delete the session record immediately, then best-effort revoke EA's access + refresh tokens at Hydra's revocation endpoint, then optionally drive RP-initiated logout at `/oauth2/sessions/logout` for the EA leg only. Clear the session cookie. On renewal-failure expiry, just delete the record (token already dead).
- **Rationale**: FR-012/FR-012a. "Local-first" guarantees the EA session is dead even if the network revoke fails. Global single-logout of Alkemio's browser session stays out of scope.
- **Alternatives considered**: Revoke-before-delete — rejected: a failed network call could leave the user "logged in" locally; local-first is the safer ordering.

## 10. Edge cases → handling map

| Edge case (spec) | Handling |
|---|---|
| Cancelled/failed login | Hydra returns error to callback → render "sign in to continue", no loop |
| Missing/expired EA session | middleware → 401 → frontend redirects to `/api/auth/login` |
| Short-lived token expiry mid-task | lazy refresh (§6); only re-auth when refresh fails |
| Forged/replayed return | one-time `oidc_auth_tx` + timing-safe `state` + `nonce` (FR-013) |
| Untrusted `returnTo` | allow-list validation of EA-internal paths only (FR-013) |
| Wrong-environment callback | unregistered redirect URI fails at Hydra → clear error (FR-006) |
| Concurrent tabs | shared server-side session; sign-out in one → others 401 → login |
| Authorized at Alkemio but not this client | Hydra/`aud` rejection or missing `alkemio_actor_id` → "not authorized" page (FR-015) |
