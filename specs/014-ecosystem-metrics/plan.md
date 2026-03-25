# Implementation Plan: Ecosystem Metrics

**Branch**: `014-ecosystem-metrics` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/014-ecosystem-metrics/spec.md`

## Summary

Enhance the force graph with discoverable ecosystem metrics — aggregate counts, bridge connectors, space engagement rankings, top connectors leaderboard, and contextual nudges — surfaced in an expandable bottom panel and optional floating nudge cards. All metrics are computed client-side from the existing `GraphDataset` with no server changes. Restricted nodes are excluded from all computations with a visible indicator.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, ESM), React 19  
**Primary Dependencies**: React 19, Vite 7, D3.js v7 (existing)  
**Storage**: N/A (no backend / storage changes)  
**Testing**: Vitest (frontend/), manual visual testing  
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge)  
**Project Type**: Web application (frontend-only change)  
**Performance Goals**: Metric computation ≤ 10ms for 500 nodes; panel open/close animation ≤ 300ms; filter-change re-computation ≤ 500ms  
**Constraints**: Must coexist with all existing graph modes (force, map, timeline, chord); must not exceed 16ms frame budget when filters change  
**Scale/Scope**: Typical ecosystems up to ~500 nodes. Primary changes: new computation hook, new/modified panel components, Explorer wiring

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Auth | ✅ Pass | No auth changes. All data already in client memory. |
| II. Typed GraphQL Contract | ✅ Pass | No GraphQL changes. No new queries. |
| III. BFF Boundary | ✅ Pass | Frontend-only — no new API calls. All metrics computed from existing `GraphDataset`. |
| IV. Data Sensitivity | ✅ Pass | No new data exposure. Restricted nodes excluded from metrics. No cache changes. |
| V. Graceful Degradation | ✅ Pass | Empty/minimal graphs show zero counts and suppress irrelevant rankings/nudges. Missing optional fields cannot crash computation. |
| VI. Design Fidelity | ✅ Pass | Expandable bottom panel extends existing `MetricsBar` pattern. Uses existing design tokens. No conflict with design brief — new interaction not covered by brief, so spec governs. |

## Project Structure

### Documentation

```text
specs/014-ecosystem-metrics/
├── plan.md              # This file
├── research.md          # Phase 0: computation approach research
├── data-model.md        # Phase 1: data structures & interfaces
├── quickstart.md        # Phase 1: dev setup & testing guide
├── contracts/           # Empty — no API changes (frontend-only)
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code

```text
frontend/src/
├── hooks/
│   └── useEcosystemMetrics.ts          # NEW — compute all metrics from GraphDataset + filters
├── components/panels/
│   ├── MetricsBar.tsx                  # MODIFY — collapsed state (aggregate counts + headline insights)
│   ├── MetricsBar.module.css           # MODIFY — support collapsed/expanded states
│   ├── MetricsPanel.tsx                # NEW — expanded state (rankings, leaderboard, drill-downs)
│   ├── MetricsPanel.module.css         # NEW — expanded panel styles
│   ├── NudgeCard.tsx                   # NEW — floating nudge card component (P3)
│   └── NudgeCard.module.css            # NEW — nudge card styles (P3)
├── pages/
│   └── Explorer.tsx                    # MODIFY — wire useEcosystemMetrics, pass props, handle graph interactions
└── styles/
    └── tokens.css                      # NO CHANGE — uses existing tokens
```

**Structure Decision**: Extract all metric computation into a single custom hook (`useEcosystemMetrics`) that takes the `GraphDataset` and current filter state, returns computed metrics. The hook uses `useMemo` for efficient re-computation on filter changes. UI is split between the existing `MetricsBar` (enhanced for collapsed state with headline insights) and a new `MetricsPanel` (expanded state with full rankings). This keeps the computation logic testable and independent from rendering.

## Technical Approach

### Architecture

```
Explorer.tsx (orchestrator)
  │
  ├── useEcosystemMetrics(dataset, filters)
  │     └── Returns: EcosystemMetrics (all computed data)
  │
  ├── MetricsBar (collapsed — always visible)
  │     ├── Aggregate counts: users, orgs, subspaces, bridge connectors
  │     ├── 0–4 headline insights (threshold-based)
  │     └── Expand toggle → opens MetricsPanel
  │
  ├── MetricsPanel (expanded — overlay above MetricsBar)
  │     ├── Space engagement rankings (sorted by member count)
  │     ├── Top connectors leaderboard (by distinct space count)
  │     ├── Bridge connector details
  │     ├── Multi-space user details
  │     └── Click handlers → setHighlightedNodeIds / setSelectedNode
  │
  └── NudgeCard[] (floating, optional, P3)
        ├── Contextual insight messages
        ├── Dismissable
        └── Click → graph interaction
```

### Computation Flow

```
GraphDataset (nodes[], edges[]) + filter state (showPeople, showOrgs, showSpaces)
  │
  ├─ 1. Filter: exclude restricted nodes (node.restricted === true)
  ├─ 2. Filter: apply visibility toggles (showPeople, showOrgs, showSpaces)
  ├─ 3. Filter: only edges where both endpoints are visible
  │
  ├─ 4. Aggregate counts:
  │     ├── users = visible nodes where type === USER
  │     ├── orgs = visible nodes where type === ORGANIZATION
  │     ├── subspaces = visible nodes where type === SPACE_L1 | SPACE_L2
  │     └── totalEdges = visible edge count
  │
  ├─ 5. Bridge connectors:
  │     ├── For each USER node: count distinct L0 scopeGroups from their edges
  │     └── Bridge = user with 2+ distinct L0 scope groups
  │
  ├─ 6. Multi-space users:
  │     ├── For each USER node: group edges by L0 parent, count distinct L1/L2 targets per L0
  │     └── Multi-space = user with 2+ subspaces within any single L0
  │
  ├─ 7. Space engagement rankings:
  │     ├── For each SPACE_L1/L2 node: count connected USER/ORG members via edges
  │     └── Sort descending by member count
  │
  ├─ 8. Top connectors:
  │     ├── For each USER/ORG node: count distinct spaces connected to (via edge targetId → space node)
  │     ├── Exclude nodes with < 2 connections
  │     └── Sort by distinct space count descending, ties alphabetical
  │
  ├─ 9. Org distribution per L0:
  │     └── For each L0 space: count distinct orgs connected to it or its subspaces
  │
  └─ 10. Headline insights (threshold-based, 0–4 shown):
        ├── Bridge connectors > 0 → "N users active across M+ spaces"
        ├── Busiest subspace has 10+ members → "Space X has Y members — busiest subspace"
        ├── Top connector has 3+ spaces → "Top connector: Name — N spaces"
        └── Org diversity > 5 → "N organisations across the ecosystem"
```

### Graph Interaction Model

When the user clicks a metric, ranking entry, or nudge:
1. **Highlight**: Set `highlightedNodeIds` in Explorer state → ForceGraph dims non-highlighted nodes
2. **Focus**: For space rankings, optionally center the graph view on the target space
3. **Select**: For top connectors, set `selectedNode` → opens DetailsDrawer

The existing `highlightedNodeIds` and `setSelectedNode` mechanisms in Explorer.tsx already support all three interaction types.

### MetricsBar Enhancement (Collapsed State)

The current `MetricsBar` shows 4 items (nodes, edges, avg degree, density). The enhanced version:
- Replaces raw counts with semantic labels: "N users · N organisations · N subspaces · N bridge connectors"
- Adds 0–4 headline insight chips (clickable)
- Adds an expand/collapse toggle button (chevron)
- Retains the slim single-row bar aesthetic
- Shows a restricted-data indicator (asterisk/tooltip) when restricted nodes exist

### MetricsPanel (Expanded State)

Opens above the MetricsBar as an overlay panel (max-height ~40vh, scrollable):
- **Tab sections**: Overview │ Rankings │ Connectors
- **Overview**: All aggregate counts + all headline insights
- **Rankings**: Space engagement table (name, member count, click to highlight)
- **Connectors**: Top connectors leaderboard + bridge connector list (click to select/highlight)
- Close via the same toggle or an explicit close button

### Performance Considerations

- All computations are `useMemo`-ized with `[dataset, showPeople, showOrganizations, showSpaces]` dependencies
- For 500 nodes × ~2000 edges, the full computation pipeline involves Map/Set operations that complete in <10ms
- No D3 re-renders triggered — only React state changes for `highlightedNodeIds` / `selectedNode`
- Panel open/close uses CSS `max-height` transition (no layout thrash)

## Post-Design Constitution Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Auth | ✅ Pass | No change. |
| II. Typed GraphQL Contract | ✅ Pass | No change. |
| III. BFF Boundary | ✅ Pass | No API calls added. |
| IV. Data Sensitivity | ✅ Pass | Restricted nodes excluded. No new data surfaced beyond what's already in GraphDataset. |
| V. Graceful Degradation | ✅ Pass | Empty graphs → zeros. Single L0 → bridge count 0 (not "N/A"). Minimal data → nudges suppressed. |
| VI. Design Fidelity | ✅ Pass | Extends existing MetricsBar. Uses project design tokens. No visual conflict with brief. |

## Complexity Tracking

No constitution violations to justify. Feature is frontend-only, uses existing data structures, and follows established patterns.
