# Implementation Plan: VNG Innovation Funnel View

**Branch**: `022-vng-funnel-view` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-vng-funnel-view/spec.md`

## Summary

Add a screen-only Funnel view to the VNG dashboard: six stages (a GemeenteDelers mouth followed by
one stage per authored `Fase` value), enclosed by two converging curved bounding bars, with one dot
per initiative sized on a single global logarithmic scale by participating-gemeente count and
coloured by Groei/GD source, settled inside the curves by collision relaxation, and revealing
initiative detail on hover/focus.

**Technical approach**: the funnel is almost entirely a *presentation* layer over data the dashboard
already holds. The dots come from the already-cached `GraphDataset` using the exact edge rule the
Initiatives table uses, which is what makes FR-017/SC-002 true by construction rather than by
coincidence. The stage list comes from the existing `phaseDistribution` in the dashboard payload,
which already carries key/label/`nr` in authored order including count-0 phases. That leaves one
genuine gap — a Groei space's phase is not on its graph node — closed by a small, symmetric addition
to the existing post-cache classification enrichment in `graph-service.ts`. **No new endpoint, no new
GraphQL query, no new cache entry, no new dependency.**

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM); Node 24 (server), React 19 (frontend)
**Primary Dependencies**: Server — Express 5, existing codegen GraphQL SDK, `better-sqlite3`.
Frontend — React 19, Vite 7, **D3 v7 (`d3-force` for collision relaxation, `d3-shape`/`d3-scale` for
the curves and the log scale — the full `d3` package is already a dependency of `@ea/shared` and
`frontend/vng`)**, Radix UI + Tailwind v4, `react-i18next`. **No new dependencies.**
**Storage**: Existing SQLite cache. **No schema change and no cache-version bump** — the one new node
field is written by post-cache enrichment (`graph-service.ts`), which already runs on cached rows, so
existing cache entries are enriched on read exactly as `ndsCategories` is today.
**Testing**: Vitest (server + frontend unit), Playwright (visual regression, root `test:visual`)
**Target Platform**: Modern evergreen browsers; VNG SPA (`frontend/vng`, dev :5174) served by the
shared BFF
**Project Type**: Web application — Express 5 BFF + multi-SPA pnpm workspace
**Performance Goals**: Layout settles ≤ 2s at working scale (SC-009); no perceived wait versus the
existing dashboard charts (SC-007). Relaxation runs synchronously over ~330 dots — two orders of
magnitude below what `ForceGraph` already handles.
**Constraints**: Every dot contained by the curved envelope at its full radius (FR-016c); a SINGLE
global size scale across all stages (FR-012a); the complete funnel visible without scrolling at every
supported viewport (FR-006); dot positions are simulation-settled and therefore NOT pixel-reproducible
(A-012), so verification asserts structural invariants only.
**Scale/Scope**: ~305 GD initiatives in the mouth + ~20–30 Groei initiatives across five phase stages
and the holding area (A-011). Roughly 8 new/changed files across three packages.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. Constitution v4.3.0.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| **I. Alkemio OIDC Authentication** | ✅ PASS | No auth surface touched. The funnel sits behind the existing `ea_session` gate like every other tab; no new credential handling, no token exposure. |
| **II. Typed GraphQL Contract** | ✅ PASS | No `.graphql` file added or changed, so no `pnpm run codegen` run. The funnel consumes an already-generated `GraphDataset` and the existing dashboard payload. |
| **III. BFF Boundary** | ✅ PASS | Zero new frontend→Alkemio calls. The funnel adds **no new endpoint at all** — it reuses `POST /api/<app>/dashboard` and the existing graph generation. |
| **IV. Data Sensitivity** | ✅ PASS | No new cache entry, no new cache key, no new logging. `node.phase` is derived in-memory from data already on the node and rides the existing per-`(user_id, space_id)` scoping. No SQL is added. |
| **V. Graceful Degradation** | ✅ PASS — and load-bearing | FR-025 (no phase vocabulary → explanatory empty state), FR-026 (vocabulary drift → render live stages anyway + advisory notice), FR-027 (standard loading/empty states), FR-024 (unphased initiatives held, never dropped). `phaseDistribution` being `undefined` is a designed-for state, not a crash. |
| **VI. Design Fidelity** | ⚠️ ADVISORY | The design brief (`specs/001-ecosystem-analytics/design-brief-figma-make.md`) governs the Explorer and says nothing about a funnel. The reference here is the author's whiteboard photo in the spec Input. Mitigation: the funnel takes every colour, radius, font and spacing value from `@ea/shared` `styles/tokens.css` and reuses the established Groei/GD source colours (FR-014, A-007), so it reads as part of the existing system rather than inventing a palette. No brief conflict exists to defer on. |
| **VII. Dutch-Dashboard Map Scope** | ✅ PASS (trivially) | The funnel contains **no map**. No file under `frontend/shared/src/map/`, no `ForceGraph` map path, and no `InitiativeMap` is touched, so the Netherlands-only mask cannot regress. |

**Development Workflow compliance**: pnpm workspace respected; the visual lives in `@ea/shared`
(consumed by VNG, opt-in for any future dashboard) rather than being forked into `frontend/vng`;
`tsc --noEmit` must pass on `server/` and every `frontend/*` package; any new CSS goes through Tailwind
utilities and shared tokens (no unlayered global CSS).

**Gate result: PASS.** One advisory (VI), mitigated, requiring no complexity-tracking entry.

## Project Structure

### Documentation (this feature)

```text
specs/022-vng-funnel-view/
├── spec.md              # Feature specification (with Clarifications session)
├── plan.md              # This file
├── research.md          # Phase 0 output — geometry, scale, layout decisions
├── data-model.md        # Phase 1 output — entities and derived shapes
├── quickstart.md        # Phase 1 output — how to run and verify
├── checklists/
│   └── requirements.md  # Spec quality checklist (passing)
├── contracts/
│   ├── funnel-layout.md      # Pure layout contract + invariants
│   └── graph-node-phase.md   # The one new GraphNode field
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
server/src/
├── types/graph.ts                       # CHANGED: GraphNode.phase?: NodePhase
├── services/graph-service.ts            # CHANGED: resolve designations.phase in the
│                                        #   existing enrichment loop (symmetric with
│                                        #   ndsCategories / vng2030Categories)
└── services/graph-service.phase.test.ts # NEW: phase enrichment unit tests

frontend/shared/src/
├── app/AppConfig.tsx                    # CHANGED: `funnel?: boolean` opt-in flag
├── dashboard/App.tsx                    # CHANGED: 'funnel' TabKey, gated on cfg.funnel
├── dashboard/utils/
│   ├── initiatives.ts                   # NEW: buildInitiativeRows(dataset) — extracted
│   │                                    #   verbatim from InitiativesTab, + phase
│   ├── initiatives.test.ts              # NEW: parity + phase resolution
│   ├── funnel.ts                        # NEW: pure geometry — curves, stage bands,
│   │                                    #   global log scale fit, contained relaxation
│   └── funnel.test.ts                   # NEW: layout invariants (the real test surface)
├── dashboard/components/
│   ├── FunnelChart.tsx                  # NEW: the SVG visual (frame + dots + legend)
│   └── FunnelHoverCard.tsx              # NEW: hover/focus detail
├── dashboard/pages/
│   └── FunnelTab.tsx                    # NEW: data wiring, loading/empty/drift states
├── dashboard/pages/InitiativesTab.tsx   # CHANGED: consume the extracted builder
└── index.ts                             # CHANGED: export buildInitiativeRows + funnel utils

frontend/vng/src/
├── appConfig.ts                         # CHANGED: funnel: true
└── i18n/{nl,en}.json                    # CHANGED: tabs.funnel + funnel.* strings
```

**Structure Decision**: The funnel is built in `@ea/shared` and opted into per-app via `AppConfig`,
following the exact precedent set by the Usage Explorer (`usageExplorer?: boolean`, feature 019
FR-003). VNG turns it on; GovTech does not, and can later flip one boolean rather than forking the
shell. The single server change lands in the existing enrichment loop rather than in a new service.

## Phase 0 — Research

See [research.md](./research.md). Resolved: funnel orientation and the width/aperture terminology
collision in the spec (R-001); stage length allocation and why favouring the mouth is a design choice
rather than the data-driven stretching FR-012b forbids (R-002); the dot area model and the closed-form
global scale fit, with the supported dot ceiling computed (R-003); contained collision relaxation via
`d3-force` run synchronously to rest (R-004); where each field the hover card needs actually comes
from, and why `node.phase` is the only real gap (R-005); how the funnel stays consistent with the
phase chart (R-006); and the testing strategy under A-012's no-pixel-assertions constraint (R-007).

No `NEEDS CLARIFICATION` items remain in Technical Context.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — `FunnelStage`, `FunnelDot`, `InitiativeRow` (extended with
  `phase`), `NodePhase`, and the derived-shape pipeline from `GraphDataset` + `PhaseDistribution` to
  laid-out dots.
- [contracts/funnel-layout.md](./contracts/funnel-layout.md) — the pure-function contract for
  `layoutFunnel()`, with the seven invariants that stand in for pixel assertions.
- [contracts/graph-node-phase.md](./contracts/graph-node-phase.md) — the one new `GraphNode` field,
  its resolution rule (furthest-along wins, mirroring `countGroeiPhases`), and its cache behaviour.
- [quickstart.md](./quickstart.md) — run, verify, and the manual acceptance walk-through.

## Known Consequences (surfaced, not hidden)

1. **The phase stages will look sparse and their dots small.** A single global scale (FR-012a) fitted
   to a 305-dot mouth (FR-022a) means a 3-gemeente Groei initiative in Formalisatie is drawn at the
   same modest radius as a 3-gemeente GD initiative in the crowded mouth. This is the accepted cost of
   the clarified encoding — the alternative was dot size meaning different things in different parts
   of one picture — but it is a visible aesthetic consequence worth seeing rendered before it is
   settled.
2. **Turning the GD layer off visibly enlarges every dot in the funnel**, because the mouth no longer
   sets the scale. Documented as expected in the spec's Edge Cases; it will read as a jump.
3. **The funnel is excluded from pixel-level visual regression** except for its frame (A-012).

## Complexity Tracking

> No constitutional violations require justification. Table intentionally empty.
