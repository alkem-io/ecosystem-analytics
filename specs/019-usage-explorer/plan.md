# Implementation Plan: Usage Explorer

**Branch**: `019-usage-explorer` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-usage-explorer/spec.md`

## Summary

Add a **Usage Explorer** tab to the VNG dashboard: a Netherlands map carrying one marker per Dutch gemeente — a dot sized linearly by initiative count (1 = smallest, selection maximum = 3× that) or a grey square for a gemeente with none — above a ranked list of the initiatives in use across whatever is currently in the viewport, each shown as "N of M in view".

Technically the feature splits cleanly in two:

1. **A new, selection-independent server dataset**: the geo-location of *all 342* gemeentes, fetched from Alkemio and cached long-term. This is genuinely new — today gemeente positions only exist for organisations that happen to appear in a selected space's graph, so a gemeente participating in nothing has no position and could not be drawn at all.
2. **A new client-side map** that renders those 342 markers at constant on-screen size, reports its viewport, and derives the ranking in the browser from the already-loaded `GraphDataset` — no server round-trip on zoom or pan.

The main structural decision is that the existing `ForceGraph` cannot serve this map (it scales markers by `1/√k` on zoom, runs a force simulation, and exposes no viewport). A new `UsageMap` component is required — and because constitution §VII makes Netherlands-only rendering a hard requirement, the tile + white-complement masking logic is **extracted** from `ForceGraph` into a shared primitive both maps call, rather than copied.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM); Node 24 (server), React 19 (frontend)
**Primary Dependencies**: Server — Express 5, `graphql-request` + codegen SDK, `better-sqlite3`. Frontend — React 19, Vite 7, D3 v7 (`d3-zoom`, `d3-geo`), Radix UI + Tailwind v4, `react-i18next`. **No new dependencies.**
**Storage**: Existing SQLite cache. **No schema change** — the gemeente location set reuses `cache_entries (user_id, space_id)` under a synthetic space id `__gemeente_geo__`, exactly the pattern feature 016 established with `__gd_initiatives__`.
**Testing**: Vitest (server + frontend units), Playwright (`tests/*.spec.mjs`) for the Netherlands-only visual guard
**Target Platform**: Browser SPA (VNG dashboard, prod :4001) served by the shared BFF
**Project Type**: Web application — Express BFF + React SPA in a pnpm workspace
**Performance Goals**: 342 markers rendered < 3 s on tab open (SC-006); ranking recomputed < 1 s after the map settles (SC-005); no perceptible stutter while zooming/panning (SC-007)
**Constraints**: Markers hold constant on-screen size at every zoom (FR-015); the map renders **only** the Netherlands (constitution §VII); overlapped small markers stay hit-testable (FR-011)
**Scale/Scope**: 342 gemeentes × up to a few hundred initiatives; one new tab, one new server route, one new cached dataset

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Verdict | How this feature complies |
|-----------|---------|---------------------------|
| **I. Alkemio OIDC auth** | ✅ PASS | The new route mounts on the existing `dashboardRouter`, already behind `authMiddleware` + `resolveUser`. The Alkemio call uses the session's access token like every other acquisition. No new auth surface. |
| **II. Typed GraphQL contract** | ✅ PASS *(with obligation)* | Location fetching adds `server/src/graphql/queries/gemeenteLocations.graphql` and goes through the generated SDK. `pnpm -C server run codegen` MUST be run and `src/graphql/generated/` committed. No raw query strings. |
| **III. BFF boundary** | ✅ PASS | The SPA calls only `GET /api/<app>/gemeente-locations`. Viewport maths and ranking are pure client-side functions over data the BFF already delivered. |
| **IV. Data sensitivity** | ⚠️ PASS *(justified — see Complexity Tracking)* | Gemeente locations are public reference data with no per-user variation, yet the cache remains **keyed by `(user_id, space_id)`** so the per-user scoping rule is not weakened. Parameterised SQL throughout; no token logging. |
| **V. Graceful degradation** | ✅ PASS | FR-030/030a/031/032: a gemeente without a location is excluded and *counted* in a disclosed total; a stale cache still renders; a failed refresh never blanks the tab. |
| **VI. Design fidelity** | ✅ PASS | New tab adopts the existing VNG tab chrome, tokens, and card styling. The size legend (FR-015a) is a new element and follows the dashboard's existing legend treatment. |
| **VII. Dutch-dashboard map scope (NL-only)** | ⚠️ **HIGHEST RISK — PASS by design** | This feature adds a **third** Dutch map. Everything outside the Netherlands boundary MUST stay plain white. Two decisions protect it: (a) the tile + white-complement masking is *extracted and shared*, not duplicated; (b) FR-013a's "province selection does not mask" is explicitly **only** about not hiding neighbouring *Dutch* provinces — the NL outer boundary clip is untouched, and a new Playwright spec pins it. |

**No gate failures.** One justified deviation recorded under Complexity Tracking.

### The §VII / FR-013a interaction, stated precisely

These two rules could be misread as contradictory. They are not, and the distinction must survive implementation:

- **Constitution §VII** governs the **outer** boundary: nothing outside the *Netherlands* is ever drawn.
- **FR-013a** governs **internal** framing: selecting a province must not mask the *other Dutch provinces* — a gemeente just over a provincial border is exactly the neighbour the feature exists to reveal.

So the Usage Explorer always uses the **`netherlands` basemap**, never the twelve masked `province` basemaps. Province selection only changes the d3-zoom transform. `PROVINCE_BASEMAPS` is used solely as a source of *bounds* to zoom to, never as a basemap to render.

## Project Structure

### Documentation (this feature)

```text
specs/019-usage-explorer/
├── plan.md              # This file
├── research.md          # Phase 0 — the six unknowns resolved
├── data-model.md        # Phase 1 — entities and derivation rules
├── quickstart.md        # Phase 1 — how to run and verify
├── contracts/
│   ├── api-gemeente-locations.md   # GET /api/<app>/gemeente-locations
│   └── usage-aggregation.md        # normative marker-size + ranking rules
├── checklists/
│   └── requirements.md  # spec quality checklist (complete)
└── tasks.md             # Phase 2 — created by /speckit.tasks, NOT by this command
```

### Source Code (repository root)

```text
server/src/
├── graphql/queries/
│   └── gemeenteLocations.graphql          # NEW — bulk gemeente org locations
├── services/
│   ├── gemeente-geo-service.ts            # NEW — fetch + cache all 342 locations
│   └── gemeente-geo-service.test.ts       # NEW
├── routes/
│   └── dashboard.ts                       # + GET /gemeente-locations
├── cache/
│   └── cache-service.ts                   # + GEO_CACHE_SPACE_ID
├── types/
│   └── api.ts                             # + GemeenteLocation, GemeenteLocationsResponse
└── config.ts                              # + geoCacheTtlHours (per-dashboard)

server/analytics.yml                       # + geo_cache_ttl_hours (vng, govtech)

frontend/shared/src/
├── map/
│   ├── nl-basemap.ts                      # NEW — tiles + NL clip, EXTRACTED from ForceGraph
│   └── UsageMap.tsx                       # NEW — 342 static markers, constant screen size
├── graph/
│   └── ForceGraph.tsx                     # MODIFIED — now calls nl-basemap.ts
├── dashboard/
│   ├── pages/UsageExplorerTab.tsx         # NEW
│   ├── hooks/useGemeenteLocations.ts      # NEW
│   ├── utils/usage.ts                     # NEW — markers + area ranking (pure)
│   └── App.tsx                            # + tab, gated by AppConfig flag
└── app/AppConfig.tsx                      # + usageExplorer?: boolean

frontend/vng/src/
├── appConfig.ts                           # usageExplorer: true
├── i18n/{nl,en}.json                      # + usageExplorer.* keys
└── dashboard/usage.test.ts                # NEW — mirrors the aggregation contract

tests/
└── vng-usage-explorer-nl-only.spec.mjs    # NEW — §VII guard for the third map
```

**Structure Decision**: The existing multi-dashboard layout is unchanged. Shared code lands in `@ea/shared` (as with every dashboard page since feature 016) and is switched on for VNG alone via a new `AppConfig` flag, satisfying FR-003 without forking the shared `App.tsx`.

## Phase 0 — Research

Six unknowns were identified and resolved in [research.md](./research.md):

| # | Unknown | Resolution |
|---|---------|-----------|
| R1 | How to bulk-fetch 342 gemeente locations from Alkemio | `organizationsPaginated` with a nameID join against the registry; documented fallback ladder |
| R2 | Where a selection-independent dataset may be cached under §IV | `cache_entries` with synthetic `space_id = '__gemeente_geo__'`, per-user, 168 h TTL — the `__gd_initiatives__` precedent |
| R3 | Rendering 342 markers at 60 fps | SVG with a single d3-zoom transform and counter-scaled markers; canvas rejected as unnecessary |
| R4 | Constant on-screen marker size under d3-zoom | Counter-scale each marker by exactly `1/k`; ForceGraph's `1/√k` is deliberately *not* reused |
| R5 | Deriving the visible gemeente set from the viewport | `d3.zoomTransform().invert()` on the two viewport corners, then a projected-point box test; rAF-throttled with a settle debounce |
| R6 | Extracting the NL basemap without regressing §VII | Move (not copy) into `nl-basemap.ts`; the two existing Playwright NL-only specs are the gate, plus a third for the new map |

## Phase 1 — Design & Contracts

Artifacts produced:

- **[data-model.md](./data-model.md)** — `GemeenteLocation`, `UsageMarker`, `VisibleArea`, `AreaInitiativeRanking`, `FocusedGemeente`, with the derivation rules and their FR anchors.
- **[contracts/api-gemeente-locations.md](./contracts/api-gemeente-locations.md)** — request/response shape, caching semantics, error and partial-failure behaviour.
- **[contracts/usage-aggregation.md](./contracts/usage-aggregation.md)** — the **normative** marker-size formula and ranking rules, mirrored by tests on both sides exactly as feature 018 pinned its city-count rule.
- **[quickstart.md](./quickstart.md)** — run, warm the cache, and verify each acceptance scenario.

### Design decisions worth flagging before implementation

**The count rule is inherited, not reinvented.** A gemeente's initiative count must equal what the Cities view shows (FR-029). `frontend/shared/src/dashboard/utils/cities.ts#buildCityRows` already implements the normative rule from feature 018, pinned by mirrored tests. `utils/usage.ts` consumes `CityRow[]` and adds *only* position and geometry — it must never recount.

**The ranking is client-side.** Everything needed already sits in the loaded `GraphDataset` plus the cached location set. Recomputing in the browser on viewport change is what makes SC-005 achievable; a server round-trip per pan would not be.

**The location fetch is a cold-start cost, not a per-view cost.** First call for a user populates the cache; every later call is a SQLite read. The TTL is a week, matching the GD corpus, because gemeente locations essentially never move.

### Agent context

`.specify/scripts/bash/update-agent-context.sh claude` was run; `CLAUDE.md` now carries this feature's stack and storage lines.

### Constitution re-check after Phase 1

Re-evaluated against the produced design. **No new violations, no gate failures.** Three points firmed up rather than changed:

- **§II** — the new query is a single `.graphql` file going through the SDK; the codegen obligation is now an explicit quickstart step, not a footnote.
- **§IV** — the `__gemeente_geo__` decision is documented in both the API contract and research R2, including the stale-on-refresh-failure rule that keeps FR-030a from being implemented as a cache delete.
- **§VII** — the design now separates the two boundaries explicitly (outer NL clip vs internal province framing) in the plan, the aggregation contract, and the quickstart checklist, with the existing Playwright specs named as the pre/post gate for the extraction.

The two Complexity Tracking entries stand unchanged.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **§IV**: a cached dataset with no per-user variation, stored per-user (342 identical rows in the worst case) | Constitution §IV requires *every* cache entry be keyed `(user_id, space_id)` and verified at read time. Gemeente locations are public, but carving out an exception would create the project's first unscoped cache row and a precedent for "this data is not sensitive" judgements at each new feature. | A single global row keyed by a sentinel user was rejected: it breaks the read-time ownership check that §IV names explicitly, and the storage cost of duplication is trivial (342 rows × a few hundred bytes per active user). Feature 016 already set this precedent with `__gd_initiatives__`. |
| **Refactor**: extracting tile/mask rendering out of `ForceGraph.tsx` (a 2 877-line component) as part of a feature that does not otherwise touch it | Constitution §VII names the exact files implementing NL-only masking and warns that *any* change must preserve the behaviour. Adding a third Dutch map by copying that logic would put constitution-critical code in two places, free to diverge. | Duplicating into `UsageMap` was rejected on divergence risk. Building the new map on `ForceGraph` was rejected because FR-015 (constant marker size) directly contradicts its `1/√k` map-mode sizing, and changing that would regress the Explorer and both existing Dutch maps. |
