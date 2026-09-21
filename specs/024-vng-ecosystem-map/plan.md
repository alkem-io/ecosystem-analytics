# Implementation Plan: VNG Ecosystem Map

**Branch**: `024-vng-ecosystem-map` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/024-vng-ecosystem-map/spec.md`

## Summary

Add an **Ecosystem** tab to the VNG dashboard that draws the selected innovation hub as the
hand-drawn "hyper-connector map": a cloud region with the orchestrator Space at its centre, the
hub's Spaces (initiatives) on a ring joined by "part of" lines, and every organisation with a
lead/member role — direct or rolled up from subspaces — as a logo circle connected by weighted,
styled lines; with two organisation filters, hover highlighting, pan/zoom and click-through into
the existing Space-details and City tabs. The model is a **pure client-side derivation of the
`GraphDataset` the dashboard already fetches** (like the Funnel); the only server work is the
baked-in default table behind a read-only endpoint (shipped in Phase 2, so US1 needs no
throwaway constant) and, in US2, a small **orchestrator-choice store** — per signed-in user,
cross-device, plus a community preset that is readability-filtered before it leaves the server. Research established that the VIH orchestrator
(`programmagroei`) is *not* among `vih-test`'s listed Spaces, so the tab fetches the resolved
orchestrator Space in addition to the selection (one extra per-Space cache entry). The visual
takes a list of ecosystems from day one; this release passes one.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM); Node 24 (server), React 19 (frontend)
**Primary Dependencies**: Server — Express 5, `better-sqlite3`, existing codegen GraphQL SDK (no new queries). Frontend — React 19, Vite 7, D3 v7 (`d3-force` synchronous relaxation, `d3-polygon` hull, `d3-shape` curves, `d3-zoom`), Radix UI + Tailwind v4, `react-i18next`. **No new dependencies.**
**Storage**: Existing SQLite (`better-sqlite3`, WAL). **One new table** `orchestrator_choices (user_id, hub_name_id, space_name_id, updated_at)`; no change to `cache_entries`, no `CACHE_MAINTENANCE_VERSION` bump (the dataset shape is unchanged).
**Testing**: Vitest (`frontend/vng/src/dashboard/*.test.ts`, `server/src/**/*.test.ts`), Playwright 1.58 (`tests/*.spec.mjs`, mocked BFF at the network layer)
**Target Platform**: Web (VNG dashboard SPA on :5174 dev / :4001 prod), Linux container BFF
**Project Type**: Web application — BFF + shared SPA package (`@ea/shared`) consumed by `frontend/vng`
**Performance Goals**: Tab interactive < 3 s with a warm dataset (SC-003); orchestrator change redraw < 1 s (SC-004) — layout is synchronous and O(n · ticks) for ~25 Spaces / ~200 organisations
**Constraints**: Page never scrolls horizontally at 390/820/1440 px (SC-005, `mobile-navigation.spec.mjs`); deterministic layout so Playwright can assert structure; no D3-owned DOM (React renders the SVG); no geographic basemap (constitution §VII does not apply and must not be disturbed)
**Scale/Scope**: VIH today: 23 listed Spaces + 1 orchestrator, ~200 organisations, ~260 connections. Design ceiling: a few ecosystems × ~50 Spaces × ~500 organisations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Alkemio OIDC via BFF | ✅ PASS | No auth change. New routes sit behind `resolveUser`; identity = session `alkemio_actor_id`. |
| II. Typed GraphQL contract | ✅ PASS | No new `.graphql`; the dataset already carries Spaces, subspace parents, org roles and profiles. No codegen run needed. |
| III. BFF boundary | ✅ PASS | Frontend talks only to `/api/graph/generate` (existing) and `/api/ecosystem/orchestrator/*` (new). |
| IV. Data sensitivity | ✅ PASS | `orchestrator_choices` keyed by `user_id`, all statements parameterised, own choice readable only by its owner. **The community preset is filtered for readability before it leaves the server** — the top three candidates are checked against the *caller's* own token and the first readable one is returned, else `null`; a Space the caller cannot read never appears in the response (see contract, and research R4). Nothing logged beyond hub/space nameIds. |
| V. Graceful degradation | ✅ PASS | Initials fallback for logos (badImageCache), resolution-order fallback for an unreadable orchestrator with FR-013 notice, empty states, standard error state + retry, guest fallback to sessionStorage. |
| VI. Design fidelity | ✅ PASS | Dashboard tokens/typography/card styling reused (FR-022); Q-session decisions govern behaviour. |
| VII. NL-only maps | ✅ PASS (n/a) | Not a geographic map; `ForceGraph`/`InitiativeMap`/basemap untouched. |
| Dev workflow | ✅ PASS | pnpm workspace, `tsc --noEmit` on server + every frontend package, tests in the established locations. |

**Post-design re-check (after Phase 1)**: unchanged — no violations, no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/024-vng-ecosystem-map/
├── plan.md              # This file
├── research.md          # Phase 0 — R1 (orchestrator not listed), R2–R9
├── data-model.md        # Phase 1 — derived model + orchestrator_choices table + view state
├── quickstart.md        # Phase 1 — run, try, test, verify against live platform
├── contracts/
│   └── api-ecosystem-orchestrator.md   # GET/PUT/DELETE contract + UI test-id contract
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
server/src/
├── data/ecosystem/orchestrators.ts        # NEW  [Phase 2] BUILT_IN_ORCHESTRATORS { 'vih-test': 'programmagroei', 'vih': 'programmagroei' }
├── routes/ecosystem.ts                    # NEW  [Phase 2] GET (builtIn only) → [US2] own/community + PUT/DELETE
├── routes/ecosystem.test.ts               # NEW  [Phase 2] validation, 401, shape → [US2] store-backed + readability cases
├── app.ts                                 # EDIT [Phase 2] mount ecosystemRouter
├── services/space-readability.ts          # NEW  [US2] canReadSpace(auth, nameId) — the §IV community filter
├── cache/db.ts                            # EDIT [US2] create orchestrator_choices (+ index)
├── cache/orchestrator-choice-store.ts     # NEW  [US2] getOwn / getCommunityCandidates / set / clear (prepared statements)
└── cache/orchestrator-choice-store.test.ts# NEW  [US2] in-memory DB: upsert, ranking + tie-break, isolation per user

frontend/shared/src/
├── app/AppConfig.tsx                      # EDIT ecosystem?: boolean
├── dashboard/App.tsx                      # EDIT TabKey 'ecosystem'; TABS insertion before 'graph'; render <EcosystemTab/>
├── dashboard/utils/ecosystem.ts           # NEW  buildEcosystemModel, resolveOrchestrator, guessOrchestrator, applyFilters, candidateSpaces
├── dashboard/utils/ecosystem-layout.ts    # NEW  layoutEcosystems(model, size) → positions, cloud paths (pure, deterministic)
├── dashboard/hooks/useOrchestratorChoice.ts # NEW  [Phase 2] GET → [US2] choose()/reset() + sessionStorage fallback
├── lib/initials.ts                        # NEW  two-letter initials helper, extracted from UserMenu.tsx
├── dashboard/components/UserMenu.tsx      # EDIT import the extracted initials helper
├── dashboard/hooks/useEcosystemViewState.ts # NEW  filters + transform persisted per hub (sessionStorage)
├── dashboard/components/EcosystemMap.tsx  # NEW  SVG renderer: clouds, nodes, edges, hover, zoom, legend, fit
├── dashboard/components/OrchestratorControl.tsx # NEW  select + source badge + reset + FR-013 notice
├── dashboard/components/EcosystemFilterBar.tsx  # NEW  two checkboxes + hidden count + clear
└── dashboard/pages/EcosystemTab.tsx       # NEW  composition: selection → choice → dataset (∪ orchestrator) → model → layout → map

frontend/vng/src/
├── appConfig.ts                           # EDIT ecosystem: true
├── i18n/en.json, i18n/nl.json             # EDIT tabs.ecosystem + ecosystem.* keys
├── dashboard/ecosystem.test.ts            # NEW  model rules, roll-up, provenance, filters, resolution order, guess, counts
└── dashboard/ecosystem-layout.test.ts     # NEW  determinism, orchestrator at centre, initiatives on ring, orgs outside ring, shared org between regions

tests/
├── vng-ecosystem.spec.mjs                 # NEW  mocked-BFF structural spec (modelled on vng-funnel.spec.mjs)
├── fixtures/vng-ecosystem-fixtures.json   # NEW  small hub: orchestrator (unlisted) + 4 initiatives + subspace roles + shared orgs
└── mobile-navigation.spec.mjs             # EDIT TAB_NAMES → nine tabs (no-horizontal-scroll covers the new tab)
```

**Structure Decision**: Web application, existing layout. All UI lives in `@ea/shared` (so a
second dashboard can opt in with one config flag, exactly like `funnel`), VNG only flips the
flag and supplies translations; server work is confined to one data table, one store, one
router and one built-in table. `ForceGraph`, the basemap and every existing tab are untouched.

## Design Notes (how the pieces fit)

1. **EcosystemTab data flow**
   `useSelectionContext()` → `activeHubNameId`, `hubSpaceIds` (listed), `effectiveSpaceIds`
   → `useOrchestratorChoice(hub)` → `{own, community, builtIn}` — available from Phase 2
   (answering `builtIn` only until US2 adds the store), so no component ever hardcodes the
   built-in table and nothing US1 writes is rewritten later
   → `useVngGraph(effectiveSpaceIds ∪ {own, community, builtIn}.filter(nonNull))` — fetching
   every explicit candidate up front means the resolution order can be applied against
   "Spaces actually present in the dataset" without a second request
   → `resolveOrchestrator(...)` → `buildEcosystemModel(dataset, [{hub, listed, orchestrator}])`
   → `applyFilters` → `layoutEcosystems(model, size)` (memoised on model + size)
   → `<EcosystemMap …/>`.
   Choosing in the select calls `choose()` (PUT) and, because the chosen Space is already in
   the dataset (it is a candidate), the redraw is immediate (SC-004); if it were not (direct
   addition removed meanwhile), the hook's new `own` simply joins the next request.
2. **Multi-ecosystem readiness (FR-007/SC-006)**: `buildEcosystemModel` takes
   `EcosystemInput[]`; organisations are keyed once globally with `ecosystemIds[]`;
   `layoutEcosystems` places N regions on a row and the force relaxation naturally pulls a
   shared organisation between the regions it connects. Nothing in `EcosystemMap` indexes
   `ecosystems[0]`.
3. **Determinism**: Space positions are fixed; organisations start from a deterministic seed
   (centroid of connected Spaces, angle from index) and relax for a fixed tick count with
   `simulation.stop()` — no timers, no randomness (d3-force only randomises exactly coincident
   nodes, which the seed avoids). Unit tests assert equality across two runs.
4. **Hover/highlight**: React state `hoverId`; classes toggle `opacity` on unrelated nodes and
   edges; Escape/blur clears. Keyboard: nodes are `tabIndex=0` `<g role="button">` so focus
   highlights too (FR-020).
5. **Logos**: `<image href={proxyImageUrl(logoUrl)}>` inside a `<clipPath>` circle; `onError`
   → `markImageFailed`, state flip → initials `<text>`. Pre-check `isImageFailed` to skip
   known-dead URLs (same discipline as ForceGraph).
6. **Guests** (023 not yet implemented): `useOrchestratorChoice` treats 401/403 on PUT/DELETE
   as "remember locally" (`guestChoice` in view state) and reads `own` from there; the server
   contract already specifies guest semantics for 023 to implement.
7. **i18n keys**: `tabs.ecosystem`, `ecosystem.{title, orchestrator, source.own,
   source.community, source.builtIn, source.guess, reset, notice.builtInMissing,
   filter.orchestrator, filter.multi, filter.hidden, filter.clear, fit, legend.lead,
   legend.member, legend.direct, legend.viaSubspace, legend.partOf, legend.connector,
   empty.noSpaces, empty.noOrgs, empty.noOrchestrator, orgCount}` in NL + EN.

## Complexity Tracking

No constitution violations — section intentionally empty.
