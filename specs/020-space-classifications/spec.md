# Feature Specification: Dashboards read Space Classifications instead of tags

**Feature Branch**: `020-space-classifications`
**Created**: 2026-09-01
**Status**: Draft
**Input**: User description: "I want to update the vng, and other dashboards, to use classifications instead of tags - these were recently added to the alkemio api. In a separate project I am busy with ensure the classifications are added to all candidate spaces. So the dashboard should no longer use tags there were for classifications but use classifications instead"

## Overview

The VNG and GovTech dashboards currently determine *what an initiative is about* by string-matching free-text profile tags on each Space against operator-maintained keyword lists: an NDS theme list, a VNG-2030 theme list, and a fixed set of growth-phase keywords. Alkemio now offers **Classifications** — structured, curated vocabularies attached to a Space, where each classification is a named group (e.g. "NDS theme") holding a fixed set of allowed values, of which the Space has zero or more selected. A parallel programme of work is applying these classifications to every candidate Space.

This feature moves the dashboards off tag string-matching and onto the classification data as their source of truth for every facet that is genuinely a classification. Free-text tags remain what they are — informal keywords — and continue to be shown as such where they are shown today.

## Clarifications

### Session 2026-09-01

- Q: How should a Space that carries no classification data yet be counted during the rollout? → A: It falls into the "no classification" bucket — there is no tag fallback
- Q: Are GemeenteDelers initiative entries in scope for this change? → A: Out of scope — they keep their current tag-derived behaviour, and the change is limited to Spaces
- Q: Where do the dashboard's chart categories come from once classifications are in use? → A: Directly from the classification vocabulary itself; the operator keyword lists are retired

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Theme charts count the curated classification (Priority: P1)

A VNG programme manager opens the dashboard, selects a set of Groei initiatives, and looks at the NDS and VNG-2030 theme charts. Every initiative that has been classified in the Alkemio Space appears under exactly the theme(s) an editor selected there — not under whichever theme happened to match a tag spelling. An initiative whose tag text was misspelled, translated, or pluralised no longer falls into the "no classification" bucket when it has in fact been classified.

**Why this priority**: The theme charts are the dashboard's headline output and the reason the classification work is being done. On its own this story already replaces the most error-prone part of the current behaviour and delivers the accuracy gain.

**Independent Test**: Select a set of Spaces of which some are classified and some are not; confirm each classified Space is counted under its selected classification values, that the counts sum to the number of Spaces counted, and that the tooltip for each bar lists the expected initiative names.

**Acceptance Scenarios**:

1. **Given** a selected Space whose Alkemio Space carries an NDS classification with the value "Data" selected, **When** the dashboard is loaded, **Then** that Space is counted in the "Data" bar of the NDS chart and in no other NDS bar.
2. **Given** a selected Space whose classification allows several values and has two of them selected, **When** the dashboard is loaded, **Then** the Space is counted once in each of the two corresponding bars and appears in the multi-value list used by the cross-tab view.
3. **Given** a selected Space that carries a classification group with no value selected, **When** the dashboard is loaded, **Then** the Space is counted in that dimension's "no classification" bucket.
4. **Given** a Space whose free-text tags say "Data" but whose classification selects "Cloud", **When** the dashboard is loaded, **Then** the Space is counted under "Cloud" — the classification wins over the tag.
5. **Given** an editor renames a classification value's label in Alkemio without changing the vocabulary, **When** the dashboard is reloaded, **Then** the same Spaces are still counted in that category and the chart shows the new label.

---

### User Story 2 - Chart categories come from the vocabulary, not a hand-maintained list (Priority: P1)

A dashboard operator no longer maintains a keyword list per dashboard to define what the charts show. The categories on each theme chart, their labels, and their order come from the classification vocabulary that Alkemio holds. When the vocabulary gains a value, that value appears as a chart category — at count zero until a Space selects it — without a configuration change or redeploy.

**Why this priority**: Equal to US1 in importance: without it the dashboard still depends on a hand-maintained list that drifts from Alkemio, which is the second half of the problem the classification work exists to solve. It is separately testable and separately valuable.

**Independent Test**: Add a value to a classification vocabulary in Alkemio, reload the dashboard without changing any configuration, and confirm a new zero-count category appears in the right position with the right label.

**Acceptance Scenarios**:

1. **Given** a classification vocabulary of six values, **When** the dashboard is loaded for a selection where only three are used, **Then** all six categories render, three with counts and three at zero, in the vocabulary's authored order.
2. **Given** a value is added to the vocabulary in Alkemio, **When** the dashboard is reloaded, **Then** the new category appears with a zero count and no configuration change was required.
3. **Given** the selected Spaces carry classification groups the operator has not designated for a chart, **When** the dashboard is loaded, **Then** those groups do not produce charts and do not affect existing counts.
4. **Given** the operator-maintained keyword lists have been retired, **When** the dashboard is deployed, **Then** it starts and produces charts with no keyword-list configuration present.

---

### User Story 3 - Growth phase read from its classification (Priority: P2)

The growth-phase ("groeifase") pipeline chart reads each initiative's phase from its phase classification rather than from a phase keyword tag. An initiative that has moved from "intake" to "initiatief" shows in exactly one phase — the one currently selected — with no risk of a stale phase keyword left behind on the profile pulling it into two places.

**Why this priority**: A smaller chart than the theme charts, and the current keyword approach mostly works, but it carries the "stale tag" defect that classifications eliminate outright. Independent of US1/US2 because it reads a different classification group.

**Independent Test**: Select initiatives at different phases, confirm each appears once at its selected phase, and confirm an initiative whose profile still carries an obsolete phase keyword is placed by its classification, not the keyword.

**Acceptance Scenarios**:

1. **Given** an initiative whose phase classification selects "formalisatie", **When** the dashboard is loaded, **Then** it is counted in the "formalisatie" slot only.
2. **Given** an initiative whose profile still carries an old "intake" keyword tag but whose classification selects "beheer", **When** the dashboard is loaded, **Then** it is counted in "beheer" only.
3. **Given** no selected initiative carries a phase classification or a phase tag, **When** the dashboard is loaded, **Then** the phase chart is omitted rather than shown empty.

---

### User Story 4 - The classification gap is visible, not hidden (Priority: P2)

Because classifications are still being applied Space by Space, a dashboard user can see exactly how much of the selection is not yet classified. Spaces without classification data land in the "no classification" bucket of each chart, and the user can see which Spaces those are — so a manager knows a gap in a chart is an unfinished classification, and an editor knows precisely which Spaces to go and classify.

**Why this priority**: Without it the rollout gap is a silent hole in the charts. It is not needed for the classification path itself to work, so it sits below US1/US2.

**Independent Test**: Load a selection mixing classified and unclassified Spaces; confirm the unclassified ones appear in the "no classification" bucket, that the bucket names them, and that the reported unclassified total matches.

**Acceptance Scenarios**:

1. **Given** a selection of ten Spaces of which three carry no classification data, **When** the dashboard is loaded, **Then** all ten are counted, the three appear in the "no classification" bucket of each classification-driven chart, and the dashboard reports three as not yet classified.
2. **Given** a Space carries free-text tags that would previously have placed it under a theme, but carries no classification, **When** the dashboard is loaded, **Then** it appears in the "no classification" bucket — the tag is not used to place it.
3. **Given** every selected Space carries classification data, **When** the dashboard is loaded, **Then** nothing is reported as unclassified and no rollout notice is shown.
4. **Given** a user hovers the "no classification" bar, **When** the tooltip opens, **Then** it lists the names of the Spaces in that bucket.

---

### User Story 5 - Classifications visible on the initiative itself (Priority: P3)

A user inspecting a single initiative — in the details panel or the initiatives list — sees its classifications presented as named, curated facets ("NDS theme: Data"), distinct from its free-text keywords, so they can see why it was counted where it was counted.

**Why this priority**: Explanatory rather than functional; the charts are correct without it. Valuable for trust and for the editors doing the classification work.

**Independent Test**: Open the details for a classified initiative and confirm each classification group and its selected values are labelled and separated from the free-text tag list.

**Acceptance Scenarios**:

1. **Given** an initiative with two classification groups, **When** its details are opened, **Then** both groups appear with their labels and selected values, separately from its keyword tags.
2. **Given** an initiative with a classification group marked as not for display, **When** its details are opened, **Then** that group is not shown, while still counting toward any chart it drives.
3. **Given** an initiative with no classifications, **When** its details are opened, **Then** no empty classification section is rendered.

---

### Edge Cases

- A Space carries a classification group whose vocabulary is empty, or whose selected value is not present in its vocabulary → the Space is treated as having no selection in that dimension and lands in "no classification"; it must not crash the dashboard or produce a phantom category.
- Two classification groups on the same Space share a display label → both must remain distinguishable so counts are not merged.
- The classification vocabularies of two selected Spaces differ (different template versions) → the chart shows the union of values, each value counted only for Spaces whose vocabulary contains it.
- A Space is classified but the viewing user lacks permission to read some part of its About data → the Space is still counted from what is readable and, if nothing is readable, lands in "no classification" rather than being dropped.
- A dashboard is pointed at Spaces that use none of the designated classification groups → the theme charts render their vocabulary at zero counts rather than disappearing.
- Cached dashboard results produced before this change → must not be served as if classification-derived; a user reloading after the change sees classification-based counts.
- Every Space in a selection is unclassified → each classification-driven chart renders its full vocabulary at zero with every Space in the "no classification" bucket, rather than showing no chart.
- The GemeenteDelers initiative layer, which is not Space-based, continues to be counted from its tags and remains visibly attributed as such.

## Requirements *(mandatory)*

### Functional Requirements

#### Source of truth

- **FR-001**: The dashboards MUST read each selected Space's classifications from Alkemio and use them as the source of truth for every facet that represents a classification (theme dimensions and growth phase).
- **FR-002**: The dashboards MUST NOT infer a classification facet for a Space from its free-text profile tags, whether or not that Space carries classification data.
- **FR-003**: The system MUST continue to treat free-text tags as informal keywords and MUST keep presenting them wherever they are presented today (e.g. the Explorer's tag displays and shared-tag comparisons), unchanged.
- **FR-004**: The system MUST count a Space under every value selected in a multi-value classification, and under exactly one value for a single-value classification.
- **FR-005**: The system MUST identify a classification value by a stable identifier rather than by its display text, so renaming a value in Alkemio does not change which Spaces are counted under it.
- **FR-006**: The system MUST display the value's current label from Alkemio wherever that value is named to a user.

#### Chart composition

- **FR-007**: The categories, labels, and ordering of each classification-driven chart MUST be derived from the classification vocabulary reported by Alkemio, not from a keyword list maintained in dashboard configuration.
- **FR-008**: The system MUST render every value of a driving vocabulary as a category, including values selected by no Space in the current selection (zero-count categories).
- **FR-009**: The system MUST retain a "no classification" bucket per dimension for Spaces with no selected value in that dimension, in the same leading position it occupies today.
- **FR-010**: The system MUST allow an operator to designate, per dashboard, which classification groups drive which dashboard panels, so VNG and GovTech can diverge; this designation MUST NOT require restating the vocabulary itself.
- **FR-011**: The system MUST retire the per-dashboard tag-to-category keyword lists as the definition of chart categories, and MUST start and operate correctly with no such lists configured.
- **FR-012**: The cross-tab view MUST place each Space using its selected classification values on each axis, preserving today's primary-value placement and multi-value disclosure behaviour.
- **FR-013**: The growth-phase panel MUST read the phase from the designated phase classification, MUST place each initiative at exactly one phase, and MUST keep today's fixed pipeline ordering and omit-when-empty behaviour.

#### Rollout and degradation

- **FR-014**: The system MUST NOT fall back to tag matching for a Space that carries no classification data; a Space with no classification in a dimension MUST be counted in that dimension's "no classification" bucket.
- **FR-015**: The system MUST make the Spaces in a "no classification" bucket identifiable by name, so editors can act on the gap.
- **FR-016**: The system MUST report, per dashboard load, how many of the counted Spaces carry no classification data at all.
- **FR-017**: Chart behaviour MUST be identical before and after the classification programme completes — no configuration switch, migration step, or code change is required when the last Space is classified.
- **FR-018**: Missing, empty, or unreadable classification data MUST NOT cause a dashboard request to fail; the affected Space MUST be counted in the "no classification" bucket.
- **FR-019**: Cached dashboard data produced before this change MUST NOT be presented as classification-derived; results MUST reflect the new source of truth after the change is deployed.

#### Scope boundaries

- **FR-020**: The GemeenteDelers initiative layer MUST retain its current tag-derived behaviour and remain attributed as a separate segment; this feature changes only Space-based counting.
- **FR-021**: Every dashboard built on the shared dashboard foundation (VNG, GovTech, and any dashboard added later) MUST get this behaviour from the shared implementation, with per-dashboard differences expressed only as which classification groups drive which panels.

#### Presentation

- **FR-022**: The details view for an initiative MUST show its classifications as labelled groups with their selected values, visually distinct from its free-text keyword tags.
- **FR-023**: The system MUST honour a classification group's "not for display" flag in user-facing presentation, while still counting that group where it drives a panel.
- **FR-024**: Classification group and value labels MUST be shown as authored in Alkemio and MUST NOT be re-translated by the dashboard.

### Key Entities

- **Classification (group)**: A named, curated vocabulary attached to a Space — e.g. "NDS theme". Has a display label, an ordering among the Space's classifications, a flag for whether it is shown on the Space page, and a rule for whether one or several of its values may be selected.
- **Classification value**: One entry of a classification's vocabulary. Has a stable identifier used for counting and a human-readable label used for display; the label may change without the identifier changing.
- **Selection**: The set of values a Space has selected within one classification. May be empty.
- **Dashboard panel designation**: The operator's statement, per dashboard, of which classification group drives which panel (e.g. which group is the NDS chart, which is the phase pipeline).
- **Counted entity**: A Space (or, for the unchanged GemeenteDelers layer, an initiative entry) contributing to the charts, now carrying its classification selections — or none, in which case it is unclassified.
- **Free-text tag**: An informal keyword on a profile. Retained and displayed, but no longer a source of classification.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of selected Spaces are counted according to their classification selections, with zero Spaces placed by tag text in any classification-driven chart.
- **SC-002**: For a classified Space, the number of times it is mis-placed or missed because of tag spelling, translation, or pluralisation drops to zero.
- **SC-003**: Adding or renaming a value in a classification vocabulary is reflected on the dashboard on the next load with no configuration change and no redeploy, in 100% of cases.
- **SC-004**: Every counted Space is accounted for in every classification-driven chart: the sum of category counts plus the "no classification" bucket equals the number of counted Spaces, for every chart and every selection.
- **SC-005**: Users can see, on every dashboard load during the rollout, how many of the counted Spaces are not yet classified, and can identify them by name.
- **SC-006**: Dashboard load time for a given selection is no worse than before the change, as perceived by the user.
- **SC-007**: No dashboard request fails because of missing, empty, or unreadable classification data — degradation is always to the "no classification" bucket.
- **SC-008**: A new dashboard can be pointed at a different set of classification groups purely by operator configuration, with no dashboard-specific vocabulary restated anywhere.

## Assumptions

- **A-001**: The classification data the dashboards need is exposed on the Space's About information and is readable by the same authenticated user who can already read the Space, with no additional permission grant required.
- **A-002**: The parallel classification programme will apply classifications to all candidate Spaces. Until it completes, unclassified Spaces appear in the "no classification" bucket; this is accepted deliberately (a visible gap is preferred to a tag-inferred count that looks curated but is not).
- **A-003**: The classification vocabularies for the theme dimensions correspond to the categories the current keyword lists describe (the six NDS categories and the six VNG-2030 omkeringsthema's), so the charts keep their present shape after the switch.
- **A-004**: The growth phases (pre-intake, intake, initiatief, formalisatie, beheer) become a classification group. *Superseded during planning (see plan.md § Spec deltas, research R-005)*: the pipeline ordering is read from the vocabulary's authored order rather than kept in code, which carries the deployment expectation that the phase vocabulary is authored in pipeline order.
- **A-005**: A classification group is identified for panel designation by a stable, operator-visible identifier; conflicts caused by two groups sharing a display label are resolved by that identifier.
- **A-006**: Free-text tags that are not classification-like (keywords, skills, gemeente names, GemeenteDelers years and award markers) are untouched by this feature.
- **A-007**: The "Common Ground" marker and the gemeente associations continue to be derived as they are today; they are not part of the classification vocabularies in scope.
- **A-008**: Existing cached results are allowed to be discarded on deployment of this change; a one-off recomputation is acceptable.

## Out of Scope

- Creating, editing, or applying classifications in Alkemio — that is the parallel programme's work.
- Changing the GemeenteDelers initiative layer's tag-derived themes, years, awards, or gemeente resolution.
- Changing the Explorer's free-text tag features (tag display, shared-tag comparison, tag-based views).
- Changing how gemeente participation, city population analysis, or the usage explorer compute their results.
- Introducing new dashboard panels for classification groups that no panel is designated to.
- Any tag-based fallback for classification facets on Spaces — deliberately excluded, per the rollout decision above.
