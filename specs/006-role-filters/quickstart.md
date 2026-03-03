# Quickstart: Role-Based Filters & Connection Colors

**Feature**: 006-role-filters
**Date**: 2026-02-26

## Prerequisites

- Node.js 20+, pnpm 9+
- Alkemio account with access to at least one Space
- `server/.env` configured with `ALKEMIO_GRAPHQL_ENDPOINT` and `KRATOS_BASE_URL`

## Dev Setup

```bash
# 1. Switch to the feature branch
git checkout 006-role-filters

# 2. Install dependencies (both server and frontend)
cd server && pnpm install && cd ..
cd frontend && pnpm install && cd ..

# 3. Regenerate GraphQL SDK after fragment changes
cd server && pnpm run codegen && cd ..

# 4. Start dev servers
cd server && pnpm run dev &     # BFF on :4000
cd frontend && pnpm run dev &   # Vite on :5173 (proxies /api → :4000)
```

## Manual Testing Checklist

### Server-Side (ADMIN Edge Creation)

1. Log in via the frontend and select a Space where you have admin access.
2. Open browser devtools → Network tab → find the `POST /api/graph/generate` response.
3. In the JSON response, search for `"type":"ADMIN"` — confirm ADMIN edges exist.
4. Verify admin edges have `sourceId` (user) and `targetId` (space).
5. If the Space has activity data, verify ADMIN edges have `activityCount`/`activityTier` fields.

### Frontend — Role Filter Toggles

1. Open the Explorer with a loaded graph.
2. In the Control Panel, verify three new checkboxes appear under People: **Members (N)**, **Leads (N)**, **Admins (N)**.
3. Verify all three are checked by default.
4. **Uncheck "Members"** → MEMBER edges disappear; users who are only members disappear.
5. **Uncheck "Leads"** → LEAD edges disappear; lead-only users disappear.
6. **Uncheck "Admins"** → ADMIN edges disappear; admin-only users disappear.
7. **Uncheck all three** → Only space nodes and CHILD edges remain.
8. **Re-check all** → Full graph restored.

### Frontend — People Toggle Precedence

9. Uncheck "People" → All user edges and nodes hidden, role toggles grayed out.
10. Check "People" → Users restored, role filter state re-applied.

### Frontend — Edge Colors

11. With all filters on, verify edges are visually distinguishable:
    - **CHILD (parent–child)**: Indigo/purple
    - **LEAD**: Amber/orange (NOT brown)
    - **ADMIN**: Teal/green-blue
    - **MEMBER**: Subtle gray-blue
12. Check the Legend section in the Control Panel — colors must match the graph.

### Frontend — Composition with Other Features

13. **Selection highlighting**: Click a node → 1st/2nd degree highlighting respects role filters (hidden edges excluded from neighbor computation).
14. **Activity pulse**: Enable pulse → hidden role edges don't pulse; visible ones do.
15. **Search**: Search for a user → only visible edges (per role filters) show.
16. **Map overlay**: Toggle map on → role filters still work correctly on geographic layout.

### Performance

17. Toggle a role filter and observe: the graph should update within 300ms with no simulation restart (no nodes flying around or re-settling).

## Key Files to Watch

| File | Change |
|------|--------|
| `server/src/types/graph.ts` | `ADMIN` in EdgeType, EDGE_WEIGHT |
| `server/src/graphql/fragments/communityRolesFragment.graphql` | `adminUsers` field |
| `server/src/transform/transformer.ts` | Admin edge creation, activity filter |
| `frontend/src/pages/Explorer.tsx` | State: showMembers/showLeads/showAdmins |
| `frontend/src/components/graph/ForceGraph.tsx` | EDGE_COLORS, role filter useEffect |
| `frontend/src/components/panels/FilterControls.tsx` | 3 role toggle checkboxes |
| `frontend/src/components/panels/ControlPanel.tsx` | Props pass-through, legend update |

## Codegen Reminder

After modifying `.graphql` files:

```bash
cd server && pnpm run codegen
```

This regenerates `server/src/graphql/generated/alkemio-schema.ts`. The generated file MUST be committed.
