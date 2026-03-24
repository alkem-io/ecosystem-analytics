# Quickstart: Ecosystem Metrics

**Feature**: 014-ecosystem-metrics  
**Branch**: `014-ecosystem-metrics`

## Prerequisites

- Node.js 20+
- pnpm 9+
- Running BFF server (port 4000) with valid Alkemio credentials
- At least two L0 spaces loaded (to test bridge connectors and cross-space metrics)

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 014-ecosystem-metrics

# 2. Start the BFF server (if not already running)
cd server && pnpm run dev
# Server runs on http://localhost:4000

# 3. Start the frontend dev server (new terminal)
cd frontend && pnpm run dev
# Frontend runs on http://localhost:5173
```

## Testing the Feature

### P1: Ecosystem Overview at a Glance

1. Open http://localhost:5173
2. Log in with Alkemio credentials
3. Select one or more L0 spaces → click "Generate"
4. **Verify collapsed MetricsBar** shows:
   - Total users count
   - Total organisations count
   - Total subspaces count (L1+L2)
   - Bridge connectors count (if any)
   - 0–4 headline insight chips (if thresholds met)
5. If restricted nodes exist, verify the restricted-data indicator appears

### P1: Cross-Space Connection Discovery

1. Load a graph with 2+ L0 spaces where at least one user belongs to multiple spaces
2. Verify the bridge connectors count > 0 in the collapsed bar
3. Click the bridge connectors insight → bridging users should be highlighted on the graph
4. In expanded panel (Connectors tab), verify the bridge connector list shows user names and their L0 space count

### P2: Space Engagement Rankings

1. Load a graph with multiple L1/L2 subspaces
2. Click the expand toggle (chevron) on MetricsBar → MetricsPanel opens
3. Go to "Rankings" tab
4. Verify subspaces are sorted by member count (descending)
5. Click a subspace entry → its members should be highlighted on the graph

### P2: Top Connectors Leaderboard

1. In the expanded MetricsPanel, go to "Connectors" tab
2. Verify top connectors are sorted by distinct space count (descending)
3. Verify ties are broken alphabetically
4. Verify nodes with < 2 connections are excluded
5. Click a connector entry → node is selected, DetailsDrawer opens

### P3: Exploration Nudges

1. Load a graph with 10+ nodes
2. Verify floating nudge cards appear (if implemented)
3. Click a nudge → graph interaction triggers
4. Dismiss a nudge → it disappears and does not return for this session

### Filter Reactivity

1. Load a graph with users, organisations, and spaces visible
2. Note the metrics counts
3. Toggle "Hide People" → verify all user-related metrics update immediately (user count → 0, bridge connectors → 0, etc.)
4. Toggle "Hide Organisations" → verify org counts update
5. Re-enable all → metrics return to original values

### Edge Cases

1. **Empty graph**: Load with no spaces → metrics show zeros, no nudges
2. **Single L0 space**: Bridge connector count should show 0
3. **All same connectivity**: Top connectors should be alphabetically sorted
4. **Restricted nodes**: If a space is restricted, verify it's not counted in rankings

## Verification Checklist

- [ ] Collapsed MetricsBar shows semantic counts (users, orgs, subspaces)
- [ ] Collapsed bar shows 0–4 headline insights
- [ ] Expand toggle opens MetricsPanel overlay
- [ ] MetricsPanel has Overview / Rankings / Connectors tabs
- [ ] Space rankings sorted by member count descending
- [ ] Top connectors sorted by distinct space count descending
- [ ] Bridge connectors listed with L0 space names
- [ ] Clicking any metric/ranking/connector interacts with the graph
- [ ] Metrics update within 500ms when filters change
- [ ] Restricted nodes excluded with visible indicator
- [ ] Empty graph shows zeros gracefully
- [ ] Panel close returns to slim bar
- [ ] No visual regressions in force/map/timeline/chord modes

## Running Tests

```bash
cd frontend && pnpm run test        # Unit tests
cd frontend && pnpm run test:watch  # Watch mode during development
```
