# Contract: Guest session endpoints

**Feature**: 023-vng-guest-access | Router: `server/src/routes/auth.ts`

All three endpoints are public (no `ea_session` required). They never touch Alkemio.

## `POST /api/auth/guest`

Enter guest mode for one dashboard.

**Request** `{ "app": "vng" }`

**Responses**

| Status | Body | When |
|---|---|---|
| 200 | `{ "kind": "guest", "app": "vng" }` + `Set-Cookie: ea_guest=vng; HttpOnly; Path=/; SameSite=…; Secure` (host-only, session-scoped) | app exists and `guestAccess` is on |
| 400 | `{ "error": "INVALID_REQUEST", "message": … }` | missing/unknown `app` |
| 403 | `{ "error": "GUEST_ACCESS_DISABLED", "message": … }` | app exists but `guestAccess` is off (e.g. `govtech`) |
| 409 | `{ "error": "ALREADY_SIGNED_IN", "kind": "member" }` | a valid `ea_session` is present — the client should render as member |

Idempotent: calling it again re-sets the same cookie.

## `GET /api/auth/guest`

Read guest state (used by the shell on load after `/api/auth/me` returns 401).

| Status | Body | When |
|---|---|---|
| 200 | `{ "kind": "guest", "app": "vng" }` | `ea_guest` present, names an enabled app, **and** no member session resolves |
| 204 | — | no guest cookie, or cookie names a disabled/unknown app (cookie is cleared) |
| 409 | `{ "kind": "member" }` | a valid member session is present (precedence) |

## `DELETE /api/auth/guest`

Leave guest mode. Always `204`, clears `ea_guest` (same attributes, `Max-Age=0`). Does **not** touch
`ea_session`.

## `GET /api/auth/me` — unchanged

Still `401` for guests. The shell calls it first; guest resolution is a fallback. Keeping it unchanged
means the Explorer's and GovTech's `fetchMe()` need no modification.

## `GET /api/features` — extended

Adds `"guestAccess": { "vng": true, "govtech": false }` so the login screen can hide the guest option
if an operator disabled it server-side even though the SPA build opts in.

## Guest resolution on data routes (middleware contract)

`guestAwareAuth` (applied to `hubsRouter`, `graphRouter`, `dashboardRouter`, `imageProxyRouter`):

1. `ea_session` present and resolves → `req.auth.kind = 'member'` (identical to `authMiddleware`).
2. Else `ea_guest` present, app enabled → `req.auth.kind = 'guest'`; guest rate limit applied.
3. Else → `401 UNAUTHORIZED` (stale `ea_session` cleared, exactly as today).

`authMiddleware` (all other routers) is unchanged and never yields a guest context.

Route-level rules inside guest-eligible routers:

| Route | Guest behaviour |
|---|---|
| `POST /api/graph/generate` | `forceRefresh` ignored; `spaceIds` cap enforced as for members |
| `DELETE /api/graph/cache` | `403 GUEST_FORBIDDEN` |
| `GET /api/graph/progress` | keyed by `X-EA-Client-Id` (see api-error-codes.md) |
| `GET /api/image-proxy` | fetches the Alkemio visual **without** a bearer token |
