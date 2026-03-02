# Implementation Plan: 009 — Alternative Visualization Views

**Branch**: `007-space-visibility` (to be rebased to `009-alternative-views`) | **Date**: 2026-03-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/009-alternative-views/spec.md`

## Summary

Add five new D3-powered visualization modes to the Ecosystem Analytics Explorer — Treemap, Sunburst, Chord Diagram, Activity Timeline, and Temporal Force Graph — plus a view switcher toolbar. Phases 1-2 use existing data; Phase 3 requires server-side timestamp preservation and bucketed time series.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (strict), React 19, D3.js 7.9  
**Primary Dependencies**: d3 (d3-hierarchy, d3-chord, d3-shape, d3-scale, d3-brush, d3-force, d3-timer), React 19, Express 5, Vite 7.3.1  
**Storage**: In-memory per-user cache (existing `cache-service.ts`); no new storage  
**Testing**: Playwright visual regression (existing), manual; TypeScript strict (`tsc --noEmit`)  
**Target Platform**: Modern browsers (Chrome/Firefox/Safari/Edge), SPA served from Express BFF  
**Project Type**: Web application — `server/` (Express BFF) + `frontend/` (React SPA)  
**Performance Goals**: Each view must render ≤500ms for datasets up to 2,000 nodes + 5,000 edges; smooth zoom/pan at 60fps; Temporal Force Graph animation at 30fps minimum  
**Constraints**: D3 v7.9 already installed — no major new runtime dependencies. All views must degrade gracefully when optional data is missing (activity, timestamps). Maximum bundle size increase for all 5 views: ≤150KB gzipped.  
**Scale/Scope**: Typical ecosystem: 5-20 L0 spaces, 50-200 subspaces, 500-2,000 users, 1,000-5,000 edges. Largest expected: ~5,000 nodes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Alkemio Identity Auth** | PASS | No change to auth flow. New views consume the same authenticated `GraphDataset`. |
| **II. Typed GraphQL Contract** | PASS | New fields (`createdDate`, `tagsets`) will be added to `.graphql` fragments and regenerated via `pnpm run codegen`. No hand-written queries. |
| **III. BFF Boundary** | PASS | All new data flows through the BFF. Frontend never contacts Alkemio directly. Time-series bucketing computed server-side. |
| **IV. Data Sensitivity** | PASS | Pre-bucketed aggregates are privacy-friendly (no individual timestamps in Timeline payload). Per-user cache scoping unchanged. |
| **V. Graceful Degradation** | PASS | Views degrade when data is missing: Treemap/Sunburst fall back to member count when activity absent; Timeline/Temporal show "No timestamp data available" message; Chord still works with member-based matrix. |
| **VI. Design Fidelity** | NOTE | No design brief exists for new views. Views follow existing theme tokens (Inter font, dark-blue/light-blue palette, CSS custom properties). Design brief can follow implementation. |

**GATE RESULT**: PASS — no violations. Principle VI noted: design will be established during implementation using existing design tokens.

## Project Structure

### Documentation (this feature)

```text
specs/009-alternative-views/
├── plan.md              # This file
├── spec.md              # Feature specification (complete)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── view-props.md    # React component prop contracts
│   ├── server-api.md    # New/extended API endpoints
│   └── data-types.md    # New TypeScript types
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── graphql/
│   │   └── fragments/
│   │       ├── spaceAboutFragment.graphql    # + createdDate, visibility, tagsets
│   │       └── communityRolesFragment.graphql # (unchanged)
│   ├── services/
│   │   └── graph-service.ts                  # + time-series bucketing logic
│   ├── transform/
│   │   └── transformer.ts                    # + timestamp preservation, bucket aggregation
│   └── types/
│       └── graph.ts                          # + TimeBucket, createdDate fields, tagsets

frontend/
├── src/
│   ├── components/
│   │   ├── graph/
│   │   │   ├── ForceGraph.tsx                # Existing (+ temporal mode)
│   │   │   ├── TreemapView.tsx               # NEW
│   │   │   ├── SunburstView.tsx              # NEW
│   │   │   ├── ChordView.tsx                 # NEW
│   │   │   ├── TimelineView.tsx              # NEW
│   │   │   └── ViewSwitcher.tsx              # NEW
│   │   └── panels/
│   │       └── ControlPanel.tsx              # + view-specific controls
│   ├── hooks/
│   │   └── useViewState.ts                   # NEW — shared view state management
│   └── pages/
│       └── Explorer.tsx                      # + view routing, ViewSwitcher integration
```

**Structure Decision**: Web application pattern. New view components live alongside existing `ForceGraph.tsx` in `frontend/src/components/graph/`. Shared state via a custom hook. Server changes minimal — extend existing types and services.

---

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 1 design artifacts (data-model.md, contracts/, quickstart.md).*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Alkemio Identity Auth** | PASS | No auth changes. New fields (`createdDate`, `visibility`, `tagsets`) flow through existing authenticated pipeline. |
| **II. Typed GraphQL Contract** | PASS | New fields added to `.graphql` fragments (spec'd in `contracts/server-api.md`). `pnpm run codegen` regenerates SDK. No hand-written queries. |
| **III. BFF Boundary** | PASS | `timeSeries` bucketing computed in `transformer.ts` on the BFF. `estimateEdgeCreatedDate` runs server-side. Frontend receives pre-processed data only. |
| **IV. Data Sensitivity** | PASS | Time buckets are weekly aggregates (no individual activity timestamps exposed). `TagData` contains only public profile tags. Cache scoping unchanged. |
| **V. Graceful Degradation** | PASS | All new types use optional fields (`createdDate?`, `visibility?`, `tags?`, `timeSeries?`). Each view contract specifies fallback behaviour: Treemap/Sunburst default to member-count sizing, Timeline shows empty state, Temporal disables when no timestamps. |
| **VI. Design Fidelity** | NOTE | Still no design brief for new views. Contracts specify using existing theme tokens (`#7dd3fc`, `#38bdf8`, `#1e3a5f`, `#e5e7eb`). Acceptable for exploratory feature; design brief can follow. |

**POST-DESIGN GATE RESULT**: PASS — all principles satisfied. No violations found.

---

## Phase 1 Artifacts Summary

| Artifact | Path | Status |
|----------|------|--------|
| Research | `research.md` | Complete — 6 decisions documented |
| Data Model | `data-model.md` | Complete — extended + new types |
| View Props Contract | `contracts/view-props.md` | Complete — 6 component interfaces + hook |
| Server API Contract | `contracts/server-api.md` | Complete — extended response schema, GraphQL fragments, transformer functions |
| Data Types Contract | `contracts/data-types.md` | Complete — all TypeScript type definitions |
| Quickstart | `quickstart.md` | Complete — file map, implementation order, verification steps |
| Agent Context | `.github/agents/copilot-instructions.md` | Updated with 009 technologies and types |

**Next**: Run `/speckit.tasks` to generate `tasks.md` from these artifacts.
