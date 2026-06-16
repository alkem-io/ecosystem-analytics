# Contract: EA Auth API (`/api/auth/*`)

BFF endpoints exposed to the browser-side SPA. The browser never sees tokens — only an opaque `httpOnly` session cookie. Replaces the legacy `POST /api/auth/login` (Kratos password) and `POST /api/auth/sso/detect`.

Cookies set by the BFF:
- `ea_preauth` — short-lived (`httpOnly`, `Secure`, `SameSite=Lax`), holds the one-time `tx_id`; set on `/login`, cleared on callback.
- `ea_session` — session reference (`httpOnly`, `Secure`, `SameSite=Lax`, host/`domain` from config), holds the opaque `session_id`; set on successful callback, cleared on logout.

---

## `GET /api/auth/login`

Begin sign-in. Public.

**Query params**
- `returnTo` (optional) — EA-internal path to land on after login. Validated against the trusted-path allow-list; anything external/unknown is replaced with the default landing page (FR-013).

**Behavior**: generate `state`, `nonce`, PKCE `code_verifier`/`code_challenge`; insert `oidc_auth_tx`; set `ea_preauth` cookie; `302` to Hydra `/oauth2/auth?response_type=code&client_id=…&redirect_uri=…&scope=openid%20profile%20email%20offline_access%20alkemio&state=…&nonce=…&code_challenge=…&code_challenge_method=S256&audience=…`.

**Responses**
- `302 Found` → Hydra authorization URL.
- `500` → config error (issuer/client unresolved). No secret/PKCE values in the body or logs.

---

## `GET /api/auth/oidc/callback`

Complete sign-in. Public (reached via Hydra redirect). This is the pre-registered redirect URI.

**Query params**: `code`, `state` (success) — or `error`, `error_description` (failure/cancel).

**Behavior (success)**: read `ea_preauth` → load `oidc_auth_tx` by `tx_id`; reject if missing/expired; **timing-safe** compare `state`; exchange `code` at `/oauth2/token` with `code_verifier`; validate ID token (`iss`, `aud` includes `ecosystem-analytics`, `exp`/`nbf`/`iat`, `nonce`); require `alkemio_actor_id` claim; create `oidc_sessions` (encrypted tokens + identity); delete the `oidc_auth_tx` row; clear `ea_preauth`; set `ea_session`; `302` to validated `return_to`.

**Responses**
- `302 Found` → `return_to` (default landing if none). Sets `ea_session`.
- `302 Found` → `/login?error=cancelled` (or a clean "sign in to continue" state) when Hydra returns `error` or the user cancelled (no redirect loop) — FR edge case.
- `302 Found` → `/not-authorized` when the account lacks the `ecosystem-analytics` audience / `alkemio_actor_id` (FR-015).
- `400` → forged/replayed/expired return: missing `ea_preauth`, unknown `tx_id`, `state` mismatch, or `nonce` mismatch. No session established (FR-013).

---

## `GET /api/auth/me`

Return the current signed-in identity. Session-protected (reads `ea_session`).

**Responses**
- `200` → `{ "userId": string, "displayName": string, "avatarUrl": string | null }` (identity from the session row; FR-011).
- `401` → no/expired/invalid session. Frontend treats as unauthenticated and redirects to `/api/auth/login` (FR-009).

> This replaces the previous Bearer-token `me`; it never echoes tokens.

---

## `POST /api/auth/logout`

End the EA session. Session-protected.

**Behavior**: local-cleanup-first — delete the `oidc_sessions` row; best-effort revoke access + refresh tokens at Hydra's revocation endpoint; clear `ea_session` (FR-012/FR-012a). Does NOT terminate Alkemio's global browser session (out of scope).

**Responses**
- `204 No Content` → session ended; cookie cleared. (Idempotent: a logout with no/invalid session also returns `204`.)

---

## Cross-cutting contract rules

- **Protected data routes** (`/api/spaces`, `/api/graph`, `/api/query`): auth middleware now resolves the session from `ea_session` (was `Authorization: Bearer`). Missing/expired/invalid session → `401` (FR-009). On a downstream Alkemio `401` that a token refresh cannot resolve, the EA session is invalidated and the response is `401`.
- **Transparent refresh** (FR-008): when the stored access token is expired but the refresh grant is valid, the BFF refreshes (rotating) before the upstream GraphQL call — invisible to the client; never surfaced as an error.
- **No secrets in responses or logs** (FR-014/FR-018): tokens, `code_verifier`, `state`, client secret, and `session_id` are never written to logs or returned in any body.
- **CORS/credentials**: responses set `Access-Control-Allow-Credentials: true` for the configured origin(s); the SPA sends `credentials: 'include'`.

## Removed endpoints

| Endpoint | Reason |
|---|---|
| `POST /api/auth/login` (email/password) | Kratos password API flow retired (FR-002) |
| `POST /api/auth/sso/detect` (`ory_kratos_session`) | Cookie-reuse model dropped for own-client OIDC (FR-005) |
