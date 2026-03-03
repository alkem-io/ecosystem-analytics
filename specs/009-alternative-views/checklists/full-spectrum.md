# Full-Spectrum Requirements Quality Checklist: 009 — Alternative Visualization Views

**Purpose**: Validate completeness, clarity, consistency, and measurability of requirements across all 5 views, server API, types, interactions, and non-functional concerns before implementing 44 tasks.
**Created**: 2026-03-02
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [contracts/](../contracts/)
**Depth**: Standard | **Focus**: All views equally | **Audience**: Author (pre-implementation)

---

## Requirement Completeness

- [ ] CHK001 - Are loading/skeleton state requirements defined for each of the 5 new views during initial data computation (d3.treemap, d3.partition, d3.chord layout)? [Completeness, Gap]
- [ ] CHK002 - Are resize/responsive requirements specified for all views when the browser window or Explorer panel changes dimensions? [Completeness, Gap]
- [ ] CHK003 - Are requirements defined for what happens when a user switches views while an animation is in progress (e.g., Sunburst zoom transition or Temporal playback)? [Completeness, Gap]
- [ ] CHK004 - Is the ViewSwitcher's visual design specified — icon set, active/inactive tab styling, spacing, and mobile/narrow-viewport behavior? [Completeness, Spec §3]
- [ ] CHK005 - Are tooltip content and styling requirements defined consistently across all views (Treemap cell hover, Sunburst arc hover, Chord ribbon hover, Timeline band hover)? [Completeness, Gap]
- [ ] CHK006 - Are requirements documented for the Chord diagram when all spaces have zero shared members (empty matrix)? [Completeness, Gap]
- [ ] CHK007 - Is the breadcrumb trail visual design specified for Treemap zoom navigation — separator style, max depth display, click behavior on intermediate crumbs? [Completeness, Spec §2 View 3]
- [ ] CHK008 - Are requirements defined for the Timeline legend when the number of spaces exceeds available vertical space (20+ spaces)? [Completeness, Gap]
- [ ] CHK009 - Is the Temporal Force Graph scrubber's visual design specified — track style, thumb style, date label positioning, play/pause icon states? [Completeness, Spec §2 View 5]
- [ ] CHK010 - Are error state requirements defined when `buildTimeSeries()` or `estimateEdgeCreatedDate()` fails on the server? Does the BFF return partial data or an error? [Completeness, Gap]

## Requirement Clarity

- [ ] CHK011 - Is "smooth animated transition, ~750ms" for Sunburst zoom quantified with an exact duration and easing function, or is ~750ms an approximation that could vary? [Clarity, Spec §2 View 1]
- [ ] CHK012 - Is "0.15 opacity dimming" for Chord hover-highlight specified precisely — does it apply to ribbons, arcs, or both? Does it apply on arc hover and ribbon hover identically? [Clarity, Spec §2 View 2]
- [ ] CHK013 - Is "minimum arc width" for leafless Sunburst arcs quantified with a specific pixel or radian value? [Clarity, Contracts view-props.md §SunburstView]
- [ ] CHK014 - Is "minimum area (value floored to 1)" for empty Treemap spaces clear about whether this is relative to siblings or an absolute minimum pixel area? [Clarity, Contracts view-props.md §TreemapView]
- [ ] CHK015 - Are the Temporal Force Graph speed controls (1x/2x/5x) defined in terms of real time — what duration of simulated time passes per second of real time at each speed? [Clarity, Spec §2 View 5]
- [ ] CHK016 - Is "warm restart with alpha(0.1)" specific enough — should the simulation also adjust `alphaDecay` or `velocityDecay` when new nodes appear? [Clarity, Research Topic 6]
- [ ] CHK017 - Is "diagonal hatch pattern" for private Sunburst arcs specified with pattern dimensions (line spacing, angle, stroke width, color)? [Clarity, Contracts view-props.md §SunburstView]
- [ ] CHK018 - Are the HierarchySizeMetric values consistent between data-model.md (`members`, `activity-day`, `activity-week`, `activity-month`, `activity-allTime`) and contracts/data-types.md (`activity`, `members`, `subspaces`)? These are different enums. [Ambiguity, Conflict]

## Requirement Consistency

- [ ] CHK019 - Do the `ViewMode` enum values match across data-model.md (`'temporal'`), contracts/data-types.md (`'temporal-force'`), and contracts/view-props.md (`'force-graph'` default)? The temporal mode naming is inconsistent. [Conflict, data-model.md §5 vs data-types.md §3]
- [ ] CHK020 - Is the `ViewState` interface shape consistent between data-model.md §5 (uses `activeView`, `focusedSpaceId`, `sizeMetric`) and contracts/data-types.md §3 (uses `mode`, `hierarchySizeMetric`, no `focusedSpaceId`)? These define different property names. [Conflict]
- [ ] CHK021 - Are color encoding requirements consistent between Treemap (activity tier palette) and Chord (d3.schemeTableau10) — is the intentional difference documented and justified? [Consistency, Spec §2 View 2 vs View 3]
- [ ] CHK022 - Are the node selection semantics consistent across views — does `selectedNodeId` select a space in Chord (which shows only spaces) versus a user in Sunburst (which shows users as leaves)? [Consistency, Contracts view-props.md]
- [ ] CHK023 - Is the `INITIAL_VIEW_STATE.sizeMetric` consistent between data-model.md §5 (`'members'`) and contracts/data-types.md §3 (`'activity'` via `hierarchySizeMetric`)? These defaults differ. [Conflict]
- [ ] CHK024 - Does the spec's Treemap default ("activity count") match the contracts/view-props.md behavior contract ("Default sizing: `activity-allTime`, falling back to `members`")? The spec says area defaults to activity, the contract says `activity-allTime` specifically. [Consistency, Spec §2 View 3 vs Contracts]
- [ ] CHK025 - Is the `ChordView.groupLevel` prop ('L0' | 'L1') in contracts/view-props.md reflected in the `ViewState` interface? Neither `data-model.md` nor `data-types.md` includes a `groupLevel` state field. [Gap, Contracts view-props.md §ChordView]

## Acceptance Criteria Quality

- [ ] CHK026 - Can the performance target "≤500ms initial render" be objectively measured for each view? Are measurement conditions specified (dataset size, browser, cold/warm start)? [Measurability, Plan §Technical Context]
- [ ] CHK027 - Can "60fps smooth zoom/pan" be objectively verified? Is a threshold defined (e.g., 95th percentile frame time ≤ 16.67ms)? [Measurability, Plan §Technical Context]
- [ ] CHK028 - Can "≤150KB gzipped bundle increase" be measured? Is this per-view or total across all 5 views? Is the baseline defined? [Measurability, Plan §Technical Context]
- [ ] CHK029 - Are the Treemap/Sunburst fallback behaviors testable — when exactly does "activity unavailable" trigger (null field? zero value? missing `activityByPeriod`?)? [Measurability, Contracts view-props.md]
- [ ] CHK030 - Is the Timeline empty-state condition precisely defined — is `timeSeries` "empty" when it's `undefined`, an empty array, or when all buckets have `count: 0`? [Measurability, Contracts view-props.md §TimelineView]

## Scenario Coverage

- [ ] CHK031 - Are requirements specified for what happens when a space has subspaces but zero members in Sunburst member-sizing mode (arc width would be 0)? [Coverage, Edge Case]
- [ ] CHK032 - Are requirements defined for the Chord diagram when only 1 L0 space exists (no chords possible)? [Coverage, Edge Case]
- [ ] CHK033 - Are requirements defined for the Temporal Force Graph when all nodes share the same `createdDate` (scrubber has no range)? [Coverage, Edge Case]
- [ ] CHK034 - Are requirements defined for cross-view brush interaction — does brushing a time range in Timeline filter what's shown in Treemap/Sunburst/Chord if the user switches views? [Coverage, Spec §2 View 4]
- [ ] CHK035 - Are requirements specified for what happens when the user logs out or the session expires while a Temporal playback animation is running? [Coverage, Exception Flow]

## Edge Case & Non-Functional Requirements

- [ ] CHK036 - Are keyboard navigation requirements defined for each view — can users tab through Treemap cells, navigate Sunburst arcs, or control the Temporal scrubber with arrow keys? [Coverage, Accessibility, Gap]
- [ ] CHK037 - Are screen reader requirements specified for the non-textual D3 visualizations (SVG `role`, `aria-label` on arcs/rects/ribbons)? [Coverage, Accessibility, Gap]
- [ ] CHK038 - Are color contrast requirements specified for the activity tier palette against the background, meeting WCAG AA? [Coverage, Accessibility, Gap]
- [ ] CHK039 - Is memory management addressed for d3.timer() in Temporal mode — are cleanup/dispose requirements specified when unmounting or switching away from the view? [Coverage, Non-Functional, Gap]
- [ ] CHK040 - Are requirements specified for very large datasets at scale boundary (~5,000 nodes per plan) — should views virtualize, paginate, or aggregate when node count exceeds a threshold? [Coverage, Non-Functional, Gap]

## Dependencies & Assumptions

- [ ] CHK041 - Is the assumption that `Application.createdDate` exists for edge timestamp estimation validated against the Alkemio schema? Is this field nullable? [Assumption, data-model.md §2]
- [ ] CHK042 - Is the assumption that `d3.schemeTableau10` has enough colors for 20+ L0 spaces documented — what happens when spaces exceed the palette size? [Assumption, Contracts view-props.md §ChordView]
- [ ] CHK043 - Is the dependency on `activityFeedGrouped` entries having `createdDate` fields documented? Are these always present or conditionally available? [Dependency, Contracts server-api.md §3]

---

## Notes

- Check items off as completed: `[x]`
- Items marked `[Conflict]` are cross-artifact inconsistencies that must be resolved before implementation
- Items marked `[Gap]` indicate missing requirements that should be added to spec/contracts
- Items marked `[Assumption]` should be validated against the Alkemio schema
- CHK018-CHK025 identify concrete conflicts between data-model.md and contracts/data-types.md that need resolution
