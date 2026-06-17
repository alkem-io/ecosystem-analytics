# Phase 1 Data Model: Redirect-Based Alkemio OIDC Login

Entities derived from the spec's Key Entities + FR-013/FR-018a. Two new SQLite tables in the existing `better-sqlite3` store; `cache_entries`/`query_feedback` unchanged. All access via parameterized prepared statements (Constitution IV).

---

## Entity: OIDC auth transaction (pre-auth, short-lived)

The CSRF/replay-defense record created at `GET /api/auth/login`, consumed once at callback. Isolated from session state on purpose.

| Field | Type | Notes |
|---|---|---|
| `tx_id` | TEXT PK | Opaque one-time id (CSPRNG); also the value of the short-lived pre-auth cookie |
| `state` | TEXT NOT NULL | Anti-forgery value sent to Hydra; timing-safe compared on return (FR-013) |
| `nonce` | TEXT NOT NULL | One-time marker bound into the ID token; validated on exchange (FR-013) |
| `code_verifier` | TEXT NOT NULL | PKCE verifier; `code_challenge` = S256(verifier) sent to Hydra |
| `return_to` | TEXT NOT NULL | Validated EA-internal path to land on post-login (open-redirect guarded) |
| `created_at` | INTEGER NOT NULL | epoch ms |
| `expires_at` | INTEGER NOT NULL | created_at + pre-auth TTL (e.g. 10 min); expired rows rejected + purged |

**Validation rules**
- `return_to` MUST match the trusted-path allow-list (relative EA path, no external host) or it is replaced with the default landing page (FR-013).
- Row is **single-use**: deleted immediately after a successful callback; a second callback with the same `tx_id`/`state` MUST fail (FR-013 replay protection).
- Expired rows (`expires_at < now`) are invalid and purged.

```sql
CREATE TABLE IF NOT EXISTS oidc_auth_tx (
  tx_id          TEXT PRIMARY KEY,
  state          TEXT NOT NULL,
  nonce          TEXT NOT NULL,
  code_verifier  TEXT NOT NULL,
  return_to      TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oidc_auth_tx_expires ON oidc_auth_tx (expires_at);
```

---

## Entity: Ecosystem Analytics session

EA's own signed-in state, established on return from Alkemio. Persisted server-side, encrypted at rest; the browser holds only `session_id` (FR-018a).

| Field | Type | Notes |
|---|---|---|
| `session_id` | TEXT PK | Opaque CSPRNG id (≥128-bit); value of the `httpOnly` session cookie |
| `user_id` | TEXT NOT NULL | Stable Alkemio identity = `alkemio_actor_id` claim; cache scoping key (FR-010) |
| `display_name` | TEXT | From `profile`/`/userinfo` for personalization (FR-011) |
| `avatar_url` | TEXT | Optional; graceful-degradation if absent (Constitution V) |
| `access_token_enc` | BLOB NOT NULL | AES-256-GCM(`iv‖tag‖ciphertext`) of Hydra access JWT |
| `refresh_token_enc` | BLOB NOT NULL | AES-256-GCM of Hydra refresh token (rotated → always overwrite with newest) |
| `access_expires_at` | INTEGER NOT NULL | epoch ms; drives lazy refresh (FR-008) |
| `refresh_expires_at` | INTEGER NOT NULL | epoch ms; upper bound of session validity (FR-009a) |
| `created_at` | INTEGER NOT NULL | epoch ms |
| `last_seen_at` | INTEGER NOT NULL | epoch ms; updated on activity; drives idle timeout (FR-009a) |

**Validation / lifecycle rules**
- A session is **valid** iff `now < refresh_expires_at` AND `now - last_seen_at < idle_timeout` (default 8 h, configurable). Failing either → treated as unauthenticated, FR-009 routing applies.
- `access_token_enc` refreshed transparently when `now >= access_expires_at` (or within a small skew) while the refresh grant is valid (FR-008); refresh rotation means `refresh_token_enc` + `refresh_expires_at` are overwritten on every refresh.
- Tokens MUST be decrypted only in-process at use; never logged, never returned to the browser (FR-014/FR-018).
- On explicit sign-out: revoke tokens at Hydra, then delete row (FR-012a). On refresh failure: delete row.

```sql
CREATE TABLE IF NOT EXISTS oidc_sessions (
  session_id          TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  display_name        TEXT,
  avatar_url          TEXT,
  access_token_enc    BLOB NOT NULL,
  refresh_token_enc   BLOB NOT NULL,
  access_expires_at   INTEGER NOT NULL,
  refresh_expires_at  INTEGER NOT NULL,
  created_at          INTEGER NOT NULL,
  last_seen_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oidc_sessions_user ON oidc_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_oidc_sessions_refresh_exp ON oidc_sessions (refresh_expires_at);
```

---

## Entity: Visitor identity (derived, not separately stored)

Carried on the session row (`user_id`, `display_name`, `avatar_url`). Sourced from ID-token claims (`alkemio_actor_id`, `profile`) and optionally enriched via `/userinfo` or the existing `me` GraphQL query (FR-011). `user_id` is the durable key everything else scopes to.

## Entity: Cached dataset (existing, unchanged schema)

`cache_entries (user_id, space_id, dataset_json, created_at, expires_at)` — PK `(user_id, space_id)`. **No schema change.** The only difference: `user_id` is now resolved from the EA session (`oidc_sessions.user_id` = `alkemio_actor_id`) instead of from a per-request `me()` against a Bearer token. Per-user isolation (FR-010) is preserved; a read still verifies the requesting session's `user_id` matches the cache owner.

---

## Relationships

```
oidc_auth_tx ──(consumed once at callback, then deleted)──▶ oidc_sessions
oidc_sessions.user_id (= alkemio_actor_id) ──(1:N)──▶ cache_entries.user_id
oidc_sessions.user_id ──(1:N)──▶ query_feedback.user_id
browser cookie `session_id` ──(opaque ref, 1:1)──▶ oidc_sessions.session_id
browser cookie `tx_id` (pre-auth only) ──(opaque ref, 1:1)──▶ oidc_auth_tx.tx_id
```

## Retention / cleanup

- `oidc_auth_tx`: purge `expires_at < now` (piggyback on the existing `purgeExpired` cache sweep).
- `oidc_sessions`: purge rows where `refresh_expires_at < now` OR `last_seen_at < now - idle_timeout`; delete immediately on sign-out.
