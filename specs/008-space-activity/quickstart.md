# Quickstart: Space Activity Volume

**Feature**: 008-space-activity  
**Date**: 2026-03-02

## Prerequisites

- Node.js 20+, pnpm >= 9
- Running Alkemio platform instance with spaces that have activity data (contributions)
- Valid Alkemio credentials (email/password)
- Repository on branch `008-space-activity`

## Setup

```bash
# Install dependencies
cd server && pnpm install
cd ../frontend && pnpm install
cd ..
```

## Development

```bash
# Terminal 1: Start BFF server
cd server
cp .env.example .env  # Edit ALKEMIO_GRAPHQL_ENDPOINT if needed
pnpm run dev

# Terminal 2: Start frontend
cd frontend
pnpm run dev
```

Open http://localhost:5173 in your browser.

## Testing the Feature

### 1. Verify Data Pipeline

After logging in and selecting spaces:

```bash
# Check that totalActivityCount and spaceActivityTier appear in the API response
curl -s http://localhost:4000/api/graph/generate \
  -H "Authorization: Bearer <your-session-token>" \
  -H "Content-Type: application/json" \
  -d '{"spaceIds": ["your-space-id"]}' | \
  jq '.nodes[] | select(.type | startswith("SPACE")) | {displayName, type, totalActivityCount, spaceActivityTier}'
```

Expected output:
```json
{ "displayName": "My Active Space", "type": "SPACE_L0", "totalActivityCount": 142, "spaceActivityTier": "HIGH" }
{ "displayName": "Quiet Subspace", "type": "SPACE_L1", "totalActivityCount": 3, "spaceActivityTier": "LOW" }
{ "displayName": "Empty L2", "type": "SPACE_L2", "totalActivityCount": 0, "spaceActivityTier": "INACTIVE" }
```

### 2. Visual Verification Checklist

| # | Check | Expected Result |
|---|-------|-----------------|
| 1 | Open control panel "Activity" section | Two checkboxes: "Activity Pulse" and "Space Activity" |
| 2 | Enable "Space Activity" | Space nodes animate to activity-based sizes (~300ms) |
| 3 | High-activity space | Visibly larger than low-activity spaces, amber/gold glow |
| 4 | Medium-activity space | Moderate size, blue border glow |
| 5 | Low-activity space | Slightly larger than baseline, subtle light blue border |
| 6 | Zero-activity space | No size change from baseline, no glow |
| 7 | Disable "Space Activity" | Nodes animate back to original degree-based sizes |
| 8 | Node positions preserved | No "jump" or layout reset after toggle |
| 9 | Enable both "Activity Pulse" AND "Space Activity" | Edge pulses + space sizing coexist without conflict |
| 10 | Click a space node → check details drawer | "Contributions: N" stat visible in stats section |
| 11 | Click a user node → check details drawer | No "Contributions" stat shown |
| 12 | Lock badge on private space with activity sizing | Badge repositions correctly to match larger radius |

### 3. Edge Case Testing

| # | Scenario | Expected |
|---|----------|----------|
| 1 | All spaces have same contribution count | All scale equally; glow tier = MEDIUM |
| 2 | Activity data unavailable | Both checkboxes disabled, "Activity data unavailable" message |
| 3 | Space hidden by visibility filter, then revealed | Appears with correct activity sizing when shown |
| 4 | Enable Space Activity, then toggle Spaces entity filter off and back on | Spaces reappear at activity-scaled size |
| 5 | Reduced-motion preference | Sizes change instantly (no animation), glow applied without transition |

## After Making Changes

```bash
# If .graphql files were modified, regenerate SDK
cd server && pnpm run codegen

# Type check both packages
cd server && pnpm run typecheck
cd ../frontend && pnpm run typecheck
```

## Key Files Modified

### Server
- `server/src/types/graph.ts` — Add `totalActivityCount` and `spaceActivityTier` to `GraphNode`
- `server/src/transform/transformer.ts` — Add `aggregateSpaceActivityCounts()`, attach to space nodes

### Frontend
- `frontend/src/pages/Explorer.tsx` — Add `spaceActivityEnabled` state
- `frontend/src/components/panels/ControlPanel.tsx` — Add "Space Activity" checkbox
- `frontend/src/components/graph/ForceGraph.tsx` — Add space activity sizing/glow useEffect
- `frontend/src/components/panels/DetailsDrawer.tsx` — Add "Contributions" stat for space nodes
