# Implementation Plan: VNG Guest Access

**Branch**: `023-vng-guest-access` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-vng-guest-access/spec.md`

## Summary

Open the VNG dashboard to visitors without an Alkemio account, and make the shared dashboard shell
degrade cleanly when data requests fail. The BFF gains a stateless **guest principal**: a host-only,
session-scoped `ea_guest` cookie (set by `POST /api/auth/guest`, admitted only for dashboards with
`guestAccess: true` — VNG) lets guest-eligible routes run the existing typed GraphQL queries **with
no bearer token**, so Alkemio's own anonymous authorization decides what is visible. Verified live:
hubs, the full GemeenteDelers corpus, gemeente locations and classifications are public; in the VNG
hub 3 of 23 spaces are fully readable and 20 are `READ_ABOUT`-only — which today's acquisition
silently drops, so privacy-aware loading (feature 011) is extended from subspaces to top-level
spaces, benefiting members too. The frontend gets an explicit auth state (member / guest /
anonymous), a guest option + warning on the login screen, a persistent guest notice with sign-in
return-to, and one error taxonomy + one `DataAreaFailure` component with per-area Retry, structured
per-space failures, a slow-request Cancel, and a consolidated "service unavailable" banner —
applied to the shared shell so GovTech gets the robustness without the guest door.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM); Node 24 (server), React 19 (frontends)
**Primary Dependencies**: Server — Express 5, `cookie-parser`, `graphql-request` + codegen SDK,
`better-sqlite3`. Frontend — React 19, Vite 7, `react-i18next`, Radix UI + Tailwind v4, lucide-react.
**No new dependencies** (the guest rate limiter is a ~30-line in-process token bucket; see R7).
**Storage**: Existing SQLite cache. **No schema change** — guest rows reuse
`cache_entries (user_id, space_id)` with `user_id = '__guest__'`; no session row for guests.
**Testing**: Vitest (server + `frontend/vng`), Playwright 1.58 (`tests/*.spec.mjs`, route-mocked).
**Target Platform**: Linux container (one BFF, three SPAs on :4000/:4001/:4002), modern browsers.
**Project Type**: Web application (BFF + multiple SPAs sharing `@ea/shared`).
**Performance Goals**: Guest first paint of a populated dashboard < 10 s from the login screen
(SC-001, warm cache); N concurrent guests on the same public selection → one upstream build (SC-010,
via the existing in-flight memo + shared cache principal).
**Constraints**: Guest requests carry **no** token, ever; `ea_guest` must never reach Explorer/GovTech
origins (host-only cookie); member behaviour on the happy path is byte-for-byte unchanged (SC-009);
no page-level horizontal scroll with the new notices (existing `mobile-navigation.spec.mjs`);
constitution VII (NL-only maps) untouched — no map code changes.
**Scale/Scope**: 1 new query (`spaceAboutByName`), 3 new auth endpoints, 1 middleware, 1 error
classifier, ~6 touched routes/services on the server; on the frontend 1 context, 1 hook, 3
components (guest notice, failure card, banner), 5 hooks gaining `reload`/typed errors, login screen
+ user menu changes, i18n (nl/en), 1 Playwright spec, unit tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Alkemio OIDC auth (Code + PKCE via BFF) | ✅ with documented deviation | Member sign-in flow untouched. Guests do **not** authenticate at all and receive **no** token — nothing new reaches the browser but an opaque `ea_guest` cookie. Deviation: a class of requests without a session (see Complexity Tracking, R10). |
| II. Typed GraphQL contract | ✅ | One new `.graphql` (`spaceAboutByName`), codegen re-run and committed. Guest SDK is the same `getSdk(client)` with a token-less client. No raw query strings. |
| III. BFF boundary | ✅ | Guests still talk only to the BFF; the BFF still makes every Alkemio call. |
| IV. Data sensitivity | ✅ with documented deviation | Member cache scoping unchanged. Guest data is cached under the sentinel principal `__guest__` — identical for every guest by construction (no token, no identity), so no cross-*user* leakage is possible; a member never reads `__guest__` rows and vice versa (read-time owner check unchanged). Deviation: "per-user" now includes one shared anonymous principal (R10). No tokens/cookies logged. |
| V. Graceful degradation | ✅ strengthened | The feature's second half *is* this principle: per-area failure containment, plain-language notices, Retry, restricted L0 spaces rendered rather than dropped. |
| VI. Design fidelity | ✅ | New UI reuses `AuthorizationWarning`'s shell, existing button/card tokens, `lg` collapse rule. |
| VII. NL-only maps | ✅ | No map code touched; `nl-only` specs remain the guard. |
| Security Requirements — "BFF MUST resolve a valid session for every protected request" | ⚠️ deviation | Guest-eligible routes accept a validated guest cookie **instead of** a session, only for apps with `guestAccess: true`, only for Alkemio-public content, never for member-only capabilities (`/api/spaces`, `/api/query`, cache clear, `forceRefresh`). Recommend MINOR amendment via `/speckit.constitution` (R10). |
| Security Requirements — `max_spaces_per_query` server-side | ✅ | Enforced unchanged; plus guest per-IP rate limit. |
| Dev workflow — `tsc --noEmit` on all packages, pnpm, codegen committed | ✅ | The `AuthContext` union is deliberately used as the compile-time checklist for token-touching call sites. |

**Gate result (pre-research)**: PASS with two documented deviations that share one root cause (a
session-less guest principal). Neither weakens token handling, browser exposure, or member isolation.
**Gate result (post-design)**: PASS — design (R2/R3/R7) confines the deviation to a host-only cookie,
an explicit route allow-list, and a single shared cache principal.

## Project Structure

### Documentation (this feature)

```text
specs/023-vng-guest-access/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0 — live anonymous-GraphQL findings + decisions R1–R10
├── data-model.md        # Phase 1 — AuthContext union, cookie, config, spaceFailures, frontend state
├── quickstart.md        # Phase 1 — run, manual guest path, failure drills, tests, codegen
├── contracts/
│   ├── api-auth-guest.md            # POST/GET/DELETE /api/auth/guest, middleware contract
│   ├── api-error-codes.md           # stable error codes, GUEST_FORBIDDEN, ALKEMIO_UNREACHABLE, headers
│   └── ui-guest-and-failure-states.md  # login screen, notice, menu, failure states, Playwright asserts
├── checklists/requirements.md
└── tasks.md             # Phase 2 — /speckit.tasks (not created here)
```

### Source Code (repository root)

```text
server/
├── analytics.yml                          # + vng.guest_access, vng.guest_rate_limit_per_minute, govtech.guest_access
├── src/
│   ├── config.ts                          # DashboardAppConfig.guestAccess / guestRateLimitPerMinute
│   ├── auth/
│   │   ├── middleware.ts                  # AuthContext union, GUEST_USER_ID, guestAwareAuth, authMiddleware rejects guests
│   │   ├── guest.ts                       # NEW: ea_guest cookie options, set/clear, admission check
│   │   └── guest-rate-limit.ts            # NEW: in-process per-IP token bucket (guest only)
│   ├── routes/
│   │   ├── auth.ts                        # + POST/GET/DELETE /api/auth/guest
│   │   ├── meta.ts (or features)          # /api/features + guestAccess map
│   │   ├── hubs.ts, graph.ts, dashboard.ts, image-proxy.ts   # guestAwareAuth; guest branches; classifyUpstreamError
│   │   └── errors.ts                      # NEW: classifyUpstreamError → 503 ALKEMIO_UNREACHABLE | 403 GUEST_FORBIDDEN | route 502
│   ├── graphql/
│   │   ├── client.ts                      # createAlkemioSdk(auth): token-less client for kind 'guest'
│   │   ├── queries/spaceAboutByName.graphql   # NEW (about + membership.myPrivileges, no community)
│   │   └── generated/                     # regenerated
│   ├── services/
│   │   ├── acquire-service.ts             # L0 privilege probe → restricted L0 node | spaceFailures; skip activity for guests
│   │   ├── graph-service.ts               # spaceFailures assembly; memo skip on 'failed'; guest progress key
│   │   ├── hub-service.ts, gemeente-geo-service.ts, gd-initiatives-service.ts, vng-dashboard-service.ts  # accept union auth (no token access)
│   └── types/graph.ts                     # SpaceFailure, GraphDataset.spaceFailures
└── src/**/*.test.ts                       # middleware.guest, guest-rate-limit, acquire L0 probe, graph-memo skip, errors.classify

frontend/shared/src/
├── app/AppConfig.tsx                      # guestAccess?: boolean
├── services/
│   ├── api.ts                             # ApiFailure classes; mode-aware 401; X-EA-Client-Id
│   └── auth.ts                            # enterGuest(), fetchGuest(), leaveGuest()
├── dashboard/
│   ├── App.tsx                            # AuthProvider gate (member|guest|anonymous), ?tab= restore, banner slot, focus re-check
│   ├── hooks/
│   │   ├── AuthContext.tsx                # NEW: AuthState + useAuth
│   │   ├── useDataArea.ts                 # NEW: loading/slow/cancel/ready/failed + retry registration
│   │   ├── UpstreamStatusContext.tsx      # NEW: unavailable + retryAll
│   │   ├── useHubs.ts, useVngGraph.ts, useDashboard.ts, useGdInitiatives.ts, useGemeenteLocations.ts  # typed errors + reload via useDataArea
│   ├── components/
│   │   ├── LoginScreen.tsx                # guest option + warning (gated)
│   │   ├── GuestNotice.tsx                # NEW
│   │   ├── DataAreaFailure.tsx            # NEW
│   │   ├── UnavailableBanner.tsx          # NEW
│   │   ├── UserMenu.tsx                   # guest variant
│   │   └── AuthorizationWarning.tsx       # unchanged; swapped for GuestNotice in guest mode
│   └── pages/*Tab.tsx                     # replace `{error}` strings with <DataAreaFailure/>; partial-failure line; nothing-public empty state
frontend/vng/src/
├── appConfig.ts                           # guestAccess: true
└── i18n/{nl,en}.json                      # login.guest*, guest.*, failure.*
frontend/govtech/                          # NO change (guestAccess absent → false)

tests/
└── vng-guest-access.spec.mjs              # NEW Playwright spec (contract: ui-guest-and-failure-states.md)
```

**Structure Decision**: Web application, existing layout. All guest logic lives in the BFF auth
layer plus the shared dashboard shell; the VNG package changes are one config flag and i18n strings.
GovTech and the Explorer are untouched by construction (no `ea_guest` on their hosts, `guestAccess`
unset, `authMiddleware` unchanged on their routers).

## Phase 0 — Research (complete → `research.md`)

Resolved: R1 anonymous GraphQL capabilities (live-verified matrix); R2 guest signalling (host-only
session cookie); R3 auth-context union + route allow-list + refusal codes; R4 L0 restricted spaces
(privilege probe, the 20/23 finding); R5 structured `spaceFailures` + memo skip; R6 frontend error
taxonomy, slow/cancel, consolidation; R7 load bounding (shared principal, memo, rate limit, no
`forceRefresh`); R8 guest progress key; R9 return-to tab; R10 constitution alignment.
No `NEEDS CLARIFICATION` remains.

## Phase 1 — Design (complete)

- `data-model.md`: `AuthContext` union, `ea_guest` cookie attributes, config keys, cache principal,
  `SpaceFailure`, progress key, frontend `AuthState` transitions, `ApiFailure` classes,
  `DataAreaState`, `UpstreamStatus`, guest notice, persisted client state, i18n keys.
- `contracts/`: guest endpoints + middleware contract; error envelope + stable codes + headers +
  dataset partial-failure fields; UI state contract with the Playwright assertion list.
- `quickstart.md`: run, manual guest walk-through, curl verification of upstream behaviour, failure
  drills, test commands, codegen step.
- Agent context: `.specify/scripts/bash/update-agent-context.sh claude` run (see report).

### Implementation order (input to `/speckit.tasks`)

1. **Server foundation** — config flags; `AuthContext` union + `GUEST_USER_ID`; `guest.ts` cookie
   helpers; `guestAwareAuth`; `authMiddleware` guest rejection; `createAlkemioSdk` guest branch;
   `routes/errors.ts` classifier; `/api/auth/guest` endpoints; `/api/features.guestAccess`.
   Fix every compile error the union produces (services must not touch `auth.session` on the guest
   arm). Unit tests: middleware precedence, cookie attributes (host-only, no expiry), classifier.
2. **Guest-eligible routes** — apply `guestAwareAuth` to hubs/graph/dashboard/image-proxy; guest
   branches (`forceRefresh` ignored, cache clear 403, token-less image fetch, progress key via
   `X-EA-Client-Id`); rate limiter. Tests: route gating, 403 vs 401 mapping, rate limit 429.
3. **Acquisition** — `spaceAboutByName.graphql` + codegen; L0 privilege probe → restricted L0
   node / `spaceFailures`; skip activity for guests (`activity_unavailable`); `GraphDataset.spaceFailures`;
   memo skip on `failed`. Tests with mocked SDK: READ / READ_ABOUT / none / throw paths; memo skip.
4. **Frontend transport + state** — `api.ts` error classes + mode-aware 401 + client id;
   `auth.ts` guest calls; `AuthContext` + `App.tsx` gate (member/guest/anonymous, focus re-check,
   `?tab=` restore); `AppConfig.guestAccess`; VNG `appConfig` + i18n. Unit tests for the taxonomy
   and transitions.
5. **Guest UI** — `LoginScreen` guest option + warning (double-gated); `GuestNotice` replacing
   `AuthorizationWarning`; `UserMenu` guest variant.
6. **Failure containment** — `useDataArea`, `UpstreamStatusContext`, `DataAreaFailure`,
   `UnavailableBanner`; migrate the five hooks (`reload`, typed `error`); replace every
   `{t('states.error')}: {error}` in the tabs; partial-failure line from `spaceFailures`;
   "nothing public" empty state; slow/cancel.
7. **E2E + regression** — `tests/vng-guest-access.spec.mjs` (7 assertions in the UI contract);
   run `mobile-navigation`, `vng-funnel`, `*-nl-only` specs unchanged; `tsc --noEmit` everywhere.
8. **Governance** — propose constitution MINOR amendment (guest principal) via `/speckit.constitution`;
   update CLAUDE.md architecture note (one paragraph: guest access pattern).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Requests served **without a server-side session** (Security Req. "resolve a valid session for every protected request"; Principle I) | The feature's purpose is anonymous exploration; a guest has no Alkemio identity to hold a session for | A service-account token for guests would hand guests a BFF-defined view (not Alkemio's public view), add a long-lived credential, and still bypass the per-user session rule; a fake per-guest session row stores nothing and needs cleanup |
| A **shared cache principal** `__guest__` (Principle IV "per-user") | All guests are, by construction, the same anonymous identity to Alkemio; sharing is what bounds upstream load (FR-027, SC-010) | Per-guest cache keys (random id) would multiply upstream retrieval by the number of guests and still isolate nothing extra — every guest's data is identical |
| `AuthContext` becomes a **discriminated union** touching many call sites | Only way to make "guest code never reaches a token" a compile-time property rather than a runtime hope | Optional `session?` field would silently pass `undefined` into `ensureFreshAccessToken` at runtime |
