# Data Model: VNG Ecosystem Map

**Feature**: 024-vng-ecosystem-map | **Date**: 2026-09-20

Two layers: (1) a **client-side derived model** computed from the existing `GraphDataset`
(no server change), and (2) one **new persisted table** for orchestrator choices.

## 1. Derived model (`frontend/shared/src/dashboard/utils/ecosystem.ts`)

```ts
/** One drawn region. Phase 1 builds exactly one; the type is a list everywhere it is consumed. */
interface Ecosystem {
  id: string;                 // hub nameId (stable key; also the choice key)
  name: string;               // hub displayName
  orchestrator: EcoSpace | null;
  orchestratorSource: OrchestratorSource | null;   // null iff orchestrator is null
  initiatives: EcoSpace[];    // listed Spaces (∪ direct additions) minus the orchestrator
  spaceLinks: SpaceLink[];    // orchestrator → each initiative ('partOf'); empty if no orchestrator
}

type OrchestratorSource = 'own' | 'community' | 'builtIn' | 'guess';

interface EcoSpace {
  id: string;                 // GraphNode.id (Alkemio UUID)
  nameId: string;             // for the openSpace bridge + choice persistence
  name: string;
  orgCount: number;           // distinct organisations connected (direct or via subspace); Q4
  listed: boolean;            // true = in the hub's spaceListFilter; false = orchestrator/direct addition
}

interface SpaceLink { kind: 'partOf'; fromId: string; toId: string }   // Space–Space connection

interface EcoOrganisation {
  id: string;                 // GraphNode.id — the openCity bridge key for gemeentes
  nameId: string | null;
  name: string;
  logoUrl: string | null;     // GraphNode.avatarUrl (proxied at render time)
  isGemeente: boolean;
  ecosystemIds: string[];     // every ecosystem it has ≥1 connection in (FR-007)
  connections: OrgConnection[];
  isConnector: boolean;       // FR-006: connected to an orchestrator AND ≥1 initiative of the same ecosystem
  linkedToOrchestrator: boolean;   // filter (a)
  multiMembership: boolean;   // filter (b): connections.length ≥ 2
}

interface OrgConnection {
  ecosystemId: string;
  spaceId: string;            // the LISTED Space (L0) the connection is attributed to
  strength: 'lead' | 'member';        // strongest role found at any level
  provenance: 'direct' | 'viaSubspace'; // 'direct' iff ≥1 role on the L0 Space itself
  subspaceIds: string[];      // L1/L2 ids the roles were found on (hover detail; may be empty)
}

interface EcosystemModel {
  ecosystems: Ecosystem[];
  organisations: EcoOrganisation[];   // each organisation exactly once across all ecosystems
}

interface EcosystemFilters { linkedToOrchestrator: boolean; multiMembership: boolean }
```

### Derivation rules (from `GraphDataset`)

| Rule | Source |
|------|--------|
| Listed Spaces = `SPACE_L0` nodes whose `nameId ∈ hub.spaceNameIds`; direct additions = other `SPACE_L0` nodes in the effective selection | FR-002/003, R1 |
| Top-level ancestor of an `SPACE_L1/L2` node = follow `parentSpaceId` until an `SPACE_L0` | FR-004a |
| Connection exists iff ≥1 edge `{source: org, target: space, type ∈ {LEAD, MEMBER}}` where `space` is the L0 or any descendant | FR-004/004a |
| `strength` = `lead` if any such edge is `LEAD`, else `member` | FR-005 |
| `provenance` = `direct` if any such edge targets the L0 itself, else `viaSubspace` | FR-004a |
| Self-links never emitted; `USER` nodes and `ADMIN` edges ignored | Edge cases |
| `orgCount` on a Space = distinct organisations with a connection to it, filters ignored | FR-017 |
| `isConnector` = has a connection to the orchestrator and to ≥1 initiative of the same ecosystem | FR-006 |
| Filters hide organisations (and their connections) only; Spaces and `spaceLinks` always remain | FR-020a |

### Orchestrator resolution (pure; `resolveOrchestrator`)

Inputs: `candidatesInDataset: Set<nameId>`, `own`, `community`, `builtIn` (each `nameId | null`),
`guess(dataset) → nameId | null`.

```
for (source, nameId) of [('own', own), ('community', community), ('builtIn', builtIn)]:
  if nameId && candidatesInDataset.has(nameId) → { nameId, source }
g = guess(dataset); if g → { nameId: g, source: 'guess' }
→ null
```
A non-null `builtIn` that is *not* in `candidatesInDataset` yields the FR-013 notice flag
(`builtInMissing: true`) alongside the result.

### Guess (`guessOrchestrator`) — see research R6

Candidates = listed Spaces ∪ direct additions present in the dataset. Score = (profile hit
? 1 : 0, overlap count). Qualifies if profile hit or overlap ≥ 2. Highest score wins; ties by
`displayName` ascending.

## 2. Persisted: `orchestrator_choices` (SQLite, `server/src/cache/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS orchestrator_choices (
  user_id        TEXT    NOT NULL,   -- alkemio_actor_id from the session (constitution §IV)
  hub_name_id    TEXT    NOT NULL,   -- ecosystem key
  space_name_id  TEXT    NOT NULL,   -- chosen orchestrator
  updated_at     INTEGER NOT NULL,   -- epoch ms
  PRIMARY KEY (user_id, hub_name_id)
);
CREATE INDEX IF NOT EXISTS idx_orchestrator_choices_hub ON orchestrator_choices (hub_name_id);
```

| Operation | Statement (parameterised) |
|-----------|---------------------------|
| own | `SELECT space_name_id FROM orchestrator_choices WHERE user_id=? AND hub_name_id=?` |
| community | `SELECT space_name_id, COUNT(*) AS n, MAX(updated_at) AS latest FROM orchestrator_choices WHERE hub_name_id=? GROUP BY space_name_id ORDER BY n DESC, latest DESC LIMIT 1` |
| set | `INSERT INTO … VALUES (?,?,?,?) ON CONFLICT(user_id, hub_name_id) DO UPDATE SET space_name_id=excluded.space_name_id, updated_at=excluded.updated_at` |
| clear | `DELETE FROM orchestrator_choices WHERE user_id=? AND hub_name_id=?` |

Validation: `hub_name_id` and `space_name_id` are Alkemio nameIDs — `^[a-z0-9-]{1,64}$` —
rejected with `400` otherwise. No TTL; rows are never expired (a choice is not a cache).
Not touched by `CACHE_MAINTENANCE_VERSION` bumps or force-refresh.

Lifecycle: absent → set (PUT) → updated (PUT) → absent (DELETE). No other states.

## 3. Client view state (sessionStorage, `${storagePrefix}:ecosystem:${hubNameId}`)

```ts
interface EcosystemViewState {
  filters: EcosystemFilters;
  transform: { k: number; x: number; y: number } | null;  // d3-zoom transform; null = fit
  guestChoice?: string | null;   // orchestrator nameId when the server refused to remember (guest)
}
```
Survives tab switches and reloads within the visit (FR-025); cleared with the browser session.
