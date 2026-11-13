# Implementation Plan: Space-Based Access Gate

**Branch**: `026-space-access-gate` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-space-access-gate/spec.md`

## Summary

Make use of an application conditional on the signed-in person's roles on a designated Alkemio
Space. Each application (Explorer, VNG, GovTech) declares an **Access Policy**: `none`, or a gate
Space plus a required level. In production only the VNG dashboard is gated, by
`programmagroei/landelijkinnovatiemonitor`, at **Read** (the Member role). **Manage** (Member + Admin) is determined
and reported now, for the forthcoming management area.

Approach:
- **Reusable module.** One new server module, `server/src/access/`, holds all of the logic: pure
  policy, roles → level, outcome classification, the per-session decision store, the start-up
  probe, and the middleware factory. Every consumer declares a policy and nothing more (FR-018a–c).
- **Which application a request is for.** A request belongs to the application whose listener served
  it **and** to any application it names (`/api/<app>/…`, `?app=`, `body.app`). This closes the
  route-sharing bypass across listeners.
- **Where the roles come from.** The person's roles come from
  `Space.community.roleSet.myRoles` through a new typed query. Roles, not privileges: the production
  gate subspace is public, and READ on a public Space is granted to everyone (research R4).
- **When access is decided.** The decision is made once per session per application and held in a
  new `access_decisions` table. "Check again" re-decides. A failed check fails closed and is never
  held.
- **Frontend.** The SPAs read `me.access` before rendering and show shared "no access" or "could
  not verify" screens. A 403 `ACCESS_DENIED` switches to the same screens mid-session.

**Revision (2026-11-13, research R4)**: the gate was first built on the READ/UPDATE privileges. The
production gate subspace is public, so READ admits everyone; on the product owner's decision the
gate now reads the person's **roles**. Only the two queries, `levelFromRoles` and the probe changed;
the policy model, store, middleware and UI were unaffected, as R4 predicted.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM); Node 24 (server), React 19 (frontends)

**Primary Dependencies**: Server: Express 5, `cookie-parser`, `graphql-request` + codegen SDK,
`better-sqlite3`. Frontend: React 19, Vite 7, `react-i18next`, Radix UI + Tailwind v4.
**No new dependencies.**

**Storage**: Existing SQLite (`better-sqlite3`, WAL). **One new table**, `access_decisions
(session_id, app_id, gate_key, level, decided_at)`. No change to `cache_entries` or
`oidc_sessions`, and no `CACHE_MAINTENANCE_VERSION` bump.

**Testing**: Vitest (server: pure, service and HTTP; `frontend/shared`: screens and the 403 signal),
Playwright (`tests/vng-access-gate.spec.mjs`, mocked BFF like the existing specs)

**Target Platform**: Linux container (one BFF serving three SPAs on :4000/:4001/:4002); dev on
:4100/:4101/:4102

**Project Type**: Web application (BFF + multiple SPAs, pnpm workspace)

**Performance Goals**: Sign-in for a member adds at most 1 s (SC-003). That is one Alkemio round trip
per session per gated application, with a 5 s timeout. Zero added Alkemio calls after the first
decision (SC-004).

**Constraints**: Fail closed (FR-007). No credentials or service account (Constitution I): the gate's
public name comes from an **anonymous** start-up probe. No token, cookie or session id is logged
(Constitution IV). 401 and 403 stay distinct.

**Scale/Scope**: About 3 applications. Decision rows number at most active sessions × applications.
About 6 server files and 3 frontend components are new; about 8 existing files change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Alkemio OIDC (Code + PKCE via BFF) | ✅ | The sign-in flow is unchanged. The per-person check uses the session's own access token server-side. The start-up probe is **anonymous**: no token, no user data, public profile fields only. No credential or service account is added. |
| II. Typed GraphQL contract | ✅ | New `src/graphql/queries/accessGate.graphql` (per person) and `accessGateProbe.graphql` (anonymous), then `pnpm run codegen`. No raw query strings. The anonymous probe uses the same `getSdk` with an unauthenticated client. |
| III. BFF boundary | ✅ | The SPAs learn their access only from `/api/auth/me` and `/api/auth/access/recheck`. All Alkemio calls stay in the BFF. |
| IV. Data sensitivity | ✅ | Decisions are keyed per session and per application, so they are never shared across users. SQL is parameterised. The gate runs **before** any cache read (FR-011). Refusal logs carry the user id and reason only. Decision rows are deleted with their session, in the shared SQLite store (replica-safe). |
| V. Graceful degradation | ✅ | "Could not verify" is a distinct, recoverable screen with a retry. The gate name falls back from the probe to config to the nameID. A 403 mid-session switches screens with no crash, toast or loop. |
| VI. Design fidelity | ✅ | The new screens use the existing tokens and the LoginScreen layout. Copy goes in each app's i18n bundles. |
| VII. NL-only maps | ✅ n/a | No map is touched. |
| Security reqs: session resolved per protected request; 401 + clean re-login | ✅ | Kept. The gate adds a **403** path only for sessions that resolve. A missing or expired session still 401s through the route's `authMiddleware`. |

No violations, so Complexity Tracking is empty.

**Post-design re-check (after Phase 1)**: ✅ The design above holds. The only Alkemio call outside a
user's token is the anonymous probe, which reads public profile fields that Alkemio serves to
anonymous visitors, so it is compatible with I and IV.

## Project Structure

### Documentation (this feature)

```text
specs/026-space-access-gate/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R11 decisions, incl. R4 (roles, not privileges)
├── data-model.md        # Phase 1: AppId, GateRef, GateInfo, AccessLevel, AccessPolicy, AccessDecision, AccessReport
├── quickstart.md        # Phase 1: release precondition + validation run
├── contracts/
│   ├── api-access.md    # /api/auth/me extension, /api/auth/access/recheck, 403 ACCESS_DENIED, bypass table
│   └── config-access.md # analytics.yml `access` block, accepted values, start-up behaviour
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
server/
├── analytics.yml                         # + `access:` block (contracts/config-access.md)
└── src/
    ├── access/                           # NEW — the single reusable access module (FR-018a)
    │   ├── policy.ts                     #   pure: AppId, GateRef parse (path|URL|none), level from roles, admits()
    │   ├── request-apps.ts               #   pure: apps a request belongs to (listener ∪ named)
    │   ├── determine.ts                  #   per-person Alkemio check → level | unverified (R3, R7)
    │   ├── probe.ts                      #   anonymous start-up probe → GateInfo, not-found error (R6, FR-020)
    │   ├── decision-store.ts             #   access_decisions get/put/clear (R5)
    │   ├── access-service.ts             #   decide(session, app, {force}) · report(session, app)
    │   ├── middleware.ts                 #   accessGate (app-level) + requireAccess(policy) (R8)
    │   └── *.test.ts
    ├── graphql/queries/
    │   ├── accessGate.graphql            # NEW: community.roleSet.myRoles down to L2
    │   └── accessGateProbe.graphql       # NEW: about.profile (anonymous)
    ├── graphql/client.ts                 # + createAnonymousAlkemioSdk()
    ├── config.ts                         # + AccessConfig parsing/validation (fail start-up, FR-003)
    ├── app.ts                            # createApp(appId, staticDir); stamp app; mount accessGate
    ├── index.ts                          # pass app ids; run probes; log gate status per app
    ├── auth/me.ts                        # + access report
    ├── routes/auth.ts                    # + POST /access/recheck
    ├── auth/session.ts, cache/db.ts      # + table; delete decisions with session; purge orphans
    └── types/access.ts                   # re-export for @server/types/access.js

frontend/
├── shared/src/
│   ├── access/                           # NEW
│   │   ├── NoAccessScreen.tsx
│   │   ├── AccessCheckFailedScreen.tsx
│   │   └── access-signal.ts              #   once-guarded signalAccessDenied() + subscribe
│   ├── services/auth.ts                  # MeResponse.access; recheckAccess()
│   ├── services/api.ts, graph-loader.ts  # 403 ACCESS_DENIED → signalAccessDenied()
│   └── dashboard/App.tsx                 # branch on me.access.status; listen for the signal
├── ecosystem-analytics/src/…             # Explorer root: same branch (gateable by config)
├── vng/  govtech/                        # vite proxy default → :4101 / :4102 (R2); i18n strings nl/en
tests/
└── vng-access-gate.spec.mjs              # NEW Playwright
```

**Structure Decision**: The existing BFF + pnpm multi-SPA layout is kept. All access logic lives in
`server/src/access/` and all access UI in `frontend/shared/src/access/`, so that a new dashboard,
or the management area, adds only a policy declaration (FR-018b).

## Complexity Tracking

No constitution violations to justify.
