# API Contract: Dashboard Endpoints

**Feature**: 013-space-analytics-dashboard
**Date**: 2026-03-17
**Status**: Complete

## Base URL

All endpoints are prefixed with `/api/dashboard` and require authentication via `Authorization: Bearer <session_token>` header. The existing `authMiddleware` and `resolveUser` middleware are applied to the router.

---

## POST /api/dashboard/generate

Generate the analytics dataset for a single space.

### Request

```json
{
  "spaceId": "string (nameID of the space)",
  "forceRefresh": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spaceId` | `string` | Yes | The `nameID` of the L0 space to analyze |
| `forceRefresh` | `boolean` | No | If `true`, bypass cache and re-fetch from Alkemio. Default: `false` |

### Response — 200 OK

Returns a `DashboardDataset` object (see [data-model.md](../data-model.md)).

```json
{
  "generatedAt": "2026-03-17T12:00:00Z",
  "space": {
    "id": "uuid",
    "nameId": "my-space",
    "displayName": "My Space",
    "avatarUrl": "https://...",
    "tagline": "A collaborative space",
    "hasSubspaces": true,
    "subspaceCount": 5
  },
  "headline": {
    "totalCallouts": 42,
    "totalContributions": 180,
    "contributionsByType": { "post": 120, "memo": 30, "link": 20, "whiteboard": 10 },
    "totalComments": 350,
    "totalMembers": 60,
    "totalUniqueContributors": 25,
    "engagementRatio": 0.417,
    "unansweredCalloutPct": 0.12,
    "avgContributionsPerCallout": 4.29,
    "avgCommentsPerContribution": 1.94,
    "totalWhiteboards": 10,
    "totalWhiteboardModifications": 45,
    "avgWhiteboardModifications": 4.5
  },
  "callouts": [
    {
      "id": "uuid",
      "title": "What challenges do you face?",
      "phaseId": "uuid",
      "phaseName": "Knowledge Base",
      "subspaceId": null,
      "subspaceName": null,
      "contributionCount": 12,
      "contributionsByType": { "post": 10, "memo": 1, "link": 1, "whiteboard": 0 },
      "commentCount": 25,
      "totalEngagement": 37,
      "createdDate": "2025-06-15T10:00:00Z",
      "lastActivityDate": "2026-03-10T14:30:00Z",
      "createdById": "user-uuid"
    }
  ],
  "contributors": [
    {
      "userId": "uuid",
      "displayName": "Jane Doe",
      "avatarUrl": "https://...",
      "organizationId": "org-uuid",
      "organizationName": "Acme Corp",
      "role": "lead",
      "totalContributions": 35,
      "totalComments": 50,
      "contributionsByType": { "post": 25, "memo": 5, "link": 3, "whiteboard": 2 },
      "activeSubspaceCount": 3,
      "firstContributionDate": "2025-07-01T08:00:00Z",
      "lastContributionDate": "2026-03-15T16:00:00Z",
      "perSubspace": [
        { "subspaceId": "uuid-1", "count": 20 },
        { "subspaceId": "uuid-2", "count": 10 },
        { "subspaceId": "uuid-3", "count": 5 }
      ]
    }
  ],
  "subspaces": [
    {
      "id": "uuid",
      "displayName": "Subspace A",
      "level": 1,
      "parentId": "parent-uuid",
      "totalCallouts": 10,
      "totalContributions": 45,
      "totalComments": 80,
      "totalMembers": 20,
      "uniqueContributors": 8
    }
  ],
  "timeline": [
    {
      "period": "2026-01",
      "contributions": 32,
      "byType": { "post": 20, "memo": 5, "link": 4, "whiteboard": 3 },
      "comments": 45,
      "uniqueContributors": 12,
      "newContributors": 3
    }
  ],
  "phases": [
    {
      "id": "uuid",
      "displayName": "Knowledge Base",
      "type": "KNOWLEDGE_BASE",
      "calloutCount": 20
    },
    {
      "id": "uuid-2",
      "displayName": "Innovation Flow",
      "type": "COLLABORATION",
      "calloutCount": 22
    }
  ],
  "members": [
    {
      "userId": "uuid",
      "displayName": "Jane Doe",
      "role": "lead",
      "organizationId": "org-uuid",
      "isActive": true
    }
  ],
  "organizations": [
    {
      "organizationId": "uuid",
      "displayName": "Acme Corp",
      "avatarUrl": "https://...",
      "memberCount": 8,
      "activeContributorCount": 5,
      "totalContributions": 60
    }
  ],
  "cacheInfo": {
    "lastUpdated": "2026-03-17T12:00:00Z",
    "fromCache": false
  },
  "errors": []
}
```

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `INVALID_REQUEST` | `spaceId` missing or empty |
| 401 | `UNAUTHORIZED` | Missing or invalid bearer token |
| 502 | `GENERATION_FAILED` | Failed to fetch data from Alkemio GraphQL |

```json
{
  "error": "INVALID_REQUEST",
  "message": "spaceId is required"
}
```

---

## POST /api/dashboard/export *(DEFERRED — v1 uses client-side export only)*

> **Note**: Per research decision R8, v1 implements CSV export client-side (JSON → CSV in the browser via T039). This server-side endpoint is documented for future implementation if server-generated exports become necessary. No task currently implements this endpoint.

Export dashboard data as CSV.

### Request

```json
{
  "spaceId": "string",
  "format": "csv",
  "sections": ["headline", "contributors", "callouts", "timeline"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spaceId` | `string` | Yes | The `nameID` of the space |
| `format` | `"csv"` | Yes | Export format (currently only CSV) |
| `sections` | `string[]` | No | Which sections to include. Default: all |

### Response — 200 OK

Returns `Content-Type: text/csv` with `Content-Disposition: attachment; filename="dashboard-{spaceId}-{date}.csv"`.

### Error Responses

Same as `/generate`.

---

## TypeScript Request Type (`server/src/types/api.ts`)

```typescript
/** Request body for dashboard generation */
export interface DashboardGenerationRequest {
  spaceId: string;
  forceRefresh?: boolean;
}

/** Request body for dashboard export */
export interface DashboardExportRequest {
  spaceId: string;
  format: 'csv';
  sections?: ('headline' | 'contributors' | 'callouts' | 'timeline')[];
}
```

---

## GraphQL Queries (new)

### spaceAnalytics.graphql

Fetches the full collaboration hierarchy for a single space (L0) including callouts, contributions (metadata), and comment counts. Called once for L0, then per L1/L2 subspace.

```graphql
query SpaceAnalytics($spaceId: UUID!) {
  lookup {
    space(ID: $spaceId) {
      id
      nameID
      about {
        profile {
          displayName
          avatar { uri }
          tagline
        }
      }
      community {
        ...communityRolesFragment
      }
      collaboration {
        calloutsSet {
          id
          type
          callouts {
            id
            nameID
            createdDate
            createdBy { id }
            framing {
              profile { displayName }
            }
            contributionsCount {
              post
              memo
              link
              whiteboard
            }
            contributions {
              id
              createdDate
              createdBy { id }
              post {
                comments {
                  messagesCount
                }
              }
              link { id }
              memo { id }
              whiteboard { id }
            }
            comments {
              messagesCount
              messages {
                sender { id }
                timestamp
              }
            }
          }
        }
        innovationFlow {
          states {
            id
            displayName
          }
        }
      }
      subspaces {
        id
        nameID
        about {
          profile {
            displayName
            avatar { uri }
          }
        }
      }
    }
  }
}
```

### subspaceAnalytics.graphql

Fetches the same collaboration detail for a subspace (reuses the pattern but scoped to a specific subspace ID).

```graphql
query SubspaceAnalytics($spaceId: UUID!) {
  lookup {
    space(ID: $spaceId) {
      id
      nameID
      about {
        profile {
          displayName
          avatar { uri }
        }
      }
      community {
        ...communityRolesFragment
      }
      collaboration {
        calloutsSet {
          id
          type
          callouts {
            id
            nameID
            createdDate
            createdBy { id }
            framing {
              profile { displayName }
            }
            contributionsCount {
              post
              memo
              link
              whiteboard
            }
            contributions {
              id
              createdDate
              createdBy { id }
              post {
                comments {
                  messagesCount
                }
              }
              link { id }
              memo { id }
              whiteboard { id }
            }
            comments {
              messagesCount
              messages {
                sender { id }
                timestamp
              }
            }
          }
        }
      }
      subspaces {
        id
        nameID
        about {
          profile { displayName }
        }
      }
    }
  }
}
```

---

## Frontend API Service Extensions

```typescript
// Added to frontend/src/services/api.ts

export const api = {
  // ... existing methods ...
  
  dashboard: {
    generate: (spaceId: string, forceRefresh = false) =>
      apiFetch<DashboardDataset>('/api/dashboard/generate', {
        method: 'POST',
        body: JSON.stringify({ spaceId, forceRefresh }),
      }),
    
    exportCsv: (spaceId: string, sections?: string[]) =>
      apiFetch<Blob>('/api/dashboard/export', {
        method: 'POST',
        body: JSON.stringify({ spaceId, format: 'csv', sections }),
        headers: { Accept: 'text/csv' },
      }),
  },
};
```

---

## Sequence Diagram

```
Frontend                    BFF (/api/dashboard)           Alkemio GraphQL
   │                              │                              │
   │  POST /generate {spaceId}    │                              │
   ├─────────────────────────────►│                              │
   │                              │  Check SQLite cache          │
   │                              │  (userId, dashboard:spaceId) │
   │                              │                              │
   │                              │  [CACHE MISS]                │
   │                              │  SpaceAnalytics(spaceId)     │
   │                              ├─────────────────────────────►│
   │                              │  ◄─ L0 space + callouts      │
   │                              │                              │
   │                              │  SubspaceAnalytics(L1 id)    │
   │                              ├─────────────────────────────►│
   │                              │  ◄─ L1 subspace data         │
   │                              │  (repeat per L1/L2)          │
   │                              │                              │
   │                              │  ActivityFeedGrouped(spaceIds)│
   │                              ├─────────────────────────────►│
   │                              │  ◄─ timestamped events       │
   │                              │                              │
   │                              │  UsersByIDs(contributorIds)  │
   │                              ├─────────────────────────────►│
   │                              │  ◄─ user profiles            │
   │                              │                              │
   │                              │  Transform → DashboardDataset│
   │                              │  Store in SQLite cache       │
   │                              │                              │
   │  ◄── 200 DashboardDataset   │                              │
   │                              │                              │
   │  Client-side filtering       │                              │
   │  (time range, phase)         │                              │
```
