# Phase 1 Data Model: Dashboards read Space Classifications instead of tags

**Feature**: 020-space-classifications | **Date**: 2026-09-01

No persistence schema changes. Everything below is either read from Alkemio, derived in memory, or carried on the existing API payloads.

---

## 1. Read from Alkemio

### `ClassificationEntry` (as consumed)

One vocabulary group attached to a Space's About. Read via `SpaceAbout.classifications`, documented by the schema as *"in sortOrder. Empty array when none exist — never null, never an error."*

| Field | Type | Used for |
|---|---|---|
| `id` | UUID | Per-space instance id. **Not** used for aggregation or designation — it is not comparable across spaces. |
| `displayLabel` | String | The designation key (R-002) and the group heading in the details view (FR-022). |
| `cardinality` | `SINGLE_SELECT` \| `MULTI_SELECT` | Validation only — see invariant I-3. Counting does not branch on it. |
| `display` | Boolean | Honoured in user-facing presentation (FR-023). **Never** gates counting. |
| `sortOrder` | Int | Tie-break when two entries share a `displayLabel` (R-002); ordering of groups in the details view. |
| `values` | `ClassificationValue[]` | The vocabulary — the source of chart categories (FR-007/008). Authored order is display order. |
| `selectedValues` | `ClassificationValue[]` | What this space is classified as. |

`selectedValueIDs` is deliberately not selected — `selectedValues` already carries the ids (R-004).

### `ClassificationValue` (as consumed)

| Field | Type | Used for |
|---|---|---|
| `id` | UUID | **The aggregation key.** Every count, bucket, filter and matrix cell is keyed on this (R-001, FR-005). |
| `label` | String | Display only, server-supplied, single-language, never re-translated (FR-006/024). |

---

## 2. Derived in the server

### `Vocabulary`

The ordered value list of one designated classification, unioned across the selected spaces.

```
Vocabulary = { key: string; label: string }[]   // key = ClassificationValue.id
```

- Built per dimension per request (R-003): de-duplicated by `key`, ordered by first appearance walking spaces in selection order and each space's `values` in authored order.
- The synthetic `uncategorised` entry is prepended when the dimension is rendered; it is not part of the vocabulary itself.

### `Selection`

What one space is classified as, in one dimension.

```
Selection = string[]   // ClassificationValue.id[], possibly empty
```

- Derived as `selectedValues.map(v => v.id)` **intersected with** `values.map(v => v.id)` — a selected id absent from its own snapshot is dropped (invariant I-4).
- Empty selection ⇒ the space lands in that dimension's `uncategorised` bucket.

### `DashboardCountable` (modified)

The entity fed into the counting core. Today it carries `{ id, label, tags, source }`.

| Field | Change | Notes |
|---|---|---|
| `id`, `label`, `source` | unchanged | `source` remains `'spaces' \| 'gd'`. |
| `tags` | retained | Used **only** by the GD layer's label resolution (R-006). Never read for a `source: 'spaces'` entity. |
| `selections` | **new** — `Record<string, string[]>` | Dimension key → selected value ids. Absent dimension = no selection. |
| `hasClassifications` | **new** — `boolean` | True when the space carried a non-empty `classifications` array. Drives `unclassifiedCount` (FR-016) and is distinct from "selected nothing" (FR-016's second half, and spec US4 scenario 3). |

### `GraphNode` (modified)

| Field | Change | Notes |
|---|---|---|
| `classifications` | **new** — `{ label: string; display: boolean; values: { id: string; label: string }[] }[]` | Every classification the space carries, in `sortOrder`. Feeds the details view (FR-022/023). |
| `ndsCategories`, `vng2030Categories` | **semantics change** | Were category *keys* derived from tags (`'cloud'`, `'ai'`). Become the selected value **labels** of the designated groups, for the Initiatives table's chips and filters. |
| `vngThemes`, `commonGround`, `initiativeClassifications`, `globalGoals`, `initiativeYear` | unchanged | Out of scope per spec A-006/A-007 and FR-020. |

---

## 3. Carried on the API

### `DashboardDimension.categories[]` (modified)

| Field | Change |
|---|---|
| `key` | unchanged shape, **new meaning**: a `ClassificationValue.id`, or the literal `'uncategorised'`. |
| `label` | **new** — the value's label from Alkemio; `null` for the `uncategorised` bucket, which the client localises. |
| `count`, `items`, `spacesItems`, `gdItems`, `spacesCount`, `gdCount` | unchanged. |

### `CategoryMatrix` (modified)

`ndsCategories` and `vng2030Categories` become `{ key, label }[]` instead of `string[]`, so the axes can be rendered without a client-side lookup. `cells[].nds` / `.vng2030` remain the value-id keys.

### `PhaseDistribution.phases[]` (modified)

| Field | Change |
|---|---|
| `key` | value id, or `'unknown'`. |
| `label` | **new** — from the vocabulary; `null` for `unknown`. |
| `nr` | **new meaning**: index in the vocabulary's authored order (R-005); `null` for `unknown`. |
| `count`, `items` | unchanged. |

### `VngDashboardResponse` (modified)

| Field | Change |
|---|---|
| `unclassifiedCount` | **new** — counted spaces whose `classifications` array was empty or unreadable (FR-016). |
| `uncategorisedCount` | unchanged meaning — matched no category in **any** dimension. A space can be in both counts; they answer different questions (FR-016). |
| everything else | unchanged. |

### `DashboardAppConfig` (modified)

`tagCategoryMapping` is **removed**. Replaced by:

```
classifications: { nds: string; vng2030: string; phase: string }   // displayLabel designations
```

An empty string means "no group designated for this panel" — the panel renders empty rather than disappearing (R-002). See [contracts/config-designation.md](./contracts/config-designation.md).

---

## 4. Invariants

Each maps to the requirement it pins, and each is directly testable.

| # | Invariant | Pins |
|---|---|---|
| **I-1** | For a `source: 'spaces'` entity, its placement in a classification-driven chart is a pure function of its `selections`. Its `tags` are never consulted. | FR-002, FR-014 |
| **I-2** | Renaming a value's label changes no count and moves no entity between categories. | FR-005 |
| **I-3** | A `SINGLE_SELECT` group yields at most one value id per space; a `MULTI_SELECT` group yields zero or more, each counted once. | FR-004 |
| **I-4** | A selected value id absent from its own snapshot vocabulary is dropped and contributes to no category. | FR-018, spec edge case |
| **I-5** | For every dimension: `Σ categories[].count` (excluding `uncategorised`) + `uncategorised.count` = number of counted entities, for every selection. | SC-004, FR-009 |
| **I-6** | Every value in the unioned vocabulary appears as a category, including at count 0. | FR-008 |
| **I-7** | `display: false` removes a group from presentation and from nothing else — its counts are unaffected. | FR-023 |
| **I-8** | `unclassifiedCount` counts spaces with no classification data; a space that carries classifications but selected nothing is **not** in it. | FR-016 |
| **I-9** | No absent, empty, or malformed classification data raises; every such case resolves to `uncategorised`. | FR-018, Constitution V |
| **I-10** | Free-text tag surfaces (Explorer tag chips, shared-tag chord, treemap/sunburst tooltips) are byte-identical before and after. | FR-003, spec Out of Scope |

---

## 5. State and lifecycle

There is no state machine here — classifications are read, never written by this application (spec Out of Scope). The only lifecycle concern is the **rollout transition**, which is data-driven and needs no code path of its own:

| Rollout stage | `hasClassifications` | Chart placement | `unclassifiedCount` |
|---|---|---|---|
| Space not yet reached by the programme | `false` | `uncategorised` in every dimension | counted |
| Space classified, nothing selected in this dimension | `true` | `uncategorised` in this dimension | not counted |
| Space classified and selected | `true` | its value's categories | not counted |

When the programme completes, the first row simply stops occurring; `unclassifiedCount` reaches 0 and the FR-016 notice disappears on its own, with no configuration switch and no code change (FR-017).
