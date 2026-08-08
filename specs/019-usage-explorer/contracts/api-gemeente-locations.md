# Contract: `GET /api/<app>/gemeente-locations`

**Feature**: 019-usage-explorer | **Status**: Design

Returns the geo-location of every Dutch gemeente, independent of any space selection. This is the only new server endpoint the feature adds.

## Route

```
GET /api/vng/gemeente-locations
GET /api/govtech/gemeente-locations      # route exists; the tab itself is VNG-only (FR-003)
```

Mounted on the existing `dashboardRouter` (`server/src/routes/dashboard.ts`), so it inherits `authMiddleware` + `resolveUser` and the app-profile resolution the other dashboard routes use.

**No request body and no query parameters.** The response does not vary by selection, hub, or toggle — that independence is the point, and is what lets the client cache it for the session and recompute rankings locally.

## Response `200`

```jsonc
{
  "locations": [
    {
      "nameId": "gemeente-groningen",
      "title": "Groningen",
      "cbsCode": "GM0014",
      "latitude": 53.2194,
      "longitude": 6.5665,
      "provinceCode": "PV20",
      "provinceName": "Groningen"
    }
    // … one per eligible gemeente, sorted by title
  ],
  "expected": 342,
  "withLocation": 340,
  "partial": false,
  "fetchedAt": "2026-08-08T09:12:44.000Z",
  "cached": true
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `locations` | `GemeenteLocation[]` | Every registry gemeente with both a nameID and a CBS code. Entries with no coordinates are **included** with `latitude`/`longitude` null. |
| `expected` | `number` | The registry's gemeente count (342). Lets the client report shortfall without hard-coding. |
| `withLocation` | `number` | How many have usable coordinates. `expected − withLocation` is the unplaced count the UI discloses (FR-030). |
| `partial` | `boolean` | The sweep completed but could not reach every gemeente — the response is usable but incomplete. |
| `fetchedAt` | ISO 8601 | When the Alkemio sweep ran, not when this response was served. Drives any staleness note. |
| `cached` | `boolean` | Served from cache (`true`) or freshly fetched (`false`). Diagnostic only. |

Types are declared in `server/src/types/api.ts` and imported by the frontend via `@server/types/api.js`, per the existing convention.

## Caching semantics

- Stored in `cache_entries` with `space_id = '__gemeente_geo__'` (`GEO_CACHE_SPACE_ID`), keyed by the session's `user_id` — read through `getCacheEntry(userId, spaceId)` so §IV's read-time ownership check is inherited, not reimplemented.
- TTL from `dashboards.<app>.geo_cache_ttl_hours`, default **168 h**, matching the GD corpus. Gemeente locations change on municipal reorganisation — an annual event at most.
- A cache hit MUST NOT contact Alkemio (FR-005b). The endpoint is a SQLite read on every call but the first.
- A `partial: true` result **is** cached, so a degraded Alkemio does not trigger a full sweep on every request. It carries a shorter TTL (1 h) so recovery is picked up promptly.

## Failure behaviour

| Situation | Response | Why |
|-----------|----------|-----|
| Cache hit | `200`, `cached: true` | Normal path. |
| Cache miss, sweep succeeds | `200`, `cached: false` | Cold start; the only path that pays the Alkemio cost. |
| Cache miss, sweep partially succeeds | `200`, `partial: true`, short TTL | FR-030a — a partial map beats no map. The client discloses the unplaced count. |
| Cache miss, sweep fails entirely | `503` with `ApiError` | The client shows "the map cannot be drawn" (edge case), not an empty country. |
| Cache expired, refresh fails | `200` with the **stale** entry, `partial` preserved | FR-030a explicitly: a failure to refresh MUST NOT blank the tab. |
| No session | `401` | Inherited from `authMiddleware`. |

The stale-on-refresh-failure rule is the one most easily lost in implementation: expiry must not delete the row before the replacement is in hand.

## Non-goals

- **No initiative or count data.** Counts come from the graph dataset the client already holds; mixing them here would couple a selection-independent cache to selection-scoped data and force invalidation on every toggle.
- **No filtering or pagination.** 342 entries is a small, fixed payload; parameters would only create cache-key variants of an invariant dataset.
