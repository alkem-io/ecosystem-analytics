# Data Model: VNG Guest Access

**Feature**: 023-vng-guest-access | **Date**: 2026-09-11

No database schema change. One new cookie, one new cache principal, two type extensions, and a
frontend state model. Everything below maps to spec Key Entities (Visitor mode, Guest notice, Data
area, Failure notice).

---

## 1. Server

### 1.1 `AuthContext` (extends `server/src/auth/middleware.ts`) — *Visitor mode*

```ts
export const GUEST_USER_ID = '__guest__';

export type AuthContext = MemberAuthContext | GuestAuthContext;

export interface MemberAuthContext {
  kind: 'member';
  session: SessionRecord;      // validated server-side session (encrypted tokens) — unchanged
  userId: string;              // alkemio_actor_id — cache scoping key — unchanged
  displayName?: string;
}

export interface GuestAuthContext {
  kind: 'guest';
  app: DashboardAppId;         // which dashboard admitted the guest (from the ea_guest cookie)
  userId: typeof GUEST_USER_ID; // cache scoping key shared by all guests
}
```

**Rules**
- `kind: 'member'` is produced exactly as today by session resolution; nothing about it changes.
- `kind: 'guest'` is produced **only** by `guestAwareAuth`, **only** when no member session resolves,
  **only** when `ea_guest` names an app with `guestAccess: true`.
- A guest context has no session, no tokens, no display name. Any code path that needs a token must
  branch on `kind` (the union makes `auth.session` a compile error on the guest arm).
- `resolveUser` accepts both kinds (it only checks `userId` is present).

### 1.2 `ea_guest` cookie

| Attribute | Value | Why |
|---|---|---|
| Name | `ea_guest` | |
| Value | dashboard app id (`vng`) | validated against `config.dashboards[app].guestAccess` on every request |
| `HttpOnly` | yes | not readable by page script |
| `Secure` | same rule as `ea_session` | |
| `SameSite` | same rule as `ea_session` | |
| `Domain` | **none (host-only)** | must not reach Explorer / GovTech origins (FR-006) |
| `Path` | `/` | |
| `Max-Age` / `Expires` | **none (session cookie)** | dropped when the browser closes (FR-012) |

Set by `POST /api/auth/guest`; cleared by `DELETE /api/auth/guest`. Precedence: `ea_session` wins.

### 1.3 `DashboardAppConfig.guestAccess` (`server/src/config.ts`, `server/analytics.yml`)

```yaml
vng:
  guest_access: ${VNG_GUEST_ACCESS}:true
  guest_rate_limit_per_minute: ${VNG_GUEST_RATE_LIMIT_PER_MINUTE}:120
govtech:
  guest_access: ${GOVTECH_GUEST_ACCESS}:false
```

`guestAccess: boolean` (default `false` for any profile that omits it) and
`guestRateLimitPerMinute: number`. `/api/features` exposes `guestAccess` per app so the frontend
never has to hard-code it — but the frontend's `AppConfig.guestAccess` is the switch that shows the
login-screen option; the server flag is the authority that admits the cookie. Both must be on.

### 1.4 Cache principal

`cache_entries (user_id, space_id)` — **no schema change**. Guest rows use `user_id = '__guest__'`.
Existing read-time owner check (`cache-service.ts`) is unchanged: a guest request reads only
`__guest__` rows; a member request reads only its own actor-id rows. `clearUserCache('__guest__')`
is never reachable from a guest request (route not eligible).

In-process `datasetMemo` keys already start with `userId|…`, so guest builds share one memo entry
and in-flight de-duplication applies across all guests.

### 1.5 `GraphDataset.spaceFailures` (`server/src/types/graph.ts`) — *Failure notice (partial)*

```ts
export type SpaceFailureReason =
  | 'restricted'            // READ_ABOUT only, or no privileges at all — deterministic
  | 'not_found'             // lookupByName returned nothing — deterministic
  | 'failed'                // upstream/transport/other — transient, retryable
  | 'activity_unavailable'; // activity feed forbidden (always the case for guests) — informational

export interface SpaceFailure {
  nameId: string;           // the request key the frontend used
  reason: SpaceFailureReason;
}

export interface GraphDataset {
  /* …existing fields… */
  errors?: string[];        // unchanged, still logged; no longer rendered verbatim
  spaceFailures?: SpaceFailure[];   // NEW — omitted when empty
}
```

**Rules**
- A space appears in `spaceFailures` **or** in `nodes` as a restricted L0 node, never both, except
  `activity_unavailable`, which is informational and may accompany a rendered space.
- A dataset with any `reason: 'failed'` entry is **not memoised** (a Retry must reach acquisition).
- Restricted L0 spaces are rendered as `GraphNode` with `restricted: true` (existing flag), about
  + classifications populated, no community edges, no gemeente participation.

### 1.6 Progress key

`progressMap` key: member → `userId` (unchanged); guest → `__guest__:${clientId}` where `clientId` is
the `X-EA-Client-Id` request header (falls back to `__guest__`).

---

## 2. Frontend (`@ea/shared`)

### 2.1 `AppConfig.guestAccess?: boolean` (`frontend/shared/src/app/AppConfig.tsx`)

Opt-in per dashboard, exactly like `usageExplorer` / `funnel`. VNG sets `true`; GovTech omits it.

### 2.2 Auth state (`frontend/shared/src/dashboard/hooks/AuthContext.tsx`) — *Visitor mode*

```ts
export type AuthState =
  | { status: 'loading' }
  | { status: 'member'; me: MeResponse }
  | { status: 'guest'; app: string }
  | { status: 'anonymous' };            // no session, no guest cookie → LoginScreen
```

**Transitions**

| From | Event | To |
|---|---|---|
| loading | `/api/auth/me` 200 | member |
| loading | `/api/auth/me` 401 → `/api/auth/guest` 200 (cookie present) | guest |
| loading | both refused | anonymous |
| anonymous | user chooses guest → `POST /api/auth/guest` 200 | guest |
| anonymous | user chooses sign-in | (navigates away; returns as member) |
| guest | notice / menu "Sign in" | (navigates away with `?tab=`; returns as member) |
| guest | menu "Leave" → `DELETE /api/auth/guest` | anonymous |
| guest | focus/visibility re-check finds `/api/auth/me` 200 | member (data reloads) |
| guest | any request returns 401 (guest cookie no longer accepted) | anonymous |
| member | any request returns 401 | (redirect to sign-in — unchanged) |

`useAuth()` exposes the state; `api.ts` reads the current mode through a module-level setter (no
React dependency in the transport layer) to decide 401 handling.

### 2.3 `ApiFailure` hierarchy (`frontend/shared/src/services/api.ts`) — *Failure notice (kind)*

```ts
class NetworkError            // transport (exists) → "Could not reach the server"
class RequiresSignInError     // guest 401, or 403 GUEST_FORBIDDEN → "requires signing in"
class UpstreamUnavailableError// 503 ALKEMIO_UNREACHABLE → consolidated "service unavailable"
class RequestFailedError      // any other non-OK; .code = stable server error code; .status
```

Plus native `AbortError` for a visitor-cancelled slow request. Every hook surfaces `error: ApiFailure
| null` (not `string`), and `reload(): void`.

### 2.4 `DataArea` state (`frontend/shared/src/dashboard/hooks/useDataArea.ts`) — *Data area*

```ts
type DataAreaState<T> =
  | { phase: 'idle' }
  | { phase: 'loading'; slow: boolean; cancel: () => void }   // slow flips true after slowAfterMs
  | { phase: 'ready'; data: T; stale?: boolean }
  | { phase: 'failed'; error: ApiFailure; retry: () => void }
```

Each independently loading region (hub list, hub spaces, dashboard aggregates, graph dataset, GD
initiatives, gemeente locations, per-space subsets within a selection) is one data area. Areas
register their `retry` with the `UpstreamStatus` context so "Retry all" can reach them.

### 2.5 `UpstreamStatus` (shell context) — *consolidated failure*

`{ unavailable: boolean; retryAll(): void }` — `unavailable` becomes true when the most recent
failure from every currently-failed area is an `UpstreamUnavailableError`; cleared when any area
loads successfully.

### 2.6 Guest notice — *Guest notice*

Rendered in place of `AuthorizationWarning` when `status === 'guest'`. Content: title, body
(incomplete data), "Sign in" action (`login(origin + '/?tab=' + active)`). `role="alert"`; collapses
below `lg` exactly like `AuthorizationWarning`.

### 2.7 Persisted client state

| Key | Store | Purpose |
|---|---|---|
| `ea_client_id` | `sessionStorage` | per-tab id for `X-EA-Client-Id` (progress polling) |
| `<prefix>_selection` | `localStorage` (exists) | hub + Space selection survives the sign-in round-trip |
| `?tab=<key>` | URL on return | active tab restored, then removed from the URL |

Nothing about the guest choice itself is stored client-side; the `ea_guest` cookie is the only
record and it is `httpOnly` and session-scoped.

---

## 3. i18n keys (VNG `nl.json` / `en.json`; GovTech does not need the guest keys)

- `login.guestCta`, `login.guestWarning`, `login.or`
- `guest.title`, `guest.body`, `guest.signIn`, `guest.leave`, `guest.menuLabel`
- `failure.network`, `failure.requiresSignIn`, `failure.unavailable`, `failure.generic`,
  `failure.retry`, `failure.retryAll`, `failure.slow`, `failure.cancel`, `failure.spacesPartial`
  (`{{failed}} of {{total}}`), `failure.spacesRestrictedGuest`, `failure.nothingPublic`
