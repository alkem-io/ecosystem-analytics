# Implementation Plan: Role-Based Filters & Connection Colors

**Branch**: `006-role-filters` | **Date**: 2026-02-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-role-filters/spec.md`

## Summary

Add three role-based filter toggles (Members, Leads, Admins) to the control panel, letting users isolate or combine role-based connections. The server fetches admin users via `usersInRole(role: ADMIN)` and produces `ADMIN`-type edges alongside existing `MEMBER` and `LEAD` edges. On the frontend, role filter changes are handled as lightweight D3 visual-state updates (show/hide edges + prune orphaned nodes) — no simulation restart or full SVG rebuild. Edge colors are updated to a four-color WCAG-accessible palette: indigo (CHILD), amber (LEAD), teal (ADMIN), slate (MEMBER).

## Technical Context

**Language/Version**: TypeScript 5.9.3 (strict mode), React 19.x  
**Primary Dependencies**: D3 v7.9, Express 5, Vite 7.3.1, `@graphql-codegen/cli` (typed SDK)  
**Storage**: SQLite cache (per-user per-space, via better-sqlite3) — no schema changes  
**Testing**: Manual visual testing, Playwright visual regression  
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge)  
**Project Type**: Web application (frontend + BFF server)  
**Performance Goals**: Role filter toggle reflected in graph within 300ms (SC-003); no simulation restart  
**Constraints**: WCAG AA ≥ 3:1 contrast for LEAD/ADMIN/CHILD edges (SC-005); MEMBER edges intentionally subtler for visual hierarchy  
**Scale/Scope**: ~8 files modified across server + frontend; 1 new EdgeType value; 3 new filter state variables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Auth | ✅ Pass | No authentication changes. Admin roles use existing bearer token forwarding. |
| II. Typed GraphQL Contract | ✅ Pass | `communityRolesFragment.graphql` will be extended with `adminUsers: usersInRole(role: ADMIN)`. `pnpm run codegen` MUST be re-run to regenerate the typed SDK. |
| III. BFF Boundary | ✅ Pass | Admin data is fetched server-side in the BFF transformer. Frontend receives the graph dataset via ` POST /api/graph/generate` — no direct Alkemio access. |
| IV. Data Sensitivity | ✅ Pass | Admin role membership is role data already accessible to the authenticated user. Cache is per-user per-space. No new data sensitivity. |
| V. Graceful Degradation | ✅ Pass | If `usersInRole(role: ADMIN)` returns empty (no admins or API error), the ADMIN filter simply shows count 0. If `community` is null (no access), admins are skipped like members/leads. |
| VI. Design Fidelity | ✅ Pass | New edge colors and filter UI follow existing control panel patterns. Legend updated to match. No conflicts with the design brief. |

## Project Structure

### Documentation

```text
specs/006-role-filters/
├── plan.md              # This file
├── research.md          # Phase 0: edge color research, filtering architecture
├── data-model.md        # Phase 1: EdgeType extension, filter state model
├── quickstart.md        # Phase 1: dev setup & testing guide
├── contracts/           # Phase 1: updated GraphQL fragment, type diffs
└── tasks.md             # Phase 2: task breakdown (not created by /plan)
```

### Source Code

```text
server/
├── src/
│   ├── types/
│   │   └── graph.ts                                    # MODIFY — add ADMIN to EdgeType, EDGE_WEIGHT
│   ├── graphql/
│   │   ├── fragments/
│   │   │   └── communityRolesFragment.graphql           # MODIFY — add adminUsers field
│   │   └── generated/
│   │       └── alkemio-schema.ts                        # REGENERATE — pnpm run codegen
│   └── transform/
│       └── transformer.ts                               # MODIFY — add admin edge creation, update activity filter

frontend/
├── src/
│   ├── pages/
│   │   └── Explorer.tsx                                 # MODIFY — add showMembers/showLeads/showAdmins state
│   ├── components/
│   │   ├── graph/
│   │   │   └── ForceGraph.tsx                           # MODIFY — EDGE_COLORS, role filter useEffect, props
│   │   └── panels/
│   │       ├── ControlPanel.tsx                         # MODIFY — pass-through role filter props, legend update
│   │       └── FilterControls.tsx                       # MODIFY — add 3 role sub-toggles with counts
└── tests/
    └── visual/
        └── ecosystem-analytics.visual.spec.mjs          # UPDATE — add role filter visual test if applicable
```

**Structure Decision**: Web application (frontend + BFF server). All changes are modifications to existing files — no new modules needed. The feature adds a new `EdgeType.ADMIN` value and 3 filter state variables that flow from Explorer → ControlPanel → FilterControls/ForceGraph.

## Technical Approach

### Architecture

```
Server pipeline (data acquisition):
  communityRolesFragment.graphql
    └── adds: adminUsers: usersInRole(role: ADMIN) { id }
  transformer.ts → addContributorEdges()
    └── adds: for (adminUsers) → edges.push(createEdge(id, space.id, EdgeType.ADMIN))
    └── updates: activity attachment filters to include ADMIN edges

Frontend pipeline (rendering):
  Explorer.tsx
    └── State: showMembers (true), showLeads (true), showAdmins (true)
    └── Passes to ControlPanel + ForceGraph

  ForceGraph.tsx
    └── EDGE_COLORS: { CHILD: indigo, LEAD: amber, ADMIN: teal, MEMBER: slate }
    └── Role filter refs: showMembersRef, showLeadsRef, showAdminsRef
    └── NEW useEffect (role-filter-visibility):
        1. For each link in linkSelRef: set display based on type vs filter state
        2. Compute visibleUserIds (users with ≥1 visible edge)
        3. For each node in nodeSelRef: hide USER nodes with no visible edges
        4. Compose with selection/pulse effects

  FilterControls.tsx
    └── 3 new checkboxes: Members (count), Leads (count), Admins (count)
    └── Indented under People toggle for hierarchy

  ControlPanel.tsx
    └── Legend: 4 connection types with new colors
```

### Role Filter as Visual-State Effect (FR-008)

The existing People/Orgs/Spaces filters are in the `renderGraph` dependency array and trigger a full SVG rebuild. Role filters use a different pattern to avoid simulation restart:

1. **Store filter booleans in refs** (like `activityPulseEnabledRef`).
2. **Add as props** so changes trigger a re-render but not `renderGraph`.
3. **Dedicated useEffect** watches `[showMembers, showLeads, showAdmins, graphVersion]`:
   - Iterates `linkSelRef.current`, sets `display: none` on hidden role types.
   - Computes which USER nodes still have ≥1 visible edge.
   - Sets `display: none` on orphaned USER nodes.
   - Composes: re-applies selection highlighting if `selectedNodeIdRef.current` is set.
4. **visibleEdgesRef** is updated to reflect role-filtered edges (for correct neighbor computation in selection highlighting).

### Edge Color Palette

| Type | Color | Hex | RGBA | Rationale |
|------|-------|-----|------|-----------|
| CHILD | Indigo | `#4338ca` | `rgba(67,56,202,0.60)` | Unchanged hue, refined saturation |
| LEAD | Amber | `rgba(234,88,12,0.60)` | orange-600 | Highly visible warm tone, replaces brown |
| ADMIN | Teal | `rgba(13,148,136,0.60)` | teal-600 | Cool green-blue, distinct from all |
| MEMBER | Slate | `rgba(148,163,184,0.35)` | slate-400 | Intentionally subtle for majority edges |

Colors chosen from Tailwind palette for maximum hue separation. CHILD/LEAD/ADMIN meet WCAG AA 3:1 at their opacity levels. MEMBER is intentionally subtler to reduce visual noise — this is a documented design trade-off.

## Complexity Tracking

> No Constitution Check violations — table not needed.
