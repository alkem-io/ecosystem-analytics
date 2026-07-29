# Contract: The city ↔ initiative aggregation rule

**Feature**: 018-city-analysis | **Status**: normative

This is the **single source of truth** for how a city's initiative count is computed. Two implementations exist — one in the browser, one on the server — and FR-028 requires them to agree for every selection. Any change to this rule must change both implementations and both tests in the same commit.

---

## The rule

> Given a `GraphDataset`, a **city** is a node with `type === ORGANIZATION` and `isGemeente === true`.
>
> A city **participates in** an initiative when the dataset contains **at least one edge**, in **either direction**, between that city's node and a node whose `type` is `SPACE_L0` (a Groei initiative) or `INITIATIVE` (a GemeenteDelers callout).
>
> A city's **initiative count** is the number of **distinct** such initiative nodes.

Nothing else counts. In particular:

- **Edge type is irrelevant.** Any edge connecting the two nodes establishes participation. This mirrors `countSpaceGemeentes` (`server/src/services/vng-dashboard-service.ts:88-100`) and the Initiatives tab's gemeente column (`InitiativesTab.tsx:147-177`), of which this rule is the transpose.
- **Direction is irrelevant.** Check both `sourceId` and `targetId`.
- **Sub-spaces do not count.** `SPACE_L1` and `SPACE_L2` nodes are not initiatives (consistent with `GROEI_TYPE = 'SPACE_L0'` in `InitiativesTab.tsx:11`).
- **Multiple edges between the same pair count once.** De-duplicate by initiative node id.
- **Description text matching is NOT used.** See "Why not text matching" below.

## Why not text matching

`assembleGemeenteDistribution` derives GD gemeente links with `registry.findGemeentesInText(callout.description)` (`vng-dashboard-service.ts:132-135`). That is a *different* rule: `server/src/transform/initiatives.ts:162-164` emits an `INITIATIVE_GEMEENTE` edge only `if (nodeId)` — i.e. only when the mentioned gemeente resolves to an organisation node that exists in the graph. A gemeente named in a description but absent from the graph is counted by the text rule and not by the edge rule.

For an initiative-keyed chart that discrepancy is invisible. For a **city-keyed** view it is not: a city with no node cannot be a row, so counting it would produce chart totals that the Cities table can never reproduce — a direct FR-028 violation. The city feature therefore uses the edge rule on both sides, and does not modify the existing distribution chart's behaviour.

## Determinism

Both implementations must be **pure** — same dataset in, same result out, no clock, no randomness, no I/O — so a single fixture can drive tests on both sides.

---

## Implementation A — frontend

**File**: `frontend/shared/src/dashboard/utils/cities.ts`

```ts
export function buildCityRows(dataset: GraphDataset | null): CityRow[];
```

- Returns `[]` for `null`.
- One `CityRow` per city node (see [data-model.md](../data-model.md#2-derived-entity-cityrow-frontend) for the full shape).
- `CityRow.initiativeCount === CityRow.initiatives.length`.
- `initiatives` sorted by `name` (`localeCompare`); rows sorted by `name`.
- Classification arrays are the de-duplicated, sorted union across the city's initiatives.

**Consumers**: `CitiesTab`, `CityDetailsTab`. Neither may re-derive counts by any other means.

## Implementation B — server

**File**: `server/src/services/vng-dashboard-service.ts`

```ts
export interface CityInitiativeCount {
  nameId: string | null;
  name: string;
  provinceName: string | null;
  population: number | null;
  initiativeCount: number;
}

export function countCityInitiatives(dataset: GraphDataset): CityInitiativeCount[];
```

- Same rule, same node/edge traversal, keyed by node id internally and returned with `nameId` for the registry join.
- Exported (not module-private) so it is directly unit-testable, matching `countSpaceGemeentes`.

**Consumer**: `assembleCityPopulation` only.

---

## Conformance tests (both required)

Both tests build the **same fixture dataset** and assert the **same expected counts**. Keep the fixture inline and identical in both files, with a comment pointing at this contract.

**Fixture** — minimal but covering every branch:

| Node | Type | Notes |
|---|---|---|
| `org-groningen` | `ORGANIZATION`, `isGemeente: true`, `population: 238147`, `provinceName: 'Groningen'` | participates in 2 |
| `org-brugge` | `ORGANIZATION`, `isGemeente: true`, `population: null`, `provinceName: null` | Belgian — unknown population, participates in 1 |
| `org-utrecht` | `ORGANIZATION`, `isGemeente: true`, `population: 367984` | isolated — participates in 0 |
| `org-acme` | `ORGANIZATION`, `isGemeente: false` | must never produce a row |
| `space-a` | `SPACE_L0` | Groei initiative |
| `space-b` | `SPACE_L0` | Groei initiative |
| `sub-a1` | `SPACE_L1` | must NOT count as an initiative |
| `gd-1` | `INITIATIVE` | GD callout |
| `user-1` | `USER` | must never count |

**Edges**: `space-a → org-groningen`; `org-groningen → space-b` (reverse direction); a **second** `space-a → org-groningen` edge of a different type (de-duplication); `sub-a1 → org-groningen` (sub-space, ignored); `gd-1 → org-brugge`; `user-1 → org-groningen` (non-initiative, ignored).

**Assertions** (identical on both sides):

| Assertion | Expected |
|---|---|
| Number of city rows | 3 (`groningen`, `brugge`, `utrecht`) — `org-acme` excluded |
| `groningen.initiativeCount` | **2** (`space-a`, `space-b`; duplicate edge, sub-space and user edges excluded) |
| `brugge.initiativeCount` | **1** (`gd-1`) |
| `utrecht.initiativeCount` | **0** |
| `groningen.population` | `238147` |
| `brugge.population` | `null` (not `0`) |
| No duplicate row ids | true |
| Rows sorted by name | `Brugge, Groningen, Utrecht` |

Frontend-only additional assertions: `groeiCount + gdCount === initiativeCount` for every row; classification union de-duplicated and sorted; `buildCityRows(null) === []`.

**Test files**:
- `server/src/services/vng-cities.test.ts`
- `frontend/vng/src/dashboard/cities.test.ts`

Run in the devcontainer (`pnpm -C server test`, `pnpm -C frontend/vng test`) — this macOS host cannot run Vitest.
