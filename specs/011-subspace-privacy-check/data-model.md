# Data Model: Subspace Privacy-Aware Loading

**Feature**: 011-subspace-privacy-check | **Date**: 2026-03-07

## Entity Changes

### GraphNode (extended)

| Field | Type | Change | Description |
| ----- | ---- | ------ | ----------- |
| `restricted` | `boolean` | **NEW** | `true` when user has READ_ABOUT but not READ privilege. Defaults to `false`. |
| `privacyMode` | `'PUBLIC' \| 'PRIVATE' \| null` | Unchanged | Continues to reflect the space's `isContentPublic` setting |

**Relationships**: When `restricted === true`:
- CHILD edges to parent space: preserved
- MEMBER/LEAD/ADMIN contributor edges: absent (not fetched)
- L2 child subspace nodes: absent (not fetched when parent L1 is restricted)

### GraphEdge (unchanged)

No changes to edge types or structure. Restricted nodes simply have no contributor edges.

## GraphQL Fragment Changes

### spaceAboutFragment (extended)

Add `membership.myPrivileges` to the existing about fragment:

```graphql
fragment spaceAboutFragment on SpaceAbout {
  id
  isContentPublic
  membership {
    myPrivileges
  }
  profile {
    # ... existing fields unchanged
  }
}
```

### New: spaceAboutOnlyFragment

A lightweight fragment for subspaces in the initial phase (about + privileges only, no community data):

```graphql
fragment SpaceAboutOnlyFragment on Space {
  id
  nameID
  createdDate
  visibility
  about { ...spaceAboutFragment }
}
```

### Existing: SpaceGraphInfoFragment (unchanged usage)

Used in phase 2 for accessible subspaces only:

```graphql
fragment SpaceGraphInfoFragment on Space {
  id
  nameID
  createdDate
  visibility
  about { ...spaceAboutFragment }
  community { ...communityRolesFragment }
}
```

## Query Restructure

### Phase 1: spaceByName query (modified)

Subspaces fetched with about-only data:

```graphql
query spaceByName($nameId: NameID!) {
  lookupByName {
    space(NAMEID: $nameId) {
      ...SpaceGraphInfoFragment       # Full data for L0 (user must have READ to select it)
      subspaces {
        ...SpaceAboutOnlyFragment      # About-only for L1 (privilege check follows)
        subspaces {
          ...SpaceAboutOnlyFragment    # About-only for L2 (privilege check follows)
        }
      }
      account { host { id } }
    }
  }
}
```

### Phase 2: subspace community query (new)

Per-subspace query for community data when user has READ privilege:

```graphql
query subspaceCommunity($subspaceId: UUID!) {
  lookup {
    space(ID: $subspaceId) {
      id
      community { ...communityRolesFragment }
    }
  }
}
```

## Privilege Logic

```text
For each subspace in Phase 1 response:
  privileges = subspace.about.membership.myPrivileges

  IF privileges is missing or empty:
    → Log error: "No privileges returned for subspace {id}"
    → Omit from graph, add error message to errors array

  IF privileges includes READ:
    → Fetch community data (Phase 2 query)
    → Create node with restricted = false
    → Create contributor edges (MEMBER, LEAD, ADMIN)
    → IF L1: also process its L2 children with same logic

  ELSE IF privileges includes READ_ABOUT:
    → Skip community data fetch
    → Create node with restricted = true
    → Create CHILD edge to parent only
    → IF L1: skip all L2 children entirely

  ELSE (neither READ nor READ_ABOUT):
    → Log error: "Subspace {id} has privileges but neither READ nor READ_ABOUT"
    → Omit from graph, add error message to errors array
```

## Error Handling

All GraphQL retrieval errors during any phase MUST be:
1. **Logged server-side** with the full error message from the Alkemio API
2. **Propagated to the frontend** so the user sees the actual error message received from the Alkemio server

Errors must never be silently swallowed. This applies to:
- Phase 1 (spaceByName query) failures
- Phase 2 (subspaceCommunity query) failures per subspace
- Missing or empty `myPrivileges` on any subspace
- Unexpected privilege states (neither READ nor READ_ABOUT)

The BFF response should include an `errors` array alongside the graph data, allowing partial results with error reporting.

## Cache Impact

No schema changes. Cached datasets contain:
- Restricted nodes with `restricted: true`, no contributor edges
- Full nodes with `restricted: false`, all edges as before
- Cache key: `(userId, spaceNameId)` — unchanged
- Cache TTL: unchanged
