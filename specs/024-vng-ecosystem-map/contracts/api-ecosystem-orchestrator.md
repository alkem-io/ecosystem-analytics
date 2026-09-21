# Contract: Orchestrator choice — `/api/ecosystem/orchestrator/:hubNameId`

**Feature**: 024-vng-ecosystem-map | **Router**: `server/src/routes/ecosystem.ts` (new), mounted
in `server/src/app.ts` behind `resolveUser` like `/api/graph`. App-agnostic (hub nameIds are
platform-global), so no `/api/<app>/` namespace.

**Built in two steps, one shape.** Phase 2 ships `GET` answering `own: null, community: null,
builtIn: <table>` with no database at all — enough for US1, and the response shape below is
already final. US2 adds the `orchestrator_choices` table, `PUT`/`DELETE`, and the real
`own`/`community` values. Nothing written against the Phase-2 endpoint changes.

`:hubNameId` and `spaceNameId` MUST match `^[a-z0-9-]{1,64}$` → otherwise `400 INVALID_REQUEST`.
No session → `401` (existing middleware). All responses `application/json`.

## GET `/api/ecosystem/orchestrator/:hubNameId`

Everything the client needs to resolve the orchestrator, in one round trip.

```json
{
  "hubNameId": "vih-test",
  "own": "programmagroei",              // this user's saved choice, or null
  "community": { "spaceNameId": "programmagroei", "count": 3 },   // or null when nobody has chosen
  "builtIn": "programmagroei"           // BUILT_IN_ORCHESTRATORS[hubNameId], or null
}
```
- `community` is the most-chosen Space across ALL signed-in users (ties → most recently
  updated). Never exposes who chose.
- **Readability filter (constitution §IV — data must not leak across users).** A choice saved
  by a user who can read a Space the caller cannot MUST NOT put that Space's nameID in this
  response. The server therefore takes the top **three** candidates by the ranking above and
  returns the first one the CALLER can read, verified with the caller's own token
  (`canReadSpace(auth, nameId)` — a minimal space lookup; null/throw = not readable); if none
  of the three is readable, `community` is `null` and the client falls through to `builtIn`.
  Top-three rather than top-one so a single privately-chosen Space does not wipe the preset for
  everyone. `count` is the raw count of the RETURNED Space.
- Side-effect free. The client calls it once per hub per tab mount; the readability check costs
  at most one Alkemio lookup per call and only when a choice exists (memoisable per
  `(userId, spaceNameId)`).

## PUT `/api/ecosystem/orchestrator/:hubNameId`

Body `{ "spaceNameId": "programmagroei" }`. Upserts this user's choice for the hub.
Response `200` with the same shape as `GET` (post-write state), so the client needs no second
call. Missing/invalid `spaceNameId` → `400`.

## DELETE `/api/ecosystem/orchestrator/:hubNameId`

Removes this user's choice (FR-012). Idempotent. Response `200` with the `GET` shape.

## Guest principal (when feature 023 lands — not implemented today)

- `GET` → `own: null`, `community` + `builtIn` as usual.
- `PUT` / `DELETE` → `403 GUEST_FORBIDDEN`. The client keeps the choice in `sessionStorage` for
  the visit (spec FR-011).

## Client hook — `useOrchestratorChoice(hubNameId)` (`frontend/shared/src/dashboard/hooks/`)

```ts
{
  own: string | null; community: string | null; builtIn: string | null;
  loading: boolean; error: string | null;
  choose(spaceNameId: string): Promise<void>;   // PUT; on 401/403 → sessionStorage only
  reset(): Promise<void>;                       // DELETE; same fallback
}
```

## UI contract — Ecosystem tab (`EcosystemTab`)

| Element | `data-testid` / role | Behaviour |
|---------|----------------------|-----------|
| Tab | `role=tab`, name `t('tabs.ecosystem')` | Present when `AppConfig.ecosystem` |
| Orchestrator select | `ecosystem-orchestrator-select` (`<select>`) | Options = candidate Spaces; value = effective orchestrator nameId or `""` |
| Source badge | `ecosystem-orchestrator-source` | Text from `ecosystem.source.{own,community,builtIn,guess}` |
| Reset | `ecosystem-orchestrator-reset` (button) | Visible only when `own` is set (or guest choice); calls `reset()` |
| Built-in missing notice | `ecosystem-orchestrator-notice` | Shown iff `builtInMissing` |
| Filter: orchestrator | `ecosystem-filter-orchestrator` (checkbox) | FR-020a (a) |
| Filter: multi | `ecosystem-filter-multi` (checkbox) | FR-020a (b) |
| Hidden count | `ecosystem-filter-hidden` | "N organisations hidden"; absent when 0 |
| Clear filters | `ecosystem-filter-clear` | Visible iff any filter on |
| Fit to view | `ecosystem-fit` | Resets zoom transform |
| Region | `<g data-ecosystem="<hubNameId>">` with `<path class="eco-cloud">` | One per ecosystem |
| Orchestrator node | `<g data-space="<nameId>" data-role="orchestrator">` | Click → `openSpace` |
| Initiative node | `<g data-space="<nameId>" data-role="initiative">` | Click → `openSpace`; text includes `· N` when `orgCount > 0` |
| Organisation node | `<g data-org="<id>" data-connector="true|false">` | Click (gemeente) → `openCity`; hover → highlight |
| Org connection | `<line data-edge="org" data-strength="lead|member" data-provenance="direct|viaSubspace">` | Stroke width by strength; dash by provenance |
| Space link | `<line data-edge="partOf">` | Always drawn, lightest stroke |
| Empty states | `ecosystem-empty` | "no initiatives" / "no organisations match" |
