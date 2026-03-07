# Contract: GraphNode Extension

**Feature**: 011-subspace-privacy-check | **Date**: 2026-03-07

## GraphNode Interface Change

The `GraphNode` interface (shared between server and frontend via `@server/types/graph.ts`) is extended with a `restricted` field.

### Added Field

```typescript
/** true when user has READ_ABOUT but not READ privilege on this space */
restricted?: boolean;
```

### Placement

After the existing `privacyMode` field in the `GraphNode` interface.

### Default Value

`false` (or `undefined` which is treated as `false`). Only set to `true` for subspace nodes where the user's privileges include `READ_ABOUT` but not `READ`.

### Consumer Impact

| Consumer | Change Required |
| -------- | --------------- |
| `transformer.ts` | Set `restricted: true` for READ_ABOUT-only subspaces |
| `ForceGraph.tsx` | Extend lock badge filter to include `restricted === true` |
| `HoverCard.tsx` | Show privacy notice when `restricted === true` |
| `DetailsDrawer.tsx` | Show restricted indicator, hide community sections |
| Cache (SQLite) | No change — serialized JSON includes the new field automatically |

### Backward Compatibility

- Existing cached datasets without `restricted` field are treated as `restricted: false` (falsy check)
- No cache migration needed
