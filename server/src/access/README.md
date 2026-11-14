# Access gate (`server/src/access/`)

Features 026 and 027. Use of an application is conditional on the signed-in person's
**roles** on designated Alkemio Spaces: the application's **viewer Spaces** and, optionally,
its **admin Spaces**. **All** access logic lives in this folder. Consumers declare a policy
and never re-implement the rule (FR-018a). Specs, plans and contracts are in
`specs/026-space-access-gate/` and `specs/027-vng-admin-area/`.

## The model

| Term | Meaning |
|---|---|
| **Gate Space** (`GateRef`) | 1–3 nameIDs from an L0 Space down, e.g. `programmagroei/landelijkinnovatiemonitor` |
| **Sets** (`AccessSets`) | `viewers` (non-empty) and `admins` (may be empty) per application, plus `setKey` = `v:<sorted viewer keys>\|a:<sorted admin keys>` |
| **Level** (`AccessLevel`) | `none` < `read` < `manage`, from the person's `community.roleSet.myRoles` per Space (`levelFromSets`): `ADMIN` on any admin Space → manage (even without `MEMBER`); else `MEMBER` on any viewer Space → read; else none. `LEAD` never admits, nor does `ADMIN` on a viewer-only Space |
| **Policy** (`AccessPolicy`) | what a consumer requires: `{ app, gate: null }` (ungated) or `{ app, gate: AccessSets, required: 'read' \| 'manage' }` |
| **Decision** | a person's level for one application, held for the life of their session under `gate_key = setKey` (`access_decisions`) |

Files:

- `policy.ts`: pure. Gate parsing (path, URL, list or `none`), `levelFromSets`, `setKey`, `admits()`.
- `request-apps.ts`: pure. Which applications a request belongs to.
- `determine.ts`: the per-person check — one role query per **distinct** Space, in parallel, combined.
- `probe.ts`: anonymous start-up probe per Space key (name and link, not-found error).
- `decision-store.ts`: held decisions (SQLite).
- `access-service.ts`: `decide()` / `report()`. The only entry point for consumers.
- `middleware.ts`: `accessGate` (application level) and `requireAccess()` (route level).
- `recheck-handler.ts`: `POST /api/auth/access/recheck` ("check again").
- `public-spaces-handler.ts`: `GET /api/auth/access/spaces` — **public**: the listener app's
  viewer Spaces (never the admin Spaces) for the sign-in screen, from the probe registry.

## Configuration

Every application must be declared in `server/analytics.yml` under `access:` as its viewer
Space(s) — comma-separated paths or Alkemio Space URLs — or `none`. `access.<app>_admin`
optionally lists the admin Spaces (empty: nobody can manage). `<app>_display_name` names the
first viewer Space for the screens when the probe cannot, `<app>_display_names` the others by
position. Start-up **stops** on a missing or empty viewer value, an unparseable item, a Space
listed twice within a set, or an admin set on an app that is `none`; nothing is ever ungated
by accident. Production: `vng` viewers and admins are both `programmagroei`. See
`specs/027-vng-admin-area/contracts/api-access-sets.md`.

## Which application a request is for

The application whose **listener** served the request (`createApp(appId, …)`), plus any
application the request **names**: `/api/<app>/…`, `?app=` on `/api/hubs`, or
`body.app` on `/api/graph/*`. **Every** one of them must admit the person.

Every listener mounts every route, so the listener alone would let a refused person
reach `/api/vng/*` through the Explorer's port. The Explorer's own features name no
application, so they stay open to anyone the Explorer admits (FR-012a). In dev each SPA
proxies to its own listener (Explorer :4100, VNG :4101, GovTech :4102) so the gate
behaves as in production.

## When access is decided

Access is decided **once per session per application**, at first use, and held until
sign-out or session expiry (FR-006). "Check again" re-decides at once. **"Could not
verify" is never held**, so a temporary Alkemio failure never locks a member out for
their whole session.

Per Space (one query per distinct Space, in parallel, under `check_timeout_ms`):

| Alkemio answers (with the person's token) | Space outcome |
|---|---|
| roles | those roles |
| Space null, or FORBIDDEN / NOT_FOUND, and the probe found it | no roles |
| the same, but the probe never confirmed the Space | unverified (operator error logged) |
| auth error (expired or invalid session) | session invalidated, 401 |
| network error, timeout, 5xx | unverified |

Combined: any proven `MEMBER` on a viewer Space or `ADMIN` on an admin Space admits, at the
highest level proven (`read` while an admin Space is unverified stays `read`); every Space
answered with no admitting role is `none`; otherwise `unverified` — refused, fails closed.

Refusal is classified **before** the auth-error check. Alkemio refuses a non-member with
an error that must never be mistaken for an expired session, or a refused person would
be bounced round the sign-in loop.

## Gating something new

- **A new dashboard**: add its id to `APP_IDS` in `policy.ts`, declare `access.<app>`
  in `analytics.yml`, and create its listener with `createApp('<app>', …)`. Nothing else.
- **A stricter area**, such as the admin area (`server/src/admin/router.ts`):
  `router.use(authMiddleware, requireAccess({ app: 'vng', required: 'manage' }))`. It
  uses the same sets, the same held decision, "check again" and the same 403 shape. On an
  **ungated** app nobody passes `manage` (there are no admin Spaces).
- **Writes**: add `requireAccess({ …, fresh: true })`. It re-determines the level from
  Alkemio before the handler and replaces the held decision, so a manager whose `ADMIN`
  role was removed is refused at once (027 FR-009).

## Roles, not privileges

Alkemio grants the `READ` **privilege** on a public Space to everyone, so a privilege check
would admit every signed-in person while the gate is public. The production gate
`programmagroei` **is** public. A **role** (`MEMBER`, `ADMIN`) is
held only by the people actually given it, so the gate works whatever the Space's
visibility (research R4).
