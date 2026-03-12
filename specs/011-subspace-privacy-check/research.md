# Research: Subspace Privacy-Aware Loading

**Feature**: 011-subspace-privacy-check | **Date**: 2026-03-07

## R1: How to query user privileges on subspaces

**Decision**: Query `myPrivileges` from `Space.about.membership` within the existing `spaceAboutFragment`.

**Rationale**: The Alkemio schema exposes `SpaceAboutMembership.myPrivileges` as `Array<AuthorizationPrivilege>` which includes `READ` and `READ_ABOUT` values. This field is available on the `Space.about.membership` path, making it accessible alongside the existing about fragment without a separate query.

**Alternatives considered**:
- `Space.authorization.myPrivileges` — also available but requires querying the top-level `authorization` field separately. The `about.membership` path is more semantically appropriate and already nested within the about data we fetch.
- Separate privilege-check API call — would require a new endpoint and add latency. The GraphQL field approach is more efficient.

## R2: Two-phase subspace loading strategy

**Decision**: Restructure the `spaceByName` GraphQL query to fetch subspaces with about-only data (including `myPrivileges`) in the initial query, then make follow-up queries per accessible subspace to retrieve community/role data.

**Rationale**: The current query fetches all subspace data (about + community) in one shot via `SpaceGraphInfoFragment`. By splitting this:
1. Phase 1: Fetch all subspaces with `spaceAboutFragment` + `myPrivileges` (lightweight, no permission errors)
2. Phase 2: For each subspace where `myPrivileges` includes `READ`, fetch community data via a targeted query

This eliminates the FORBIDDEN_POLICY errors that currently flood logs when users lack access to subspaces.

**Alternatives considered**:
- Single query with error handling (current approach) — generates server errors and returns partial data unpredictably. The two-phase approach is cleaner.
- Batch query for all accessible subspaces in one call — would be ideal but the Alkemio API doesn't support querying multiple spaces by ID in a single community-data query. Individual per-subspace queries are needed.

## R3: Lock badge visual implementation

**Decision**: Reuse the existing lock badge pattern from `ForceGraph.tsx` (lines 966-996) which already renders a 🔒 emoji on `privacyMode === 'PRIVATE'` nodes. Extend the condition to also show the badge when `restricted === true`.

**Rationale**: The visual pattern (white circle background + lock emoji at `0.6 * nodeRadius` offset) is already implemented and scales with node type. The only change needed is extending the D3 filter condition from `privacyMode === 'PRIVATE'` to also include `restricted === true`.

**Alternatives considered**:
- SVG lock icon — higher visual quality but adds complexity (SVG path definitions, scaling). The emoji approach is already established and consistent.
- Different badge position or color for restricted vs private — adds visual complexity with little user value. Both concepts (space is private, user lacks access) convey the same message: "you can't see the full content."

## R4: GraphNode `restricted` field vs `privacyMode`

**Decision**: Add a separate `restricted: boolean` field to `GraphNode` (per clarification session). The existing `privacyMode` continues to reflect the space's own `isContentPublic` setting.

**Rationale**: The two concepts are orthogonal:
- `privacyMode` = the space's content visibility setting (set by space admin)
- `restricted` = the current user lacks READ privilege on this specific space

A space can be `privacyMode: 'PUBLIC'` (content is public) but `restricted: true` (this user specifically can't read it, e.g., if they're not a member of a members-only space). Keeping them separate preserves the existing semantics.

## R5: Impact on caching

**Decision**: No cache schema changes needed. Restricted nodes are cached with `restricted: true` and empty community data. Cache invalidation behavior is unchanged.

**Rationale**: The cache stores serialized `GraphNode[]` and `GraphEdge[]` per user per space. Restricted nodes simply have fewer edges (no contributor edges) and `restricted: true`. The cache key remains `(userId, spaceNameId)` and TTL is unchanged.

**Alternatives considered**:
- Separate cache entries for restricted vs full data — unnecessary complexity. The privilege check happens at query time and the result is cached as-is.
