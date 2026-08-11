# Data Model: Usage Explorer

**Feature**: 019-usage-explorer | **Date**: 2026-08-08

Two data sources meet in this feature and never mix responsibilities:

- **Positions** come from the cached gemeente location set — selection-independent, server-fetched, long-TTL.
- **Counts** come from `buildCityRows(dataset)` — the normative rule from feature 018, unchanged and never recomputed here.

Everything else is derived in the browser from those two, per viewport.

---

## Server-side

### `GemeenteLocation`

One Dutch gemeente's position as held in Alkemio. Selection-independent.

| Field | Type | Notes |
|-------|------|-------|
| `nameId` | `string` | Alkemio organisation nameID, e.g. `gemeente-groningen`. The join key everywhere. |
| `title` | `string` | Canonical gemeente name from the registry, **not** the Alkemio display name — keeps labels stable across views. |
| `cbsCode` | `string` | Official municipality code, e.g. `GM0014`. Non-null by construction: only registry entries with a code are included (FR-005c). |
| `latitude` | `number \| null` | `null` when Alkemio holds no geo-location. |
| `longitude` | `number \| null` | Same. |
| `provinceCode` | `string` | `PV20`–`PV31`, from `municipality-facts.json`. |
| `provinceName` | `string` | Display name. |

**Validation rules**

- Exactly the **342** registry entries with a non-null `alkemioNameId` **and** `cbsCode` are eligible (FR-005, FR-005c). Brugge and Gent have neither and are never emitted.
- An entry with `latitude` or `longitude` null is still emitted, so the client can count it as unplaced (FR-030) rather than silently losing it.
- `latitude`/`longitude` are not range-validated beyond being finite; a gemeente positioned outside the Netherlands is a data error to surface, not to silently drop.

### `GemeenteLocationSet`

The cached whole. Stored in `cache_entries` under `space_id = '__gemeente_geo__'`, keyed per user, TTL 168 h.

| Field | Type | Notes |
|-------|------|-------|
| `locations` | `GemeenteLocation[]` | All eligible gemeentes, sorted by `title`. |
| `fetchedAt` | `string` (ISO 8601) | When the Alkemio sweep ran. Drives the staleness note. |
| `expected` | `number` | 342 — the registry count, so the client can detect shortfall without hard-coding. |
| `withLocation` | `number` | How many carry usable coordinates. |
| `partial` | `boolean` | True when the sweep completed but did not reach every gemeente (see the API contract). |

---

## Client-side (derived, never persisted)

### `UsageMarker`

One gemeente on the map: position joined to count.

| Field | Type | Derivation |
|-------|------|------------|
| `nameId` | `string` | Join key from `GemeenteLocation`. |
| `name` | `string` | `GemeenteLocation.title`. |
| `provinceName` | `string` | From the location set. |
| `initiativeCount` | `number` | `CityRow.initiativeCount` for the matching `nameId`, else **0**. Never recomputed (FR-029). |
| `x`, `y` | `number` | Projected once from lon/lat via the shared NL Mercator projection; static thereafter (R5). |
| `shape` | `'dot' \| 'square'` | `initiativeCount > 0 ? 'dot' : 'square'` (FR-006). |
| `diameter` | `number` | From the size formula below (FR-007, FR-008, FR-008a/b). |
| `cityRow` | `CityRow \| null` | The underlying row, for the focus panel and the route into city details. `null` for a zero-initiative gemeente. |

**Marker size** — normative, mirrored in `contracts/usage-aggregation.md`:

```
MIN_DIAMETER          fixed design token
MAX_DIAMETER        = MIN_DIAMETER × 3                     (FR-008)
maxCount            = max(initiativeCount) over ALL gemeentes in the selection
                      (not just visible ones — the scale must not shift on zoom)

count = 0  → grey square, edge ≤ MIN_DIAMETER              (FR-009)
count ≥ 1, maxCount ≤ 1 → MIN_DIAMETER                     (FR-008b)
count ≥ 1, maxCount > 1 →
    MIN_DIAMETER + (count − 1) / (maxCount − 1) × (MAX_DIAMETER − MIN_DIAMETER)
```

Two properties this must preserve: the smallest dot always means *exactly one initiative* regardless of selection, and `maxCount` is computed over the whole selection so zooming never rescales the map.

### `VisibleArea`

The current viewport and what falls inside it.

| Field | Type | Derivation |
|-------|------|------------|
| `markers` | `UsageMarker[]` | Markers whose **anchor point** `(x, y)` lies within the inverted viewport box (R5, FR-016). |
| `total` | `number` | `markers.length` — the ranking denominator (FR-019b). |
| `participating` | `number` | `markers.filter(m => m.initiativeCount > 0).length` (FR-017). |
| `unplaced` | `number` | Gemeentes excluded for want of coordinates (FR-030). Constant across viewports; displayed once. |

### `AreaInitiativeRanking`

The list under the map.

| Field | Type | Derivation |
|-------|------|------------|
| `entries` | `AreaInitiativeEntry[]` | See below. |
| `denominator` | `number` | `VisibleArea.total` — identical for every entry (FR-019b). |

`AreaInitiativeEntry`:

| Field | Type | Derivation |
|-------|------|------------|
| `id` | `string` | Initiative id — the route into initiative details (FR-023). |
| `name` | `string` | Display name; falls back to a placeholder if absent (FR-031). |
| `kind` | `'groei' \| 'gd'` | Carried through from `CityInitiativeRef`. |
| `cityCount` | `number` | Distinct visible gemeentes participating. **Distinct** is what FR-028 pins. |
| `usedByFocused` | `boolean` | True when the focused gemeente also uses it (FR-026). False when nothing is focused. |

**Construction**: for each visible marker, for each of its `cityRow.initiatives`, add the marker's `nameId` to a `Set` under that initiative id; `cityCount` is the set's size. Sets — not counters — are what make FR-028 structurally true rather than a thing to remember.

**Ordering**: `cityCount` descending, ties broken by `name.localeCompare` ascending (FR-020). Deterministic, so the list doesn't reshuffle between identical renders.

### `FocusedGemeente`

| Field | Type | Notes |
|-------|------|-------|
| `marker` | `UsageMarker` | The selected gemeente. |
| `initiatives` | `CityInitiativeRef[]` | Its own initiatives, listed separately (FR-025). Empty array renders the explicit "no initiatives" state (US4 scenario 3). |

**Lifecycle**: cleared when the gemeente is no longer present in the data after a selection change (edge case, US4 scenario 4 covers the manual clear). Focus does **not** alter the visible set or the ranking — it only adds a panel and flips `usedByFocused` for highlighting.

---

## Relationships

```
GemeenteLocationSet (server, cached, selection-independent)
   │  join on nameId
   ▼
CityRow[] ◄── buildCityRows(GraphDataset)     [feature 018, normative, NOT reimplemented]
   │
   ▼
UsageMarker[]  (all 342 — position + count + geometry)
   │  filter by viewport box
   ▼
VisibleArea ──► AreaInitiativeRanking
   │
   └──► FocusedGemeente (optional overlay, no effect on the above)
```

## State transitions

The tab holds three pieces of state, with deliberately narrow coupling:

| Trigger | Affects | Does not affect |
|---------|---------|-----------------|
| Selection or GD-toggle change | `CityRow[]` → counts, `maxCount`, marker sizes, ranking | Positions (cached separately), viewport, province choice |
| Zoom / pan | `VisibleArea`, ranking | Marker sizes (scale is selection-wide), positions, focus |
| Province selection | Viewport, hence `VisibleArea` and ranking | Basemap (always `netherlands`), marker sizes, focus |
| Focus / clear focus | `FocusedGemeente`, `usedByFocused` flags | Visible set, ranking order, counts |

The one that matters most: **zoom never changes marker size**, because `maxCount` spans the whole selection, not the viewport. A gemeente's dot means the same thing wherever the map is pointed.
