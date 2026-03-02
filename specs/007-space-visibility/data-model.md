# Data Model: Space Visibility Indicators

**Feature**: 007-space-visibility  
**Date**: 2026-02-26

## Entity Changes

### 1. GraphNode (extended)

**File**: `server/src/types/graph.ts`  
**Change type**: Add optional field

```typescript
/** A node in the graph dataset */
export interface GraphNode {
  // ... existing fields ...

  /** Privacy mode for space nodes; null for non-space nodes (USER, ORGANIZATION) */
  privacyMode: 'PUBLIC' | 'PRIVATE' | null;
}
```

| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `privacyMode` | `'PUBLIC' \| 'PRIVATE' \| null` | Yes | `null` | Privacy visibility mode. Set for SPACE_L0, SPACE_L1, SPACE_L2 nodes. `null` for USER and ORGANIZATION nodes. |

**Validation rules**:
- MUST be `'PUBLIC'` or `'PRIVATE'` for all space-type nodes
- MUST be `null` for USER and ORGANIZATION nodes
- When source data (`isContentPublic`) is missing, defaults to `'PUBLIC'`

---

### 2. SpaceLike (internal transformer interface, extended)

**File**: `server/src/transform/transformer.ts`  
**Change type**: Add field to internal interface

```typescript
interface SpaceLike {
  // ... existing fields ...
  about: {
    isContentPublic?: boolean;  // ← NEW
    profile: {
      // ... existing profile fields ...
    };
  };
  // ... rest of existing fields ...
}
```

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `about.isContentPublic` | `boolean \| undefined` | `SpaceAbout.isContentPublic` via GraphQL | Whether space content is visible to non-members |

---

### 3. spaceAboutFragment (GraphQL fragment, extended)

**File**: `server/src/graphql/fragments/spaceAboutFragment.graphql`  
**Change type**: Add field to existing fragment

```graphql
fragment spaceAboutFragment on SpaceAbout {
  id
  isContentPublic          # ← NEW
  profile {
    # ... existing profile fields ...
  }
}
```

| Field | GraphQL Type | Description |
|-------|-------------|-------------|
| `isContentPublic` | `Boolean!` (non-nullable) | Whether space content is visible to non-members |

**Codegen impact**: After this change, `pnpm run codegen` must be re-run in `server/`. The generated type for `SpaceAboutFragment` will include `isContentPublic: boolean`.

---

## State Model

### Frontend State (Explorer.tsx)

| State Variable | Type | Default | Description |
|---------------|------|---------|-------------|
| `showPublic` | `boolean` | `true` | Whether to show public space nodes |
| `showPrivate` | `boolean` | `true` | Whether to show private space nodes |

### Filter Composition Logic

A space node is **visible** when ALL of the following are true:
1. `showSpaces === true` (entity filter)
2. `(node.privacyMode === 'PUBLIC' && showPublic) || (node.privacyMode === 'PRIVATE' && showPrivate)`

A non-space node (USER, ORGANIZATION) is **visible** when:
1. Its entity filter is enabled (`showPeople` / `showOrganizations`)
2. It has at least one visible edge to a visible node (orphan removal)
3. Role filters apply as before (`showMembers`, `showLeads`, `showAdmins`)

---

## Data Flow

```
Alkemio API                              BFF Server                         Frontend
─────────────────────────────────────────────────────────────────────────────────────
Space.about.isContentPublic  ──GraphQL──▶  SpaceLike.about.isContentPublic
                                                    │
                                          transformer.ts::addSpaceNode()
                                                    │
                                          privacyMode = isContentPublic !== false
                                                      ? 'PUBLIC' : 'PRIVATE'
                                                    │
                                          GraphNode.privacyMode  ──JSON──▶  ForceGraph
                                                                              │
                                                                        ┌─────┴──────┐
                                                                   SVG icon      Filter
                                                                   overlay      controls
                                                                 (lock/unlock)  (toggle)
```

---

## Relationships

```
GraphNode (space types)
  ├── privacyMode: 'PUBLIC' | 'PRIVATE'    ← derived from SpaceAbout.isContentPublic
  ├── type: SPACE_L0 | SPACE_L1 | SPACE_L2
  └── [all existing fields unchanged]

GraphNode (non-space types)
  ├── privacyMode: null                     ← always null
  ├── type: USER | ORGANIZATION
  └── [all existing fields unchanged]
```

No new entities are introduced. No new edge types. No database schema changes (cache stores serialized JSON — new field is automatically included).
