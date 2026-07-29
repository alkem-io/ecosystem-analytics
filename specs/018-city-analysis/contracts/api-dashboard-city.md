# Contract: `cityPopulation` on `POST /api/<app>/dashboard`

**Feature**: 018-city-analysis | **Status**: normative | **Change type**: additive, non-breaking

Extends the existing app-aware dashboard endpoint (`server/src/routes/dashboard.ts`, mounted at `/api/vng` and `/api/govtech`). No new route, no request-shape change, no auth change.

---

## Request — unchanged

```http
POST /api/vng/dashboard
Cookie: ea_session=<opaque>
Content-Type: application/json
```

```jsonc
{
  "spaceIds": ["signalen", "common-ground"],
  "includeGemeentes": false,
  "includeInitiatives": true,
  "includeGemeenteDelers": true   // the GD checkbox; also drives cityPopulation
}
```

The existing validation is unchanged: `spaceIds` required and non-empty (`400 INVALID_REQUEST`), length ≤ `config.maxSpacesPerRequest` (`400 TOO_MANY_SPACES`), unknown mount app (`400 UNKNOWN_APP`), and `authMiddleware` + `resolveUser` in front of everything.

`cityPopulation` is computed with `includeGd = body.includeGemeenteDelers ?? false`, exactly like `gemeenteDistribution`.

---

## Response — one new optional field

`VngDashboardResponse` (`server/src/types/api.ts`) gains:

```ts
/** Population × initiative-count scatter series (feature 018). */
cityPopulation?: CityPopulationSeries;
```

```ts
export interface CityPopulationPoint {
  /** Gemeente organisation nameID, e.g. "gemeente-groningen". Stable key. */
  nameId: string;
  name: string;
  provinceName: string | null;
  /** Always > 0 — municipalities with unknown population are excluded, not zeroed. */
  population: number;
  /** Distinct initiatives in this selection. Always 0 in `nonParticipating`. */
  initiativeCount: number;
}

export interface CityPopulationSeries {
  /** True when GD initiatives were folded into the counts. */
  gdIncluded: boolean;
  /** Cities with >= 1 initiative in the current selection. */
  participating: CityPopulationPoint[];
  /** Dutch municipalities with 0 initiatives in this selection (FR-021). */
  nonParticipating: CityPopulationPoint[];
  /** Count omitted for unknown population — the UI MUST surface this (FR-023). */
  excludedUnknownPopulation: number;
}
```

The field is **optional** so existing clients (and GovTech before it renders the chart) are unaffected, matching how `gemeenteDistribution` and `categoryMatrix` were introduced.

### Example (abridged)

```jsonc
{
  "gdIncluded": true,
  "totalCounted": 42,
  "uncategorisedCount": 7,
  "dimensions": [ /* … unchanged … */ ],
  "gemeenteDistribution": { /* … unchanged … */ },
  "categoryMatrix": { /* … unchanged … */ },

  "cityPopulation": {
    "gdIncluded": true,
    "participating": [
      { "nameId": "gemeente-amsterdam", "name": "Amsterdam", "provinceName": "Noord-Holland", "population": 931298, "initiativeCount": 11 },
      { "nameId": "gemeente-groningen", "name": "Groningen", "provinceName": "Groningen",     "population": 238147, "initiativeCount": 2 }
    ],
    "nonParticipating": [
      { "nameId": "gemeente-vlissingen", "name": "Vlissingen", "provinceName": "Zeeland", "population": 44648, "initiativeCount": 0 }
    ],
    "excludedUnknownPopulation": 2
  }
}
```

---

## Server behaviour

Assembled by `assembleCityPopulation(userId, auth, spaceIds, includeGd)` in `server/src/services/vng-dashboard-service.ts`, attached in the route alongside `gemeenteDistribution`:

```ts
result.cityPopulation = await assembleCityPopulation(
  req.auth!.userId!,
  req.auth!,
  body.spaceIds,
  body.includeGemeenteDelers ?? false,
);
```

Steps:

1. `generateGraph(userId, auth, { spaceIds, includeInitiatives: includeGd })` — cached per user/space; the GD layer is included only when the checkbox is on.
2. `countCityInitiatives(dataset)` — the rule in [city-aggregation.md](./city-aggregation.md). **No other counting method is permitted here.**
3. Left-join `registry.municipalities()` (new accessor) against those counts:
   - `population == null` → `excludedUnknownPopulation++`, emit nothing;
   - `initiativeCount > 0` → `participating`;
   - else → `nonParticipating` with `initiativeCount: 0`.
4. A gemeente node present in the graph but absent from the registry is still emitted into `participating` from the node's own fields, so no participating city is dropped.
5. Sort both arrays by `population` descending, then `name`.

### Guarantees

- `participating` ∩ `nonParticipating` = ∅ (by `nameId`).
- Every `population` in either array is a positive number; unknowns are only ever reflected in `excludedUnknownPopulation`.
- `includeGemeenteDelers: false` ⇒ `gdIncluded === false` and no `INITIATIVE` node contributed to any count.
- For any city in `participating`, its `initiativeCount` equals the `CityRow.initiativeCount` the frontend derives for the same selection (FR-028).

### Errors

No new error codes. Failures propagate through the route's existing handler, including the Alkemio auth-error path (`isAlkemioAuthError` → `invalidateAndReject`).

---

## Client consumption

- `useDashboard` needs **no change** — it already returns the whole `VngDashboardResponse`.
- `DashboardTab` reads `data?.cityPopulation` and renders `<CityPopulationChart series={…} />`, showing `dashboard.noData` when the field is absent or both arrays are empty.
- `exportDashboardXlsx` gains city rows (`name`, `province`, `population`, `initiativeCount`, participating yes/no) plus the chart image capture, following the existing per-chart pattern (FR-025).

---

## Test coverage

`server/src/services/vng-cities.test.ts`:

| Case | Expectation |
|---|---|
| Fixture from [city-aggregation.md](./city-aggregation.md) | `participating` counts match the contract table |
| Municipality with `population: null` | absent from both arrays; `excludedUnknownPopulation` incremented |
| Municipality in the registry, absent from the graph | in `nonParticipating` with `initiativeCount: 0` |
| Gemeente node in the graph, absent from the registry | in `participating`, not dropped |
| `includeGd: false` | `gdIncluded === false`; no GD initiative contributes |
| Disjointness + sort order | asserted |
