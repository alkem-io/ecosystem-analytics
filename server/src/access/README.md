# Access gate (`server/src/access/`)

Feature 026. Use of an application is conditional on the signed-in person's **roles** on a
designated Alkemio Space, called the **gate**. **All** access logic lives in this
folder. Consumers declare a policy and never re-implement the rule (FR-018a). Spec,
plan and contracts are in `specs/026-space-access-gate/`.

## The model

| Term | Meaning |
|---|---|
| **Gate** (`GateRef`) | 1–3 nameIDs from an L0 Space down to the gate, e.g. `programmagroei/landelijkinnovatiemonitor` |
| **Level** (`AccessLevel`) | `none` < `read` < `manage`, from the person's `community.roleSet.myRoles` on the gate. `MEMBER` → read; `MEMBER`+`ADMIN` → manage; anything without `MEMBER` (incl. `ADMIN` or `LEAD` alone) → none |
| **Policy** (`AccessPolicy`) | what a consumer requires: `{ app, gate: null }` (ungated) or `{ app, gate, required: 'read' \| 'manage' }` |
| **Decision** | a person's level for one application, held for the life of their session (`access_decisions`) |

Files:

- `policy.ts`: pure. Gate parsing (path, URL or `none`), roles → level, `admits()`.
- `request-apps.ts`: pure. Which applications a request belongs to.
- `determine.ts`: one per-person check against Alkemio, with outcome classification.
- `probe.ts`: anonymous start-up probe (gate name and link, not-found error).
- `decision-store.ts`: held decisions (SQLite).
- `access-service.ts`: `decide()` / `report()`. The only entry point for consumers.
- `middleware.ts`: `accessGate` (application level) and `requireAccess()` (route level).
- `recheck-handler.ts`: `POST /api/auth/access/recheck` ("check again").

## Configuration

Every application must be declared in `server/analytics.yml` under `access:` as a gate
path, an Alkemio Space URL, or `none`. A missing or invalid value **stops start-up**;
nothing is ever ungated by accident. See `specs/026-space-access-gate/contracts/config-access.md`.

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

| Alkemio answers (with the person's token) | Outcome |
|---|---|
| roles | `none` / `read` / `manage` |
| gate null, or FORBIDDEN / NOT_FOUND, and the probe found the gate | `none` |
| the same, but the probe never confirmed the gate | `unverified` (operator error logged) |
| auth error (expired or invalid session) | session invalidated, 401 |
| network error, timeout (`check_timeout_ms`), 5xx | `unverified`: refused, fails closed |

Refusal is classified **before** the auth-error check. Alkemio refuses a non-member with
an error that must never be mistaken for an expired session, or a refused person would
be bounced round the sign-in loop.

## Gating something new

- **A new dashboard**: add its id to `APP_IDS` in `policy.ts`, declare `access.<app>`
  in `analytics.yml`, and create its listener with `createApp('<app>', …)`. Nothing else.
- **A stricter area**, such as the management area:
  `router.use(authMiddleware, requireAccess({ app: 'vng', required: 'manage' }))`. It
  uses the same gate, the same held decision, "check again" and the same 403 shape.

## Roles, not privileges

Alkemio grants the `READ` **privilege** on a public Space to everyone, so a privilege check
would admit every signed-in person while the gate is public. The production gate
`programmagroei` **is** public. A **role** (`MEMBER`, `ADMIN`) is
held only by the people actually given it, so the gate works whatever the Space's
visibility (research R4).
