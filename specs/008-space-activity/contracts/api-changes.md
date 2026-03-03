# API Contract Changes: Space Activity Volume

**Feature**: 008-space-activity  
**Date**: 2026-03-02

## `POST /api/graph/generate` Response — GraphNode Extension

### Existing response shape (unchanged fields omitted)

```jsonc
{
  "nodes": [
    {
      "id": "string",
      "type": "SPACE_L0",      // SPACE_L0 | SPACE_L1 | SPACE_L2 | USER | ORGANIZATION
      "displayName": "string",
      // ... existing fields ...

      // NEW — only present when hasActivityData is true and node is a space type
      "totalActivityCount": 42,          // number (0 for non-space nodes)
      "spaceActivityTier": "MEDIUM"      // "INACTIVE" | "LOW" | "MEDIUM" | "HIGH"
    }
  ],
  "hasActivityData": true
}
```

### Field behavior by node type

| Node Type | `totalActivityCount` | `spaceActivityTier` |
|-----------|---------------------|---------------------|
| `SPACE_L0` | Sum of direct contributions | Tier from percentile distribution |
| `SPACE_L1` | Sum of direct contributions | Tier from percentile distribution |
| `SPACE_L2` | Sum of direct contributions | Tier from percentile distribution |
| `USER` | `undefined` (not set) | `undefined` (not set) |
| `ORGANIZATION` | `undefined` (not set) | `undefined` (not set) |

### When `hasActivityData` is `false`

Both fields are absent from all nodes. Frontend gates the toggle on `hasActivityData`.

### Backwards compatibility

Both fields are optional (`?` in TypeScript). Existing clients that don't read these fields are unaffected.
