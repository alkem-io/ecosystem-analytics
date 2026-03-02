# Implementation Plan: Space Activity Volume

**Branch**: `008-space-activity` | **Date**: 2026-03-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/008-space-activity/spec.md`

## Summary

Add a "Space Activity" visualization mode that scales space node size and border glow by total contribution volume. Data is aggregated server-side from existing per-user-per-space activity counts. The frontend provides a separate toggle in the Activity section, animating size/stroke changes without simulation restart. A contribution count stat is shown in the details drawer for space nodes.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (strict mode)  
**Primary Dependencies**: React 19, D3.js v7.9, Express 5, Vite 7.3.1  
**Storage**: SQLite (better-sqlite3) for cache — no schema change needed  
**Testing**: Manual visual verification (quickstart.md checklist), TypeScript strict mode  
**Target Platform**: Web (modern browsers)  
**Project Type**: Web application (BFF server + React SPA)  
**Performance Goals**: Toggle animation ≤300ms, no simulation restart, no additional API calls  
**Constraints**: Must compose with existing Activity Pulse, role filters, visibility filters, and lock badges  
**Scale/Scope**: ~6 files modified, ~150 LOC net change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Auth | PASS | No auth changes |
| II. Typed GraphQL Contract | PASS | No new .graphql files — reuses existing `ActivityFeedGrouped` query |
| III. BFF Boundary | PASS | Aggregation is server-side; frontend reads from BFF response |
| IV. Data Sensitivity | PASS | No new data exposure — activity counts are already fetched |
| V. Graceful Degradation | PASS | FR-010: null/undefined/0 totalActivityCount → baseline size. FR-008: toggle disabled when no data |
| VI. Design Fidelity | PASS | Follows existing control panel patterns (checkbox toggle, stats section) |
| Dev Workflow — pnpm | PASS | No new dependencies |
| Dev Workflow — TypeScript strict | PASS | Required by SC-003 |
| Dev Workflow — Codegen | PASS | No .graphql changes — no codegen run needed |

**Post-design re-check**: All gates PASS. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/008-space-activity/
├── plan.md              # This file
├── research.md          # Phase 0: aggregation strategy, D3 animation, tier reuse
├── data-model.md        # Phase 1: GraphNode extensions, state changes, visual mapping
├── quickstart.md        # Phase 1: setup, verification checklists
├── contracts/
│   └── api-changes.md   # Phase 1: GraphNode response extension
└── tasks.md             # Phase 2 output (NOT created by /plan)
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── types/
│   │   └── graph.ts                    # GraphNode: +totalActivityCount, +spaceActivityTier
│   └── transform/
│       └── transformer.ts              # +aggregateSpaceActivityCounts(), attach to space nodes

frontend/
├── src/
│   ├── pages/
│   │   └── Explorer.tsx                # +spaceActivityEnabled state, wire to ControlPanel + ForceGraph
│   ├── components/
│   │   ├── graph/
│   │   │   └── ForceGraph.tsx          # +spaceActivityEnabled prop, sizing/glow useEffect
│   │   └── panels/
│   │       ├── ControlPanel.tsx        # +Space Activity checkbox, pass through props
│   │       └── DetailsDrawer.tsx       # +Contributions stat for space nodes
```

**Structure Decision**: Follows existing web application layout. All changes are additions to existing files — no new files except documentation.

## Implementation Phases

### Phase 1: Data Pipeline (Server)
- Add `totalActivityCount` and `spaceActivityTier` to `GraphNode` interface
- Add `aggregateSpaceActivityCounts()` function to transformer
- Wire aggregation into the existing activity data attachment flow
- Attach fields to space nodes in `addSpaceNode()`

### Phase 2: Toggle & Props (Frontend Scaffolding)
- Add `spaceActivityEnabled` state to Explorer.tsx
- Add `spaceActivityEnabled` + `onToggleSpaceActivity` props to ControlPanel
- Add "Space Activity" checkbox in Activity section
- Add `spaceActivityEnabled` prop to ForceGraph

### Phase 3: Activity Sizing useEffect (US1 — P1)
- Compute per-node activity radius (log-scaled, max 2.5×, per-level peers)
- D3 transition on `circle[r]`, `image[x,y,width,height]`, `clipPath[r]`
- Badge repositioning for lock icon (FR-009)
- Reverse transitions on disable
- Respect `prefers-reduced-motion`

### Phase 4: Border Glow (US2 — P2)
- Apply tier-based `stroke`, `stroke-width` via D3 transition
- Add `drop-shadow` filter for HIGH tier
- Remove glow on disable

### Phase 5: Details Drawer Stat (FR-011)
- Add "Contributions" stat to DetailsDrawer for space nodes
- Always shown (not gated by toggle)

### Phase 6: Polish & Validation
- Verify graceful degradation (null/0 activity)
- TypeScript strict mode (server + frontend)
- Composition testing (Activity Pulse + Space Activity + role filters + visibility filters)
- Run quickstart checklist

## Complexity Tracking

No violations — no complexity justification needed.
