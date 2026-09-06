# Feature Specification: VNG Innovation Funnel View

**Feature Branch**: `022-vng-funnel-view`
**Created**: 2026-09-05
**Status**: Draft
**Input**: User description: "I want to create another visual for VNG that echos strongly the idea of a funnel. The first phase has a small amount of money + effort (effort = clock symbol), and each phase has more. Roughly speaking the GD initiatives go into the box with the number 100, and the groei ones go into that with the 25. We can also leverage the groei phases for the different phases of the funnel. Important is that the full funnel is visible. Then in each phase there is one dot for each initiative, and the size of the dot is logarithmic tied to the number of participating gemeentes. The color for now can be the groei / GD split. On hovering over a dot additional information about the initiative is shown, including its classifications. The overall idea is to create the concept of a funnel + to see where the initiatives are in the funnel. The double curved bounding bars should be kept."

## Overview

VNG's innovation programme is, in the programme team's own words, a funnel: a wide mouth of many
lightweight ideas that narrows, stage by stage, into a small number of formalised, managed
initiatives — and every step along the way costs more money and more effort than the one before it.
Today the dashboard shows that pipeline only as a bar chart of counts per growth phase. A bar chart
answers "how many are in Formalisatie?" but it does not communicate the *shape* of the programme,
the *cost gradient* along it, or *which* initiative sits where.

This feature adds a single new visual — the Funnel — that renders the programme as the funnel the
team already draws on whiteboards: two converging curved bounding bars enclosing a sequence of
narrowing stages, an increasing money-and-effort ramp across those stages, and inside every stage a
dot for each individual initiative, sized by how many gemeentes take part in it and coloured by
whether it comes from the GemeenteDelers corpus or from the Groei programme. Hovering a dot reveals
that initiative's details, including its classifications.

The funnel is a *presentation* of data the dashboard already holds. It introduces no new data
source: the initiatives, their gemeente participation, their classifications and their growth phase
are already what drive the existing Dashboard and Initiatives views.

## Clarifications

### Session 2026-09-05

- Q: Which initiatives populate the GemeenteDelers stage? → A: The entire GemeenteDelers corpus (~305 initiatives) whenever the GD toggle is on — selection-independent, as the GD layer behaves elsewhere.
- Q: How should dots be placed inside a stage? → A: Force-directed collision relaxation — an organic scatter that settles by simulation; positions are not identical run to run.
- Q: What bounds the relaxation? → A: The two curved bounding bars are a hard containment envelope — dots stay inside the curves, following the actual curvature, not a bounding rectangle.
- Q: What gives when a stage cannot fit its dots at their log-derived sizes? → A: One global size scale for the whole funnel, auto-fitted so the densest stage fits — every stage's dots shrink together, preserving cross-stage comparability.
- Q: Where does the "no phase" holding area sit? → A: A detached area outside the curved bounding bars, clearly labelled — same dot sizing and colours, but visibly not in the funnel.
- Q: Does the funnel participate in the dashboard's existing export? → A: No — the funnel is a screen-only view; the export is unchanged by this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the whole funnel at a glance (Priority: P1)

A VNG programme lead opens the funnel view and immediately sees the complete innovation funnel:
every stage from the widest intake stage to the narrowest managed stage, enclosed by two converging
curved bounding bars, with each stage labelled by name and by how many initiatives it holds, and
each stage annotated with an investment-and-effort indicator that visibly grows from the wide end to
the narrow end. The entire funnel is visible in one view without scrolling or panning.

**Why this priority**: The funnel *shape* is the point of the feature. Even with no initiative dots
drawn at all, a correctly proportioned, fully visible, labelled funnel with the cost gradient is a
deliverable artefact — it is the picture the programme team currently draws by hand, and it can be
shown to stakeholders on its own.

**Independent Test**: Open the funnel view with a space selection loaded. Confirm every stage is
rendered, the two curved bounding bars enclose all stages and converge from wide to narrow, each
stage shows its name and count, the money/effort indicators increase monotonically across stages,
and nothing is cut off at any supported window size.

**Acceptance Scenarios**:

1. **Given** a selection whose spaces carry growth-phase classifications, **When** the user opens the
   funnel view, **Then** the funnel renders with one stage per pipeline phase plus the
   GemeenteDelers stage, in pipeline order from widest to narrowest.
2. **Given** the funnel is rendered, **When** the user inspects it, **Then** two curved bounding bars
   enclose the full stage sequence, converging from the wide end to the narrow end.
3. **Given** the funnel is rendered, **When** the user reads the stage annotations, **Then** each
   stage shows a money indicator and an effort (clock) indicator, and both are non-decreasing from
   the wide end to the narrow end.
4. **Given** a stage that currently holds no initiatives, **When** the funnel renders, **Then** that
   stage is still drawn, labelled, and shown with a count of zero — the pipeline gap is visible.
5. **Given** any supported window size, **When** the funnel renders, **Then** the complete funnel
   (all stages, both bounding bars, all labels) is visible at once without scrolling the funnel
   itself.

---

### User Story 2 - Locate every initiative in the funnel (Priority: P1)

The programme lead needs to see not just how many initiatives are at each stage but which ones, and
how big each one is. Inside each stage, one dot is drawn for every initiative currently in that
stage. A dot's size grows with the number of gemeentes participating in that initiative, on a
logarithmic scale so a 60-gemeente initiative reads as clearly larger than a 6-gemeente one without
dwarfing it. A dot's colour states its source: Groei (a selected programme space) or GemeenteDelers.

**Why this priority**: Together with US1 this is the feature. The funnel without dots is a diagram;
with dots it becomes an instrument for seeing where the portfolio actually sits and where it is
top-heavy or bottom-heavy.

**Independent Test**: With a known selection, count the dots in each stage and confirm the totals
match the stage counts and the initiative totals shown elsewhere in the dashboard. Confirm the
largest-participation initiative has the largest dot and that dot sizes follow a logarithmic
progression, and confirm the two source colours are distinguishable and explained by a legend.

**Acceptance Scenarios**:

1. **Given** a loaded selection, **When** the funnel renders, **Then** the number of dots in each
   stage equals that stage's stated count, and the total number of dots equals the number of
   initiatives the funnel is showing.
2. **Given** two initiatives in the same stage with different gemeente participation, **When** the
   funnel renders, **Then** the one with more participating gemeentes is drawn as the larger dot.
3. **Given** an initiative with no participating gemeentes, **When** the funnel renders, **Then** its
   dot is still drawn at a legible minimum size.
4. **Given** initiatives from both sources are present, **When** the funnel renders, **Then** Groei
   and GemeenteDelers dots are visually distinguishable by colour and a legend names both.
5. **Given** a stage holds many initiatives, **When** the funnel renders, **Then** all of that
   stage's dots come to rest inside the two curved bounding bars — following the curves, not a
   bounding box — without any dot being hidden behind another or crossing a curve.

---

### User Story 3 - Inspect an initiative without leaving the funnel (Priority: P2)

Hovering (or keyboard-focusing) a dot reveals the initiative behind it: its name, its source, how
many gemeentes take part, and its classifications — the same classification dimensions the rest of
the dashboard uses, plus its growth phase.

**Why this priority**: Turns the picture into something answerable. Valuable, but the funnel already
delivers its core insight without it.

**Independent Test**: Hover several dots across different stages and both sources; confirm the
revealed details match the same initiative's row in the Initiatives view.

**Acceptance Scenarios**:

1. **Given** the funnel is rendered, **When** the user hovers a dot, **Then** the initiative's name,
   source, participating-gemeente count, growth phase and classification values are shown.
2. **Given** an initiative carrying no values in a classification dimension, **When** the user hovers
   its dot, **Then** that dimension is shown as having no value rather than being silently omitted.
3. **Given** the user moves the pointer away from a dot, **When** no dot is hovered, **Then** the
   detail disappears and the funnel returns to its resting state.
4. **Given** a user navigating by keyboard, **When** a dot receives focus, **Then** the same detail
   is revealed.

---

### User Story 4 - The funnel follows the current selection (Priority: P2)

The funnel reflects the dashboard's current space selection and its GemeenteDelers inclusion toggle,
exactly as the other dashboard visuals do. Changing either changes the funnel.

**Why this priority**: Consistency with the rest of the dashboard. A funnel that disagreed with the
charts beside it would undermine trust in both.

**Independent Test**: Change the space selection and confirm dot counts change accordingly; toggle
GemeenteDelers inclusion off and on and confirm the GemeenteDelers dots disappear and reappear.

**Acceptance Scenarios**:

1. **Given** the funnel is rendered, **When** the user changes the space selection, **Then** the
   funnel re-renders against the new selection.
2. **Given** GemeenteDelers inclusion is switched off, **When** the funnel renders, **Then** no
   GemeenteDelers dots appear and the stage counts reflect Groei initiatives only.
3. **Given** the funnel and the growth-phase chart are both viewed for the same selection, **When**
   their per-phase counts are compared, **Then** they agree.

---

### Edge Cases

- **No phase classification configured for the dashboard**: the funnel cannot derive its stages. It
  shows an explanatory empty state naming the missing configuration rather than an empty frame.
- **An initiative carries no growth phase**: it is placed in the labelled holding area outside the
  curves, never silently dropped and never guessed into a stage. This is the expected state for a
  Groei space the classification programme has not reached yet, so the area doubles as a visible
  rollout gap.
- **An initiative carries more than one growth-phase value**: it is placed once, at its
  furthest-advanced stage, and the hover detail lists every phase value it carries.
- **The live phase vocabulary differs from the one this build expects** (a value added or renamed in
  Alkemio): the funnel still renders every live stage in authored order and surfaces the same
  advisory drift notice the existing phase chart uses.
- **The mouth stage holds an order of magnitude more initiatives than every stage after it**: with
  the GD toggle on the funnel is routinely ~305 dots in the GemeenteDelers stage against a handful in
  each phase stage. The mouth stage's density is what sets the funnel's single global dot scale
  (FR-012b), so turning the GD layer on visibly shrinks every dot in every stage — expected, and
  preferable to dot size meaning two different things in one picture. The stage's width and shape are
  fixed by the funnel geometry (FR-004), never stretched to accommodate its population.
- **Empty selection / still loading**: the funnel shows the dashboard's standard loading and empty
  states, not a partially drawn funnel.
- **Very wide or very narrow viewport**: the funnel scales to fit; it never clips a stage, a bounding
  bar, or a label.

## Requirements *(mandatory)*

### Functional Requirements

**Funnel structure**

- **FR-001**: The dashboard MUST provide a funnel visual that renders the innovation pipeline as an
  ordered sequence of stages narrowing from a wide mouth to a narrow outlet.
- **FR-002**: The funnel's stages MUST be exactly one leading (widest) stage representing the
  GemeenteDelers corpus, followed by one stage per value of the dashboard's configured growth-phase
  vocabulary, in that vocabulary's authored order.
- **FR-002a**: The funnel MUST take its stage set and stage order from the live growth-phase
  vocabulary and MUST NOT restate those values itself: a phase value added, renamed or reordered in
  Alkemio MUST appear in the funnel with no configuration or code change.
- **FR-003**: The funnel MUST render every stage in the vocabulary, including stages that currently
  hold no initiatives.
- **FR-004**: Stage widths MUST decrease monotonically from the first stage to the last, so the
  funnel shape is legible independently of how many initiatives each stage holds.
- **FR-005**: The funnel MUST be enclosed by two curved bounding bars — one above and one below the
  stage sequence — that converge from the wide end to the narrow end.
- **FR-006**: The complete funnel — every stage, both bounding bars, every stage label and
  annotation — MUST be visible simultaneously, without scrolling or panning within the visual, at
  every supported viewport size.
- **FR-007**: Each stage MUST be labelled with its name, rendered verbatim as authored in the source
  vocabulary, and with the number of initiatives it currently holds.

**Investment and effort ramp**

- **FR-008**: Each stage MUST carry an investment (money) indicator and an effort (clock) indicator.
- **FR-009**: Both indicators MUST be non-decreasing from the first stage to the last, expressing
  that each successive stage costs more money and more effort than the one before it.
- **FR-010**: The indicators MUST be presented as relative, qualitative signals (a growing ramp) and
  MUST NOT be presented as measured monetary amounts or measured hours.

**Initiative dots**

- **FR-011**: Each initiative in the current scope MUST be represented by exactly one dot, placed in
  the stage matching its growth phase.
- **FR-012**: Dot size MUST scale logarithmically with the number of gemeentes participating in that
  initiative.
- **FR-012a**: A SINGLE size scale MUST apply across the whole funnel: two initiatives with the same
  participating-gemeente count MUST be drawn at the same size regardless of which stage they are in.
  Per-stage normalisation is forbidden — it would make dot size mean different things in different
  parts of the same picture.
- **FR-012b**: When the densest stage cannot fit its dots inside the curves at the current scale, the
  funnel MUST reduce that single global scale until it does, shrinking every stage's dots together.
  Individual stages MUST NOT be rescaled independently, and the funnel geometry MUST NOT be stretched
  to make room (the curves are fixed by FR-004/FR-016c).
- **FR-013**: An initiative with zero participating gemeentes MUST still be drawn, at a legible
  minimum dot size.
- **FR-014**: Dot colour MUST encode the initiative's source — Groei (selected programme spaces)
  versus GemeenteDelers — using two visually distinguishable colours.
- **FR-015**: A legend MUST name both source colours and MUST explain that dot size represents the
  number of participating gemeentes.
- **FR-016**: Every dot MUST be placed fully inside its stage's horizontal extent and inside the
  curved envelope (FR-016c), and dots MUST NOT be fully occluded by one another.
- **FR-016a**: Dot placement within a stage MUST be an organic scatter produced by collision
  relaxation — dots repel one another until they no longer overlap — rather than a grid or a fixed
  packing order.
- **FR-016b**: The placement MUST come to rest: it settles into a stable arrangement and then stops,
  with no perpetual motion in the funnel's resting state.
- **FR-016c**: The two curved bounding bars MUST act as a hard containment envelope on the
  relaxation: every dot, at its full drawn radius, stays inside the curves. Containment MUST follow
  the actual curvature at the dot's horizontal position — not a bounding rectangle around the stage —
  so the dots in a stage visibly narrow with the funnel rather than squaring it off.
- **FR-016d**: A stage's vertical extent for placement purposes MUST be the distance between the
  upper and lower curve at that stage's position, which is what makes later stages hold fewer dots
  comfortably than earlier ones.
- **FR-017**: The sum of dots across all stages (including the "no phase" holding area) MUST equal
  the number of initiatives in the current scope — no initiative may be dropped.

**Initiative detail on hover**

- **FR-018**: Hovering a dot MUST reveal the initiative's name, its source, its participating-gemeente
  count, its growth phase, and its classification values across the dashboard's configured
  classification dimensions.
- **FR-019**: A classification dimension in which the initiative has no value MUST be shown
  explicitly as having none.
- **FR-020**: The revealed detail MUST disappear when the dot is no longer hovered or focused.
- **FR-021**: Dots MUST be reachable and inspectable by keyboard, revealing the same detail as hover.

**Scope, consistency and states**

- **FR-022**: The funnel MUST reflect the dashboard's current space selection and its GemeenteDelers
  inclusion toggle.
- **FR-022a**: When the GemeenteDelers toggle is on, the GemeenteDelers stage MUST hold the ENTIRE
  GemeenteDelers corpus (~305 initiatives), independently of the space selection — the same
  selection-independent behaviour the GD layer has elsewhere in the dashboard. The corpus MUST NOT be
  filtered down to initiatives that happen to touch the current selection.
- **FR-022b**: When the GemeenteDelers toggle is off, the GemeenteDelers stage MUST render as an
  empty stage (drawn and labelled, count zero) rather than being removed from the funnel.
- **FR-023**: The funnel's per-phase counts MUST agree with the growth-phase counts shown elsewhere
  in the dashboard for the same scope.
- **FR-024**: Initiatives carrying no growth phase MUST be shown in an explicit, labelled "no phase"
  holding area rather than being omitted or assigned to a stage.
- **FR-024a**: The holding area MUST be drawn OUTSIDE the two curved bounding bars and be visually
  distinct from the funnel, so that nothing inside the curves is ever occupied by an initiative whose
  stage is unknown. It MUST NOT be rendered as a leading or trailing stage.
- **FR-024b**: Dots in the holding area MUST use the same size scale (FR-012a) and the same source
  colours (FR-014) as dots in the funnel, and MUST offer the same hover/focus detail (FR-018), so it
  reads as the same population held to one side rather than a different chart.
- **FR-024c**: The holding area MUST be labelled with its count and MUST remain visible alongside the
  complete funnel under FR-006. When it holds no initiatives it MUST be omitted entirely rather than
  drawn empty — unlike funnel stages, which are always drawn (FR-003).
- **FR-025**: When the dashboard has no growth-phase vocabulary configured, the funnel MUST show an
  explanatory empty state naming what is missing.
- **FR-026**: When the live phase vocabulary differs from the set this build expects, the funnel MUST
  render every live stage regardless and MUST surface the same advisory drift notice used by the
  existing phase chart.
- **FR-027**: The funnel MUST show the dashboard's standard loading and empty states while data is
  unavailable, rather than a partially drawn funnel.
- **FR-028**: All funnel text that is not authored vocabulary MUST be localised in the same languages
  as the rest of the dashboard.
- **FR-029**: The funnel MUST be presented as its own top-level destination in the VNG dashboard's
  primary navigation, alongside the existing destinations, so it has the full viewport to render the
  complete funnel in.
- **FR-030**: The existing growth-phase chart on the Dashboard destination MUST remain unchanged —
  the funnel is an addition, not a replacement.
- **FR-031**: The funnel is a screen-only view. The dashboard's existing export MUST be unchanged by
  this feature: the funnel is neither rasterised into it nor given a data sheet, and no new export
  affordance is added to the funnel view.

### Key Entities

- **Funnel stage**: One step of the innovation pipeline. Has a name (from the growth-phase
  vocabulary or the GemeenteDelers corpus), a position in the pipeline, a relative width, a relative
  investment level, a relative effort level, and the set of initiatives currently in it.
- **Initiative**: A programme initiative, either a Groei initiative (a selected programme space) or a
  GemeenteDelers initiative. Has a name, a source, a set of participating gemeentes, a growth phase
  (absent for GemeenteDelers initiatives), and classification values.
- **Gemeente participation**: The link between an initiative and the municipalities taking part in
  it. Its count drives dot size.
- **Classification value**: An authored category an initiative is tagged with, in one of the
  dashboard's configured classification dimensions. Shown in the hover detail.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer with no prior briefing can describe the programme as a narrowing funnel with
  increasing cost per stage after looking at the visual for under 15 seconds.
- **SC-002**: 100% of the initiatives in the current scope are represented by exactly one dot, with
  zero initiatives dropped or double-counted, verified against the Initiatives view's row count.
- **SC-003**: The funnel's per-stage counts match the growth-phase counts shown elsewhere in the
  dashboard for the same selection, in 100% of comparisons.
- **SC-004**: The complete funnel — every stage, both bounding bars, all labels — is visible without
  scrolling at every supported viewport size, verified at the narrowest and widest supported widths.
- **SC-009**: The dot layout settles into its resting arrangement within 2 seconds of the funnel
  appearing, at the working scale of A-011, with zero dots intersecting or crossing either curved
  bounding bar at rest.
- **SC-005**: A user can identify the source and participating-gemeente count of any individual
  initiative in under 5 seconds, by hovering its dot.
- **SC-006**: Given two initiatives whose gemeente participation differs by a factor of ten, a viewer
  correctly identifies which is larger from dot size alone in at least 9 of 10 attempts — and this
  holds whether the two dots sit in the same stage or in different stages.
- **SC-010**: At the minimum global scale the densest supported corpus forces, the smallest dot is
  still large enough to hover and to distinguish by colour.
- **SC-007**: The funnel renders its first complete frame within the same time budget as the existing
  dashboard charts for the same selection — the user perceives no additional wait when switching to
  it.
- **SC-008**: Changing the space selection or the GemeenteDelers toggle updates the funnel with no
  manual refresh, in 100% of cases.

## Assumptions

- **A-001**: The funnel is a new presentation of data the dashboard already holds. No new external
  data source, and no new information from Alkemio, is required.
- **A-002**: "Groei phases" are the dashboard's configured growth-phase classification (`Fase`),
  whose values form the pipeline in their authored order. The funnel takes both its stage set and
  its stage order from that live vocabulary and never restates the values itself — adding a phase
  value in Alkemio adds a funnel stage with no configuration change, consistent with how the
  existing phase chart behaves.
- **A-003**: The whiteboard's numbers (500 / 200 / 100 / 25) are illustrative of the funnel's *shape*,
  not target values to display. Stage widths express relative narrowing; actual counts come from the
  data and are shown as stage labels.
- **A-004**: The money and clock indicators are qualitative and configured, not derived from data —
  no budget or timesheet data exists to source them from. They express the programme's premise that
  each stage costs more than the last.
- **A-005**: GemeenteDelers initiatives carry no growth phase (they are a separate, completed
  programme), which is why they occupy their own leading stage rather than being distributed across
  the phase stages.
- **A-011**: Working scale for layout and performance: ~305 GemeenteDelers initiatives in the mouth
  stage and on the order of 20-30 Groei initiatives spread across the phase stages. These are current
  figures, not caps — the funnel must not break if the corpus grows.
- **A-006**: "Number of participating gemeentes" means the count of distinct municipalities
  associated with the initiative — the same count the Initiatives view already shows per initiative.
- **A-007**: The Groei/GemeenteDelers colour split reuses the source colours already established
  elsewhere in the dashboard, so the funnel reads consistently with the existing stacked charts.
  Colour encodes source "for now"; classification-based colouring is explicitly out of scope here.
- **A-008**: The funnel is built as a shared dashboard component in the same way as the existing
  dashboard visuals, so a sibling dashboard with a growth-phase vocabulary configured can adopt it
  without a rewrite. Only VNG's adoption is in scope for this feature.
- **A-010**: With a leading GemeenteDelers stage plus the five currently authored phase values, the
  funnel has six stages today. The count is not fixed by this spec — it follows the live vocabulary
  (FR-002a) — so stage widths and dot layout must hold up for a stage count that changes.
- **A-009**: The funnel is read-only. Clicking a dot is not required by this feature; hover/focus
  detail is the interaction.
- **A-012**: Because dot placement is simulation-settled (FR-016a), exact dot positions are NOT
  reproducible between renders. Verification of the funnel must therefore assert structural
  properties — dot counts per stage, dot sizes, containment within stage bounds, absence of full
  occlusion — and must NOT assert exact pixel positions. Any pixel-level visual regression coverage
  must target the funnel's frame (stages, bounding bars, labels, ramp) rather than the dot layer.

## Out of Scope

- Colouring dots by classification, theme, activity or any dimension other than the Groei/GD source
  split.
- Editing, moving or reassigning an initiative's stage from the funnel.
- Real monetary or effort figures per stage, or any budget/time tracking.
- Historical or animated movement of initiatives through the funnel over time.
- Replacing or removing the existing growth-phase bar chart.
- Adding the funnel to the Explorer SPA.
- Exporting the funnel — as an image, as a data sheet, or as an addition to the dashboard's existing
  XLSX export (FR-031).

## Dependencies

- The dashboard's growth-phase classification must be configured and populated in Alkemio for the
  funnel to have stages beyond the GemeenteDelers stage.
- The initiative-to-gemeente participation data that drives dot size, and the classification values
  shown on hover, must be present in the loaded dataset.
