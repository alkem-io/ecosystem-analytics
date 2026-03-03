# Contract: EdgeType Extension & Graph Dataset Changes

**Feature**: 006-role-filters
**Date**: 2026-02-26

## EdgeType Enum Diff

```diff
 export enum EdgeType {
   CHILD = 'CHILD',
   MEMBER = 'MEMBER',
   LEAD = 'LEAD',
+  ADMIN = 'ADMIN',
 }
```

## EDGE_WEIGHT Diff

```diff
 export const EDGE_WEIGHT: Record<EdgeType, number> = {
   [EdgeType.CHILD]: 3,
   [EdgeType.LEAD]: 2,
+  [EdgeType.ADMIN]: 2,
   [EdgeType.MEMBER]: 1,
 };
```

## GraphDataset Response (no interface changes)

The `GraphDataset` interface is unchanged. The `edges` array already uses `GraphEdge[]` where each edge has a `type: EdgeType` field. Adding `ADMIN` to the enum means edges with `type: 'ADMIN'` will appear in the response.

Example edge in response:

```json
{
  "sourceId": "user-uuid-abc",
  "targetId": "space-uuid-xyz",
  "type": "ADMIN",
  "weight": 2,
  "scopeGroup": "l0-space-uuid"
}
```

## Activity Data on ADMIN Edges

ADMIN-type edges will also receive `activityCount` and `activityTier` from the activity attachment logic in `transformer.ts`. The existing activity filter (`edge.type !== EdgeType.MEMBER && edge.type !== EdgeType.LEAD`) must be updated to also include `EdgeType.ADMIN`:

```diff
-      if (edge.type !== EdgeType.MEMBER && edge.type !== EdgeType.LEAD) continue;
+      if (edge.type !== EdgeType.MEMBER && edge.type !== EdgeType.LEAD && edge.type !== EdgeType.ADMIN) continue;
```

This ensures admin edges show activity pulse animation when enabled.
