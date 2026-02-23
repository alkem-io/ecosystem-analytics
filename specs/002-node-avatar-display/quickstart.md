# Quickstart: Node Avatar Display

**Feature**: 002-node-avatar-display
**Branch**: `002-node-avatar-display`

## Prerequisites

- Node.js 20+
- pnpm 9+
- Running BFF server (port 4000) with valid Alkemio credentials
- A space loaded with user members who have profile images set

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 002-node-avatar-display

# 2. Start the BFF server (if not already running)
cd server
pnpm install
npx tsx src/index.ts
# Server runs on http://localhost:4000

# 3. Start the frontend dev server (new terminal)
cd frontend
pnpm install
pnpm run dev
# Frontend runs on http://localhost:5173
```

## Testing the Feature

1. Open http://localhost:5173 in a browser
2. Log in with Alkemio credentials
3. Select a space that has user members (e.g., "DigiCampus")
4. Click "Generate" to load the graph
5. Observe user nodes — those with profile images should display the image clipped to a circle
6. Observe user nodes without images — they should show the default gray color fill

### Verification Checklist

- [ ] User nodes with avatars show profile images in circles
- [ ] User nodes without avatars show gray color fill (unchanged)
- [ ] Organization nodes with logos show logos in circles (P3)
- [ ] Organization nodes without logos show purple color fill (unchanged)
- [ ] Space nodes remain unchanged (color fills only)
- [ ] Zoom in/out — avatars scale with nodes
- [ ] Drag a node — avatar moves with it
- [ ] Switch layout modes (force/cluster/map) — avatars persist
- [ ] Search highlighting still works (opacity changes)
- [ ] No console errors from failed image loads

### Test with broken avatar URLs

To test the fallback behavior, you can temporarily modify a node's `avatarUrl` in the browser console or inspect the network tab to confirm `onerror` handling works for 404 responses.

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/graph/ForceGraph.tsx` | Add `<defs>`, `<clipPath>`, `<image>` for avatar rendering |

## Key Technical Details

- **Avatar URL source**: `d.data.avatarUrl` on the SimNode (from `GraphNode`)
- **Node radius formula**: `Math.sqrt(d.data.weight) * 3`
- **ClipPath ID format**: `clip-avatar-{nodeId}`
- **Fallback**: Background `<circle>` always rendered with node type color
