# Implementation Plan: Unified Data Loading

**Branch**: `025-unified-data-loading` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-unified-data-loading/spec.md`

## Summary

The dashboards (VNG, GovTech — one shared shell) load the selection's data **once per page** into a single provider that every tab reads; tabs derive their views from it and never fetch. The BFF keeps doing the acquisition and the augmenting/processing (Clarification 1) and now **streams named progress stages** to the browser over one request-scoped SSE response, which a single header strip renders on every tab. On the platform side the core load becomes *relational only* — Spaces, hierarchy, roles, organisations, classifications, on-screen profile fields — with organisation profiles carried inline by the roles query (no per-organisation lookups), activity split into a separately cached on-demand item, extended organisation profiles fetched lazily and cached per organisation, and the dashboard counts computed from the same dataset instead of re-querying classifications. Nothing changes for the Explorer's request/response shape; it gains the cheaper acquisition.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM); Node 24 (server), React 19 (frontends)

**Primary Dependencies**: Server — Express 5, `graphql-request` + codegen SDK, `better-sqlite3`. Frontend — React 19, Vite 7, `react-i18next`, Radix UI + Tailwind v4, D3 v7 (unchanged graph/map). **No new dependencies** — SSE parsing reuses the pattern in `frontend/ecosystem-analytics/src/services/query-api.ts`; the provider is React context + a small store.

**Storage**: Existing SQLite cache (`better-sqlite3`, WAL). **No schema change.** Cache rows split by kind under the established synthetic-space-id pattern (`__gd_initiatives__`, `__gemeente_geo__`): per-Space *relational* rows (existing `(user_id, space_id)`), new `__activity__:<spaceId>` rows, new `__org__:<orgId>` extended-profile rows. One `CACHE_MAINTENANCE_VERSION` bump (3 → 4) so no pre-split per-Space row (which embeds activity-derived fields) is served as relational-only.

**Testing**: Vitest (server unit + route tests with the existing mock SDK; shared/vng/explorer unit tests), Playwright (`tests/*.spec.mjs`) for the tab-tour zero-request assertion and the shared indicator.

**Target Platform**: Linux container (one BFF serving three SPAs), modern browsers.

**Project Type**: Web application — BFF + multi-SPA pnpm workspace.

**Performance Goals**: SC-001 tab switch < 1 s with zero requests; SC-004 ≥ 50 % fewer platform requests and bytes for the default VNG hub; SC-007 cold load no slower than today.

**Constraints**: Constitution II (typed SDK only — no dynamic aliased documents for batching), III (BFF boundary), IV (per-viewer cache scoping — no cross-viewer sharing, per Clarification), V (graceful degradation when an extra item fails), VII (maps untouched). Explorer request/response contract unchanged (FR-018).

**Scale/Scope**: Default VNG hub ≈ 22 Spaces (+ subspaces), ~60 organisations, a few hundred users; `max_spaces_per_query` cap unchanged. Nine tabs in the shared shell; two dashboard SPAs; one Explorer SPA untouched except for the shared `api`/progress types.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. OIDC auth via BFF | ✅ Pass | No auth change. The SSE generate response authenticates with the same `ea_session` cookie (`credentials: 'include'`). |
| II. Typed GraphQL contract | ✅ Pass | All query changes are `.graphql` edits + `pnpm run codegen`: roles fragment gains inline profile fields; a new `organizationsDetails`-style lookup stays a static document. **Rejected**: dynamically aliased multi-org documents (would be raw query strings). |
| III. BFF boundary | ✅ Pass | Browser still talks only to the BFF; the BFF does all acquisition/augmenting (Clarification 1). |
| IV. Data sensitivity | ✅ Pass | All new cache rows are `(user_id, synthetic_space_id)`; no cross-viewer sharing (FR-016). Loaded data lives in browser memory only (FR-001a) — no browser storage. Progress stream carries Space nameIds/labels only, never tokens. |
| V. Graceful degradation | ✅ Pass | Extra items (activity, extended profiles, locations, GD layer) fail independently; the core dataset still renders; indicator names the failure (FR-011). |
| VI. Design fidelity | ✅ Pass | Header strip uses existing tokens/typography; per-tab placeholders reuse the existing loading copy. |
| VII. NL-only maps | ✅ Pass | No map code touched; GraphTab/InitiativeMap consume the same `GraphDataset` shape. |
| Security — `max_spaces_per_query` | ✅ Pass | Enforced on the SSE path exactly as on the JSON path. |

No violations → Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/025-unified-data-loading/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions with rationale
├── data-model.md        # Phase 1 — entities, cache rows, provider state
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   ├── api-graph-generate-stream.md   # SSE progress + result contract
│   ├── api-graph-activity.md          # on-demand activity item
│   ├── api-graph-organizations.md     # on-demand extended organisation profiles
│   └── dashboard-data-provider.md     # frontend provider / derivation contract
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
server/src/
├── graphql/
│   ├── fragments/communityRolesFragment.graphql   # + inline org/user core profile fields
│   ├── queries/organizationByID.graphql           # becomes the EXTENDED profile query (on demand)
│   └── generated/                                  # regenerated (pnpm run codegen)
├── services/
│   ├── acquire-service.ts        # core relational acquisition: no per-org lookups, no activity
│   ├── activity-service.ts       # NEW — activity item: chunked feed sweeps, __activity__ cache rows
│   ├── organization-service.ts   # NEW — extended org profiles: __org__ cache rows, lazy per-org
│   ├── graph-service.ts          # buildGraph composes relational + optional activity; stage reporter
│   ├── vng-dashboard-service.ts  # counts from dataset classificationEntries (no SpaceClassifications)
│   └── progress/                 # NEW — request-scoped LoadReporter (stages, items, done/total)
├── routes/
│   ├── graph.ts                  # /generate: SSE when Accept: text/event-stream; JSON otherwise
│   │                             # + /activity, /organizations (on-demand items)
│   └── dashboard.ts              # counts assembled from the dataset; both GD variants returned
├── cache/cache-service.ts        # CACHE_MAINTENANCE_VERSION 3 → 4; synthetic ids for new rows
└── types/api.ts                  # LoadProgress (stages/items), DashboardCountsBundle, item responses

frontend/shared/src/
├── services/
│   ├── api.ts                    # + apiStream(): SSE reader (pattern from Explorer query-api)
│   └── graph-loader.ts           # NEW — pure loader: plan → requests → progress events
├── dashboard/
│   ├── data/                     # NEW — the three layers
│   │   ├── DashboardDataProvider.tsx   # context: selection → loaded data, load plan, refresh
│   │   ├── useLoadedData.ts            # read loaded data / per-item state
│   │   ├── useLoadPlan.ts              # read the shared progress model
│   │   ├── useExtraItem.ts             # a tab declares an extra item (activity, locations, orgs)
│   │   └── derive/                     # memoised derivations (funnel, cities, ecosystem, usage, counts)
│   ├── components/LoadStrip.tsx  # NEW — header progress strip (FR-007a)
│   ├── App.tsx                   # mounts provider + LoadStrip once; tabs unchanged in position
│   ├── pages/*.tsx               # replace useVngGraph/useDashboard/useGraphProgress with data hooks
│   └── hooks/                    # useVngGraph, useDashboard, useGraphProgress REMOVED
frontend/vng/src/i18n/{en,nl}.json, frontend/govtech/src/i18n/{en,nl}.json   # strip wording
frontend/ecosystem-analytics/                                                 # unchanged (JSON path)
tests/
├── dashboard-load-once.spec.mjs      # NEW — tab tour issues zero requests (SC-001)
└── dashboard-load-strip.spec.mjs     # NEW — one strip, continuing progress across tabs (SC-003)
```

**Structure Decision**: Web application layout already in place (`server/` + `frontend/{shared,ecosystem-analytics,vng,govtech}`). The feature adds one server module per on-demand item, one request-scoped progress reporter, and a `dashboard/data/` layer in `@ea/shared` that replaces the per-tab hooks. No new package.

## Phase 0 — Research

See [research.md](./research.md). All Technical Context unknowns resolved; the decisions:

1. **Progress transport**: request-scoped **SSE** on `POST /api/graph/generate` (content negotiation on `Accept`), replacing per-user polled progress for the dashboards. Fixes guest progress collision; keeps the Explorer on JSON.
2. **Organisation profiles**: core fields **inline in the roles fragment** (zero per-org requests); extended fields on demand via `organizationByID`, cached per org (`__org__:<id>`).
3. **Activity**: separate service + separate cache rows; dashboards request it only from the Initiatives tab via `POST /api/graph/activity`; Explorer keeps `includeActivity` default true so its output is unchanged.
4. **Dashboard counts**: computed by the BFF from the dataset's own `classificationEntries` and returned **with** the dataset as a bundle carrying both GD variants; the `SpaceClassifications` per-Space re-query goes.
5. **Incremental selection change**: one generate request for the new set; retained Spaces come from the per-viewer cache (no platform requests); the response is the processed dataset for the new set (server processes — Clarification 1). Progress shows only "processing" for cache-only loads.
6. **Frontend state**: React context provider + `useSyncExternalStore`-backed store in `@ea/shared`, derivations memoised by `(dataset identity, inputs)` via `WeakMap`; no new state library.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — Selection, LoadPlan/LoadItem/Stage, LoadedData, cache row kinds, Derivation registry.
- [contracts/api-graph-generate-stream.md](./contracts/api-graph-generate-stream.md) — SSE event schema (`stage`, `item`, `result`, `error`) and the JSON fallback.
- [contracts/api-graph-activity.md](./contracts/api-graph-activity.md), [contracts/api-graph-organizations.md](./contracts/api-graph-organizations.md) — on-demand items.
- [contracts/dashboard-data-provider.md](./contracts/dashboard-data-provider.md) — the three-layer contract every tab must follow (FR-005).
- [quickstart.md](./quickstart.md) — how to prove SC-001, SC-002a, SC-003, SC-004.

### Constitution Check — post-design

Re-evaluated against the contracts: unchanged, all ✅. The only item that needed a second look was II (typed SDK): the extended-profile endpoint accepts a list of ids but issues the static `organizationByID` document per **uncached** id, bounded by the cache rather than by a dynamic document — accepted because these are on-demand, one-organisation-at-a-time detail opens, not core-path loads (FR-013 applies to the core path).

## Complexity Tracking

Not required — no constitution violations.
