# Phase 1 Data Model: VNG Innovation Funnel View

**Feature**: 022-vng-funnel-view | **Date**: 2026-09-05

The funnel introduces **no persisted entity and no schema change**. Everything below is either an
in-memory derived shape in `@ea/shared`, or one additive field on an existing server type. Canonical
geometry terms are R-001's: **aperture** (vertical, narrows) and **length** (horizontal).

---

## 1. `NodePhase` — new, `server/src/types/graph.ts`

The single server-side addition. Resolved in the existing post-cache enrichment loop in
`graph-service.ts`, alongside `ndsCategories` / `vng2030Categories`.

```ts
/**
 * The growth phase ("groeifase") a Groei initiative has reached, resolved from the
 * dashboard's designated phase classification (feature 020). Set on SPACE_L0/L1/L2
 * nodes only — GemeenteDelers INITIATIVE nodes are a completed programme and carry
 * no phase (spec A-005).
 */
export interface NodePhase {
  /** `ClassificationValue.id` — the stable key, comparable across spaces. */
  key: string;
  /** Label as authored in Alkemio; rendered verbatim (FR-007/FR-024 of feature 020). */
  label: string;
  /** Position in the vocabulary's AUTHORED order — an ordering hint, not an identity. */
  nr: number;
}
```

Added to `GraphNode`:

```ts
  /**
   * SPACE: the growth phase this initiative has reached. Absent when the space
   * selects no phase value, or when the dashboard designates no phase
   * classification. Absent on every INITIATIVE (GD) node.
   */
  phase?: NodePhase;
```

**Resolution rule** (mirrors `countGroeiPhases`, R-006): of the values the space selects in the
designated phase classification, the one with the **highest index in the vocabulary's authored order**
wins — "furthest along". No selection ⇒ field absent.

**Cache behaviour**: written by post-cache enrichment, exactly as `ndsCategories` is. Cached rows
retain `classificationEntries` and are enriched on read, so **no cache-version bump is needed** and
no existing cache entry becomes stale.

---

## 2. `InitiativeRow` — extracted + extended, `dashboard/utils/initiatives.ts`

Lifted verbatim from the derivation currently inline in `InitiativesTab.tsx`, plus `phase`. The
Initiatives table then consumes the extracted builder, so the two views cannot drift.

```ts
export interface InitiativeRow {
  id: string;
  name: string;
  kind: 'groei' | 'gd';
  /** Distinct gemeente ORGANIZATION neighbours — THE edge rule (A-006, R-005). */
  gemeentes: string[];
  provinces: string[];
  members: number | null;      // null for GD — no membership
  leads: number | null;
  themes: string[];
  nds: string[];
  vng2030: string[];
  sdg: string[];
  awards: string[];
  commonGround: boolean;
  activity: { day: number; week: number; month: number; total: number } | null;
  tier: ActivityTier | null;
  /** NEW — from GraphNode.phase. Always null for kind === 'gd'. */
  phase: NodePhase | null;
  /** NEW — authored classification groups, for the hover card (FR-018). */
  classifications: { id: string; label: string; values: { id: string; label: string }[] }[];
}

export function buildInitiativeRows(dataset: GraphDataset): InitiativeRow[];
```

**Invariant**: one row per `SPACE_L0` node and one per `INITIATIVE` node in the dataset. This is what
makes FR-017 and SC-002 hold by construction — the funnel's dot set *is* the Initiatives table's row
set.

---

## 3. `FunnelStage` — derived, `dashboard/utils/funnel.ts`

```ts
export type StageKind = 'gd' | 'phase';

export interface FunnelStage {
  /** 'gd' for the mouth, else the phase's ClassificationValue.id. */
  key: string;
  kind: StageKind;
  /** Verbatim authored phase label; the GD stage's label is localised by the caller. */
  label: string;
  /** 0-based position, mouth first. */
  index: number;
  /** Horizontal band, px (R-002 fixed ratio). */
  x0: number;
  x1: number;
  /** Relative investment / effort, 0..1, non-decreasing across stages (FR-009). */
  money: number;
  effort: number;
  dots: FunnelDot[];
}
```

Stage list construction:

| Position | Source | Present when |
|---|---|---|
| 0 (mouth) | synthetic GD stage | always, even with the GD toggle off (FR-022b: drawn, count 0) |
| 1..n | `phaseDistribution.phases[]` in authored order, `key !== 'unknown'` | `phaseDistribution` is defined |
| — | the `unknown` bucket is **not** a stage | it becomes the holding area (§5) |

When `phaseDistribution` is `undefined`, there are no phase stages and the view renders FR-025's
explanatory empty state instead of a one-stage funnel.

---

## 4. `FunnelDot` — derived

```ts
export interface FunnelDot {
  id: string;              // GraphNode id
  row: InitiativeRow;      // carried for the hover card (FR-018)
  /** Participating gemeente count = row.gemeentes.length. Drives r. */
  g: number;
  /** r = s · sqrt(1 + ln(1 + g)) — s is global to the funnel (R-003, FR-012a). */
  r: number;
  /** Settled position, px. NOT reproducible between runs (A-012). */
  x: number;
  y: number;
}
```

**Placement rule**: `row.kind === 'gd'` ⇒ mouth stage. `row.kind === 'groei'` and `row.phase` set ⇒
the stage whose `key === row.phase.key`. `row.kind === 'groei'` and no phase ⇒ the holding area.
A Groei row whose `phase.key` matches no stage (a vocabulary that drifted mid-session) falls to the
holding area rather than being dropped — FR-017 outranks tidiness.

---

## 5. `FunnelLayout` — the layout function's output

```ts
export interface FunnelLayout {
  width: number;
  height: number;
  /** Sampled polylines for the two bounding bars, in px. */
  upper: [number, number][];
  lower: [number, number][];
  stages: FunnelStage[];
  /** Unphased Groei initiatives — OUTSIDE the curves (FR-024a). Omitted when empty. */
  holding: { label: string; box: { x0: number; y0: number; x1: number; y1: number }; dots: FunnelDot[] } | null;
  /** The fitted global scale factor s (R-003) — exposed for tests and the legend. */
  scale: number;
}

export function layoutFunnel(input: {
  rows: InitiativeRow[];
  phases: PhaseDistribution['phases'];   // authored order; may be empty
  width: number;
  height: number;
  gdIncluded: boolean;
}): FunnelLayout;
```

Pure and side-effect free. Its contract and invariants are in
[contracts/funnel-layout.md](./contracts/funnel-layout.md).

---

## 6. Envelope geometry

Two monotone curves over `x ∈ [0, width]`, evaluated per-dot during containment (FR-016c):

```
aperture(x) = a₀ + (a₁ − a₀) · ease(x / width)        a₀ > a₁ ≥ a_min   (FR-004)
upper(x)    = midline(x) − aperture(x) / 2
lower(x)    = midline(x) + aperture(x) / 2
```

`ease` is a smooth monotone decreasing easing (the whiteboard's curves bow rather than run straight),
and `midline(x)` drifts slightly so the two bars converge asymmetrically as drawn in the reference.
`aperture` is **strictly non-increasing** — the property test behind FR-004.

**Relationship to stages**: stage `k` occupies `[x0, x1]`; its usable area is
`∫ aperture(x) dx` over that band, which is what feeds the scale fit in R-003 and what makes later
stages hold fewer dots comfortably (FR-016d).

---

## 7. What is deliberately *not* modelled

- No new API request/response type — the funnel adds no endpoint (Constitution III).
- No new cache entity, key, or TTL (Constitution IV).
- No export shape — the funnel is screen-only (FR-031).
- No click/selection state — hover and focus only (A-009).
