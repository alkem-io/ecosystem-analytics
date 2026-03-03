# GraphQL Fragment Contract: Space Visibility

**Feature**: 007-space-visibility  
**Date**: 2026-02-26

## Modified Fragment: `spaceAboutFragment`

**File**: `server/src/graphql/fragments/spaceAboutFragment.graphql`

### Current

```graphql
fragment spaceAboutFragment on SpaceAbout {
  id
  profile {
    id
    displayName
    tagline
    location {
      country
      city
      geoLocation {
        latitude
        longitude
      }
    }
    url
    avatar: visual(type: AVATAR) {
      uri
    }
    banner: visual(type: BANNER) {
      uri
    }
    bannerWide: visual(type: BANNER_WIDE) {
      uri
    }
  }
}
```

### Target

```graphql
fragment spaceAboutFragment on SpaceAbout {
  id
  isContentPublic
  profile {
    id
    displayName
    tagline
    location {
      country
      city
      geoLocation {
        latitude
        longitude
      }
    }
    url
    avatar: visual(type: AVATAR) {
      uri
    }
    banner: visual(type: BANNER) {
      uri
    }
    bannerWide: visual(type: BANNER_WIDE) {
      uri
    }
  }
}
```

### Change Summary

| Change | Field | Type | Breaking |
|--------|-------|------|----------|
| ADD | `isContentPublic` | `Boolean!` | No — additive field |

### Post-Change Actions

1. Run `pnpm run codegen` in `server/` to regenerate typed SDK
2. Verify `SpaceAboutFragmentFragment` in generated types includes `isContentPublic: boolean`
3. Commit generated files (`server/src/graphql/generated/`)

---

## Shared Type Contract: `GraphNode`

**File**: `server/src/types/graph.ts`

### Current Interface

```typescript
export interface GraphNode {
  id: string;
  type: NodeType;
  displayName: string;
  weight: number;
  avatarUrl: string | null;
  bannerUrl: string | null;
  url: string | null;
  location: GraphLocation | null;
  scopeGroups: string[];
  nameId: string | null;
  tagline: string | null;
  parentSpaceId: string | null;
}
```

### Target Interface

```typescript
export interface GraphNode {
  id: string;
  type: NodeType;
  displayName: string;
  weight: number;
  avatarUrl: string | null;
  bannerUrl: string | null;
  url: string | null;
  location: GraphLocation | null;
  scopeGroups: string[];
  nameId: string | null;
  tagline: string | null;
  parentSpaceId: string | null;
  /** Privacy mode for space nodes; null for non-space types */
  privacyMode: 'PUBLIC' | 'PRIVATE' | null;
}
```

### Change Summary

| Change | Field | Type | Breaking |
|--------|-------|------|----------|
| ADD | `privacyMode` | `'PUBLIC' \| 'PRIVATE' \| null` | Non-breaking — new field, existing consumers unaffected |

### Impact on BFF Response

The `/api/graph/generate` endpoint returns a `GraphDataset` containing `nodes: GraphNode[]`. Each space node will now include `privacyMode: "PUBLIC"` or `privacyMode: "PRIVATE"`. Non-space nodes will have `privacyMode: null`.

**Example response node**:
```json
{
  "id": "abc-123",
  "type": "SPACE_L1",
  "displayName": "Innovation Hub",
  "weight": 3,
  "privacyMode": "PRIVATE",
  "avatarUrl": "https://...",
  "bannerUrl": null,
  "url": "https://...",
  "location": null,
  "scopeGroups": ["space-x"],
  "nameId": "innovation-hub",
  "tagline": "Private innovation space",
  "parentSpaceId": "def-456"
}
```
