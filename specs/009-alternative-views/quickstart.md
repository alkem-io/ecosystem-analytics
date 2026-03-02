# 009 — Alternative Views: Quickstart

**Date**: 2026-03-02

---

## Prerequisites

- Node.js ≥ 20, pnpm ≥ 9
- Running Alkemio instance (or cached data in `server/data/`)
- `.env` configured (see root README)

```bash
# Install dependencies
pnpm install --recursive

# Start both server and frontend
cd server && pnpm dev &
cd frontend && pnpm dev
```

---

## Key Files to Touch

### Server (BFF)

| File | Change |
|------|--------|
| `server/src/types/graph.ts` | Add `createdDate`, `visibility`, `tags` on `GraphNode`; `createdDate` on `GraphEdge`; `SpaceTimeSeries`, `ActivityTimeBucket` types; extend `GraphDataset` |
| `server/src/graphql/queries/` | Add `createdDate`, `visibility`, `tagsets` to space/user/org queries |
| `server/codegen.ts` | Regenerate types after query changes |
| `server/src/transform/transformer.ts` | Add `buildTimeSeries()`, `estimateEdgeCreatedDate()`; extend `transformToGraph()` |

### Frontend — New Components

| File | Purpose |
|------|---------|
| `frontend/src/components/views/ViewSwitcher.tsx` | Tab bar to switch between view modes |
| `frontend/src/components/views/TreemapView.tsx` | D3 treemap visualization |
| `frontend/src/components/views/SunburstView.tsx` | Zoomable sunburst (d3-hierarchy partition) |
| `frontend/src/components/views/ChordView.tsx` | Chord diagram (d3-chord) |
| `frontend/src/components/views/TimelineView.tsx` | Stacked area chart + brush (d3-shape, d3-brush) |

### Frontend — Extended

| File | Change |
|------|--------|
| `frontend/src/components/graph/ForceGraph.tsx` | Add temporal mode props: `temporalMode`, `temporalDate`, `onTemporalDateChange` |
| `frontend/src/pages/Explorer.tsx` | Integrate `ViewState`, render active view based on `viewState.mode` |
| `frontend/src/components/panels/ControlPanel.tsx` | Add view-specific controls (size metric, chord mode, playback) |

### Frontend — New Hooks & Types

| File | Purpose |
|------|---------|
| `frontend/src/hooks/useViewState.ts` | Centralized view state management |
| `frontend/src/hooks/useHierarchyData.ts` | Transform GraphNodes → `HierarchyDatum` tree |
| `frontend/src/hooks/useChordMatrix.ts` | Compute shared-member matrix from edges |
| `frontend/src/hooks/useTimeSeries.ts` | Parse `SpaceTimeSeries[]` for d3 scales |
| `frontend/src/types/views.ts` | All new types: `ViewMode`, `ViewState`, `HierarchyDatum`, etc. |

---

## Implementation Order

```
Phase 1 — Foundation
  ├─ server/types + queries + transformer (createdDate, visibility, tags, timeSeries)
  ├─ frontend/types/views.ts (all new types)
  ├─ frontend/hooks/useViewState.ts
  └─ frontend/components/views/ViewSwitcher.tsx (tab bar only)

Phase 2 — Hierarchy Views
  ├─ frontend/hooks/useHierarchyData.ts
  ├─ frontend/components/views/TreemapView.tsx
  └─ frontend/components/views/SunburstView.tsx

Phase 3 — Relational Views
  ├─ frontend/hooks/useChordMatrix.ts
  └─ frontend/components/views/ChordView.tsx

Phase 4 — Temporal Views
  ├─ frontend/hooks/useTimeSeries.ts
  ├─ frontend/components/views/TimelineView.tsx
  └─ frontend/components/graph/ForceGraph.tsx (temporal mode extension)

Phase 5 — Integration & Polish
  ├─ Explorer.tsx wiring
  ├─ ControlPanel.tsx view-specific controls
  └─ Visual regression tests
```

---

## Build Verification

After each phase, confirm:

```bash
# Type-check
cd frontend && pnpm tsc --noEmit
cd server && pnpm tsc --noEmit

# Lint
pnpm lint

# Dev smoke test
# 1. Open http://localhost:5173
# 2. Log in, select a space
# 3. Switch views via ViewSwitcher tabs
# 4. Verify each view renders without console errors
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Initial render (any view) | ≤ 500 ms |
| Treemap/Sunburst zoom | 60 fps |
| Temporal playback | 30 fps |
| Bundle size increase | ≤ 150 KB gzipped |

---

## D3 Module Checklist

Verify these are available (already in `package.json` or add):

```bash
cd frontend
pnpm ls d3-hierarchy d3-chord d3-shape d3-scale d3-brush d3-timer d3-interpolate
# If missing:
pnpm add d3-hierarchy d3-chord d3-shape d3-scale d3-brush d3-timer d3-interpolate
pnpm add -D @types/d3-hierarchy @types/d3-chord @types/d3-shape @types/d3-scale @types/d3-brush @types/d3-timer @types/d3-interpolate
```
