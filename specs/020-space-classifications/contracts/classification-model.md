# Contract: Reading Classifications from Alkemio

**Feature**: 020-space-classifications | **Consumer**: `server/src/transform/classifications.ts`

This is the BFF's read contract against the Alkemio platform. It is a *read-only* contract: this application never creates, updates, or deletes a classification (spec Out of Scope).

## 1. The selection

Added to `server/src/graphql/fragments/spaceAboutFragment.graphql` and to `server/src/graphql/queries/spaceClassifications.graphql` (renamed from `spaceProfileTags.graphql`):

```graphql
classifications {
  id
  displayLabel
  cardinality
  display
  sortOrder
  values {
    id
    label
  }
  selectedValues {
    id
    label
  }
}
```

Verified live on 2026-09-01 against `https://alkem.io/api/public/graphql`:

```
query { lookupByName { space(NAMEID:"gemeentedelers") { about { classifications { ... } } } } }
→ { "classifications": [] }
```

i.e. the document is valid today and the empty case is the case that occurs today.

`selectedValueIDs` is intentionally omitted — `selectedValues { id }` carries the same information, and selecting both creates two lists that can disagree.

## 2. Guarantees this contract relies on

Taken verbatim from the schema's own field documentation:

| Guarantee | Source | Relied on by |
|---|---|---|
| `classifications` is *"in sortOrder. Empty array when none exist — never null, never an error."* | `SpaceAbout.classifications` | The empty-state path (FR-018). No null check needed, but one is written anyway — see §4. |
| `ClassificationValue.id` is *"Stable identifier — aggregation key. Copied verbatim into every snapshot; never re-derived on rename."* | `ClassificationValue.id` | Cross-space aggregation and rename-stability (FR-005, R-001). |
| `values` is *"The snapshot vocabulary, in authored order. Never re-sorted."* | `ClassificationEntry.values` | Category display order and the phase pipeline order (FR-007, R-003, R-005). |
| `display` is *"Render-only… NOT an access control."* | `ClassificationEntry.display` | Why `display: false` hides but never excludes from counting (FR-023, invariant I-7). |
| `displayLabel` *"defaults to the source template's, overridable to resolve a conflict."* | `ClassificationEntry.displayLabel` | Why designation needs a duplicate-label tie-break (R-002). |

## 3. Designation resolution

```
resolveDesignated(entries, designation) → ClassificationEntry | null
```

1. If `designation` is empty → `null` (panel renders empty).
2. Normalise both sides: trim, collapse internal whitespace, lowercase.
3. Filter `entries` to those whose normalised `displayLabel` equals the normalised designation.
4. Zero matches → `null`. One match → it. More than one → the lowest `sortOrder`.

Resolution is per space: two spaces may hold different instances of the same designated group, which is expected and is exactly why the vocabulary is unioned (R-003).

## 4. Degradation matrix

Every row resolves without raising. This table **is** the test matrix for FR-018 / invariant I-9.

| Input condition | Vocabulary contribution | Selection | Space counted as |
|---|---|---|---|
| `classifications` absent from the payload (older cache, partial read) | none | `[]` | unclassified → `uncategorised` |
| `classifications: []` | none | `[]` | unclassified → `uncategorised` |
| Designated group not present on this space | none | `[]` | classified, but `uncategorised` in this dimension |
| Group present, `values: []` | none | `[]` | classified, `uncategorised` |
| Group present, `values` non-empty, `selectedValues: []` | full vocabulary | `[]` | classified, `uncategorised` |
| Group present, selected id **not** in `values` | full vocabulary | that id dropped | `uncategorised` if nothing else selected |
| Two groups share the designated `displayLabel` | lowest `sortOrder` entry only | that entry's | normally |
| `SINGLE_SELECT` group with >1 selected value (platform anomaly) | full vocabulary | all of them, each counted once | in each — never silently truncated |
| Selected value with an empty `label` | value included, keyed by id | normally | normally; the client renders the id-keyed bucket with a blank label rather than dropping the bar |
| The whole About read fails / user lacks read access | none | `[]` | unclassified → `uncategorised`; the space is **never** dropped from the count |

The final row is the spec's edge case *"a Space is classified but the viewing user lacks permission to read some part of its About data"* — degrade, never drop, because dropping would break invariant I-5 (counts must sum to the number of counted entities).

## 5. What this contract does **not** cover

- `Callout.classification` (the older tagset-based holder) — the GD layer resolves from callout framing tags by label instead (R-006).
- `TemplatesSet.classificationTemplates` — the templates are not read; per-space snapshots are the truth (R-003).
- Any mutation (`createClassificationEntry`, `updateClassificationEntrySelection`, …) — out of scope.
