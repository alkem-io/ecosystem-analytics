# Requirements Quality Checklist: Space Activity Volume

**Purpose**: Validate completeness, clarity, consistency, and coverage of the 008-space-activity requirements across all domains (data pipeline, UX/visual, integration, edge cases).
**Created**: 2026-03-02
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [data-model.md](../data-model.md)
**Depth**: Standard | **Audience**: Reviewer (PR) | **Focus**: All domains, equal risk weight

## Requirement Completeness

- [x] CHK001 - Is "contribution" explicitly defined — which event types from `ActivityFeedGrouped` count toward `totalActivityCount`? [Completeness, Gap]
  - **Resolution**: "Contribution" = every `RawActivityEntry` returned by the existing `ActivityFeedGrouped` GraphQL query. The `aggregateActivityCounts()` function counts all entries without type filtering. This is consistent with edge activity. Accepted as implicit — no spec change needed.
- [x] CHK002 - Are legend/key entries specified for the three glow colors (LOW blue, MEDIUM blue, HIGH gold) so users can interpret the visualization? [Completeness, Gap]
  - **Resolution**: Accepted gap. The existing Activity Pulse also has no legend. Glow colors are self-evident when combined with node sizing. A legend may be added as a future enhancement.
- [x] CHK003 - Are initial-render requirements specified for when activity data loads after the graph is already displayed (first paint → data arrival transition)? [Completeness, Gap]
  - **Resolution**: Not applicable. Activity data is aggregated server-side and included in the same BFF response (`POST /api/graph/generate`). There is no separate data-arrival event — the graph renders once with all data present.
- [x] CHK004 - Are requirements specified for how space nodes behave when the graph data refreshes while "Space Activity" is enabled (live data update scenario)? [Completeness, Gap]
  - **Resolution**: When spaces are added/removed, `dataset` changes → `graphVersion` increments → the useEffect re-fires with `[spaceActivityEnabled, graphVersion]` deps. Activity sizing recomputes automatically. This is handled by the dependency array pattern established in the codebase.
- [x] CHK005 - Are ARIA labels or screen-reader-accessible equivalents specified for the new "Space Activity" toggle? [Completeness, Gap]
  - **Resolution**: The checkbox uses a wrapping `<label>` element (same pattern as Activity Pulse), which provides native accessible labeling. The label text "Space Activity" or "Activity data unavailable" serves as the accessible name.
- [x] CHK006 - Is the display behavior of "Contributions: N" in the details drawer specified for spaces with `totalActivityCount === 0`? Should it show "0" or be hidden? [Completeness, Spec §FR-011]
  - **Resolution**: FR-011 says "exact `totalActivityCount` value for space nodes." Implementation uses `node.totalActivityCount ?? 0`. Shows "Contributions: 0" for spaces with zero contributions. This is informative — confirming zero activity is useful.
- [x] CHK007 - Are tooltip requirements specified for the activity glow/sizing to help users understand what the visual encoding means? [Completeness, Gap]
  - **Resolution**: Accepted gap. No tooltip requirements exist. The existing HoverCard already shows the node's displayName. Contribution count is visible in the details drawer on click. Tooltips for visual encoding are a potential future enhancement.

## Requirement Clarity

- [x] CHK008 - FR-002 says `totalActivityCount` for non-space nodes should be "0 (or undefined)" — which value is canonical? Data-model.md says `0`, spec says "0 (or undefined)". [Clarity, Conflict — Spec §FR-002 vs data-model.md]
  - **Resolution**: `undefined` is canonical. Per contracts/api-changes.md, USER/ORG nodes have both fields as `undefined` (not set). Fields are only set on SPACE_L0/L1/L2 nodes. Frontend uses `?? 0` for safe access.
- [x] CHK009 - FR-004 specifies "max scale factor of 2.5×" — is the baseline explicitly the `BASE_RADIUS` per type (not degree-scaled radius)? The spec is ambiguous about what "2.5× relative to the highest-activity peer" means mathematically. [Clarity, Spec §FR-004]
  - **Resolution**: Research R4 explicitly defines: `baseRadius = BASE_RADIUS[type]` (18/14/9 for L0/L1/L2). Activity sizing overrides degree-based sizing entirely. Formula: `baseRadius * (1 + t * (MAX_ACTIVITY_SCALE - 1))` where `t = log(1+count)/log(1+maxCount)`. Max result: `baseRadius * 2.5`.
- [x] CHK010 - FR-005 stroke widths are given as ranges (3–4px, 2–2.5px, 1–1.5px) rather than exact values. Are implementers free to choose within the range, or should exact values be pinned? [Clarity, Spec §FR-005]
  - **Resolution**: Exact values pinned in tasks: HIGH=3.5px, MEDIUM=2.5px, LOW=1.5px. These are midpoints of the spec ranges.
- [x] CHK011 - FR-005 states INACTIVE tier keeps "default stroke unchanged" — is the default stroke (color and width) documented for space nodes? [Clarity, Spec §FR-005]
  - **Resolution**: Default strokes confirmed from codebase (ForceGraph.tsx L846-857): SPACE_L0: `rgba(255,255,255,0.9)` / `2px`, SPACE_L1/L2: `rgba(255,255,255,0.7)` / `1px`. These are the restore targets when disabling.
- [x] CHK012 - FR-006 specifies "~300ms ease" with a tilde — is an acceptable range defined (e.g., 250–350ms), or should this be an exact value? [Clarity, Spec §FR-006]
  - **Resolution**: Implementation uses exactly 300ms. The tilde allows implementation flexibility; 300ms is the target.
- [x] CHK013 - FR-006 mentions "matching the existing Activity Pulse enter/exit pattern" — is this pattern documented in requirements, or is it an implicit reference to code? [Clarity, Spec §FR-006]
  - **Resolution**: Implicit code reference. The Activity Pulse useEffect (ForceGraph.tsx L1728-1819) uses D3 transitions with class-based enter/exit. The Space Activity useEffect follows the same pattern: D3 `.transition().duration(300)` with ease, same dependency array pattern `[prop, graphVersion]`.

## Requirement Consistency

- [x] CHK014 - FR-003 defines the field as `activityTier` but data-model.md names it `spaceActivityTier` (to avoid confusion with `GraphEdge.activityTier`). Which name is canonical? Spec and data-model are inconsistent. [Consistency, Conflict — Spec §FR-003 vs data-model.md]
  - **Resolution**: `spaceActivityTier` is canonical (data-model.md). This avoids confusion with `GraphEdge.activityTier` which is a different concept (per-user-per-space edge activity). The spec FR-003 uses the generic term but data-model.md and contracts/ are the binding interfaces.
- [x] CHK015 - The Edge Cases section states "all spaces with the same contribution count → glow tier is MEDIUM for all" — but percentile-based tier logic would place equal values at the same percentile, which might not be MEDIUM. Is this consistent with the actual tier algorithm? [Consistency, Spec §Edge Cases vs §FR-003]
  - **Resolution**: **Consistent.** `computeActivityTiers()` (transformer.ts L340-344) has an explicit `allSame` check: `if (allSame) { tiers.set(key, ActivityTier.MEDIUM) }`. All-equal non-zero counts → MEDIUM. Verified in code.
- [x] CHK016 - FR-004 says scaling is "relative to the highest-activity peer at each space level" while research R4 says peers are "grouped by space level (L0 vs L0, L1 vs L1)." Is per-level grouping stated in the spec itself, or only in research? [Consistency, Spec §FR-004 vs research.md R4]
  - **Resolution**: FR-004 says "at each space level" — this is per-level grouping. Research R4 elaborates the same concept. Consistent.
- [x] CHK017 - FR-002 says `totalActivityCount: 0` for non-space nodes, but the Key Entities section says "only meaningful for SPACE_L0/L1/L2 nodes." Are these aligned — should non-space nodes have `0` or omit the field? [Consistency, Spec §FR-002 vs §Key Entities]
  - **Resolution**: Fields are omitted (`undefined`) on non-space nodes per contracts/api-changes.md. "Only meaningful for SPACE" aligns with "not set on non-space." Frontend uses `?? 0`. See CHK008.

## Acceptance Criteria Quality

- [x] CHK018 - SC-001 states "Users can identify the top 3 most active spaces within 5 seconds" — how is this objectively measured? Is this intended to be a usability test or an automated test? [Measurability, Spec §SC-001]
  - **Resolution**: Manual visual verification via quickstart.md checklist item #2-#5. Not an automated test — this is a qualitative UX goal appropriate for this project's scope.
- [x] CHK019 - SC-004 states "coexist without visual conflicts" — is "visual conflict" defined with measurable criteria (e.g., no overlapping strokes, no color clashing)? [Measurability, Spec §SC-004]
  - **Resolution**: Verified via quickstart.md checklist item #9: "Enable both Activity Pulse AND Space Activity → edge pulses + space sizing coexist without conflict." Manual visual check. Space Activity operates on node circles; Activity Pulse on edge paths. No shared DOM elements.
- [x] CHK020 - US1 Scenario 1 says nodes "scale up proportionally to their total contribution count using logarithmic scaling" — logarithmic scaling is not proportional; is the acceptance scenario wording precise? [Clarity, Spec §US1-SC1]
  - **Resolution**: The word "proportionally" is imprecise in mathematical terms. The binding requirement is FR-004 which specifies "logarithmic scaling." The scenario is natural-language; FR-004 is the implementation contract.

## Scenario Coverage

- [x] CHK021 - Are requirements defined for what happens when the user switches spaces in SpaceSelector while "Space Activity" is enabled? Does the toggle state persist? [Coverage, Gap]
  - **Resolution**: React state (`spaceActivityEnabled`) persists across dataset changes. When spaces change, `dataset` updates → `graphVersion` increments → the useEffect re-fires and recomputes sizing for the new dataset. Toggle remains enabled.
- [x] CHK022 - Are requirements defined for how Space Activity interacts with the search/highlight feature — should highlighted nodes preserve their activity sizing? [Coverage, Gap]
  - **Resolution**: Search highlighting operates on `opacity` and stroke-color of matched nodes. Activity sizing operates on `r` (radius). These are orthogonal SVG attributes — no conflict. Activity-sized nodes retain their radius during search.
- [x] CHK023 - Are requirements defined for the visual result when a single space exists in the graph? Logarithmic relative scaling with one peer yields `t=1` (max scale) — is this the intended behavior? [Coverage, Edge Case]
  - **Resolution**: Yes. A single space with activity gets `t=1` → full 2.5× scale. This is correct: it IS the most active space (and the only one). With zero activity, `t=0` → baseline. Behavior is sensible.
- [x] CHK024 - Are requirements defined for concurrent toggle interactions (e.g., rapidly toggling Space Activity on/off during a transition)? Should transitions cancel, queue, or complete? [Coverage, Gap]
  - **Resolution**: D3's `.transition()` on the same element interrupts the previous transition and starts the new one from the current interpolated value. Rapid toggling produces smooth reversal. This is built-in D3 behavior.

## Edge Case Coverage

- [x] CHK025 - Are requirements specified for very large activity counts (e.g., 10,000+ contributions)? Does logarithmic scaling handle this correctly, or are there overflow/rendering concerns? [Edge Case, Gap]
  - **Resolution**: `Math.log(1 + 10000) ≈ 9.21`. Logarithmic scaling compresses large values. The max radius is bounded at `BASE_RADIUS * 2.5` (45px for L0) regardless of count magnitude. No overflow risk.
- [x] CHK026 - Is the behavior specified when activity data becomes unavailable mid-session (e.g., API error on refresh)? Should existing sizing/glow persist or revert? [Edge Case, Gap]
  - **Resolution**: Activity data is fetched once per `POST /api/graph/generate` call. If it fails, `hasActivityData = false` and the checkbox becomes disabled (FR-008). A new graph generation produces a fresh dataset. Mid-session data loss doesn't occur in practice.
- [x] CHK027 - Are requirements specified for spaces that have only 1 contributor vs many contributors with the same total count? (Same `totalActivityCount` = same visual, but is this desirable?) [Edge Case, Spec §FR-001]
  - **Resolution**: By design. FR-001 aggregates direct contribution counts, not contributor diversity. Same total = same visual. This is the intended behavior — the feature measures activity volume, not contributor breadth.

## Non-Functional Requirements

- [x] CHK028 - Are browser support requirements documented for the SVG `drop-shadow` filter used on HIGH tier glow? (Not supported in older browsers.) [Non-Functional, Gap]
  - **Resolution**: `filter: drop-shadow()` is supported in Chrome 52+, Firefox 35+, Safari 9.1+, Edge 79+. The project targets modern browsers (plan.md: "Web (modern browsers)"). No concern.
- [x] CHK029 - Are performance requirements specified for the initial tier computation when activity data arrives? (Plan says "no additional API calls" but doesn't specify computation budget.) [Non-Functional, Gap]
  - **Resolution**: `aggregateSpaceActivityCounts()` is O(n) over the count map entries. `computeActivityTiers()` is O(n log n) sort. For typical space populations (5–50 nodes), this is sub-millisecond. Plan's performance goal is "toggle animation ≤300ms" — computation overhead is negligible.
- [x] CHK030 - FR-006 addresses reduced-motion for animation, but are other accessibility requirements specified (e.g., color-blind-safe glow colors, sufficient contrast ratios for stroke colors on node backgrounds)? [Non-Functional, Gap]
  - **Resolution**: HIGH (#f59e0b amber/gold) vs MEDIUM (#3b82f6 blue) vs LOW (#93c5fd light blue) are distinguishable across common color vision deficiency types due to different hue families. Additionally, stroke **width** (3.5/2.5/1.5px) provides a redundant channel. Adequate for this project scope.

## Dependencies & Assumptions

- [x] CHK031 - Is the assumption that `computeActivityTiers()` produces meaningful results with small populations (5–50 spaces) validated? Research R2 notes the fallback triggers more often — are the fallback thresholds documented in requirements? [Assumption, research.md R2]
  - **Resolution**: Validated. The function has an explicit `nonZeroEntries.length < 3` fallback (transformer.ts L348-353) with fixed thresholds: ≤2=LOW, ≤10=MEDIUM, >10=HIGH. For ≥3 entries, percentile-based quartiles apply. Both paths produce meaningful results for small populations.
- [x] CHK032 - Is the dependency on `hasActivityData` boolean for gating the toggle explicitly documented in requirements, or only implied by FR-008's reference to "Activity Pulse disabled state"? [Dependency, Spec §FR-008]
  - **Resolution**: FR-008 explicitly states "Space Activity checkbox MUST be disabled when `hasActivityData === false`." The dependency is documented.

## Notes

- All 32 items reviewed and resolved on 2026-03-02
- Items are numbered CHK001–CHK032
- Traceability: 28/32 items (87.5%) include spec section or gap markers
- **Result: 32/32 PASS** — all items resolved (7 accepted gaps, 3 conflicts resolved, 22 confirmed)
