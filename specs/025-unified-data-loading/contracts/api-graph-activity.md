# Contract: `POST /api/graph/activity` — on-demand activity item

**Owner**: `server/src/routes/graph.ts` → `services/activity-service.ts`

Declared by the Initiatives tab (`useExtraItem('activity')`). Never part of the dashboards' core load (FR-012a).

## Request

```json
{ "spaceIds": ["…"], "forceRefresh": false }
```

`spaceIds` are L0 nameIds as for `/generate`; the service expands to the subspaces it knows from the viewer's relational cache rows. Same `spaceIds`/`max_spaces_per_query` validation. `401` as elsewhere.

## Response `200 application/json` (`ActivityItem`)

```json
{
  "bySpace": { "<spaceId>": { "day": 0, "week": 3, "month": 11, "total": 42 } },
  "fetchedAt": "2026-09-21T15:00:00Z",
  "unavailable": ["<spaceId>"]
}
```

- Served from `__activity__:<nameId>` rows when present (24 h); missing rows trigger the two chunked `ActivityFeedGrouped` sweeps for **only** those Spaces.
- A Space whose feed cannot be read lands in `unavailable` (Constitution V) — never a `5xx` for the whole item.
- `5xx` only when nothing could be fetched; the browser marks the item `failed` with retry.

## Explorer parity

`/generate` with `includeActivity: true` (JSON default) composes the same rows into the dataset server-side, so the Explorer's edges/nodes keep their activity fields without calling this endpoint.
