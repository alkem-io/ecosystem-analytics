# Research: VNG Guest Access

**Feature**: 023-vng-guest-access | **Date**: 2026-09-11

All findings below were verified against the live production Alkemio GraphQL endpoint
(`https://alkem.io/api/private/graphql`) with **no** `Authorization` header, using the exact
query shapes in `server/src/graphql/queries/`, and against the current codebase on `develop`.

---

## R1. Does Alkemio answer anonymous GraphQL queries, and for what?

**Decision**: Guest requests are served by the BFF issuing the same typed SDK queries with **no
bearer token**. Alkemio's anonymous authorization policy decides what comes back; the BFF adds no
notion of "public" of its own (spec Assumptions).

**Evidence** (anonymous, production, 2026-09-11):

| Query (project shape) | Anonymous result |
|---|---|
| `InnovationHubs` (platform library) | ✅ Full list: hubs, `spaceListFilter` with nameIDs + visibility |
| `InnovationHubByNameId("vih-test")` | ✅ Resolves the hub id |
| `InnovationHubById` → `spaceListFilter` + `authorization.myPrivileges` | ✅ 23 spaces; **3 with `READ`** (`signalen`, `gdc`, `gem`), **20 with `READ_ABOUT` only** |
| `spaceByName("gemeentedelers")` incl. community + subspaces + callouts | ✅ `READ`; 10 members with profile + city; 1 subspace; **310 callouts** (the whole GD corpus) |
| `spaceByName("atlas")` (READ_ABOUT-only) incl. `community` | ❌ `FORBIDDEN_POLICY` on `community` → **whole `space` is `null`** (non-null bubbling) |
| `space("atlas") { about { profile, classifications } authorization { myPrivileges } }` (no community) | ✅ Name, classifications (`VNG 2030 thema`, `NDS-prioriteit`, `Fase`) all readable |
| Member profiles (`displayName`, `location.city`) on a READ space | ✅ readable |
| `organizationsPaginated` (gemeente locations, feature 019) | ✅ pages normally |
| `ActivityFeedGrouped` | ❌ `FORBIDDEN_POLICY` (`read-users` on platform) — **never available to guests** |
| `me` | `{ user: null }` (no error) |

**Consequences**:
1. The VNG dashboard is genuinely useful to guests: hub list, hub spaces, the full GD initiatives
   corpus, gemeente locations, classifications and growth phases all work anonymously.
2. Without a change, a guest selecting the default VNG hub would silently lose **20 of 23** spaces,
   because `acquireSpaceData` fetches each L0 space with community included, gets `space: null`,
   and records "Space not found or fully restricted" — the space is omitted (see R4).
3. Activity data must be **skipped** for guests (known-forbidden), not attempted and logged as an
   error; guest graphs carry no activity signal.
4. `isAlkemioAuthError()` does **not** misfire on `FORBIDDEN_POLICY` (its regexes match
   `UNAUTHENTICATED|UNAUTHORIZED|AUTHENTICATION` codes and `401|unauthenticated|not authenticated`
   messages), so today's session-invalidation logic will not fire on a guest's forbidden query. But
   for a guest there is no session to invalidate, so guest routes need their own mapping (R3).

**Alternatives considered**: a service account / client-credentials token for guests — rejected:
it would show guests whatever the service account can see (a BFF-defined "public" that could
drift from Alkemio's), contradicts the spec assumption, and puts a long-lived credential in play.

---

## R2. How does the BFF know a request is a guest request, and for which app?

**Decision**: An `httpOnly`, **host-only**, **session-scoped** cookie `ea_guest=<app>` set by the BFF
via `POST /api/auth/guest { app }` (only when `config.dashboards.<app>.guestAccess` is true).
Precedence is fixed: a resolvable `ea_session` **always wins**; `ea_guest` is consulted only when no
member session resolves.

**Rationale**:
- Carried automatically by `fetch` **and** `<img src>` — the image proxy (`/api/image-proxy`) is
  loaded by image tags and cannot send a custom header; a query parameter would leak into every
  proxied URL.
- **Host-only** (no `Domain` attribute, unlike `ea_session` which is on `.alkem.io`): the cookie
  exists only for `vih-analytics.<domain>`, so the Explorer and GovTech origins never see it and
  need no code to reject it (FR-006).
- **Session-scoped** (no `Max-Age`/`Expires`): the browser drops it when closed → FR-012 with no
  extra logic.
- **Stateless**: no session row, no personal data, nothing to expire or clean up (FR-025). The
  value is only the app id, validated against config on every request.
- **Precedence** resolves every cross-tab case in the spec: signing in elsewhere sets `ea_session`
  on the parent domain; the next request from the guest tab resolves as a member; the shell notices
  via its focus/visibility re-check of `/api/auth/me` and drops the guest notice. A stale `ea_guest`
  after sign-in is inert (the OIDC callback runs on another origin and cannot clear a host-only
  cookie, so it must not need to).

**Alternatives considered**:
- Request header `X-EA-Guest` — fails for `<img>`; would need a second mechanism.
- A server-side guest session row (`kind: 'guest'`) in `oidc_sessions` — stores nothing useful,
  needs cleanup, and its cookie would be on the parent domain, forcing Explorer/GovTech to learn to
  reject it.
- Frontend-only flag (sessionStorage) with the BFF treating "no cookie" as guest on VNG routes —
  the BFF then cannot tell a guest from a member whose cookie expired, and `/api/graph/generate`
  is shared with the Explorer, which must keep returning 401.

---

## R3. How are guest requests authorised and what do refusals look like?

**Decision**: `AuthContext` becomes a discriminated union — `{ kind: 'member', session, userId,
displayName }` | `{ kind: 'guest', app, userId: GUEST_USER_ID }`. A new `guestAwareAuth`
middleware replaces `authMiddleware` **only** on guest-eligible routers; `authMiddleware` keeps its
exact behaviour everywhere else (it now also rejects guest contexts explicitly). `createAlkemioSdk`
builds an unauthenticated `GraphQLClient` for `kind: 'guest'`.

**Guest-eligible routes** (everything the VNG shell calls, verified by grep of `@ea/shared`):
`GET /api/hubs`, `GET /api/hubs/:nameId/spaces`, `POST /api/graph/generate`,
`GET /api/graph/progress`, `POST /api/<app>/dashboard`, `GET /api/<app>/initiatives`,
`GET /api/<app>/gemeente-locations`, `GET /api/image-proxy`. `/api/features` and `/api/meta` are
already public.

**Never guest-eligible** (FR-026): `/api/spaces/*` (Explorer), `/api/query/*` (AI query — spends
third-party credit, per-user sessions and feedback), `DELETE /api/graph/cache` (would let any
visitor evict the shared guest cache — FR-027), and `forceRefresh: true` on `/api/graph/generate`
(ignored for guests, for the same reason).

**Refusal semantics** (the contract `contracts/api-error-codes.md` fixes these):
- Upstream `FORBIDDEN_POLICY` / auth error **on a guest request** → `403 { error: 'GUEST_FORBIDDEN' }`
  — never `invalidateAndReject` (there is no session; a 401 would loop the guest into sign-in, FR-019).
- Upstream transport failure or 5xx **for anyone** → `503 { error: 'ALKEMIO_UNREACHABLE' }` (new,
  distinct from the existing `502 *_FAILED` compute failures) so the frontend can consolidate
  (FR-022).
- Member session genuinely expired → `401` exactly as today (FR-020).

**Rationale**: the union type makes every `req.auth!.session` call site a compile error until it is
either guest-safe or guarded — the type checker enumerates the work. Keeping `authMiddleware`
untouched on non-eligible routers is what keeps the Explorer/GovTech and the constitution's
"every protected request resolves a session" rule intact for those routes.

---

## R4. Restricted top-level spaces: why guests would lose 20/23 spaces, and the fix

**Decision**: Extend feature 011's privacy-aware loading from subspaces to **L0 spaces**. Before
`fetchSpaceByName` (which requests community), acquisition runs a new lightweight
`spaceAboutByName` query (about + `membership.myPrivileges`, no community — reuses
`spaceAboutFragment`). `READ` → existing path. `READ_ABOUT` only → an L0 node marked `restricted`
carrying about + classifications (so it still counts in NDS/VNG-2030/phase panels and sits in the
funnel) with no community/gemeente data. Neither → omitted, recorded as a structured
`spaceFailures` entry with `reason: 'restricted'`.

**Rationale**: verified in R1 — the community field's `FORBIDDEN_POLICY` nulls the entire space, so
"probe privileges first" is the only way to keep the about data. This is also a latent **member**
bug: a signed-in user without `READ` on a hub-listed space currently sees it vanish with an error
string; after this change they see it as restricted, consistent with subspaces (spec US3 scenario 7).
The `GraphNode.restricted` flag and lock rendering already exist (feature 011) — no new UI concept.

**Alternatives considered**: catching the null and re-querying without community — an extra
round-trip only on failure, but it turns an expected state into an error path and cannot
distinguish "restricted" from "not found". Reading privileges from the hub's `spaceListFilter`
(already fetched by `/api/hubs/:id/spaces`) — insufficient because `/api/graph/generate` accepts
arbitrary `spaceIds` (nameIDs) not necessarily from a hub.

---

## R5. Partial failures: from `errors: string[]` to structured per-space failures

**Decision**: `GraphDataset` gains `spaceFailures?: SpaceFailure[]` with
`{ nameId, reason: 'restricted' | 'not_found' | 'failed' | 'activity_unavailable' }`. The existing
`errors: string[]` stays (backward compatible; still logged) but the frontend stops rendering it
verbatim (FR-016). Datasets containing a `failed` (transient) entry are **not memoised**
(`graph-memo`) so a Retry re-issues the same request and re-fetches only the failed spaces —
successful spaces are already cached per nameId, so nothing else is refetched. `restricted` and
`not_found` are deterministic and memoise normally.

**Rationale**: acquisition already isolates per-space failures (`continue` on error); what is
missing is a machine-readable shape. Retry-without-`forceRefresh` matters doubly for guests, for
whom `forceRefresh` is ignored (R3).

---

## R6. Frontend failure containment: one error taxonomy, one notice component

**Decision**: `api.ts` throws a typed `ApiFailure` hierarchy — `NetworkError` (exists),
`RequiresSignInError` (guest-mode 401, or `GUEST_FORBIDDEN`), `UpstreamUnavailableError`
(`ALKEMIO_UNREACHABLE`), `RequestFailedError` (other non-OK, carries the stable `error` code) —
plus `AbortError` passthrough. A single `DataAreaFailure` component maps an error to i18n copy and
renders Retry; every hook exposes `reload`. The 401 redirect in `api.ts` becomes conditional on the
auth mode (member → redirect as today; guest → `RequiresSignInError`).

**Slow requests (FR-021)**: no hard timeout — graph acquisition legitimately runs for minutes on
large selections and `useGraphProgress` already reports per-space progress. Instead a `slowAfterMs`
(default 30 s) threshold in a shared `useDataArea` hook flips the loading state to "still
working…" with a Cancel (AbortController) — the request is only abandoned if the visitor says so.

**Consolidation (FR-022)**: a small `UpstreamStatus` context in the shell counts recent
`UpstreamUnavailableError`s; when the latest failures are all of that kind, the shell shows one
banner with "Retry all" (which invokes every registered area's `reload`) and the areas render a
one-line marker instead of full notices.

**Rationale**: today five hooks each render `err.message` and none of `useDashboard` /
`useGdInitiatives` / `useGemeenteLocations` can reload. Centralising the taxonomy is what makes
FR-014–FR-023 testable in one place rather than per tab.

---

## R7. Bounding guest load (FR-027)

**Decision**: (a) guests share one cache principal `GUEST_USER_ID = '__guest__'` in the existing
`cache_entries (user_id, space_id)` and in the in-process dataset memo (which already de-duplicates
in-flight builds, so N concurrent guests → one upstream build); (b) `forceRefresh` and
`DELETE /api/graph/cache` are unavailable to guests; (c) a small in-process per-IP token bucket on
guest requests only (`guest.rate_limit_per_minute`, default 120), returning
`429 { error: 'RATE_LIMITED' }`; (d) `maxSpacesPerRequest` already applies.

**Rationale**: the memo + cache already give SC-010 for free once guests share a principal. The rate
limiter is ~30 lines and needs no dependency; a shared (multi-replica) limiter is not justified for a
prototype and can replace it later behind the same config key.

**Alternatives considered**: `express-rate-limit` — fine, but a new dependency for a trivial guest-only
guard; revisit if limits must be shared across replicas.

---

## R8. Guest progress polling collision

**Decision**: `progressMap` is keyed by `userId` today; every guest would share one entry. The API
wrapper sends a per-tab `X-EA-Client-Id` header (random, generated once per tab in `sessionStorage`);
for guests the progress key is `__guest__:<clientId>`; for members it stays `userId` (unchanged).
Missing header → shared `__guest__` bucket (degraded but harmless).

---

## R9. Returning a guest to the same place after sign-in (FR-010)

**Decision**: The Space selection and hub are already persisted (`<storagePrefix>_selection` in
localStorage) and survive the round-trip. The active tab is **not** persisted (`useState('dashboard')`
in `App.tsx`), so the guest notice's sign-in action passes `returnTo = origin + '/?tab=<key>'` and the
shell reads `?tab=` on mount (then strips it). `returnTo` is already origin-allow-listed by the BFF;
a query string is within that.

---

## R10. Constitution alignment

The constitution (v4.3.0) says the BFF "MUST resolve a valid server-side session for every protected
request" and that cache entries are "keyed by `(user_id, space_id)` — every read verifies the
requesting session's user". This feature introduces a **guest principal** that has no session and
whose `user_id` is the sentinel `__guest__`. The plan treats this as a documented, justified
deviation (see plan.md Complexity Tracking) and recommends a **MINOR constitution amendment**
(Principle I/IV + Security Requirements: "a dashboard may opt in to anonymous *guest* access to
Alkemio-public content; guest requests carry no token, are cache-scoped under a single guest
principal, and can never reach member-only capabilities") via `/speckit.constitution` before or
alongside implementation. No principle is weakened: tokens stay server-side (a guest has none),
the browser still holds only opaque cookies, per-user isolation of member data is untouched.
