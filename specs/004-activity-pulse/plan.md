# Implementation Plan: Activity Pulse Visualization

**Branch**: `004-activity-pulse` | **Date**: 2026-02-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-activity-pulse/spec.md`

## Summary

Add an "Activity Pulse" mode to the ecosystem analytics graph that animates user→space edges based on contribution intensity. Contribution data is fetched during initial graph generation via the Alkemio `activityFeedGrouped` query (filtered by spaceIds), aggregated per user per space, and included in the `GraphDataset`. On the frontend, a toggle in the ControlPanel enables/disables the pulse animation (CSS `@keyframes` animating `stroke-dashoffset` on SVG paths — compositor-driven, zero JS per-frame cost). Edge animation speed is mapped to percentile-based activity tiers. Respects `prefers-reduced-motion` by using static color/thickness indicators instead.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (server + frontend)  
**Primary Dependencies**: Express 5, D3.js 7, React 19, `graphql-request` 7, `@graphql-codegen/cli` 6  
**Storage**: SQLite (better-sqlite3) for server-side cache; in-memory dataset on frontend  
**Testing**: Vitest 4 (both server and frontend)  
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge)  
**Project Type**: Web — `server/` (Express BFF) + `frontend/` (React SPA)  
**Performance Goals**: 30+ fps with up to 500 animated edges; pulse toggle activates in <500ms  
**Constraints**: No direct Alkemio API access from frontend (BFF boundary); 24-hour cache TTL  
**Scale/Scope**: Typical ecosystems have 50-500 user→space edges; activity data for all users in selected spaces

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Auth (Kratos) | ✅ PASS | Activity queries use existing bearer token forwarding; no new auth surface |
| II. Typed GraphQL Contract | ✅ PASS | New `activityFeedGrouped.graphql` query added to `src/graphql/queries/`; codegen regenerated |
| III. BFF Boundary | ✅ PASS | Activity data fetched server-side during graph generation; frontend receives pre-aggregated counts in `GraphDataset` |
| IV. Data Sensitivity | ✅ PASS | Activity counts are per-user per-space; cache scoped by `(user_id, space_id)` as existing; no tokens logged |
| V. Graceful Degradation | ✅ PASS | If activity fetch fails, toggle is disabled with tooltip (FR-007); graph remains fully functional |
| VI. Design Fidelity | ✅ PASS | New UI is a single toggle following existing ControlPanel patterns; no design brief conflict |
| Security: No creds in .env | ✅ PASS | No new credentials needed |
| Security: Cache per-user | ✅ PASS | Activity data embedded in existing per-user cached dataset |
| Dev: pnpm, tsc --noEmit | ✅ PASS | Standard workflow; codegen after new .graphql file |

**Gate result: ALL PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/004-activity-pulse/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── activity-api.md  # Internal API contract for activity data
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── graphql/
│   │   ├── queries/
│   │   │   └── activityFeedGrouped.graphql  # NEW — activity feed query
│   │   └── generated/
│   │       └── alkemio-schema.ts           # REGENERATED after codegen
│   ├── services/
│   │   ├── acquire-service.ts              # MODIFIED — add activity acquisition
│   │   └── graph-service.ts                # MODIFIED — integrate activity into pipeline
│   ├── transform/
│   │   └── transformer.ts                  # MODIFIED — attach activity counts to edges
│   └── types/
│       └── graph.ts                        # MODIFIED — add ActivityCount, extend GraphEdge

frontend/
├── src/
│   ├── components/
│   │   ├── graph/
│   │   │   └── ForceGraph.tsx              # MODIFIED — pulse animation logic
│   │   └── panels/
│   │       └── ControlPanel.tsx            # MODIFIED — Activity Pulse toggle
│   └── pages/
│       └── Explorer.tsx                    # MODIFIED — activityPulse state + prop threading
```

**Structure Decision**: Extends existing web application structure. No new directories needed — activity data flows through the existing acquire → transform → serve pipeline. Frontend changes are additive to existing components.

## Post-Design Constitution Re-Check

*After Phase 1 design completion. Verifying no design decisions violate constitution.*

| Principle | Status | Post-Design Notes |
|-----------|--------|-------------------|
| I. Alkemio Identity Auth (Kratos) | ✅ PASS | No change — `activityFeedGrouped` uses existing bearer token flow |
| II. Typed GraphQL Contract | ✅ PASS | `activityFeedGrouped.graphql` → codegen SDK; no raw query strings |
| III. BFF Boundary | ✅ PASS | Activity aggregation happens server-side; frontend only receives pre-computed tiers on edges |
| IV. Data Sensitivity | ✅ PASS | Activity counts are aggregated (not raw logs); no PII in counts; cached per-user |
| V. Graceful Degradation | ✅ PASS | `hasActivityData` flag → disabled toggle with tooltip; graph fully functional without activity data |
| VI. Design Fidelity | ✅ PASS | Toggle follows existing ControlPanel checkbox pattern; no design brief conflicts |
| Security: Cache per-user | ✅ PASS | Activity data embedded in existing `(userId, spaceId)` cache entries |
| Dev: codegen workflow | ✅ PASS | New `.graphql` file triggers `pnpm run codegen`; generated files committed |
| Accessibility | ✅ PASS | `prefers-reduced-motion` → static CSS variant (FR-014); CSS-only approach |

**Post-design gate result: ALL PASS.**
