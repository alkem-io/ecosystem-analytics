# Research: VNG Ecosystem Map

**Feature**: 024-vng-ecosystem-map | **Date**: 2026-09-20

All findings below were verified against the codebase on the feature branch and, where
marked, against the live Alkemio public API (`https://alkem.io/api/public/graphql`,
unauthenticated).

## R1. The VIH orchestrator is NOT a listed Space of the `vih-test` hub

**Finding (live API)**: hub `vih-test` ("VNG Innovation Hub - Test", id
`dd3a25ba-5f6d-4a24-adc4-6df204fae67b`) lists **23** Spaces: signalen, ai-haaglanden, atlas,
datadreamteam, mai-montferland, dook, freewhelen, gbi, gdc, gem, kiss,
landelijke-erfgoedregistr, maatschappelijke-pas, marktplaats-verduurzaming,
open-formulieren, opensource-overheid, openstad, ondernemer-centraal, polis, proactieve-dienst,
vakantieverhuur, tina, waardescanner. The Space the user calls "Programma Groei" exists as
**`programmagroei`** (display name *"Kenniscentrum Innovatie"*) but is **not in that list**.
Its *organisation* counterpart, "VNG Kenniscentrum Innovatie", is a **lead organisation on
20 of the 23** Spaces (44 role edges in total).

**Decision**: the ecosystem's Space set is *hub-listed Spaces ∪ the resolved orchestrator
Space*. When the orchestrator is not listed, the Ecosystem tab adds it to the graph request
(`POST /api/graph/generate` accepts any nameIds; the cache is per-Space, so it costs one extra
Space fetch, the 23 listed ones come from cache). The orchestrator dropdown offers the listed
Spaces ∪ the Spaces already in the effective selection ∪ the built-in default ∪ the community
preset — so a viewer who wants an orchestrator outside the hub adds it via the existing
SpacePicker first.

**Rationale**: the spec's assumption "orchestrator is one of the hub's Spaces" is false for the
very ecosystem the feature ships with. Requiring the hub owner to list the orchestrator inside
its own hub would put the orchestrator among the initiatives on every other tab (Initiatives
table, Funnel, Cities) — wrong there. Fetching it only for the Ecosystem tab keeps the other
tabs untouched.

**Alternatives considered**: (a) auto-add the orchestrator to the dashboard-wide selection —
rejected, pollutes every other tab; (b) require listing in the hub — rejected, same problem
plus a platform-side change VNG must make; (c) model the orchestrator as the *organisation*
"VNG Kenniscentrum Innovatie" — rejected, the user is explicit that the orchestrator is a
Space, and the org already appears as the dominant connector anyway.

**Spec impact**: FR-008/009/010/013 and the "Orchestrator is one of the hub's Spaces" assumption
are amended (see spec Clarifications, session 2026-09-20, planning addendum).

## R2. Built-in default table — value and matching

**Decision**: `server/src/data/ecosystem/orchestrators.ts` exports
`BUILT_IN_ORCHESTRATORS: Record<hubNameId, spaceNameId>` = `{ 'vih-test': 'programmagroei',
'vih': 'programmagroei' }`. Served to the browser by the orchestrator-choice endpoint (R4) so
the visual never embeds it. Matching is by nameId only.

**Rationale**: Q5 — baked in, code change to alter. `vih` is added alongside `vih-test` because
both hubs represent the same ecosystem and the same Space orchestrates it; harmless if `vih`
is never selected. The acceptance hub (`vnginnovationhub` on acc-alkem.io) gets no entry (Q5).

**Alternatives considered**: matching on displayName as a fallback — rejected, nameId is what
the rest of the dashboard keys on and the value is now verified.

## R3. Where to compute the ecosystem model

**Decision**: a **pure client-side module** `frontend/shared/src/dashboard/utils/ecosystem.ts`
derives the model from the `GraphDataset` the dashboard already fetches (`useVngGraph`), exactly
as `utils/funnel.ts` and `utils/initiatives.ts` do. No new dashboard-data endpoint.

Inputs available on the dataset (verified in `server/src/types/graph.ts` and
`transform/transformer.ts`):
- `SPACE_L0` nodes = the requested Spaces; `SPACE_L1`/`SPACE_L2` nodes carry `parentSpaceId`,
  so a subspace's top-level ancestor is found by walking parents (roll-up, Q2).
- `ORGANIZATION` nodes carry `avatarUrl` (logo), `isGemeente`, `cbsCode`, `displayName`.
- Organisation→Space role edges are `{ sourceId: orgId, targetId: spaceId, type: LEAD|MEMBER }`
  (transformer.ts:293–300). `ADMIN` edges are user-only. People are ignored.
- Space profiles for the guess: `displayName`, `tagline`, `description`.

**Rationale**: zero new requests, one source of truth with the other tabs, trivially
unit-testable (vitest in `frontend/vng/src/dashboard/`, the established location).

**Alternatives considered**: a server route `/api/vng/ecosystem` — rejected; it would
recompute from the same cached dataset and add a second cache key for no benefit.

## R4. Persisting the orchestrator choice (Q-session answer B + community preset)

**Decision**: new BFF routes under `/api/ecosystem/orchestrator/:hubNameId` (contract in
`contracts/api-ecosystem-orchestrator.md`), backed by a new SQLite table
`orchestrator_choices (user_id, hub_name_id, space_name_id, updated_at, PRIMARY KEY (user_id,
hub_name_id))` created in `server/src/cache/db.ts` next to the existing tables. `GET` returns
`{ own, community, builtIn }` in one round trip; `PUT` upserts, `DELETE` removes. Community
preset = `GROUP BY space_name_id ORDER BY COUNT(*) DESC, MAX(updated_at) DESC LIMIT 1`.
`user_id` is the session's `alkemio_actor_id` (the cache scoping key) — identity across devices
for free.

**Guests** (feature 023 is specified but has 0/65 tasks implemented, so no guest principal
exists in code yet): the frontend hook treats a `401`/`403` from these routes as "no server
memory" and falls back to `sessionStorage` for the visit — which is exactly the spec's guest
behaviour once 023 lands. Feature 023's task list should add: guest `GET` → `own: null`,
guest `PUT`/`DELETE` → `403`.

**Alternatives considered**: `localStorage` only — rejected (Q1 answer B requires
cross-device); storing in `cache_entries` under a synthetic space id — rejected, it has a TTL
and is invalidated by force-refresh.

## R5. Layout and rendering approach

**Decision**: a dedicated SVG component `EcosystemMap.tsx` with a **pure, deterministic layout
function** `utils/ecosystem-layout.ts`:
1. Ecosystem regions are placed on a horizontal row (N regions → N centres), each sized by its
   Space count.
2. Per region: orchestrator at the centre; initiatives on a ring (angle = index / count).
3. Organisations: initial position = centroid of the Spaces they connect to, pushed outward;
   then a **synchronous** `d3-force` relaxation (`simulation.stop(); tick(n)`) with link forces
   to connected Spaces, collision, and a radial force per region keeping organisations outside
   the initiative ring — so shared organisations settle between regions (FR-007/015).
   Space positions are fixed (`fx/fy`) so the skeleton is stable.
4. The cloud is a padded convex hull of the region's Space positions (`d3.polygonHull`),
   rendered with `curveBasisClosed` for the soft, cloud-like edge.

Rendering: React-managed SVG (no D3 DOM ownership) — nodes/edges are plain JSX, hover and
filter states are React state, and `d3-zoom` is attached to the `<svg>` to drive one `<g
transform>` (no map, so constitution §VII and the MapLibre camera rule do not apply — this is
not a geographic map). Logos via `<image clip-path>` inside a circle, using `proxyImageUrl` +
the session `badImageCache` (`isImageFailed`) to render the initials fallback; `SafeImage`
itself is an `<img>` and is not usable inside SVG, so the fallback logic is reused, not the
component.

**Rationale**: the same "pure layout + thin renderer" split the Funnel uses (`layoutFunnel` +
`FunnelChart`), which made its invariants unit-testable; determinism lets Playwright assert
structure. `ForceGraph` is not reused: it is a map-oriented, D3-owned-DOM component with
geo-projection and mask machinery that this view does not need.

**Alternatives considered**: reuse `ForceGraph` with a new mode — rejected (above); a
free-running force simulation — rejected, non-deterministic positions make SC-006-style
regression tests impossible and the sketch is a *placed* diagram, not a physics one.

## R6. Guess heuristic (FR-009 step 4)

**Decision**: score each candidate L0 Space in the dataset:
- **Profile signal**: `displayName`, `tagline`, `description` matched case-insensitively
  against `programma|program|team|kenniscentrum|centrum|center|centre|bureau|regie|
  coördin|coordin|orchestr|secretariaat|innovatiehub|innovation hub`. Any hit → qualifies.
- **Overlap signal**: number of *other* listed Spaces the candidate shares ≥1 organisation with.
  Qualifies if ≥2.
- Rank: profile hits first, then overlap, then displayName for a stable tie-break. No
  qualifying candidate → `null` (no orchestrator).

Against the live VIH data the true orchestrator is not a listed Space (R1), so the guess only
runs when own/community/built-in all fail; there it would rank Signalen (79 members) first by
overlap — acceptable because the result is labelled "guess" and the dropdown is the authority.
`programmagroei`'s display name "Kenniscentrum Innovatie" hits the profile signal, so once it
is in the candidate set it is chosen (SC-007).

## R7. Card count vs the existing gemeente count

`utils/initiatives.ts` counts **direct** gemeente edges only (deliberately, mirroring the
server's `countSpaceGemeentes`). The ecosystem card count (Q4) is **all organisations, direct
or via subspace, deduplicated**. These are different numbers by design; the ecosystem module
documents this and does not reuse `buildInitiativeRows` for the count.

## R8. Tab wiring, persistence of view state, and tests

- **Tab**: `AppConfig.ecosystem?: boolean`; `TabKey` gains `'ecosystem'`; inserted before
  `'graph'` (Graph stays last, per the shell's rule). VNG sets `ecosystem: true`; GovTech does
  not.
- **View state across tab switches** (FR-025): tabs unmount on switch
  (`{active === 'funnel' && <FunnelTab />}`), so filters, viewport transform and the
  resolved orchestrator source are kept in `sessionStorage` under
  `${storagePrefix}:ecosystem:${hubNameId}` — the same mechanism `useSelectedSpaces` uses for
  the selection.
- **Bridges** (FR-024): dispatch `${eventPrefix}:openSpace` with `{ spaceId: node.nameId ??
  node.id }` (as GraphTab does) and `${eventPrefix}:openCity` with `{ cityId: orgNode.id }`
  (as CitiesTab does) for `isGemeente` organisations.
- **i18n**: keys under `ecosystem.*` and `tabs.ecosystem` in `frontend/vng/src/i18n/{en,nl}.json`.
- **Tests**: vitest — `frontend/vng/src/dashboard/ecosystem.test.ts` (model, roll-up, filters,
  resolution order, guess), `ecosystem-layout.test.ts` (determinism, region containment,
  ring/centre invariants); server — `server/src/routes/ecosystem.test.ts` (routes + community
  aggregation on an in-memory DB). Playwright — `tests/vng-ecosystem.spec.mjs` modelled on
  `vng-funnel.spec.mjs` (mocked BFF, structural assertions, filter toggles, orchestrator
  change); `tests/mobile-navigation.spec.mjs` `TAB_NAMES` extended to nine tabs so the
  no-horizontal-scroll assertion covers the new tab.

## R9. Constitution touchpoints

- §I/§III: all data via the BFF; the new routes sit behind `resolveUser`. No tokens involved.
- §II: no new `.graphql` files — the dataset already carries everything (R3). No codegen run.
- §IV: `orchestrator_choices` is keyed by `user_id`; every read/write is parameterised and
  scoped to `req.auth.userId`; the community aggregate exposes only Space nameIds and counts,
  never who chose.
- §V: missing logo → initials; unreadable orchestrator → next in resolution order + notice;
  no Spaces → empty state; request failure → standard error state with retry.
- §VI: dashboard tokens/typography; no new visual language.
- §VII: not a geographic map — no basemap, no NL mask; nothing in `ForceGraph`/`InitiativeMap`
  is touched.
