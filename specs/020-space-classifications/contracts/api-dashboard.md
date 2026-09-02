# Contract: `POST /api/<app>/dashboard` response delta

**Feature**: 020-space-classifications | **App ids**: `vng`, `govtech`

Only the delta from today's contract is given. Request body, status codes, error shapes, auth, and every field not listed are unchanged.

## Request

Unchanged: `{ spaceIds: string[], includeGemeentes?: boolean, includeInitiatives?: boolean, includeGemeenteDelers?: boolean }`.

## Response deltas

### `dimensions[].categories[]` — `label` added, `key` re-meant

```diff
 {
-  "key": "cloud",
+  "key": "9f1c…-…-…",        // ClassificationValue.id, or the literal "uncategorised"
+  "label": "Cloud",           // ClassificationValue.label; null for "uncategorised"
   "count": 7,
   "items": ["…"],
   "spacesItems": ["…"],
   "gdItems": ["…"],
   "spacesCount": 6,
   "gdCount": 1
 }
```

`key` keeps its type and its position; its **meaning** changes from an operator-invented category key to the stable value id (R-001). `label` is server-authored and the client must render it as-is (FR-024). `label: null` marks the synthetic bucket the client localises as "Geen classificatie" / "No classification".

Ordering is unchanged in shape: `uncategorised` first, then the unioned vocabulary in authored order (R-003).

### `categoryMatrix` — axes become labelled

```diff
-  "ndsCategories": ["uncategorised", "cloud", "data"],
-  "vng2030Categories": ["uncategorised", "wonen-ruimte"],
+  "ndsCategories": [{ "key": "uncategorised", "label": null }, { "key": "9f1c…", "label": "Cloud" }],
+  "vng2030Categories": [{ "key": "uncategorised", "label": null }, { "key": "3ab7…", "label": "Wonen en Ruimte" }],
```

`cells[].nds` and `cells[].vng2030` remain plain keys matching the axis `key`s. `multiCategoryItems[].nds` / `.vng2030` likewise remain key arrays.

### `phaseDistribution.phases[]` — `label` added, `nr` re-meant

```diff
 {
-  "key": "formalisatie",
-  "nr": 2,
+  "key": "c41e…",            // ClassificationValue.id, or the literal "unknown"
+  "label": "Formalisatie",   // null for "unknown"
+  "nr": 3,                    // index in the vocabulary's authored order; null for "unknown"
   "count": 4,
   "items": ["…"]
 }
```

`nr` was the hard-coded `fase_nr` (−1…3); it becomes the authored-order index (R-005). Consumers must treat it as an ordering hint only, never as a fixed phase identity.

The panel is still omitted entirely (`phaseDistribution` absent) when no selected space carries a phase selection — unchanged behaviour, new source.

### `unclassifiedCount` — added

```diff
 {
   "gdIncluded": false,
   "totalCounted": 24,
   "uncategorisedCount": 5,
+  "unclassifiedCount": 3,
   "dimensions": [ … ]
 }
```

| Field | Answers |
|---|---|
| `unclassifiedCount` | "How many counted spaces carry **no classification data at all**?" — the rollout gap (FR-016). |
| `uncategorisedCount` | "How many counted entities matched **no category in any dimension**?" — unchanged. |

They overlap but are not the same: an unclassified space is always uncategorised; a classified space that selected nothing is uncategorised but **not** unclassified (invariant I-8). Both are reported so the client can distinguish "not yet classified" from "classified as nothing".

`unclassifiedCount` counts `source: 'spaces'` entities only — GD initiatives are tag-derived by design (FR-020) and would otherwise inflate the rollout gap with entities the programme will never classify.

## Client obligations

1. Render `label` verbatim; do **not** look up `categories.<dim>.<key>` in i18n any more (FR-024). The i18n `categories.nds.*`, `categories.vng2030.*` and `categories.phase.*` entries are retired.
2. Localise only `label: null` buckets, using the existing `dashboard.uncategorised` / `categories.phase.unknown` keys.
3. Show the FR-016 notice when `unclassifiedCount > 0`; show nothing when it is 0.
4. Treat `key` as opaque — never parse it, never display it.

## Unchanged endpoints

`GET /api/<app>/initiatives`, `GET /api/<app>/gemeente-locations`, and `POST /api/graph/generate` keep their contracts. `graph/generate`'s node payload gains the additive `classifications` field and changes the *content* of `ndsCategories` / `vng2030Categories` from keys to labels (see data-model.md §2).
