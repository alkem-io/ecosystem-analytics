# Research: Space-Based Access Gate

**Feature**: 026-space-access-gate · **Date**: 2026-11-13

Each section records one decision. The verified facts behind them were checked against the code on
this branch and, where marked **[live]**, against production Alkemio on 2026-11-13.

---

## R1 — How does a request know which application it is for?

**Decision**: Each application is identified in two ways, and both must admit the request.

1. **The application that served the request (its listener).** `createApp(staticDir)` becomes
   `createApp(appId, staticDir)` and stamps every request with that `appId` (`'explorer' | 'vng' |
   'govtech'`). In production each SPA reaches the BFF same-origin through its own subdomain → port
   (Explorer :4000, VNG :4001, GovTech :4002), so the listener reliably identifies the application.
2. **Any application the request names.** A request that names an application's own feature names
   that application. This covers the path `/api/<app>/…`, the query `?app=<app>` on `/api/hubs`, and
   `body.app` on `/api/graph/*`. The named application's policy applies on whichever listener the
   request arrives at.

The set of applications to check is `{listener app} ∪ {named apps}`. Every one of them must admit
the person.

**Rationale**: Every listener mounts every route today (`server/src/app.ts`), so `/api/vng/dashboard`
is reachable through the Explorer's port. Using the listener alone would let a refused person fetch
the monitor's views from `analytics.*`. That is the bypass the spec forbids in its edge case on data
endpoints shared by several applications. Using named apps alone would leave unnamed, shared routes
(`/api/spaces`, `/api/graph/generate` without `app`) ungated on the VNG listener. Combining the two
closes both gaps. It also matches FR-012a exactly: the Explorer's normal features, which name no
application, stay subject only to the Explorer's own (open) policy.

**Alternatives considered**:
- *Client-sent `X-EA-App` header*: spoofable. A refused person could simply omit it or change it.
- *Mount `/api/vng/*` only on the VNG listener*: this closes the path bypass but not
  `?app=vng` / `body.app='vng'`. It also changes routing for every deployment, and dev would need
  three proxies anyway (see R2).
- *Origin / Host header*: works behind the ingress but not reliably in dev (`changeOrigin: true`
  rewrites Host), and it adds a second source of truth next to the port mapping.

**Not gated by named app**: `/api/ecosystem/*` (feature 024). These routes are hub-scoped,
readability-filtered with the caller's own token (Constitution IV), and name no application. They
stay under the listener's policy. Being gated on the VNG listener is enough, because the ecosystem
*map* is derived client-side from graph data the person can already read (FR-012a).

---

## R2 — Dev parity: three Vite servers, one proxy target

**Decision**: Change the default dev proxy targets so each SPA talks to its own listener: Explorer
→ `localhost:4100` (unchanged), VNG → `localhost:4101`, GovTech → `localhost:4102`.
`VITE_PROXY_TARGET` still overrides each one. The BFF already listens on `port`, `port+1` and
`port+2` in dev (`server/src/index.ts`), so no server change is needed.

**Rationale**: All three `vite.config.ts` files default to `http://localhost:4100`, the Explorer
listener. Under R1 the VNG SPA in dev would then be judged as the Explorer, so the gate would
silently not apply in dev and its UX could not be exercised locally.

**Alternatives considered**: An app header honoured only in dev. Rejected: it creates two code paths
for the security-relevant decision.

---

## R3 — Which Alkemio field answers "which roles does this person hold on the gate Space"?

**Decision** (revised 2026-11-13, see R4): use the person's **roles** in the gate Space's community,
`Space.community.roleSet.myRoles`, reached through
`lookupByName.space(NAMEID).subspaceByNameID(NAMEID)` (one hop per level, up to L2), with a new
`.graphql` query `accessGate.graphql` and codegen (Constitution II). Map the result to a level:
`MEMBER ∈ roles` → Read; `MEMBER ∈ roles ∧ ADMIN ∈ roles` → Manage; otherwise → None. ADMIN is the
role that carries UPDATE on an Alkemio Space; LEAD alone does not admit.

**Rationale**: a role is held only by the people actually given it, whatever the Space's
visibility, which matches "member of the gate Space" exactly (FR-004). **[live]** The query shape
was confirmed against production: anonymously,
`lookupByName.space("programmagroei").subspaceByNameID("landelijkinnovatiemonitor").community.roleSet`
returns `myRoles: []` and `myMembershipStatus: NOT_MEMBER`.

**Alternatives considered**:
- `authorization.myPrivileges` (READ / UPDATE): the original decision. Rejected because READ on a
  public Space is granted to everyone (R4).
- `roleSet.myMembershipStatus === MEMBER`: membership only, so it cannot tell Manage apart. `myRoles`
  answers both levels in one round trip.
- `authorization.hasPrivilege(...)`: same public-Space flaw as `myPrivileges`.

---

## R4 — The production gate Space is public, so roles, not privileges

**Finding [live]**: an **anonymous** query on 2026-11-13 returned
`authorization.myPrivileges = ["READ", "READ_ABOUT", "READ_LICENSE"]` and `about.isContentPublic =
true` for `programmagroei/landelijkinnovatiemonitor`. Alkemio grants READ on a public Space to
everyone, so a privilege-based gate would admit every signed-in person.

**Decision** (product owner, 2026-11-13): "check for role, not privilege". The gate reads the
person's roles (R3). A public gate Space is then harmless: being able to read it gives no role in
it. No public-gate warning is needed, and the Space does not have to be made private.

---

## R5 — Where is the per-session decision held?

**Decision**: A new SQLite table `access_decisions`, keyed `(session_id, app_id)`, which stores the
level, the gate key it was decided against, and `decided_at`. The decision is discarded with its
session at sign-out, expiry or idle purge, and replaced on "check again". A decision whose `gate_key`
no longer matches the configured gate is ignored, so a reconfiguration takes effect at once.
"Could not verify" is never written.

**Rationale**: Constitution IV requires session state in a shared store, not per-process, so that
multiple replicas agree. The decision is session state (FR-006: held for the session). A separate
table, rather than columns on `oidc_sessions`, keeps one row per (session, app): sign-in is shared
but decisions are per application (FR-003a). It also leaves the session schema untouched.

**Alternatives considered**: An in-memory `Map` (breaks across replicas and restarts). Columns on
`oidc_sessions` (would need one column set per app, and a migration each time a dashboard is added).

No change to `cache_entries` and no `CACHE_MAINTENANCE_VERSION` bump: the gate runs before any route
handler, so cached datasets are never reached for a refused person (FR-011).

---

## R6 — Gate display name, link and start-up validation without a service account

**Decision**: At start-up, for each gated application, run an **anonymous** typed query (no
`Authorization` header) for the gate Space's `about.profile { displayName url }`. Then:
- **Not found** → operator **error** log. The application starts, but every person gets "could not
  verify" (spec edge case: gate Space missing).
- **Anonymous FORBIDDEN** → the Space exists but is private. Use the configured fallback name.
- Cache `displayName` and `url` in memory. These are what the "no access" page shows, independently
  of whether the refused person can read the Space. If the probe fails (Alkemio unreachable at boot),
  fall back to an optional configured display name, then to the nameID, and derive the URL from
  `alkemioServerUrl` + the path. The probe is retried in the background.

**Rationale**: The constitution forbids credentials in `.env`, so there is no service account.
**[live]** Anonymous `lookupByName` does return the subspace's `about.profile`. This satisfies the
spec edge case about a refused person not being able to read the gate Space's name.

**Alternatives considered**: Using the refused person's token for the name (fails for exactly the
people who need it). Configuration only (drifts from Alkemio when the Space is renamed).

---

## R7 — Classifying the outcome of a per-person check

**Decision**:

| Alkemio response for the person's token | Outcome |
|---|---|
| roles returned | level from R3 (`none` / `read` / `manage`) |
| `space`/`subspaceByNameID` null, or a GraphQL `FORBIDDEN` / `ENTITY_NOT_FOUND` error, **and** the start-up probe found the Space | `none` (the person cannot see the Space) |
| same, but the probe never confirmed the Space exists | `unverified` + operator error |
| `isAlkemioAuthError` | existing behaviour: `invalidateAndReject` → 401 → sign-in |
| network error, timeout (5 s), 5xx, anything else | `unverified` (fail closed, FR-007) |

**Rationale**: A private subspace is invisible to non-members, and Alkemio surfaces that as a null or
an error rather than as an empty role list (see the comment in `spaceAboutOnlyByName.graphql`).
The start-up probe is what separates "you cannot see it" from "it is gone".

---

## R8 — Enforcement placement and the shape of a refusal

**Decision**: One app-level middleware, `accessGate`, mounted in `createApp` after `cookieParser`
and `express.json`, before every router. Exempt paths: `/api/auth/*`, `/api/health`,
`/api/features`, `/api/meta`. These are needed to sign in, sign out, report identity and access, and
"check again" (FR-010). For other paths:
- **no session cookie, or an unresolvable session** → `next()`. The route's own `authMiddleware`
  returns 401 exactly as today.
- **session present** → collect the applications (R1), get or make a decision for each (R5, R7), and
  compare it with each application's required level. On refusal → **403**
  `{ error: 'ACCESS_DENIED', reason: 'none' | 'unverified', app }`, logged with the user id (FR-019).

Refusing before the route runs also covers the SSE stream: `POST /api/graph/generate` returns a plain
403 JSON before any `text/event-stream` header is sent.

The same building block, `requireAccess(policy)`, is exported for route-level use. The forthcoming
management routes will declare `requireAccess({ app: 'vng', level: 'manage' })` (FR-018, FR-018b).

**Rationale**: A single choke point means no route can forget the gate (FR-009). A soft session read
keeps "not signed in" (401) and "forbidden" (403) distinct, as the spec requires.

---

## R9 — Configuration shape and the "no silent opening" rule (FR-001, FR-003)

**Decision**: A new `access` block in `server/analytics.yml`, with one required key per application:

```yaml
access:
  explorer: ${EXPLORER_ACCESS_GATE}:none
  vng: ${VNG_ACCESS_GATE}:programmagroei/landelijkinnovatiemonitor
  govtech: ${GOVTECH_ACCESS_GATE}:none
  # optional fallbacks for the "no access" page when the start-up probe cannot reach Alkemio
  vng_display_name: ${VNG_ACCESS_GATE_NAME}:Landelijk Innovatie Monitor
```

Each value is either the literal `none` (explicitly ungated), a path of 1–3 nameIDs
(`space[/subspace[/subsubspace]]`), or a full Alkemio Space URL. For a URL, the `challenges` /
`opportunities` segments are dropped. A missing or empty key, or an unparseable value, **fails
start-up** with a message naming the key. At boot each application's status is logged
(`gated by programmagroei/landelijkinnovatiemonitor (read)` / `UNGATED (explicit)`).

**Rationale**: The checked-in defaults are the production policy, so leaving an env var unset falls
back to the safe value rather than to "open". Accepting the URL lets an operator paste exactly what
the spec names. Changing a gate is a configuration change plus a restart (SC-007).

---

## R10 — Frontend: where the "no access" state lives

**Decision**:
- `GET /api/auth/me` gains `access: AccessReport` for the listener's application (contract
  `contracts/api-access.md`). `POST /api/auth/access/recheck` implements "check again".
- The shared dashboard shell (`frontend/shared/src/dashboard/App.tsx`) and the Explorer root branch
  on `me.access.status` *before* rendering the app: `admitted` → app; `none` → `NoAccessScreen`;
  `unverified` → `AccessCheckFailedScreen`. Both are new shared components in
  `frontend/shared/src/access/`, use the existing tokens, and are localised through the dashboards'
  `react-i18next` bundles (nl/en) and the Explorer's existing strings.
- `apiFetch` and `graph-loader` treat **403 `ACCESS_DENIED`** like 401: a once-guarded signal
  (`signalAccessDenied`) makes the shell re-read `/api/auth/me` and switch screens, with no error
  toast and no sign-in loop (FR-015).

**Rationale**: The gate is decided by the time `/api/auth/me` answers, so the app never renders and
then retracts. The 403 path covers a held decision changed by "check again" in another tab, and a
reconfiguration.

---

## R11 — Testing strategy

- **Pure (Vitest, server)**: gate-reference parsing (path/URL/`none`/invalid), roles → level,
  `admits(policy, level)`, applications-for-request extraction. The pure module stands alone
  (FR-018c).
- **Service (Vitest, server)**: decision store (per session × app, gate-key mismatch ignored,
  cleared with session), the outcome classification table in R7 with a faked SDK, and the start-up
  probe outcomes.
- **HTTP (Vitest + supertest-style, server)**: a refused session gets 403 on `/api/vng/dashboard`
  through **both** the VNG and the Explorer apps. `/api/graph/generate` with no `app` is allowed on
  Explorer and refused on VNG. Exempt routes stay reachable. No session → 401, not 403.
- **Playwright**: `tests/vng-access-gate.spec.mjs` mocks `/api/auth/me` with `access.status: 'none'`
  and `'unverified'` and asserts the screens. It also checks that a 403 from a data route mid-session
  switches to the "no access" screen.
- **Manual (quickstart)**: real sign-in against an environment whose gate Space is private.
