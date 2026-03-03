# 009 — Contracts: Server API Changes

**Date**: 2026-03-02

---

## 1. Extended GraphDataset Response

The existing `POST /api/graph/generate` response (`GraphDataset`) gains new fields. No new endpoints required.

### New Fields on `GraphDataset`

```typescript
{
  // ... existing fields (version, generatedAt, spaces, nodes, edges, metrics, cacheInfo) ...

  /** Weekly activity time series per space — present when activity data is available */
  timeSeries?: SpaceTimeSeries[];
}
```

### New Fields on `GraphNode`

```typescript
{
  // ... existing fields ...

  /** ISO 8601 creation timestamp (from Alkemio) */
  createdDate?: string;

  /** Space visibility status — only for space nodes */
  visibility?: 'ACTIVE' | 'ARCHIVED' | 'DEMO';

  /** Aggregated tags from profile tagsets */
  tags?: {
    keywords?: string[];
    skills?: string[];
    default?: string[];
  };
}
```

### New Fields on `GraphEdge`

```typescript
{
  // ... existing fields ...

  /** Estimated creation timestamp for this relationship */
  createdDate?: string;
}
```

---

## 2. GraphQL Fragment Changes

### `spaceAboutFragment.graphql` — Add Fields

```graphql
fragment spaceAboutFragment on SpaceAbout {
  # ... existing fields ...
  createdDate                    # ← NEW
}
```

### New fragment fields on the `spaceByName` query level

```graphql
query spaceByName($nameId: NameID!) {
  space(ID: $nameId) {
    # ... existing fields ...
    createdDate                  # ← NEW
    visibility                   # ← NEW
    about {
      ...spaceAboutFragment
      profile {
        # ... existing fields ...
        tagsets {                 # ← NEW
          name
          tags
          type
          allowedValues
        }
      }
    }
  }
}
```

### `usersByIDs` query — Add Fields

```graphql
query usersByIDs($ids: [UUID!]!) {
  usersByIDs(IDs: $ids) {
    # ... existing fields ...
    createdDate                  # ← NEW
    profile {
      # ... existing fields ...
      tagsets {                  # ← NEW
        name
        tags
        type
      }
    }
  }
}
```

### `organizationByID` query — Add Fields

```graphql
query organizationByID($id: UUID!) {
  organization(ID: $id) {
    # ... existing fields ...
    profile {
      # ... existing fields ...
      tagsets {                  # ← NEW
        name
        tags
        type
      }
    }
  }
}
```

---

## 3. Transformer Changes

### New Function: `buildTimeSeries`

```typescript
/**
 * Build weekly activity time series from raw activity entries.
 * Called in transformer.ts after activity data is aggregated.
 *
 * @param activityEntries - Raw activity feed entries with createdDate
 * @param spaces - Space nodes to label the series
 * @returns Array of SpaceTimeSeries, one per space with activity
 */
function buildTimeSeries(
  activityEntries: Array<{ createdDate: string; spaceId: string }>,
  spaces: GraphNode[],
): SpaceTimeSeries[];
```

### New Function: `estimateEdgeCreatedDate`

```typescript
/**
 * Estimate when a user→space edge was created.
 * Priority: application/invitation date > earliest activity date > space creation date.
 *
 * @param edge - The edge to estimate creation for
 * @param activityEntries - Raw activity entries with timestamps
 * @param spaceNodes - Map of space ID to GraphNode (for fallback to space.createdDate)
 * @returns ISO 8601 date string
 */
function estimateEdgeCreatedDate(
  edge: GraphEdge,
  activityEntries: Array<{ createdDate: string; userId: string; spaceId: string }>,
  spaceNodes: Map<string, GraphNode>,
): string;
```

### Extended Function: `transformToGraph`

The existing `transformToGraph` function adds `createdDate`, `visibility`, and `tags` to each node, and `createdDate` to each edge. Returns `timeSeries` alongside existing returns.

---

## 4. Sample Response Fragment

```json
{
  "version": "1.0",
  "generatedAt": "2026-03-02T14:30:00Z",
  "nodes": [
    {
      "id": "space-abc",
      "type": "SPACE_L0",
      "displayName": "Circular Economy",
      "createdDate": "2024-06-15T10:00:00Z",
      "visibility": "ACTIVE",
      "tags": {
        "keywords": ["circular", "sustainability", "recycling"],
        "default": ["environment"]
      }
    },
    {
      "id": "user-xyz",
      "type": "USER",
      "displayName": "Jane Doe",
      "createdDate": "2024-01-10T08:00:00Z",
      "tags": {
        "skills": ["data-science", "sustainability"],
        "keywords": ["innovation"]
      }
    }
  ],
  "edges": [
    {
      "sourceId": "user-xyz",
      "targetId": "space-abc",
      "type": "MEMBER",
      "createdDate": "2024-07-01T12:00:00Z"
    }
  ],
  "timeSeries": [
    {
      "spaceId": "space-abc",
      "spaceDisplayName": "Circular Economy",
      "buckets": [
        { "week": "2026-W01", "count": 5 },
        { "week": "2026-W02", "count": 12 },
        { "week": "2026-W03", "count": 8 }
      ]
    }
  ]
}
```
