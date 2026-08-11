# Contract: Usage aggregation (NORMATIVE)

**Feature**: 019-usage-explorer | **Status**: Design

This document is the authority for marker geometry and area ranking. `frontend/shared/src/dashboard/utils/usage.ts` implements it; `frontend/vng/src/dashboard/usage.test.ts` pins it. If a rule changes here, both change with it.

It deliberately mirrors the structure of `specs/018-city-analysis/contracts/city-aggregation.md`, which pins the initiative-count rule this document **consumes but never re-derives**.

---

## 0. Inherited rule — initiative counts

A gemeente's initiative count is **whatever `buildCityRows(dataset)` returns** (`CityRow.initiativeCount`), per feature 018's contract. The Usage Explorer:

- MUST join to `CityRow` by `nameId`;
- MUST treat a gemeente with no matching row as count **0**;
- MUST NOT count edges, callouts, or spaces itself.

This is what makes FR-029 (agreement with the Cities view) structural rather than a coincidence to be re-verified.

## 1. Eligible gemeentes

Exactly the registry entries with **both** a non-null `alkemioNameId` and a non-null `cbsCode` — 342 today. Entries lacking either (Brugge, Gent) are excluded from the map, the visible set, every count, and the denominator (FR-005c).

A gemeente whose location set entry has null coordinates is **eligible but unplaced**: excluded from map and ranking, and included in the disclosed unplaced total (FR-030).

## 2. Marker shape

```
initiativeCount > 0  → dot    (circle)
initiativeCount = 0  → square (grey)
```

The square MUST be distinguishable from the smallest dot by **both** shape and colour, and its edge MUST NOT exceed `MIN_DIAMETER` (FR-009).

## 3. Marker size — the 3× rule

```
MIN_DIAMETER   design token (smallest participating dot)
MAX_DIAMETER = MIN_DIAMETER × 3                                    (FR-008)

maxCount = max(initiativeCount) across ALL eligible gemeentes
           in the current selection — NOT only the visible ones

diameter(count):
  count = 0            → grey square (rule 2)
  maxCount ≤ 1         → MIN_DIAMETER                              (FR-008b)
  otherwise            → MIN_DIAMETER
                       + (count − 1) / (maxCount − 1)
                       × (MAX_DIAMETER − MIN_DIAMETER)             (FR-007, FR-008a)
```

Invariants any implementation must hold:

| Invariant | Consequence if broken |
|-----------|----------------------|
| `diameter(1) = MIN_DIAMETER` always | The smallest dot stops meaning "one initiative" and the legend lies |
| `diameter(maxCount) = MAX_DIAMETER` when `maxCount > 1` | The 3× ratio (SC-003) fails |
| `maxCount` spans the selection, not the viewport | Dots resize as you zoom; the map becomes unreadable and the legend invalid |
| No `diameter` outside `[MIN, MAX]` | FR-008's "no participating dot may fall outside that range" fails |

**Diameter, not area** (A-004) — the 3× is measured on the rendered diameter, and markers hold a constant on-screen size at every zoom (FR-015), so the ratio is verifiable with a pixel measurement at any zoom.

## 4. Visible set

A gemeente is visible when its **anchor point** — the projected `(x, y)` of its coordinates — lies within the inverted viewport box:

```
t        = d3.zoomTransform(svgNode)
[x0, y0] = t.invert([0, 0])
[x1, y1] = t.invert([width, height])
visible(m) = m.x ≥ x0 && m.x ≤ x1 && m.y ≥ y0 && m.y ≤ y1
```

Anchor-point containment, **not** marker-bounds intersection: a marker half off the edge is either in or out by its centre, so counts don't flicker as a large dot straddles the boundary. This is the testable reading of FR-016.

Derived totals:

```
total         = |visible|                                          → the denominator (FR-019b)
participating = |{ m ∈ visible : m.initiativeCount > 0 }|          (FR-017)
```

## 5. Area ranking

```
byInitiative : Map<initiativeId, Set<nameId>>

for each visible marker m:
  for each initiative i in m.cityRow.initiatives:
    byInitiative[i.id].add(m.nameId)

entry.cityCount = byInitiative[i.id].size
```

A **`Set` of gemeente nameIDs**, not a counter — this makes FR-028 ("counted at most once regardless of how many times it appears") structurally true rather than dependent on upstream de-duplication.

**Ordering** (FR-020):

```
sort by cityCount DESC, then name.localeCompare(other.name) ASC
```

Both keys are required. Count alone leaves ties in map-iteration order, which is stable within a render but not guaranteed across them — US2 scenario 4 exists to catch exactly that.

**Presentation** (FR-019, FR-019a/b): each entry reads as its name, its `cityCount`, and the shared `total` — "5 of 12 in view". The denominator is `total`, including gemeentes participating in nothing, so low adoption across a well-covered area stays visible. Every entry in a given render shows the same denominator.

## 6. Focus

Focusing a gemeente:

- MUST NOT change the visible set, the counts, the ordering, or any diameter;
- adds its own `CityInitiativeRef[]`, listed separately (FR-025);
- sets `usedByFocused` on ranking entries the focused gemeente also uses (FR-026);
- is cleared silently if the gemeente leaves the data after a selection change.

Focus is a presentation overlay. Any implementation where focusing changes a number is wrong.

## 7. Worked example

Selection with `maxCount = 9`. Viewport holds 12 gemeentes: 8 participating, 4 with none.

| Gemeente | Count | Marker |
|----------|-------|--------|
| A | 9 | dot, `MAX_DIAMETER` (= 3 × MIN) |
| B | 5 | dot, `MIN + (4/8) × (MAX − MIN)` = half way (US1 scenario 7) |
| C | 1 | dot, `MIN_DIAMETER` |
| D–H | 1–4 | dots between MIN and half way |
| I–L | 0 | grey squares |

Initiative "Zaakgericht werken" used by A, B, C, and one non-visible gemeente:

```
Zaakgericht werken — 3 of 12 in view
```

Three, not four: the non-visible participant is outside the viewport. Twelve, not eight: the denominator counts the four zero-initiative gemeentes too.

## 8. Test obligations

`frontend/vng/src/dashboard/usage.test.ts` MUST cover:

1. `diameter(1) = MIN` and `diameter(maxCount) = 3 × MIN` for several `maxCount` values;
2. `maxCount = 1` → every participating dot at `MIN` (FR-008b);
3. zero-count gemeente → square, never a dot;
4. `maxCount` unchanged by viewport changes (the anti-rescale invariant);
5. a gemeente appearing twice in the underlying data counted once (FR-028);
6. tie-break ordering stable across repeated runs (FR-020);
7. denominator includes zero-initiative gemeentes (FR-019b);
8. an ineligible entry (no CBS code) absent from markers, counts, and denominator (FR-005c);
9. an unplaced gemeente excluded from ranking but present in the disclosed total (FR-030);
10. counts agreeing with `buildCityRows` for the same fixture (FR-029) — the mirror of feature 018's conformance test.
