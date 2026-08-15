# Quickstart: Usage Explorer

**Feature**: 019-usage-explorer | **Date**: 2026-08-08

## Run it

```bash
pnpm install                 # repo root — pnpm workspace
pnpm -C server run codegen   # REQUIRED: regenerates the SDK after gemeenteLocations.graphql lands
pnpm run dev                 # BFF :4000 + Explorer :5173 + VNG :5174 + GovTech :5175
```

Open the VNG dashboard at <http://localhost:5174>, sign in through Alkemio, pick a hub and a selection, then open the **Usage Explorer** tab.

The first open pays the cold-start cost: the BFF sweeps Alkemio for all 342 gemeente locations and caches them for a week. Later opens are a SQLite read.

## Verify the cache is doing its job

```bash
# Cold: fetched from Alkemio
curl -s -b "ea_session=$SESSION" localhost:4000/api/vng/gemeente-locations | jq '{expected, withLocation, partial, cached}'
# → { "expected": 342, "withLocation": 342, "partial": false, "cached": false }

# Warm: same payload, no Alkemio call
curl -s -b "ea_session=$SESSION" localhost:4000/api/vng/gemeente-locations | jq '.cached'
# → true
```

If `withLocation` is below `expected`, the difference is the unplaced count the UI must disclose (FR-030) — not a bug in itself, but worth checking against Alkemio before assuming the map is complete.

## Tests

```bash
pnpm -C server run test                       # gemeente-geo-service, cache scoping
pnpm -C frontend/vng run test                 # usage.test.ts — the aggregation contract
pnpm run test:visual                          # Playwright, incl. the three NL-only guards
```

**The NL-only specs are the gate for the basemap extraction (R6).** Run them *before* touching `ForceGraph.tsx`, keep the output, and diff after:

```bash
npx playwright test tests/vng-map-nl-only.spec.mjs tests/govtech-map-nl-only.spec.mjs
```

Any pixel difference in those two means the extraction changed behaviour and must be reverted, not re-baselined. Constitution §VII treats anything outside the Netherlands appearing as a regression.

## Verifying the acceptance scenarios by hand

| Check | How | Spec anchor |
|-------|-----|-------------|
| All 342 drawn | Count markers in the DOM at the national view | SC-002 |
| 3× ratio | Measure the largest and smallest **dot** diameters; expect exactly 3:1 | FR-008, SC-003 |
| Anchored scale | Note the size of a 1-initiative gemeente; change the selection so `maxCount` changes; it must not move | FR-007, FR-008b |
| Constant screen size | Measure one marker at the national view, zoom into a province, measure again — identical | FR-015 |
| Grey squares | Find a gemeente with no initiatives; expect a grey square, not a small dot | FR-006, FR-009 |
| Viewport ranking | Zoom to a known region; every list count ≤ the visible total; denominator equal across all rows | FR-018, FR-019b |
| Zoom-out denominator | Zoom out; counts and denominator both rise; no entry exceeds the denominator | US2 scenario 3 |
| Province reframe | Select a province; neighbouring provinces' gemeentes stay **visible** and counted | FR-013a |
| **NL-only still holds** | At every zoom, in every province view: nothing outside the Netherlands is drawn | **§VII** |
| Tie ordering | Two initiatives on the same count sort alphabetically, stably across re-renders | FR-020 |
| Focus | Select a gemeente: its own list appears, ranking numbers do **not** change | FR-025, FR-026 |
| Degradation | Delete the cache row and block Alkemio: stale renders; no cache at all → explicit message, never a blank country | FR-030a |

The two easiest to get wrong, and the two most worth checking early: **province reframe must not mask other Dutch provinces** (FR-013a) while **the NL outer boundary must still mask everything abroad** (§VII). They are different boundaries and both must hold at once.

## Clearing the location cache

```bash
sqlite3 server/data/cache.db "DELETE FROM cache_entries WHERE space_id = '__gemeente_geo__';"
```

Forces a fresh Alkemio sweep on the next request — useful when validating cold-start timing (SC-006) or after gemeente data changes upstream.
