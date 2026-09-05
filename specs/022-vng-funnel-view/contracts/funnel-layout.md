# Contract: `layoutFunnel()`

**Feature**: 022-vng-funnel-view | **Module**: `frontend/shared/src/dashboard/utils/funnel.ts`

The funnel exposes no HTTP endpoint. Its contract is this pure function: it is the boundary between
"what the data says" and "what is drawn", and it is the entire automated test surface (A-012 forbids
asserting drawn positions).

## Signature

```ts
layoutFunnel(input: {
  rows: InitiativeRow[];                 // every initiative in scope, from buildInitiativeRows()
  phases: PhaseDistribution['phases'];   // authored order; [] when no vocabulary
  width: number;                         // px, > 0
  height: number;                        // px, > 0
  gdIncluded: boolean;                   // the GD toggle
}): FunnelLayout
```

Pure: no DOM, no clock, no I/O, no module-level mutable state. Same input ⇒ same **structure** and
same **radii**; dot **coordinates** are settled by relaxation and are not guaranteed identical between
calls (A-012).

## Preconditions

- `width > 0 && height > 0`. A zero or negative extent returns an empty layout rather than throwing
  (React measures 0×0 on first paint).
- `rows` may be empty. `phases` may be empty.
- `rows` need not be sorted, and ids need not be unique across kinds.

## Postconditions — the invariants

These are normative. Each maps to a spec requirement and is a test in `funnel.test.ts`.

| # | Invariant | Requirement |
|---|---|---|
| **I-1** | `Σ stages[k].dots.length + (holding?.dots.length ?? 0) === rows.length`. No row is dropped, none is duplicated. | FR-017, SC-002 |
| **I-2** | For every dot in a stage or in the holding area: the dot's disc lies inside its container. In a stage that means `upper(x) + r ≤ y ≤ lower(x) − r`, evaluated at the dot's **own x** — not at the stage's edges, and not against a bounding rectangle. | FR-016c |
| **I-3** | For every dot in stage `k`: `stages[k].x0 + r ≤ x ≤ stages[k].x1 − r`. | FR-016 |
| **I-4** | No dot is fully occluded: for any two dots in the same container, `dist(c₁, c₂) ≥ |r₁ − r₂|`. | FR-016 |
| **I-5** | Radius is a pure function of `g` across the whole layout: `g₁ === g₂ ⇒ r₁ === r₂`, for any two dots anywhere, including one in a stage and one in the holding area. | FR-012a, FR-024b |
| **I-6** | Radius is strictly increasing in `g`: `g₁ > g₂ ⇒ r₁ > r₂`. And `g === 0 ⇒ r ≥ MIN_R` — a zero-participation initiative is still drawn legibly. | FR-012, FR-013, SC-006 |
| **I-7** | `aperture(x)` is non-increasing over `x ∈ [0, width]`; `stages[k].money` and `stages[k].effort` are non-decreasing in `k`. | FR-004, FR-009 |
| **I-8** | Every dot in `holding` lies outside both curves — no part of a holding-area disc intersects the funnel envelope. | FR-024a |
| **I-9** | `stages[0].kind === 'gd'` whenever a funnel is produced, regardless of `gdIncluded`; when `gdIncluded === false` it is present with `dots.length === 0`. | FR-022b |
| **I-10** | `holding === null` when no unphased Groei row exists; otherwise `holding.dots.length > 0`. The holding area is never drawn empty, unlike stages. | FR-024c, FR-003 |

## Degenerate inputs

| Input | Result |
|---|---|
| `phases: []` | `stages` contains the GD mouth only; the caller MUST render FR-025's empty state instead of drawing a one-stage funnel. Signalled by `stages.filter(s => s.kind === 'phase').length === 0`. |
| `rows: []` | Full frame, every stage drawn with `dots: []`, `holding: null`. FR-003 — the empty pipeline is the point. |
| A row whose `phase.key` matches no stage | Placed in `holding`, never dropped. I-1 outranks tidiness. |
| More dots than fit at `MIN_R` | `scale` clamps at `MIN_R`; I-4 is preserved, I-2 and I-3 are preserved, and dots may touch. Beyond the ceiling computed in R-003 (~600 in the mouth at 1200×620) the packing degrades visibly — a known limit, not a supported state. |

## Non-guarantees (stated so no test asserts them)

- Exact dot coordinates, between calls or between runs.
- Any particular dot ordering within `stage.dots`.
- Stability of a dot's position when an unrelated dot is added to the same stage — relaxation is
  global to the stage.
