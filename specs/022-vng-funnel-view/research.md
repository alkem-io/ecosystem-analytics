# Phase 0 Research: VNG Innovation Funnel View

**Feature**: 022-vng-funnel-view | **Date**: 2026-09-05

All items below were open in Technical Context or arose from reading the existing code. Each is
resolved; none remain marked NEEDS CLARIFICATION.

---

## R-001 — Funnel orientation, and the "width" collision in the spec

**Decision**: The funnel runs **left → right**. Stages are vertical bands. The dimension that narrows
is the **aperture** — the vertical distance between the upper and lower curve at a given x. The
horizontal extent of a stage is its **length**.

**Rationale**: The spec uses "width" for two different things. FR-004 says "stage widths MUST decrease
monotonically … so the funnel shape is legible", while FR-016d says "a stage's vertical extent for
placement purposes MUST be the distance between the upper and lower curve". Those are only consistent
if FR-004's "width" means the aperture. The whiteboard reference is drawn left→right with the two
curves converging rightward, which settles it. **Canonical terms for all downstream artefacts and
code: `aperture` (narrows, FR-004) and `length` (horizontal, unconstrained).** FR-004 is read as
constraining aperture; this is recorded here rather than by editing the spec, since the spec's intent
is unambiguous once the whiteboard is taken as the reference.

**Alternatives considered**: Top→bottom (a classic marketing funnel). Rejected — the reference image
is horizontal, a horizontal funnel gives the crowded mouth far more usable area in a landscape
viewport, and vertical would fight FR-006 (whole funnel visible without scrolling) on short windows.

---

## R-002 — Stage length allocation

**Decision**: Stage lengths are a **fixed design ratio**, not data-derived: the GemeenteDelers mouth
gets ~28% of the funnel's horizontal extent, and the five phase stages split the remaining ~72%
evenly (~14.4% each). The ratio is a constant in `funnel.ts`, not a function of counts.

**Rationale**: FR-012b forbids stretching the geometry *to make room* for data — i.e. it forbids the
layout reacting to counts. A designer's fixed choice to give the mouth more length is not that: it is
part of the funnel's shape, stable across every selection and every toggle state, and it does not vary
when initiatives are added. Giving the mouth more length is what keeps the global scale (R-003) large
enough for the phase-stage dots to stay legible, since the mouth is what binds the scale.

**Alternatives considered**: (a) Equal lengths for all six stages — simplest, but wastes area on
stages holding ~4 dots while squeezing the one holding 305, forcing a smaller global scale and hurting
SC-010. (b) Length proportional to live counts — genuinely violates FR-012b and makes the funnel's
shape jump when the GD toggle flips.

---

## R-003 — Dot area model and the global scale fit

**Decision**: Dot **area** is affine in the log of participation, so radius is

```
r(g) = s · sqrt(1 + ln(1 + g))        g = participating gemeente count, g ≥ 0
```

with a **single scale factor `s` shared by the entire funnel** (FR-012a). `s` is fitted in closed form
against the binding stage:

```
for each stage k:  s_k = sqrt( ρ · area(k) / ( π · Σ_{i∈k} (1 + ln(1 + g_i)) ) )
s = clamp( min_k s_k , s_min , s_max )
```

where `area(k)` is the stage's area under the curves (numerically integrated aperture × length), and
`ρ = 0.60` is a conservative packing efficiency for relaxed random packing of unequal disks.
`s_min = 5px` (SC-010's legibility floor), `s_max ≈ 14px` (so a sparse, GD-off funnel does not turn
into a handful of balloons).

**Rationale**: Area-proportional encoding is the correct perceptual choice for a magnitude shown as a
disk; encoding magnitude on the radius would exaggerate large values quadratically. The `1 +` inside
the log gives a finite, positive area at `g = 0`, satisfying FR-013 without a special case. Solving
for `s` directly rather than binary-searching the relaxation keeps the layout O(n) and deterministic
in its sizing even though its positions are not (A-012).

**Feasibility, computed at the working scale (A-011)**: content area ≈ 1200 × 620 px; mouth length
≈ 336 px, mouth aperture ≈ 530 px average → mouth area ≈ 178,000 px²; usable at ρ = 0.60 ≈ 107,000 px².
With 305 GD initiatives at a mean `1 + ln(1+g) ≈ 2.2`, `s ≈ 7.1 px`. That yields **r ≈ 7 px for a
0-gemeente initiative and r ≈ 16 px for a 50-gemeente one** — both comfortably above the hover target
floor, so SC-010 holds with margin and the `s_min` clamp is not reached.

**Supported ceiling**: `s` scales as `1/√N`, so the 5 px floor binds at roughly **600 dots in the
mouth** at this viewport — about 2× the current corpus. Beyond that the funnel would need either a
longer mouth or the overlap concession the clarification rejected. Recorded so the limit is known
rather than discovered.

**Alternatives considered**: (a) Radius linear in `ln(1+g)` — over-weights large initiatives visually.
(b) Per-stage scale — explicitly forbidden by FR-012a. (c) Binary-searching `s` by running the
relaxation to convergence at each candidate — correct but 10–20× the work for no better answer.

---

## R-004 — Contained collision relaxation

**Decision**: `d3-force` with `forceCollide(r + padding)` plus a **custom containment force**, seeded
deterministically and **run synchronously to rest** (fixed tick budget, no animation loop), recomputed
only when the data or the viewport changes.

The containment force, applied after each tick per node:

```
x ← clamp(x, stage.x0 + r, stage.x1 − r)
y ← clamp(y, upper(x) + r, lower(x) − r)
```

`upper(x)` and `lower(x)` are evaluated at the node's **own x**, so containment follows the actual
curvature (FR-016c) rather than a bounding rectangle. Seeding uses a deterministic spread across the
stage band (not `Math.random`), so a given dataset lands in the same neighbourhood every time even
though `forceCollide`'s coincident-node jiggle keeps exact positions unguaranteed.

**Rationale**: This is the clarified answer (organic scatter settled by simulation) implemented with a
library already in `@ea/shared`. Running synchronously satisfies FR-016b ("settles, then stops — no
perpetual motion") by construction: there is no rAF loop to leak, nothing animates in the resting
state, and there is no way for the funnel to be observed mid-settle. ~330 nodes with a collide force
is trivial next to the thousands `ForceGraph` already simulates, so SC-009's 2 s budget is met with a
very large margin.

**Alternatives considered**: (a) Animated settling over rAF — prettier on first paint, but adds a
lifecycle to manage, risks perpetual low-amplitude motion against FR-016b, and makes any screenshot
non-reproducible even at the frame level. (b) `forceX`/`forceY` toward stage centre plus a boundary
box — the rectangle is exactly what the author's mid-session constraint ruled out. (c) A deterministic
circle-pack (the option not chosen in clarification) — kept out.

---

## R-005 — Where each field the funnel needs actually comes from

**Decision**: Dots are derived **client-side from the cached `GraphDataset`**, reusing the Initiatives
table's existing derivation. The stage list comes from `phaseDistribution` in the dashboard payload.
Exactly **one** server-side addition is required: `GraphNode.phase`.

Audit of what the funnel needs, against what exists today:

| Need | Source today | Gap |
|---|---|---|
| Initiative identity, name | `GraphNode` (`SPACE_L0`, `INITIATIVE`) | none |
| Source (Groei / GD) | node type: `SPACE_L0` vs `INITIATIVE` | none |
| Participating gemeente count | edges to `ORGANIZATION` nodes with `isGemeente` | none |
| NDS / VNG-2030 / themes / SDG / awards | `ndsCategories`, `vng2030Categories`, `vngThemes`, `globalGoals`, `initiativeClassifications` | none |
| Full authored classifications | `node.classifications` (SPACE only) | none |
| **Growth phase per initiative** | — | **the one gap** |
| Stage list, order, labels, empty stages | `phaseDistribution.phases[]` (`key`, `label`, `nr`) | none |
| Vocabulary drift notice | `vocabularyDrift` | none |

**Rationale for client-side dots**: A-006 defines participation as "the same count the Initiatives
view already shows", and that view uses the **edge rule** — distinct gemeente `ORGANIZATION` neighbours
of the initiative node. The server has *two* different gemeente-count rules: `countCityInitiatives`
uses the edge rule, while `assembleGemeenteDistribution`'s GD side deliberately uses
description-text matching against the registry (it counts gemeentes named in prose even where no
organisation node exists). Computing the funnel server-side would mean picking one of those and
risking silent disagreement with the Initiatives table; deriving from the same dataset with the same
rule makes FR-017 and SC-002 true **by construction**.

**Rationale for the `node.phase` addition**: the alternative is joining `phaseDistribution.phases[].items`
(a list of display *names*) back to nodes by name — fragile against duplicate and renamed display
names, and a category error besides. Resolving the phase in `graph-service.ts`'s existing enrichment
loop is ~10 lines, sits directly beside the identical `ndsCategories` / `vng2030Categories`
resolution, uses the same per-app `designations` object, requires no extra Alkemio fetch, and runs
post-cache so cached spaces are enriched on read. It also makes phase available to the Initiatives
table and graph filters, which currently cannot show it at all.

**Alternatives considered**: (a) A new `funnel` block on `VngDashboardResponse` — new types, new
service code, a new contract, duplicated gemeente-count logic, and a payload of ~330 records for data
the client already has. (b) Exposing the designated phase classification *label* to the client so it
can scan `node.classifications` itself — leaks a server config decision into the browser and forces
label-matching logic into two places.

---

## R-006 — Staying consistent with the phase chart (FR-023)

**Decision**: Both the funnel and the existing `PhaseDistributionChart` place a Groei initiative by
the **furthest-along** selected value in the designated phase vocabulary. `buildInitiativeRows` mirrors
the rule already implemented in `countGroeiPhases` (`server/src/services/groei-phases.ts`), and the
mirroring is pinned by a test on each side — the same discipline `utils/cities.ts` and
`countCityInitiatives` already use for the city rule.

**Rationale**: FR-023 requires the two views to agree, and they compute from different inputs (server
`selections` vs client `node.phase`). Both now flow from the *same* designation resolution in
`graph-service.ts`, so agreement follows from a shared upstream rather than from two implementations
happening to match. The multi-value rule ("furthest along wins") is already stated in `groei-phases.ts`
and matches the spec's edge case.

---

## R-007 — Testing strategy under A-012

**Decision**: The test surface is `funnel.ts`'s pure layout function, asserted on **structural
invariants**, never on coordinates. Playwright coverage targets the funnel **frame only** (stages,
bounding bars, labels, ramp) with the dot layer hidden or excluded.

Invariants under test (the full contract is in `contracts/funnel-layout.md`):

1. Dot count per stage equals that stage's count; total equals the input row count (FR-017).
2. Every dot's centre ± its radius lies inside the curved envelope at its own x (FR-016c).
3. Every dot lies within its stage's horizontal band (FR-016).
4. No two dots in a stage are fully occluded — centre distance ≥ |r₁ − r₂| (FR-016).
5. Equal `g` ⇒ equal radius, anywhere in the funnel (FR-012a).
6. Strictly larger `g` ⇒ strictly larger radius (FR-012, SC-006).
7. Apertures are non-increasing across stages (FR-004); ramp values are non-decreasing (FR-009).

**Rationale**: A-012 forbids pixel assertions precisely because the placement is simulation-settled.
Structural invariants are strictly stronger than a snapshot for everything the spec actually promises,
and they keep passing when the viewport or the corpus changes — which a snapshot would not.

**Alternatives considered**: Snapshotting the whole funnel with a seeded RNG — brittle (d3's jiggle is
not routed through an injectable RNG), and it would encode one arbitrary settle as the truth.
