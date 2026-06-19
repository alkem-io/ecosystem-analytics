# Implementation Plan: VNG Kenniscentrum Innovatie Frontend

**Branch**: `016-vng-frontend` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-vng-frontend/spec.md`

## Summary

Add a second, deliberately simpler frontend ("VNG frontend", for **VNG Kenniscentrum Innovatie**) that runs alongside the existing Explorer frontend, served as a sibling subdomain against the **same BFF** and sharing the **same `ea_session`** authentication. The VNG app has three tabs — **Graph** (network over the Netherlands map), **Space details**, **Dashboard** (recharts bar charts: counts by NDS category and VNG-2030 theme) — driven by a **selected-space set** = (active innovation hub's spaces) ∪ (direct additions) − removals.

The BFF gains additive, typed-SDK capabilities: **innovation-hub listing/resolution**, **gemeentedelers Knowledge-Base callout fetching** for the optional **"include GemeenteDelers initiatives"** layer, and **server-side category counting** for the dashboard. Because GD initiatives encode their gemeente/theme links **only as Callout tag strings**, the server resolves those tags against a **build-time snapshot registry** generated from the `vng-gemeente-delers` repo (municipality display-name → `gemeente-<name>` org nameID; theme label → theme node). The same snapshot identifies the ~342 gemeente organisations for the **show/hide gemeentes** toggle. Localisation (Dutch default + English) and configuration (default hub, gemeentedelers space nameID, tag→category mapping, long GD cache TTL) round out the work.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM), Node 24 (server), React 19 (frontends)
**Primary Dependencies**: Server — Express 5, `openid-client` v6, `graphql-request` + codegen SDK, `better-sqlite3`. Frontend(s) — React 19, Vite 7, react-router 7, D3 v7 (graph/map), Radix UI + Tailwind v4 + CVA/clsx/tailwind-merge + lucide-react (shadcn-style). **New**: `recharts` (dashboard charts, via shadcn `ui/chart.tsx`), `i18next` + `react-i18next` (VNG app localisation).
**Storage**: Existing SQLite cache (`better-sqlite3`, WAL). Reuses `cache_entries (user_id, space_id)`; adds a long-TTL GD-layer entry per user (`space_id = "__gd_initiatives__"`). No schema change required (TTL carried in existing `expires_at`).
**Testing**: Vitest (server + each frontend); Playwright visual regression (root). New unit tests for hub resolution, GD tag→node resolution, category counting; new visual snapshots for the VNG app.
**Target Platform**: Linux server container; modern browsers. Two frontends served as sibling subdomains in production; two dev servers locally.
**Project Type**: Web application — one BFF + two SPA frontends sharing code via a pnpm workspace.
**Performance Goals**: First VNG load (default hub ≤30 spaces) graph+map ≤5s (SC-002); hub switch / selection change ≤3–5s (SC-003/004); org→connected-spaces reveal <1s (SC-012). GD layer fetch amortised by ~1-week cache (FR-046).
**Constraints**: Frontend talks only to BFF (Principle III); typed SDK only (Principle II); per-user/per-space cache scoping, no token logging (Principle IV); graceful degradation (Principle V). VNG app must be measurably simpler than Explorer (SC-009).
**Scale/Scope**: ~342 gemeente orgs, 92 themes, ~305 GD initiatives; hubs ≤ a few dozen spaces typical; one new SPA (~3 tabs) + ~3 new BFF endpoints + 2–3 new GraphQL queries.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Alkemio OIDC auth (PKCE via BFF)** | ✅ Pass | VNG app reuses the existing `ea_session` flow; no new auth UI, no credentials. Cookie scoped to shared parent domain; VNG origin added to `SESSION_ALLOWED_ORIGINS`. Browser still holds only the opaque session cookie. |
| **II. Typed GraphQL contract** | ✅ Pass | New innovation-hub and gemeentedelers-callout queries are added as `.graphql` files and consumed via the codegen SDK; `pnpm run codegen` re-run. No raw query strings. |
| **III. BFF boundary** | ✅ Pass | VNG frontend calls only the BFF (`/api/*`, `credentials: 'include'`). Hub listing, GD callouts, dashboard counts, gemeente identity all resolved server-side. |
| **IV. Data sensitivity** | ✅ Pass | GD-layer cache stays **per-user** (longer TTL only); access verified at read time (user must have READ on the gemeentedelers space). No token logging. Snapshot registry contains only public municipality/theme reference data. Parameterised SQL unchanged. |
| **V. Graceful degradation** | ✅ Pass | Empty hub, unreadable gemeentedelers space, unresolved initiative tags, missing translations, missing category data all have defined non-fatal fallbacks (FR-017/024/044/043, edge cases). |
| **VI. Design fidelity** | ✅ Pass | Per clarification, the VNG app reuses the **existing Alkemio branding and design tokens** (the 001 design-brief token system, shared via `@ea/shared`); it is labelled "VNG Kenniscentrum Innovatie" in text. A VNG-specific visual identity is deferred. It therefore inherits the established visual contract rather than introducing an unspecified new one — no new pixel-level brief required for this release. The Explorer is unchanged. |

**Gate result**: PASS (no unjustified violations).

## Project Structure

### Documentation (this feature)

```text
specs/016-vng-frontend/
├── plan.md              # This file
├── spec.md              # Feature spec (with Clarifications)
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entities, node/edge & registry & config schemas
├── quickstart.md        # Phase 1 — run both frontends, codegen, snapshot generation
├── contracts/           # Phase 1 — BFF endpoint & snapshot contracts
│   ├── api-hubs.md
│   ├── api-graph-generate.md
│   ├── api-vng-dashboard.md
│   └── snapshot-registry.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

Adopt a **pnpm workspace** so the apps share code and a single deduped `node_modules`. All frontend code lives under one **`frontend/`** parent with three sibling packages — **`shared`**, **`ecosystem-analytics`** (the existing Explorer, moved in), and **`vng`** (new). The server is unchanged structurally.

```text
pnpm-workspace.yaml            # NEW — packages: server, frontend/*

server/                        # BFF (existing) — additive only
├── analytics.yml              # + vng: { defaultHubNameId, gemeentedelersSpaceNameId,
│                              #          gdCacheTtlHours, tagCategoryMapping }
├── src/
│   ├── graphql/
│   │   ├── queries/
│   │   │   ├── innovationHubs.graphql          # NEW — list hubs visible to user
│   │   │   ├── innovationHubByNameId.graphql   # NEW — hub + spaceListFilter
│   │   │   ├── organizationByNameId.graphql    # NEW — resolve gemeente org by nameID
│   │   │   └── spaceKnowledgeCallouts.graphql   # NEW — gemeentedelers KB callouts + tags
│   │   └── generated/                           # regenerated via pnpm run codegen
│   ├── services/
│   │   ├── hub-service.ts                       # NEW — list hubs, resolve hub→spaceIds
│   │   ├── gd-initiatives-service.ts            # NEW — fetch callouts, resolve tags→nodes/edges
│   │   └── graph-service.ts                     # EXT — optional GD fold-in + dashboard counts
│   ├── transform/
│   │   └── initiatives.ts                       # NEW — Callout→INITIATIVE/THEME nodes & edges
│   ├── data/vng/                                # NEW — committed snapshot (generated)
│   │   ├── municipalities.json                  # {slug,title,alkemioNameId,cbsCode}[]
│   │   └── themes.json                          # {slug,title,priorLabels}[]
│   ├── routes/
│   │   ├── hubs.ts                              # NEW — GET /api/hubs, /api/hubs/:nameId/spaces
│   │   ├── vng.ts                               # NEW — POST /api/vng/dashboard
│   │   └── graph.ts                             # EXT — request gains includeInitiatives flag
│   ├── types/{graph.ts, api.ts}                 # EXT — INITIATIVE/THEME node, edge types, flags
│   └── config.ts                                # EXT — VngConfig
└── scripts/
    └── generate-vng-snapshot.mts                # NEW — reads ../vng-gemeente-delers vault → data/vng/*.json

frontend/                      # NEW parent folder for all frontend packages
├── shared/                    # NEW (@ea/shared) — code shared by both apps (extracted from the Explorer)
│   └── src/
│       ├── graph/             # ForceGraph (D3), clustering, HoverCard
│       ├── map/               # MapOverlay (netherlands region)
│       ├── panels/            # DetailsDrawer (space/org details)
│       ├── services/          # api fetch wrapper, auth (login/logout/fetchMe)
│       ├── ui/                # shadcn primitives (tabs, alert, card, badge, select, chart)
│       └── styles/            # design tokens
├── ecosystem-analytics/       # MOVED — existing Explorer SPA (port 5173), now imports @ea/shared
│   └── …                      # behaviourally unchanged
└── vng/                       # NEW VNG SPA (port 5174), proxies /api to server
    └── src/
        ├── App.tsx            # 3-tab shell + branding header + auth warning banner
        ├── pages/{GraphTab, SpaceDetailsTab, DashboardTab}.tsx
        ├── components/
        │   ├── HubSelector.tsx            # choose from all hubs available to user
        │   ├── SelectedSpacesPanel.tsx    # persistent list w/ hub-vs-direct provenance
        │   ├── GemeenteToggle.tsx         # show/hide gemeentes (graph + dashboard)
        │   ├── InitiativesToggle.tsx      # include GD initiatives + provenance note
        │   └── charts/{NdsChart, Vng2030Chart}.tsx   # recharts
        ├── hooks/{useHubs, useSelectedSpaces, useVngGraph, useDashboard}.ts
        ├── i18n/{index.ts, nl.json, en.json}         # Dutch default + English
        └── branding/                                 # VNG logo/header assets
```

**Structure Decision**: Introduce a pnpm workspace (`packages: server, frontend/*`) and consolidate all frontend code under one **`frontend/`** parent: `frontend/shared` (the extracted `@ea/shared` lib — graph, map, details, api/auth services, shadcn primitives, tokens), `frontend/ecosystem-analytics` (the existing Explorer, **moved** from the old top-level `frontend/`), and `frontend/vng` (the new app). Both apps consume `@ea/shared`, honouring "share a lot of its architecture" without cross-app source imports, keeping React/deps deduped, and leaving the Explorer behaviourally unchanged. The server stays a single BFF; all new capability is additive.

## Complexity Tracking

| Violation / Deviation | Why Needed | Simpler Alternative Rejected Because |
|-----------------------|------------|-------------------------------------|
| `frontend/{shared,ecosystem-analytics,vng}` + pnpm workspace (3 packages); the existing Explorer is **moved** into `frontend/ecosystem-analytics` | Two apps must share graph/map/details/services without duplication; workspace dedupes React and deps; one `frontend/` parent keeps the surfaces together | Cross-importing one app's `src` from another risks duplicate React instances and couples builds; copy-paste would fork the graph engine |
| New audience surface, but reusing Alkemio branding/tokens for now (Principle VI satisfied) | VNG is a distinct, simpler audience experience; reusing the existing design system avoids a new pixel-level brief this release | A bespoke VNG visual identity now would add scope and a new design contract before it's needed; deferred as an additive enhancement |
| Build-time snapshot registry committed into the server | GD themes/gemeentes survive into Alkemio only as flat tag strings; structured links exist only in the `vng-gemeente-delers` vault | Live cross-repo read at runtime couples deployments; deriving solely from the `gemeente` keyword can't recover theme links or municipality→nameID mapping |
| Per-user GD cache with a separate long TTL | Constitution IV requires per-user/per-space scoping; GD corpus is archival so a 1-week TTL avoids refetch | A shared global GD cache would violate per-user scoping; the standard 24h TTL would refetch 305 callouts needlessly |

## Phase notes

- **Phase 0 (research.md)**: resolves the serving/cookie topology, the shared-package extraction boundary, the GD tag-resolution algorithm, node/edge modelling for INITIATIVE/THEME, cache strategy, charting + i18n library choices, and the snapshot generation approach.
- **Phase 1 (data-model.md, contracts/, quickstart.md)**: new node/edge types and registry/config schemas; BFF endpoint contracts (`/api/hubs*`, `/api/graph/generate` extension, `/api/vng/dashboard`); the snapshot file contract + generator; dev/run instructions.
- **Phase 2 (/speckit.tasks)**: NOT produced here.
