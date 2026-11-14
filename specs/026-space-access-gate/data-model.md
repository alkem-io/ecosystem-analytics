# Data Model: Space-Based Access Gate

**Feature**: 026-space-access-gate · **Date**: 2026-11-13

All types below live in the new reusable module `server/src/access/` and are re-exported through
`server/src/types/access.ts`, so the frontends can import them via `@server/types/access.js`.

## AppId

`'explorer' | 'vng' | 'govtech'`. This extends the existing `DashboardAppId` (`'vng' | 'govtech'`)
with the Explorer. A new dashboard adds one member here and one `access.<app>` config key.

## GateRef — *Gate Space* in the spec

| Field | Type | Notes |
|---|---|---|
| `path` | `string[]` (length 1–3) | nameIDs from the L0 Space down to the gate, e.g. `['programmagroei','landelijkinnovatiemonitor']` |
| `key` | `string` | `path.join('/')`. Stored with each decision so a reconfiguration invalidates held decisions |

Parsed from `access.<app>` (R9): the literal `none` → no GateRef; a path or Alkemio URL → GateRef;
anything else → start-up failure.

## GateInfo — what the "no access" page shows

| Field | Type | Source |
|---|---|---|
| `displayName` | `string` | anonymous start-up probe → `access.<app>_display_name` → last nameID |
| `url` | `string` | probe → `alkemioServerUrl` + derived path |
| `exists` | `'yes' \| 'no' \| 'unknown'` | probe result. `'no'` makes every check `unverified` (R7) |

Held in memory per process and refreshed by a background retry while `exists === 'unknown'`. This
is configuration-derived and not user data.

## AccessLevel

`'none' | 'read' | 'manage'`, ordered `none < read < manage`.

| Roles on the gate Space (`community.roleSet.myRoles`) | Level |
|---|---|
| no `MEMBER` (with or without `ADMIN`, `LEAD`, …) | `none` |
| `MEMBER`, no `ADMIN` | `read` |
| `MEMBER` and `ADMIN` | `manage` |

Roles, not privileges (research R4): READ on a public Space is granted to everyone.

## AccessPolicy — what a consumer declares (FR-018a)

```ts
type AccessPolicy =
  | { app: AppId; gate: null }                                     // explicitly ungated
  | { app: AppId; gate: GateRef; required: 'read' | 'manage' };    // gated
```

Each application's base policy comes from config with `required: 'read'`. A route can declare a
stricter one, for example the future management area with `required: 'manage'`. For an ungated
policy, every signed-in person is admitted.

`admits(policy, level)`: if `policy.gate === null`, return true. Otherwise return
`rank(level) >= rank(policy.required)`.

## AccessDecision — persisted (table `access_decisions`)

| Column | Type | Constraint / meaning |
|---|---|---|
| `session_id` | TEXT | part of the PK. The owning EA session (`oidc_sessions.session_id`) |
| `app_id` | TEXT | part of the PK. One decision per application per session (FR-003a) |
| `gate_key` | TEXT NOT NULL | the `GateRef.key` it was decided against. A row whose key ≠ the current config is ignored |
| `level` | TEXT NOT NULL | `'none' \| 'read' \| 'manage'`. **Never** `'unverified'` (FR-006) |
| `decided_at` | INTEGER NOT NULL | epoch ms, for logs and diagnostics |

PRIMARY KEY `(session_id, app_id)`. Rows are written with parameterised `INSERT … ON CONFLICT DO
UPDATE` (Constitution IV).

**Lifecycle**

```text
               first gated request / GET /api/auth/me
 (no row) ───────────────────────────────────────────▶ determine()
                                                         │
                ┌────────── unverified ──────────────────┤ (nothing written; retried next request)
                │                                        │
                ▼                                        ▼ none | read | manage
        403 unverified / AccessCheckFailedScreen     row written ── held for session ──┐
                                                         ▲                             │
                                       POST /api/auth/access/recheck (re-determine,    │
                                       replace row)                                    │
                                                                                       ▼
                                   sign-out · session expiry · idle purge ──▶ row deleted
```

Deletion goes through `destroySession()` and through `purgeExpired()`, which also removes rows whose
`session_id` is no longer in `oidc_sessions`.

## AccessReport — returned to the frontend

| Field | Type | Meaning |
|---|---|---|
| `app` | `AppId` | the listener's application |
| `status` | `'admitted' \| 'none' \| 'unverified'` | what the shell renders |
| `level` | `AccessLevel \| null` | `null` when `unverified`. `'read'` for ungated apps |
| `gated` | `boolean` | whether this application has a gate |
| `gate` | `{ displayName: string; url: string } \| null` | for the "no access" page. `null` when ungated |

The "check again" and refusal contracts are in `contracts/api-access.md`.

## Configuration (`server/analytics.yml` → `ServerConfig.access`)

```ts
interface AccessConfig {
  apps: Record<AppId, { gate: GateRef | null; displayNameFallback?: string }>;
  checkTimeoutMs: number; // 5000
}
```

Validation at load (R9): every `AppId` present, every value `none` or parseable, otherwise throw.
