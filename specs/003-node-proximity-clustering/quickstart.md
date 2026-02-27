# Quickstart: Node Proximity Clustering

**Feature**: 003-node-proximity-clustering
**Branch**: `003-node-proximity-clustering`

## Prerequisites

- Node.js 20+
- pnpm 9+
- Running BFF server (port 4000) with valid Alkemio credentials
- A space with many members at the same location (e.g., DigiCampus — many users in Amsterdam/The Hague)

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 003-node-proximity-clustering

# 2. Start the BFF server (if not already running)
cd server && npx tsx src/index.ts
# Server runs on http://localhost:4000

# 3. Start the frontend dev server (new terminal)
cd frontend && pnpm run dev
# Frontend runs on http://localhost:5173
```

## Testing the Feature

### Map Mode (Primary Test)

1. Open http://localhost:5173
2. Log in with Alkemio credentials
3. Select a space with many co-located users (e.g., DigiCampus)
4. Click "Generate" → graph loads
5. Enable **Map mode** (toggle in toolbar)
6. Observe: nodes at the same city should collapse into `+N` badges
7. **Click** a badge → nodes fan out in a circle
8. **Click background** → nodes collapse back into badge
9. Click a fanned-out node → details panel opens normally

### Force Mode Test

1. Load any space in default force-directed layout
2. If nodes cluster during simulation warm-up, badges should appear temporarily
3. As simulation stabilizes and nodes spread, badges dissolve
4. Verify no visual regressions — nodes behave as before when not overlapping

### Verification Checklist

- [ ] Overlapping nodes in map mode collapse into `+N` badges
- [ ] Badge shows correct count
- [ ] Clicking badge fans out member nodes in a circle
- [ ] Clicking background collapses fan-out back into badge
- [ ] Fanned-out nodes show avatars (from feature 002)
- [ ] Fanned-out nodes are clickable (opens details)
- [ ] Search highlighting works with clusters (badge gets highlighted if member matches)
- [ ] Selected node auto-expands its cluster
- [ ] Switching layout modes recalculates clusters
- [ ] Toggling people/org visibility recalculates clusters
- [ ] Zooming in reduces clustering (nodes spread apart visually)
- [ ] Zooming out increases clustering (nodes appear closer)
- [ ] Performance is smooth with 200+ nodes
- [ ] No console errors

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/graph/proximityClustering.ts` | **NEW** — pure function for proximity grouping |
| `frontend/src/components/graph/ForceGraph.tsx` | **MODIFY** — integrate clustering in tick, badge rendering, fan-out |
