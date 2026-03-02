# Contract: Updated communityRolesFragment.graphql

**Feature**: 006-role-filters
**Date**: 2026-02-26

## Current Fragment

```graphql
fragment communityRolesFragment on Community {
  id
  roleSet {
    memberUsers: usersInRole(role: MEMBER) {
      id
    }
    memberOrganizations: organizationsInRole(role: MEMBER) {
      id
    }
    leadOrganizations: organizationsInRole(role: LEAD) {
      id
    }
    leadUsers: usersInRole(role: LEAD) {
      id
    }
  }
}
```

## Updated Fragment (diff)

```diff
 fragment communityRolesFragment on Community {
   id
   roleSet {
     memberUsers: usersInRole(role: MEMBER) {
       id
     }
     memberOrganizations: organizationsInRole(role: MEMBER) {
       id
     }
     leadOrganizations: organizationsInRole(role: LEAD) {
       id
     }
     leadUsers: usersInRole(role: LEAD) {
       id
     }
+    adminUsers: usersInRole(role: ADMIN) {
+      id
+    }
   }
 }
```

## Post-Change Requirements

1. Run `pnpm run codegen` in `server/` to regenerate the typed SDK.
2. Verify the generated type for `CommunityRolesFragment` includes `adminUsers` with `{ id: string }[]`.
3. The `SpaceLike` interface in `transformer.ts` must be updated to match the new fragment shape.

## API Impact

- **Endpoint affected**: `POST /api/graph/generate` — response `GraphDataset` will now include edges with `type: 'ADMIN'`.
- **Backward compatibility**: The BFF response type (`GraphDataset`) already uses `EdgeType` as a string union. Adding a new value (`ADMIN`) is additive — existing frontends that don't handle ADMIN will simply render those edges with the default MEMBER color (fallback in `EDGE_COLORS[d.data.type] || EDGE_COLORS.MEMBER`).
- **No new endpoints needed** — the existing generate/expand/export routes return the enriched dataset automatically.
