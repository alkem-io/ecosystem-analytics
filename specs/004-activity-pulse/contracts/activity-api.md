# API Contract: Activity Data in Graph Dataset

**Feature**: 004-activity-pulse  
**Date**: 2026-02-25

## Overview

Activity data is embedded in the existing `GraphDataset` response — no new API endpoints are needed. The existing `POST /api/graph/generate` endpoint returns an enriched dataset with activity counts on edges and a `hasActivityData` flag.

## GraphQL Query (Server → Alkemio)

### New: `activityFeedGrouped.graphql`

```graphql
query ActivityFeedGrouped($args: ActivityFeedGroupedQueryArgs) {
  activityFeedGrouped(args: $args) {
    id
    type
    createdDate
    triggeredBy {
      id
    }
    space {
      id
    }
  }
}
```

**Variables:**

```json
{
  "args": {
    "spaceIds": ["<L0-space-uuid-1>", "<L0-space-uuid-2>"],
    "limit": 5000,
    "types": [
      "CALLOUT_POST_CREATED",
      "CALLOUT_POST_COMMENT",
      "CALLOUT_MEMO_CREATED",
      "CALLOUT_LINK_CREATED",
      "CALLOUT_WHITEBOARD_CREATED",
      "CALLOUT_WHITEBOARD_CONTENT_MODIFIED",
      "DISCUSSION_COMMENT",
      "UPDATE_SENT",
      "CALENDAR_EVENT_CREATED"
    ]
  }
}
```

**Response:** `Array<ActivityLogEntry>` — each entry contains the user who triggered the activity (`triggeredBy.id`) and the space it occurred in (`space.id`).

## REST Response Changes (BFF → Frontend)

### `POST /api/graph/generate` — enriched response

The existing response type `GraphDataset` gains:

1. **`hasActivityData: boolean`** (top-level) — indicates whether activity data was successfully fetched. If `false`, the frontend disables the Activity Pulse toggle.

2. **Edge-level fields** (on `GraphEdge`):
   - `activityCount?: number` — raw contribution count for this user→space relationship
   - `activityTier?: 'INACTIVE' | 'LOW' | 'MEDIUM' | 'HIGH'` — computed tier classification

**Only user→space edges** (`type === 'MEMBER' || type === 'LEAD'`, source is `USER` node) carry these fields. All other edges (CHILD, org→space) have `undefined` for both fields.

### Example edge with activity data

```json
{
  "sourceId": "user-uuid-abc",
  "targetId": "space-uuid-xyz",
  "type": "MEMBER",
  "weight": 1,
  "scopeGroup": "space-l0-uuid",
  "activityCount": 42,
  "activityTier": "HIGH"
}
```

### Example edge without activity data (org→space)

```json
{
  "sourceId": "org-uuid-def",
  "targetId": "space-uuid-xyz",
  "type": "MEMBER",
  "weight": 1,
  "scopeGroup": "space-l0-uuid"
}
```

## Error Handling

If the `activityFeedGrouped` query fails during graph generation:
- The graph is still generated successfully with all existing data
- `hasActivityData` is set to `false`
- No `activityCount` or `activityTier` fields are set on edges
- Error is logged server-side at `warn` level
- Frontend detects `hasActivityData === false` and disables the Activity Pulse toggle with a tooltip

## Caching

Activity data is embedded in the `GraphDataset` and cached together with the existing dataset. Cache key: `(userId, spaceId)`. Cache TTL: existing 24-hour policy. No separate cache for activity data.
