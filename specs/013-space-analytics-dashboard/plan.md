# Implementation Plan: Space Analytics Dashboard

**Branch**: `013-space-analytics-dashboard` | **Date**: 2026-03-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/013-space-analytics-dashboard/spec.md`

## Summary

Add a dedicated Space Analytics Dashboard page that provides inward-looking analytics for a single Alkemio space. The dashboard displays headline metric cards (callouts, contributions, comments, contributors, engagement ratio), time-series activity charts, contributor rankings, subspace distribution, content type breakdowns, and engagement quality metrics. Data is fetched via new GraphQL queries that traverse the Space → Collaboration → CalloutsSet → Callout → Contribution/Comment hierarchy, aggregated by a new BFF analytics service, cached per-user per-space in SQLite, and rendered via D3.js visualizations in a new React page alongside the existing Explorer.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (server + frontend)
**Primary Dependencies**: Express 5, D3.js 7, React 19, Vite 7, `graphql-request` 7, `@graphql-codegen/cli` 6, `better-sqlite3`
**Storage**: SQLite (better-sqlite3) for server-side per-user per-space cache
**Testing**: Vitest 4 (both server and frontend)
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge), screen widths 1024px–2560px
**Project Type**: Web — `server/` (Express BFF) + `frontend/` (React SPA)
**Performance Goals**: Dashboard loads within 5 seconds of space selection (SC-001); D3 visualizations render at 60fps for up to 500 data points
**Constraints**: No direct Alkemio API access from frontend (BFF boundary); 24-hour cache TTL; all GraphQL via codegen SDK
**Scale/Scope**: Single space with up to ~50 subspaces, ~500 callouts, ~5000 contributions, ~200 members; 8+ dashboard panels

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Auth (Kratos) | ✅ PASS | Dashboard uses existing bearer token flow; no new auth surface. FR-013 explicitly requires no separate login. |
| II. Typed GraphQL Contract | ✅ PASS | New `.graphql` query files for space analytics data (callouts, contributions, comments); codegen regenerated. No raw query strings. |
| III. BFF Boundary | ✅ PASS | All analytics data fetched server-side via new `/api/dashboard/*` endpoints; frontend receives pre-aggregated analytics payload. |
| IV. Data Sensitivity | ✅ PASS | Analytics cache scoped by `(user_id, space_id)` reusing existing cache pattern; no tokens logged; parameterized SQL. |
| V. Graceful Degradation | ✅ PASS | Each panel shows individual loading skeleton (FR-010); zero-data spaces show empty states (FR-011); missing optional fields do not crash. |
| VI. Design Fidelity | ✅ PASS | New dashboard page follows existing design token system and layout patterns. No design brief conflict — dashboard is a new page, not modifying existing Explorer. |
| Security: No creds in .env | ✅ PASS | No new credentials needed. |
| Security: Cache per-user | ✅ PASS | Analytics data embedded in per-user per-space cache entries. |
| Dev: pnpm, tsc --noEmit | ✅ PASS | Standard workflow; codegen after new .graphql files. |

**Gate result: ALL PASS — proceed to Phase 0.**

**Post-Phase 1 re-check**: ALL PASS. New GraphQL queries use codegen SDK; new BFF endpoints follow existing auth middleware pattern; new frontend page follows BFF-only data flow.

## Project Structure

### Documentation (this feature)

```text
specs/013-space-analytics-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── dashboard-api.md # BFF REST API contract for dashboard endpoints
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── graphql/
│   │   ├── queries/
│   │   │   └── spaceAnalytics.graphql       # NEW — collaboration/callout/contribution data (reused per-subspace via iteration)
│   │   ├── fragments/
│   │   │   └── analyticsFragments.graphql   # NEW — reusable fragments for analytics types
│   │   └── generated/
│   │       └── alkemio-schema.ts            # REGENERATED after codegen
│   ├── routes/
│   │   └── dashboard.ts                     # NEW — /api/dashboard/* endpoints
│   ├── services/
│   │   └── dashboard-service.ts             # NEW — analytics data acquisition + aggregation
│   ├── transform/
│   │   └── dashboard-transform.ts           # NEW — raw GraphQL → DashboardDataset
│   └── types/
│       ├── dashboard.ts                     # NEW — DashboardDataset, metrics interfaces
│       └── api.ts                           # MODIFIED — add DashboardRequest type

frontend/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx                    # NEW — Space Analytics Dashboard page
│   │   └── Dashboard.module.css             # NEW — Dashboard page styles
│   ├── components/
│   │   └── dashboard/                       # NEW — dashboard-specific components
│   │       ├── HeadlineMetrics.tsx           # Metric cards grid
│   │       ├── ActivityTimeline.tsx          # D3 time-series chart
│   │       ├── ContributorRanking.tsx        # Bar chart / leaderboard
│   │       ├── SubspaceDistribution.tsx      # Treemap / sunburst
│   │       ├── ContentTypeMix.tsx            # Pie / donut chart
│   │       ├── EngagementQuality.tsx         # Engagement metrics panel
│   │       ├── DashboardFilters.tsx          # Time range + phase/tab filters
│   │       ├── DashboardSpacePicker.tsx      # Inline space selector
│   │       └── DashboardPanel.tsx            # Shared panel wrapper (loading/empty states)
│   ├── hooks/
│   │   └── useDashboard.ts                  # NEW — data fetching + state for dashboard
│   ├── services/
│   │   └── api.ts                           # MODIFIED — add dashboard API methods
│   └── App.tsx                              # MODIFIED — add /dashboard route
```

**Structure Decision**: Web application with separate `server/` (Express BFF) and `frontend/` (React SPA), matching the existing repository structure. New dashboard code is additive — new route, service, and component directory — with minimal modifications to existing files.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
