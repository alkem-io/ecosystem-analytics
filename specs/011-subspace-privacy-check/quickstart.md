# Quickstart: Subspace Privacy-Aware Loading

**Feature**: 011-subspace-privacy-check | **Date**: 2026-03-07

## Prerequisites

- Node 20+, pnpm 9+
- Alkemio platform running with spaces that have mixed access levels (some subspaces the test user can READ, some only READ_ABOUT)

## Development Setup

### 1. Start Dev Servers

```bash
cd server && pnpm run dev    # Port 4000
cd frontend && pnpm run dev  # Port 5173, proxies /api → :4000
```

### 2. After Modifying GraphQL Fragments

When `.graphql` files are changed (adding `myPrivileges` to the about fragment, creating new query), regenerate the SDK:

```bash
cd server && pnpm run codegen
```

### 3. Testing the Feature

1. Log in with an Alkemio account that has mixed access to subspaces
2. Select a Space that contains both accessible and restricted subspaces
3. Generate the graph
4. Verify:
   - Accessible subspaces (READ) show full community data and contributor edges
   - Restricted subspaces (READ_ABOUT only) show with a lock badge, name/tagline/avatar, but no community data
   - L2 children of restricted L1 subspaces are not shown
   - Hovering over a restricted node shows a privacy notice
   - The detail panel for a restricted node shows about info without community sections

### 4. Running Tests

```bash
cd server && pnpm run test
cd frontend && pnpm run test
```

## Troubleshooting

### Subspaces not showing up at all
- Check browser console for GraphQL errors
- Verify the `myPrivileges` field is being returned by the Alkemio API (may need schema update)
- Check server logs for privilege check results

### Lock badge not appearing
- Verify the `restricted` field is set on the GraphNode in the transformer
- Check the D3 filter condition in ForceGraph.tsx includes `restricted === true`

### FORBIDDEN_POLICY errors still appearing
- The two-phase approach should eliminate these. If they persist, check that the spaceByName query no longer fetches `community` data for subspaces in phase 1
