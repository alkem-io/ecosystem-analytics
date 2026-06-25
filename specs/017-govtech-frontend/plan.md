# Implementation Plan: GovTech Netherlands Frontend

**Branch**: `017-govtech-frontend` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-govtech-frontend/spec.md`

## Summary

Add a **third** frontend ("GovTech frontend", for **GovTech Netherlands**) that is a near-clone of the existing VNG dashboard, runs alongside the Explorer and VNG SPAs against the **same BFF**, and shares the **same `ea_session`** authentication — but is its own application on its **own port** (`config.govtechPort`, default `port+2`) and its **own static-serving endpoint**, fronted by its own subdomain.

The work is deliberately **reuse-first, not a fork**. Because GovTech differs from VNG only by branding, default innovation hub, dashboard taxonomy (same as VNG to start, separately configurable), ports, and subdomain — and because its gemeente snapshot and GemeenteDelers data sources are **identical to VNG's** — the bulk of the effort is:

1. **Frontend — promote VNG's generic surface into `@ea/shared`** (pages, generic hooks, generic components, charts, selection context, dashboard export), parameterised by a small **per-app `AppConfig`** (app id, brand logo/tokens, i18n bundle, API namespace, storage-key/event prefixes). `frontend/vng` and the new `frontend/govtech` become thin wrappers that inject their own config. VNG behaviour/appearance is preserved (a refactor, not a rewrite — FR-051).
2. **Backend — make the per-dashboard capability app-profile aware.** The Alkemio connection, OIDC client, and session/auth config stay a **single shared** configuration (one BFF). Only the per-dashboard profile (default hub, taxonomy, GD space, GD cache TTL) becomes a **keyed registry** with **independent env vars per app** — VNG keeps `VNG_*`/the `vng:` block; GovTech gets its own `GOVTECH_*`/`govtech:` block. The VNG-namespaced routes generalise to `/api/:app/*`, with `/api/vng/*` preserved.
3. **Serving + config** — a third `createApp('../frontend-govtech/dist')` listener on `config.govtechPort`, the GovTech dev/prod origin appended to the shared `session.allowed_origins`, a third dev script + workspace member, and the Dockerfile copying/EXPOSE-ing the new build.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM), Node 24 (server), React 19 (frontends)
**Primary Dependencies**: Server — Express 5, `openid-client` v6, `graphql-request` + codegen SDK, `better-sqlite3`. Frontend(s) — React 19, Vite 7, react-router 7, D3 v7 (graph/map), Radix UI + Tailwind v4 + CVA/clsx/tailwind-merge + lucide-react, `recharts` (charts), `i18next` + `react-i18next` (localisation). **No new dependencies** — GovTech reuses VNG's exact stack via `@ea/shared`.
**Storage**: Existing SQLite cache (`better-sqlite3`, WAL). **No schema change.** GovTech reuses `cache_entries (user_id, space_id)` and the shared per-user GD-layer entry (`space_id = "__gd_initiatives__"`) — because GovTech reads the **same** `gemeentedelers` space as VNG, it hits the same cache rows.
**Testing**: Vitest (server + each frontend); Playwright visual regression (root). New unit tests for app-profile config resolution and app-aware routing; new visual snapshots for the GovTech app; existing VNG snapshots/tests act as the regression guard for the promote-to-shared refactor.
**Target Platform**: Linux server container; modern browsers. Three frontends served as sibling subdomains in production; three dev servers locally (Explorer :5173, VNG :5174, GovTech :5175).
**Project Type**: Web application — one BFF + three SPA frontends sharing code via a pnpm workspace.
**Performance Goals**: First GovTech load (default hub ≤30 spaces) graph+map ≤5s (SC-003); hub switch / selection change ≤3–5s (SC-004/005); org→connected-spaces reveal <1s (SC-012). GD layer fetch amortised by the shared ~1-week cache.
**Constraints**: Frontend talks only to BFF (Principle III); typed SDK only (Principle II); per-user/per-space cache scoping, no token logging (Principle IV); graceful degradation (Principle V); Netherlands-only maps (Principle VII) inherited unchanged. Adding GovTech MUST NOT change Explorer/VNG behaviour, addresses, or default config (FR-051). GovTech env vars are independent of VNG's; Alkemio/OIDC/session config stays shared.
**Scale/Scope**: One new SPA (3 tabs) that is mostly thin wrappers over promoted shared code; ~0 new GraphQL queries (reuses VNG's); server changes are a config-registry generalisation + `/api/:app/*` routing + a third listener. ~342 gemeente orgs / ~305 GD initiatives are the **same shared corpus** as VNG.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Alkemio OIDC auth (PKCE via BFF)** | ✅ Pass | GovTech reuses the existing `ea_session` flow; no new auth UI, no credentials. Auth/OIDC/Alkemio config is **shared** (single BFF). Cookie stays parent-domain scoped; GovTech origin appended to `session.allowed_origins`. Browser still holds only the opaque session cookie. |
| **II. Typed GraphQL contract** | ✅ Pass | No new queries — GovTech reuses VNG's hub/GD/graph queries via the codegen SDK. No raw query strings introduced. |
| **III. BFF boundary** | ✅ Pass | GovTech frontend calls only the BFF (`/api/*`, `credentials: 'include'`). Hub listing, GD callouts, dashboard counts, gemeente identity all resolved server-side, app-profile aware. |
| **IV. Data sensitivity** | ✅ Pass | GD-layer cache stays **per-user** (shared rows, longer TTL); access verified at read time. GovTech adds no new data sources — same snapshot registry (public reference data) and same `gemeentedelers` space as VNG. Parameterised SQL unchanged. |
| **V. Graceful degradation** | ✅ Pass | All VNG fallbacks (empty hub, unreadable GD space, unresolved tags, missing translations/category data) are inherited via the promoted shared code (FR-020/027/050, edge cases). |
| **VI. Design fidelity** | ✅ Pass | Per clarification, GovTech reuses the **existing Alkemio branding and design tokens** (shared via `@ea/shared`), labelled "GovTech Nederland"/"GovTech Netherlands" in text. Brand-token overrides are scoped to the GovTech app only (its `styles/index.css`), leaving Explorer and VNG visually unchanged. A GovTech-specific visual identity is deferred. |
| **VII. Netherlands-only map (HARD)** | ✅ Pass | GovTech's maps (GraphTab network map + initiative-details map) reuse the same shared `ForceGraph`/`InitiativeMap` clipped to the Netherlands boundary, gated to `mapRegion==='netherlands'`. The hard requirement is inherited unchanged; it is a regression if anything outside the Netherlands appears (FR-019). §VII was generalised (constitution v4.3.0) from "VNG Map Scope" to "Dutch-Dashboard Map Scope" so it now formally binds GovTech too. |

**Gate result**: PASS (no unjustified violations).

## Project Structure

### Documentation (this feature)

```text
specs/017-govtech-frontend/
├── plan.md              # This file
├── spec.md              # Feature spec (with Clarifications)
├── research.md          # Phase 0 — decisions & rationale (sharing strategy, env split, routing)
├── data-model.md        # Phase 1 — AppConfig (frontend) + DashboardAppConfig registry (server) schemas
├── quickstart.md        # Phase 1 — run three frontends, add the GovTech profile, env vars
├── contracts/           # Phase 1 — app-aware BFF endpoint & config contracts
│   ├── api-app-aware-routes.md   # /api/:app/dashboard, /api/:app/initiatives, /api/hubs?app=
│   ├── config-dashboard-registry.md  # shared vs per-app config split + env var map
│   └── frontend-app-config.md    # the per-app AppConfig object the shared shell consumes
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

The pnpm workspace gains a fourth member (`frontend/govtech`). The generic surface of the VNG app is **promoted** into `frontend/shared` so both Dutch dashboards consume it; per-app wrappers carry only branding/config.

```text
pnpm-workspace.yaml            # EXT — add `frontend/govtech` to packages

server/                        # BFF (existing) — additive + a config generalisation
├── analytics.yml              # EXT — keep shared blocks (alkemio/oidc/session/…); keep `vng:`;
│                              #        ADD a sibling `govtech:` block (own GOVTECH_* env vars)
├── src/
│   ├── config.ts              # EXT — promote `vng:`→ a keyed `dashboards: Record<appId, DashboardAppConfig>`
│   │                          #        registry (VNG + GovTech), parsed from per-app YAML/env;
│   │                          #        add `govtechPort` (GOVTECH_FRONTEND_PORT || port+2).
│   │                          #        Shared alkemio/oidc/session config UNCHANGED.
│   ├── index.ts               # EXT — third createApp('../frontend-govtech/dist') on config.govtechPort
│   ├── routes/
│   │   ├── hubs.ts            # EXT — GET /api/hubs?app=<id> resolves that app's default hub
│   │   ├── dashboard.ts       # NEW (or vng.ts→generalised) — mounted at /api/:app/* ;
│   │   │                      #        resolves config.dashboards[app]; validates known app ids.
│   │   └── (vng.ts)           # /api/vng/* preserved (alias of the generalised router) for FR-051
│   └── services/              # UNCHANGED — hub-service, gd-initiatives-service, vng-dashboard-service,
│                              #   vng-registry now take the resolved DashboardAppConfig (taxonomy, GD space)
└── (data/vng snapshot)        # UNCHANGED — the SAME gemeente/theme snapshot serves both apps

frontend/
├── shared/                    # @ea/shared — GAINS the promoted generic surface
│   └── src/
│       ├── graph/ map/ ui/ services/ lib/ styles/   # existing
│       ├── app/               # NEW — the configurable dashboard shell + AppConfig context
│       │   ├── AppConfig.ts            # type + React context: { appId, brand, apiNamespace, storagePrefix }
│       │   ├── DashboardApp.tsx        # the 3-tab shell (promoted from vng/App.tsx), brand/config injected
│       │   ├── BrandingHeader.tsx      # accepts a Logo + i18n title (promoted, parameterised)
│       │   ├── LoadingScreen.tsx LoginScreen.tsx  # accept Logo/title (promoted)
│       │   └── ErrorBoundary.tsx UserMenu.tsx LanguageSwitcher.tsx AboutDialog.tsx
│       ├── dashboard/         # NEW — promoted generic dashboard surface
│       │   ├── pages/{GraphTab,SpaceDetailsTab,DashboardTab}.tsx
│       │   ├── components/{HubSelector,SpacePicker,SelectedSpacesPanel,GemeenteToggle,
│       │   │   InitiativesToggle,GdProvenanceNote,InitiativeMap,InitiativeGemeentesPanel,
│       │   │   MapToggle,GraphMetricsBar,AuthorizationWarning}.tsx
│       │   ├── charts/{CategoryBarChart,NdsChart,Vng2030Chart,GemeenteDistributionChart}.tsx
│       │   ├── hooks/{useHubs,useSelectedSpaces,useVngGraph,useDashboard,useGdInitiatives,
│       │   │   useGraphProgress}.ts   # storage keys/events/API namespace from AppConfig
│       │   ├── context/SelectionContext.tsx
│       │   └── export/exportDashboard.ts   # app title/filename from AppConfig
│       └── index.ts           # EXT — export the app/dashboard surface + AppConfig
├── ecosystem-analytics/       # UNCHANGED — the Explorer
├── vng/                       # SLIMMED — thin wrapper: VngLogo, vng i18n bundle, vng tokens,
│   └── src/                   #   AppConfig{appId:'vng'}, main.tsx → <DashboardApp config={vng}/>
│       ├── main.tsx App.tsx           # App.tsx → mounts shared DashboardApp with vng AppConfig
│       ├── VngLogo.tsx styles/index.css   # branding only
│       └── i18n/{index.ts,nl.json,en.json}  # vng strings, storage key vng_lang
└── govtech/                   # NEW — mirror of the slimmed vng wrapper
    └── src/
        ├── main.tsx App.tsx           # mounts shared DashboardApp with govtech AppConfig
        ├── GovtechLogo.tsx            # GovTech logo SVG (own colours/wordmark)
        ├── styles/index.css           # GovTech brand-token overrides (scoped to this app)
        ├── appConfig.ts               # { appId:'govtech', apiNamespace:'govtech', storagePrefix:'govtech',
        │                              #    Logo: GovtechLogo, brand tokens }
        └── i18n/{index.ts,nl.json,en.json}  # GovTech strings (app.title/subtitle differ); storage key govtech_lang
    ├── vite.config.ts         # port 5175, [vite:govtech] prefix, same /api proxy → :4100
    ├── package.json           # name ecosystem-analytics-govtech; deps mirror vng (all via @ea/shared)
    ├── index.html tsconfig*.json tailwind/postcss
```

**Structure Decision**: **Promote-and-wrap**, not copy-and-fork. The VNG app's generic surface (~70% per the shareability audit) moves into `@ea/shared` under `app/` + `dashboard/`, parameterised by a per-app **`AppConfig`** (app id → API namespace, storage-key/event prefix, brand logo, brand tokens, i18n bundle). Both `frontend/vng` and the new `frontend/govtech` become thin wrappers supplying their own `AppConfig` and branding. This honours FR-007 ("reuse rather than duplicate") and the user's explicit "share what can be shared" directive, keeps a single source of truth for the dashboard behaviour, and — because it is a structural refactor that preserves VNG's rendered output — keeps VNG unchanged (FR-051), verified by VNG's existing visual snapshots.

On the server, the **single BFF** keeps **one shared** `alkemio`/`oidc`/`session`/`cache`/`limits` configuration (auth + which Alkemio environment is shared, as required for cross-frontend SSO). Only the per-dashboard profile is split into an app-keyed `dashboards` registry with **independent env vars** (`VNG_*` vs `GOVTECH_*`); the VNG-namespaced routes generalise to `/api/:app/*` with `/api/vng/*` preserved.

## Complexity Tracking

| Violation / Deviation | Why Needed | Simpler Alternative Rejected Because |
|-----------------------|------------|-------------------------------------|
| Promote VNG's generic surface into `@ea/shared` (refactor touching the working VNG app) | Two Dutch dashboards must share one behaviour source; the user explicitly asked to share what can be shared (FR-007) | Copy `frontend/vng` → `frontend/govtech` forks ~70% of the code, doubles every future fix, and drifts the two dashboards apart |
| Fourth workspace package (`frontend/govtech`) + third server listener/port | GovTech is a separate frontend on its own port + endpoint (the core requirement) | A single app with a runtime "mode" flag couldn't give a distinct port/endpoint/subdomain and would entangle the two deployments |
| Generalise `vng:` config → app-keyed `dashboards` registry with per-app env vars | GovTech needs its own default hub + taxonomy with **separate** env vars, without disturbing VNG | A shared config block would force VNG and GovTech to the same default hub/taxonomy; reusing `VNG_*` env vars for GovTech violates the "separate, not shared" directive |
| `/api/:app/*` routing with `/api/vng/*` preserved | Per-app dashboard/initiatives must resolve the correct profile while keeping VNG's calls working (FR-051) | Hard-coding a parallel `/api/govtech/*` copy duplicates the route layer; dropping `/api/vng/*` breaks the shipped VNG app |

## Phase notes

- **Phase 0 (research.md)**: resolves the promote-vs-fork decision and the exact promotion boundary; the shared-vs-per-app **config/env split** (Alkemio/OIDC/session shared; default-hub/taxonomy/port per app with independent env vars); the app-aware routing approach (`/api/:app/*` + `?app=` on `/api/hubs`); the `AppConfig` parameterisation of storage keys/events/API namespace/branding; the third-port/origin/Docker serving wiring; and confirmation that GovTech ships VNG's taxonomy + same GD/gemeente corpus (so no new queries/snapshot).
- **Phase 1 (data-model.md, contracts/, quickstart.md)**: the frontend `AppConfig` shape and the server `DashboardAppConfig` registry schema; the app-aware endpoint contracts; the env-var map (shared vs `VNG_*` vs `GOVTECH_*`); and dev/run/add-a-profile instructions for three frontends.
- **Phase 2 (/speckit.tasks)**: NOT produced here.
```
