# Contract: POST /api/vng/dashboard

**Feature**: 016-vng-frontend | BFF, session-authenticated. Returns category counts for the dashboard charts. Classification mapping stays server-side (FR-022); the frontend localises labels by key (FR-037).

---

## Request

```jsonc
{
  "spaceIds": ["stad-utrecht", "…"],   // the effective selected-space set
  "includeGemeentes": true,             // mirror of the show/hide toggle (FR-034); default true
  "includeInitiatives": false           // mirror of the GD-layer toggle (FR-039); selects the counting source
}
```

## Response (200)

When `includeInitiatives` is true and the GD layer is available, the counting unit is **GD initiatives**; otherwise it is **selected spaces** (FR-022, data-source aware).

```jsonc
{
  "source": "spaces",                    // "spaces" | "gd-initiatives" — the active counting unit (shown on the chart)
  "totalCounted": 19,                    // # of entities counted (spaces, or GD initiatives)
  "uncategorisedCount": 2,               // counted entities with no tag mapping to a category ("Overig"/omitted)
  "dimensions": [
    {
      "key": "nds",                      // NDS categories chart
      "categories": [
        { "key": "cloud", "count": 0 },
        { "key": "data", "count": 1 },
        { "key": "ai", "count": 2 },
        { "key": "vakmanschap", "count": 7 }
      ]
    },
    {
      "key": "vng2030",                  // VNG-2030 themes chart
      "categories": [
        { "key": "bedrijfsvoering", "count": 10 },
        { "key": "wonen-ruimte", "count": 7 },
        { "key": "klimaat-energie", "count": 1 }
      ]
    }
  ]
}
```

## Behaviour

- **Counting source** (FR-022): if `includeInitiatives` and the GD layer is available → count **GD initiatives** (their callout tags); else count **selected spaces** (their space tags). Echo the choice in `source`.
- For each counted entity the user may view, read its tags and apply `vng.tagCategoryMapping.{nds,vng2030}` to increment category counts (each entity contributes at most once per category present).
- `includeGemeentes=false` excludes gemeente-derived counts so the dashboard stays consistent with a hidden-gemeente graph (FR-034).
- Categories with zero matches are returned with `count: 0` (frontend renders empty bars — FR-024, US3 scenario 3); `uncategorisedCount` surfaces missing-data transparency.
- **Keys, not labels**: category/dimension `key`s are stable; the frontend maps them to localised Dutch/English labels.

## Errors

- 401 (no session); 400 (empty `spaceIds`); 502 (upstream). Graceful: spaces lacking tag data are counted under `uncategorisedCount`, never error the response (FR-024).
