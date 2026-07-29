# Phase 1 Data Model: City-perspective analysis

**Feature**: 018-city-analysis | **Date**: 2026-07-29

No persisted schema changes. Every entity below is **derived at request time** from the existing `GraphDataset` and the committed static reference data. This document defines the derived shapes and the rules that produce them.

---

## 1. Source entities (existing — unchanged)

### `GraphNode` — gemeente organisation
`server/src/types/graph.ts`. A city is an `ORGANIZATION` node with `isGemeente === true`.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Node id — the stable key for a city row. |
| `nameId` | `string \| null` | Alkemio nameID, e.g. `gemeente-groningen`. Joins to the registry. |
| `displayName` | `string` | City name as shown. |
| `provinceCode` | `string \| null` | CBS statcode, e.g. `PV22`. `null` for the two Belgian entries. |
| `provinceName` | `string \| null` | e.g. `Drenthe`. |
| `population` | `number \| null` | CBS inhabitants. `null` ⇒ **unknown**, never treated as `0`. |
| `location` | `GraphLocation \| null` | lat/long for the map pin. |
| `avatarUrl` | `string \| null` | Municipal crest; falls back to initials. |

### `GraphNode` — initiative
`SPACE_L0` (a Groei initiative) or `INITIATIVE` (a GemeenteDelers callout). Relevant fields: `id`, `displayName`, `ndsCategories`, `vng2030Categories`, `vngThemes`, `globalGoals`, `initiativeClassifications`, `commonGround`, and (Groei only) `activityByPeriod` / `spaceActivityTier`.

### `MunicipalityInfo` — registry reference data
`server/src/services/vng-registry.ts`. `{ cbsCode, country: 'NL' | 'BE', provinceCode, provinceName, population }`, keyed by Alkemio nameID. Source of the **non-participating** municipalities, which have no graph node.

---

## 2. Derived entity: `CityRow` (frontend)

Produced by `buildCityRows(dataset)` in `frontend/shared/src/dashboard/utils/cities.ts`. One per gemeente `ORGANIZATION` node in the dataset. Consumed by `CitiesTab` and `CityDetailsTab`.

```ts
export interface CityInitiativeRef {
  id: string;
  name: string;
  /** 'groei' = SPACE_L0 (a selected space); 'gd' = INITIATIVE (a GemeenteDelers callout). */
  kind: 'groei' | 'gd';
  vng2030: string[];
  nds: string[];
  themes: string[];
}

export interface CityRow {
  /** Gemeente ORGANIZATION node id — the row key. */
  id: string;
  nameId: string | null;
  name: string;
  provinceName: string | null;
  /** null means UNKNOWN. Never coerce to 0. */
  population: number | null;
  /** Initiatives this city participates in, sorted by name. */
  initiatives: CityInitiativeRef[];
  /** Convenience: initiatives.length — the number every view must agree on. */
  initiativeCount: number;
  /** Convenience split, for the "Groei / GD" column and filters. */
  groeiCount: number;
  gdCount: number;
  /** Union of the initiatives' classifications, de-duplicated and sorted. */
  vng2030: string[];
  nds: string[];
  themes: string[];
  /** The underlying node, for the map and avatar. */
  node: GraphNode;
}
```

**Derivation rules**

| Field | Rule |
|---|---|
| Row set | Every node with `type === 'ORGANIZATION' && isGemeente === true`. Exactly one row per node (FR-002). |
| `initiatives` | Every node with `type === 'SPACE_L0' \| 'INITIATIVE'` connected to this city node by **any** edge (`sourceId`/`targetId` in either direction), de-duplicated by node id. |
| `initiativeCount` | `initiatives.length`. **This is the number referenced by FR-028** and must equal the server's `participating[].initiativeCount` for the same city and selection. |
| `vng2030` / `nds` / `themes` | Union across `initiatives` of the respective arrays, de-duplicated, `localeCompare`-sorted (spec Assumptions: "a city is involved in a category if any of its initiatives carries it"). |
| `population` / `provinceName` | Copied verbatim from the node, `null` preserved. |
| Sort | Rows returned sorted by `name` (`localeCompare`); view-level sorting is applied on top. |

**Invariants**
- `groeiCount + gdCount === initiativeCount`.
- Summing `initiativeCount` over all rows equals summing "gemeente count" over all initiative rows in the Initiatives tab for the same dataset — the two tables are transposes of the same bipartite relation.
- When the GD toggle is off, the dataset contains no `INITIATIVE` nodes, so `gdCount === 0` for every row (FR-006).

---

## 3. Derived entity: `CityPopulationSeries` (server → API)

Produced by `assembleCityPopulation()` in `server/src/services/vng-dashboard-service.ts`; carried on `VngDashboardResponse.cityPopulation`. Consumed by `CityPopulationChart` and by the XLSX export.

```ts
/** One plotted municipality. */
export interface CityPopulationPoint {
  /** Gemeente organisation nameID — stable key across both series. */
  nameId: string;
  name: string;
  provinceName: string | null;
  /** Always a positive number here — unknown-population cities are excluded. */
  population: number;
  /** Distinct initiatives in the current selection. 0 for the non-participating series. */
  initiativeCount: number;
}

export interface CityPopulationSeries {
  /** True when GD initiatives were folded into the counts (the GD checkbox). */
  gdIncluded: boolean;
  /** Cities with >= 1 initiative in the current selection. */
  participating: CityPopulationPoint[];
  /** Dutch municipalities with 0 initiatives in the current selection (FR-021). */
  nonParticipating: CityPopulationPoint[];
  /** Municipalities omitted because population is unknown (FR-023) — must be surfaced. */
  excludedUnknownPopulation: number;
}
```

**Derivation rules**

1. `dataset = generateGraph(userId, auth, { spaceIds, includeInitiatives: includeGd })`.
2. `counts = countCityInitiatives(dataset)` — the server twin of `buildCityRows`, applying the identical edge rule, returning `Map<nameId, { name, provinceName, population, initiativeCount }>`.
3. For every municipality in `registry.municipalities()`:
   - `population == null` → increment `excludedUnknownPopulation`, emit nothing. (Covers the Belgian entries and any future gap.)
   - present in `counts` with `initiativeCount > 0` → push to `participating`.
   - otherwise → push to `nonParticipating` with `initiativeCount: 0`.
4. A gemeente node present in the graph but absent from the registry (should not occur) is still emitted into `participating` using the node's own `population`/`provinceName`, so no participating city is silently dropped.
5. Both arrays sorted by `population` descending, then `name`.

**Invariants**
- `participating` and `nonParticipating` are disjoint by `nameId`.
- `participating.length + nonParticipating.length + excludedUnknownPopulation === registry.municipalities().length` (plus any graph-only extras from rule 4).
- For every `nameId` in both, `participating[].initiativeCount === CityRow.initiativeCount` for the same selection (FR-028).
- `gdIncluded === false` ⇒ no `INITIATIVE` node contributed to any count.

---

## 4. Registry addition

`VngRegistry` gains one accessor (`server/src/services/vng-registry.ts`):

```ts
/** Every known gemeente with its Alkemio nameID, display title, and NL geo facts. */
municipalities(): { nameId: string; title: string; info: MunicipalityInfo }[];
```

Built from the already-loaded `municipalities.json` + `municipality-facts.json` join at load time (the loader already produces `infoByNameId`; this exposes it with the title attached). Entries without an `alkemioNameId` are skipped, matching the existing `gemeenteNameIds()` behaviour. Read-only, cached with the rest of the registry.

**Why needed**: `municipalityInfoByNameId()` returns facts but not the display name, and `gemeenteNameIds()` returns ids only — the chart needs `{ nameId, title, population, province }` together for cities that have no graph node to read a `displayName` from.

---

## 5. Entity relationships

```text
                    ┌──────────────────────────┐
                    │  GraphDataset (cached)    │
                    │  nodes + edges            │
                    └────┬─────────────────┬────┘
                         │                 │
        buildCityRows()  │                 │  countCityInitiatives()
        (frontend, pure) │                 │  (server, pure)
                         ▼                 ▼
                    ┌─────────┐      ┌──────────────┐        ┌──────────────────┐
                    │ CityRow │      │ per-city     │◀──join──│ VngRegistry      │
                    │  [ ]    │      │ counts       │        │ .municipalities()│
                    └────┬────┘      └──────┬───────┘        └──────────────────┘
                         │                  │
             ┌───────────┴────────┐         ▼
             ▼                    ▼   ┌──────────────────────┐
      ┌────────────┐     ┌─────────────┐  │ CityPopulationSeries │
      │ CitiesTab  │     │CityDetailsTab│ └──────────┬───────────┘
      │ (table)    │     │ (profile+map)│            │
      └────────────┘     └─────────────┘   ┌─────────┴──────────┐
                                            ▼                    ▼
                                   ┌──────────────────┐  ┌──────────────┐
                                   │CityPopulationChart│  │ XLSX export  │
                                   └──────────────────┘  └──────────────┘
```

The dashed guarantee across the diagram: **both pure functions implement the one rule in [contracts/city-aggregation.md](./contracts/city-aggregation.md)**, verified by mirrored fixture tests.

---

## 6. Validation rules (from the spec)

| Rule | Source | Enforcement point |
|---|---|---|
| Each city appears exactly once | FR-002 | `buildCityRows` keys by node id; test asserts no duplicate ids. |
| Unknown population is explicit, never `0` | FR-005 | `population: number \| null` in `CityRow`; chart excludes `null` rather than plotting zero. |
| GD toggle controls participation counts | FR-006 | `includeInitiatives` on the graph request; no `INITIATIVE` nodes ⇒ no GD contribution. |
| Excluded-city count must be surfaced | FR-023 | `excludedUnknownPopulation` is a required (non-optional) field on the series. |
| Counts identical across all views | FR-028 | One rule, two implementations, mirrored fixture tests. |
