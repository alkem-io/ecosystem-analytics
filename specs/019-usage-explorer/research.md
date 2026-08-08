# Phase 0 Research: Usage Explorer

**Feature**: 019-usage-explorer | **Date**: 2026-08-08

Six unknowns blocked the design. Each is resolved below with the decision, why, and what was rejected. Facts verified against the codebase are marked **verified**; assumptions needing a live-API check before implementation are marked **to verify** and carry a fallback.

---

## R1 — How to fetch the location of all 342 gemeentes from Alkemio

**Context**: Today gemeente positions arrive incidentally. `acquire-service.ts` collects organisation ids from the selected spaces' role sets and fetches each profile **one at a time** via `sdk.organizationByID` (`server/src/services/acquire-service.ts:119-132`). A gemeente that participates in nothing is in no role set, so it has no node and no position — precisely the gemeente FR-006 needs to draw as a grey square.

**Verified facts**:

- The registry holds **344** entries, **342** with an `alkemioNameId` and a CBS code; the other two (Brugge, Gent) are Belgian with neither, and `MunicipalityInfo.country` already distinguishes them (`server/src/services/vng-registry.ts`).
- **All 342 nameIDs share the prefix `gemeente-`** (checked exhaustively — zero exceptions).
- `Query.organizationsPaginated(first, after, filter: OrganizationFilterInput, …)` exists; `OrganizationFilterInput` accepts `nameID`, `displayName`, `domain`, `website`, `contactEmail` (`generated/alkemio-schema.ts:6436`).
- `Query.organizations(filter: ActorFilterInput, limit, shuffle)` also exists, but `ActorFilterInput` filters **only by credentials** (`:535`) — useless here.
- `Organization.profile.location.geoLocation { latitude longitude }` is already selected by `organizationByID.graphql`, so the shape is proven.
- `lookupByName.organization(NAMEID)` returns a **`String`** (the UUID), not an object (`:3951`) — any nameID-first path costs two round trips per gemeente.

**Decision**: Page through `organizationsPaginated` with `first: 100`, selecting `nameID` + `profile.location.geoLocation` + `profile.displayName`, and **inner-join the results against the registry's 342 nameIDs** server-side. Attempt `filter: { nameID: 'gemeente-' }` first to cut the page count; treat it as an optimisation, never as the correctness boundary.

**Rationale**: One bounded, paginated sweep replaces 684 round trips. Joining against the committed registry — rather than trusting the filter — means the result is correct whether the filter does prefix, substring, or exact matching. The registry stays the authority on *which* organisations are gemeentes, consistent with how `isGemeenteNameId` is already used.

**To verify before implementation**: whether `OrganizationFilterInput.nameID` matches by substring/prefix or only exactly, and whether `organizationsPaginated` is available to an ordinary authenticated user (not just platform admins).

**Fallback ladder**, in order, if the sweep proves unavailable:

1. `organizationsPaginated` with no filter, paging everything and joining on the registry (more pages, same correctness).
2. Derive gemeente organisation ids from the **`gemeentedelers` space role set** the VNG dashboard already reads, then fetch profiles by id with the existing bounded-concurrency helper.
3. Per-nameID `lookupByName.organization` → `lookup.organization(ID)`, 684 requests. Tolerable **only** because it runs once per user per week behind the cache — but it is the last resort, and if it is reached the warm-up must be reported in the response's `partial` field rather than blocking the tab.

**Alternatives rejected**:

- *Commit a static coordinate file for all 342 gemeentes.* Rejected by the clarification session — the user was explicit that the data should come from Alkemio and be cached. It would also drift from Alkemio's own records with nothing to reconcile it.
- *Extend `acquire-service` to fetch all gemeentes during graph generation.* Rejected: it couples a selection-independent dataset to selection-scoped work, inflating every graph generation for data that changes yearly at most.

---

## R2 — Where a selection-independent dataset may be cached under constitution §IV

**Context**: §IV requires cache entries be "scoped per-user and per-Space" with ownership verified at read time. The gemeente location set belongs to no space and varies by no user.

**Verified precedent**: feature 016 hit this exact problem and solved it with `GD_CACHE_SPACE_ID = '__gd_initiatives__'` (`server/src/cache/cache-service.ts:15`) — a synthetic space id in the ordinary `cache_entries` table, per-user, 168 h TTL, with `invalidateGdCacheForAllUsers()` and deployment-time maintenance already built around it.

**Decision**: Add `GEO_CACHE_SPACE_ID = '__gemeente_geo__'` following that pattern exactly. Per-user rows, TTL from a new `geo_cache_ttl_hours` config key defaulting to **168 h**, read through the same `getCacheEntry(userId, spaceId)` path so the ownership check is inherited rather than reimplemented.

**Rationale**: Keeps §IV's read-time ownership check literally true with no exception clause, reuses maintenance and invalidation machinery, and needs no schema change. Duplication cost is negligible — a few hundred bytes × 342 rows per active user.

**Alternatives rejected**:

- *One global row under a sentinel user id.* Rejected: it defeats the read-time ownership check §IV names explicitly, and would establish "this data isn't really sensitive" as a per-feature judgement call.
- *In-process memory cache.* Rejected: the hosted deployment runs multiple replicas (§I), so each would warm separately and a restart would re-trigger the Alkemio sweep.

---

## R3 — Rendering 342 markers smoothly (SC-007)

**Decision**: SVG, one `<g>` under a single d3-zoom transform, one `<circle>` or `<rect>` per gemeente. No canvas, no virtualisation.

**Rationale**: 342 nodes is an order of magnitude below where SVG struggles; the existing `ForceGraph` already animates comparable counts *with* a live force simulation, which this map does not run — positions are fixed by projection and never tick. Zoom/pan touches one transform attribute plus a counter-scale pass over 342 elements. Canvas would forfeit native hit-testing, focus, and accessibility for no measured gain.

**Alternatives rejected**: canvas rendering (unnecessary complexity, loses hit-testing); reusing the force simulation with pinned nodes (pointless CPU for static positions).

---

## R4 — Constant on-screen marker size under d3-zoom (FR-015)

**Verified**: `ForceGraph.effectiveRadius` deliberately grows markers on zoom — `mapMultiplier = 1 / Math.pow(zoomScale, 0.5)`, so on-screen size scales as `√k` (`frontend/shared/src/graph/ForceGraph.tsx:284-305`, with a comment stating the intent).

**Decision**: In `UsageMap`, counter-scale every marker by exactly `1/k` on each zoom event, so on-screen size is invariant. Do **not** touch `effectiveRadius` — the Explorer and both existing Dutch maps depend on its `√k` behaviour.

**Rationale**: This difference alone rules out reusing `ForceGraph` for the Usage Explorer, and confirms the separate-component decision. `1/k` also makes SC-003 checkable by measuring rendered pixels at any zoom, and keeps the size legend (FR-015a) valid everywhere.

**Implementation note**: counter-scale via a `transform` on each marker group rather than recomputing `r` — one attribute write per marker per zoom event, and it keeps the dot/square geometry declarative.

---

## R5 — Deriving the visible gemeente set from the viewport (FR-016)

**Decision**: On zoom/pan, take `d3.zoomTransform(svg.node())`, invert the viewport corners `[0,0]` and `[width,height]` into projected space, and test each gemeente's **projected point** against that box. Throttle to animation frames while the gesture is live, and recompute the ranking on a short settle debounce.

**Rationale**: The identical inversion is already proven in `ForceGraph`'s `renderTiles` (`:962-975`), which maps viewport corners through `transform.invert` and the inverse projection to pick tiles. Reusing the technique keeps the visible set exactly consistent with what the tiles show. Because positions are static, projected coordinates are computed once and reused for every subsequent box test — the per-frame cost is 342 comparisons.

**Point-based, not marker-bounds-based**: a gemeente counts as visible when its *position* is in view, so its count doesn't flicker as a marker straddles the edge. FR-016's "whose markers fall within" is satisfied by the marker's anchor point; this is the testable reading and must be stated in the aggregation contract.

**Settle debounce**: SC-005 allows 1 s after the map settles. A ~150 ms debounce keeps the list stable during a gesture and well inside budget. FR-021's "must update" is satisfied on settle, not per frame.

---

## R6 — Extracting the NL basemap without regressing constitution §VII

**Context**: §VII is a hard requirement naming the exact files that implement Netherlands-only rendering and warning that *any* change must preserve it. The masking is subtle: an SVG `clipPath` does **not** track d3-zoom, so the implementation instead draws an opaque white **complement** path inside the zoom group, relying on the source GeoJSON's reversed winding plus `fill-rule: evenodd` — verified pixel-by-pixel by `tests/vng-map-nl-only.spec.mjs` (`ForceGraph.tsx:1050-1075`).

That is precisely the kind of logic that must not be reimplemented from memory in a second component.

**Decision**: **Move** the projection + tile rendering + white-complement masking out of `ForceGraph.tsx` into `frontend/shared/src/map/nl-basemap.ts`, exposing something like `renderNlBasemap({ svg, group, region, width, height }) → { projection, renderTiles }`. `ForceGraph` calls it; `UsageMap` calls it. One implementation, two consumers.

**Rationale**: §VII's stated fear is divergence, and there are already **two** Playwright guards (`tests/vng-map-nl-only.spec.mjs`, `tests/govtech-map-nl-only.spec.mjs`) that will fail loudly if the extraction changes rendering. Adding a third map by copy-paste would triple the surface with no guard on the copy.

**Risk and mitigation**: this is a refactor of constitution-critical code inside a 2 877-line component, undertaken by a feature that otherwise doesn't touch it. Mitigations, in order:

1. Extract **verbatim** — a pure move, no behavioural edits, no "improvements" while relocating.
2. Run both existing NL-only Playwright specs **before and after** the move; they are the gate, and a diff in their screenshots blocks the change.
3. Add `tests/vng-usage-explorer-nl-only.spec.mjs` for the new map.
4. Keep the extraction its own commit, so a §VII regression bisects cleanly.

**Alternatives rejected**:

- *Duplicate the masking into `UsageMap`.* Rejected on §VII divergence risk — two copies of load-bearing, subtly-wound geometry code.
- *Build `UsageMap` on `ForceGraph` with new props.* Rejected: FR-015 contradicts `effectiveRadius`'s `√k` growth (R4), the force simulation is dead weight, and no viewport is exposed. Bending it would put regression risk on three shipped maps to serve one new one.
- *Leave `ForceGraph` alone and give `UsageMap` no tiles.* Rejected outright — §VII states map tiles inside the Netherlands are **essential, not optional**.

---

## Cross-cutting: the count rule is inherited

Not an unknown, but load-bearing enough to record. FR-029 requires a gemeente's initiative count here to equal the Cities view's count. Feature 018 made that rule **normative** in `specs/018-city-analysis/contracts/city-aggregation.md`, implemented in `frontend/shared/src/dashboard/utils/cities.ts#buildCityRows` and `server/src/services/vng-dashboard-service.ts#countCityInitiatives`, pinned by mirrored tests on both sides.

`utils/usage.ts` therefore consumes `CityRow[]` from `buildCityRows` and adds **only** position, marker geometry, and viewport filtering. It must never recount initiatives — that would create a fifth implementation of a rule four places already agree on.
