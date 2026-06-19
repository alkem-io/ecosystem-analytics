# Contract: POST /api/vng/dashboard

**Feature**: 016-vng-frontend | BFF, session-authenticated. Returns category counts for the dashboard charts. Classification mapping stays server-side (FR-022); the frontend localises labels by key (FR-037).

---

## Request

```jsonc
{
  "spaceIds": ["stad-utrecht", "…"],   // the effective selected-space set
  "includeGemeentes": true              // mirror of the show/hide toggle (FR-034); default true
}
```

## Response (200)

```jsonc
{
  "totalSpaces": 19,                     // # of selected spaces counted (each = one "initiative", FR-022)
  "uncategorisedCount": 2,               // spaces with no tag mapping to a category (shown as "Overig"/omitted)
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

- For each selected space the user may view, read its tags and apply `vng.tagCategoryMapping.{nds,vng2030}` to increment category counts (each space contributes at most once per category present).
- `includeGemeentes=false` excludes gemeente-organisation-derived counts so the dashboard stays consistent with a hidden-gemeente graph (FR-034). (Selected spaces themselves are unaffected unless a space *is* a gemeente.)
- Categories with zero matches are returned with `count: 0` (frontend renders empty bars — FR-024, US3 scenario 3); `uncategorisedCount` surfaces missing-data transparency.
- **Keys, not labels**: category/dimension `key`s are stable; the frontend maps them to localised Dutch/English labels.

## Errors

- 401 (no session); 400 (empty `spaceIds`); 502 (upstream). Graceful: spaces lacking tag data are counted under `uncategorisedCount`, never error the response (FR-024).
