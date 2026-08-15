# Feature Specification: Usage Explorer — geographic initiative-usage view for the VNG dashboard

**Feature Branch**: `019-usage-explorer`  
**Created**: 2026-08-07  
**Status**: Draft  
**Input**: User description: "I want to add another tab to the VNG dashboard called usage explorer. It should show a map of NL, and on that map show the cities. The dots for cities should be sized so that there is a minimum + gray box for a city with no initiatives, and then getting bigger with more initiatives - taking the max number of initiatives into account. The ratio of smallest to largest city dot should be 3x in terms of size. The map should be zoomable, and selectable by province. The displayed area should then pick up the cities on that map, look at the initiatives in use by the cities in that map and show the initiatives in ranked order underneath the map - with the number of cities for each initiative after the name. The ultimate goal is to be able to zoom in on an area, and a particular city, and see what initiatives are in use by cities that are close by."

## Overview

The VNG dashboard today answers "which cities take part in this initiative?" (initiative-first) and "which initiatives does this city take part in?" (city-first, feature 018). Neither answers the *regional* question a VNG advisor actually asks before visiting a municipality: **"what are the neighbouring municipalities already using?"**

The Usage Explorer adds that geographic lens. A single map of the Netherlands shows every municipality as a dot whose size reflects how many initiatives it participates in — with municipalities that participate in none rendered distinctly so gaps in coverage are visible at a glance. The advisor zooms and pans, or jumps straight to a province, and the ranked list under the map re-computes to show exactly which initiatives are in use inside the currently visible area, and by how many municipalities.

## Clarifications

### Session 2026-08-07

- Q: Which municipalities appear on the map, and where do their positions come from? → A: All 342 Dutch gemeentes, positioned from location data looked up in Alkemio for every gemeente (not only participating ones), cached server-side.
- Q: How does initiative count map to dot size between the smallest and the 3× largest? → A: Linear in count, anchored — 1 initiative is always the smallest dot, the highest count in the current selection is 3× that.
- Q: Do markers keep a constant on-screen size while zooming, or grow with the map? → A: Constant on-screen size — zooming moves markers apart without resizing them.
- Q: When a province is selected, is the rest of the country hidden or still visible? → A: Reframe only, no masking — the map fits the province but neighbouring municipalities that fall in the viewport stay visible and are counted.
- Q: What does each ranked-list entry show beside the initiative name? → A: The count of visible municipalities using it, together with the share of the visible area — "5 of 12 in view".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See national initiative-usage coverage on a map (Priority: P1)

A VNG policy advisor opens the new **Usage Explorer** tab. A map of the Netherlands fills the upper part of the view, with one dot per Dutch municipality placed at its location. Municipalities that take part in at least one initiative are shown as dots sized in proportion to how many initiatives they participate in — the busiest municipality's dot is three times the size of the smallest participating municipality's dot. Municipalities that participate in no initiative at all are shown instead as a small grey square, so blank spots on the national map are immediately visible. Hovering any municipality identifies it by name and shows its initiative count.

**Why this priority**: The map alone already delivers the core insight — where initiative adoption is dense and where it is absent — and is a complete, demonstrable slice without the ranked list or the province selector.

**Independent Test**: Open the Usage Explorer tab with a selection active and confirm every Dutch municipality is represented exactly once, that dot size increases with initiative count within a 3× smallest-to-largest range, that zero-initiative municipalities render as grey squares, and that hovering reveals name and count matching the Cities view.

**Acceptance Scenarios**:

1. **Given** a selection is active, **When** the advisor opens the Usage Explorer tab, **Then** a map of the Netherlands is shown with one marker per Dutch municipality, each at its own geographic position.
2. **Given** the municipality with the most initiatives in the current selection participates in N initiatives, **When** the map renders, **Then** that municipality's dot is the largest, and its size is 3× the size of the dot used for a municipality with exactly one initiative.
3. **Given** a municipality participates in no initiative in the current selection, **When** the map renders, **Then** it is shown as a grey square distinguishable from the participating-city dots.
4. **Given** the map is shown, **When** the advisor hovers a municipality marker, **Then** its name and its number of initiatives are displayed.
5. **Given** every municipality in the current selection participates in exactly one initiative, **When** the map renders, **Then** all participating dots render at the smallest size and no marker is oversized or invisible.
6. **Given** the advisor changes the space selection or toggles which initiative sources are included, **When** the map refreshes, **Then** dot sizes and grey squares re-compute against the new maximum.
7. **Given** the highest count in the selection is 9, **When** a municipality with 5 initiatives renders, **Then** its dot size is half way between the smallest size and 3× that size.

---

### User Story 2 - Read which initiatives are in use in the visible area (Priority: P1)

Below the map the advisor sees a ranked list of initiatives. The list covers exactly the municipalities currently visible on the map: each entry shows the initiative's name followed by the number of visible municipalities using it, out of how many are in view, ordered from most-used to least-used. When the advisor zooms into a region or pans the map, the list re-computes for the new visible area, so it always answers "what is in use *here*". A count of how many municipalities the list is derived from is shown alongside it.

**Why this priority**: This is the other half of the stated goal — the map shows *where*, the list shows *what*. Together with US1 it forms the minimum viable feature.

**Independent Test**: Zoom the map to a region containing a known set of municipalities and confirm the list contains exactly the initiatives those municipalities participate in, each showing the number of those municipalities participating out of the number in view, sorted descending.

**Acceptance Scenarios**:

1. **Given** the map shows the whole Netherlands, **When** the list renders, **Then** it contains every initiative in the current selection that has at least one participating municipality, ranked by number of participating municipalities descending.
2. **Given** the advisor zooms into an area containing 12 municipalities, **When** the list re-computes, **Then** it lists only initiatives used by at least one of those 12, each with a count no greater than 12 shown as "N of 12 in view", and states that 12 municipalities are in view.
3. **Given** an initiative is used by 5 of the 12 visible municipalities, **When** the advisor zooms out so 40 municipalities are in view and 9 of them use it, **Then** the entry reads 9 of 40 rather than leaving the advisor to guess why the number changed.
4. **Given** two initiatives are used by the same number of visible municipalities, **When** the list renders, **Then** they are ordered deterministically (alphabetically by name) so the ranking is stable across renders.
5. **Given** the visible area contains no municipality that participates in any initiative, **When** the list renders, **Then** an explicit empty state explains that no initiatives are in use in the visible area.
6. **Given** the advisor pans the map without changing zoom, **When** the visible municipalities change, **Then** the list updates to match the new visible set.
7. **Given** the list is shown, **When** the advisor chooses an initiative from it, **Then** the initiative's existing detail view opens for that initiative.

---

### User Story 3 - Jump to a province (Priority: P2)

Rather than zooming manually, the advisor picks a province from a selector. The map reframes so that province fills the view — the rest of the country still drawn around it — and the ranked list immediately reflects the initiatives in use across everything now in view, that province's municipalities plus whichever near neighbours sit inside the frame. Returning to "all of the Netherlands" restores the national view.

**Why this priority**: A convenience over the manual zoom of US1/US2 — valuable for the common "brief a regional meeting" task, but the feature works without it.

**Independent Test**: Select a province and confirm the map reframes to fit it, that the visible set covers all of that province's municipalities (plus any neighbours that fall inside the resulting viewport), and that the ranked list matches the initiatives used by that visible set.

**Acceptance Scenarios**:

1. **Given** the map shows the whole Netherlands, **When** the advisor selects a province, **Then** the map reframes so that province fills the map area, with the surrounding country still drawn rather than masked out.
2. **Given** a province is selected, **When** the ranked list re-computes, **Then** its counts are derived from every municipality inside the resulting viewport — all of that province's, plus any neighbouring-province municipalities that fall within it.
3. **Given** a province is selected, **When** the advisor selects "all of the Netherlands", **Then** the map returns to the national view and the list re-computes nationally.
4. **Given** a province is selected, **When** the advisor then zooms or pans manually, **Then** the visible area and the list follow the new view rather than remaining locked to the province.
5. **Given** the map is zoomed into a province, **When** the advisor compares marker sizes with the national view, **Then** each marker is the same on-screen size in both views and only their spacing differs.

---

### User Story 4 - Focus one municipality and see its neighbourhood (Priority: P3)

The advisor zooms in on a single municipality of interest and selects it. Its own initiatives are called out — clearly separated from the surrounding-area ranking — so they can compare "what this municipality already uses" against "what its neighbours use". Clearing the focus returns to the plain visible-area view.

**Why this priority**: This completes the stated ultimate goal, but only makes sense once the map and the area ranking exist; the comparison can also be done visually without it.

**Independent Test**: Select a municipality on the map and confirm its own initiative list is shown distinctly, that the surrounding-area ranking is still present, and that clearing the selection restores the default view.

**Acceptance Scenarios**:

1. **Given** the map is zoomed to a region, **When** the advisor selects a municipality marker, **Then** that municipality is visually marked as focused and its own initiatives are listed separately from the area ranking.
2. **Given** a municipality is focused, **When** the advisor reads the area ranking, **Then** initiatives the focused municipality already uses are visually distinguished from those used only by neighbours.
3. **Given** a municipality with zero initiatives is focused, **When** its own list renders, **Then** an explicit "no initiatives" state is shown while the area ranking still lists what neighbours use.
4. **Given** a municipality is focused, **When** the advisor clears the focus, **Then** the focused styling and the per-municipality list are removed and the area ranking remains.
5. **Given** a municipality is focused, **When** the advisor opens it from the panel, **Then** the existing city detail view opens for that municipality.

---

### Edge Cases

- **No participating municipalities at all** (empty selection, or a selection whose initiatives have no municipality members): every municipality renders as a grey square and the ranked list shows its empty state rather than an error.
- **Single participating municipality**: the scale still anchors at 1, so the municipality renders at the smallest size if it has one initiative and at the largest if it has more.
- **Every participating municipality on exactly one initiative**: the range collapses; all render at the smallest size rather than all at the largest (FR-008b).
- **Municipality with no location in Alkemio**: it cannot be placed on the map; it is excluded from the map and from the visible-area ranking, and the view discloses how many municipalities were excluded for this reason.
- **Municipality present in the data but not in the reference list of Dutch municipalities** (e.g. a renamed or merged municipality): it is not shown on the map; the count of unplaced municipalities covers it.
- **Non-Dutch entry in the reference list** (an entry with no official municipality code): never placed on the NL map and never counted, even if it participates in initiatives.
- **Location lookup unavailable or partially failing**: the previously cached location set is used; if none exists, the view explains that the map cannot be drawn rather than showing an empty country.
- **Extreme zoom-out**: zooming further out than the national view does not add municipalities beyond the Dutch set, and the list stays at the national result.
- **Extreme zoom-in with nothing in view**: the visible-municipality count reads 0 and the list shows its empty state.
- **Dense clusters (Randstad)**: overlapping markers must remain individually hoverable and selectable — the largest dots must not permanently obscure smaller neighbours. Because markers keep a constant screen size, zooming in is the advisor's remedy: separation grows while the dots stay put.
- **Selection changes while a province or focused municipality is active**: the province framing and focus are preserved if still valid, and silently cleared if the focused municipality is no longer in the data.
- **Slow or failed dataset load**: the tab shows the dashboard's existing loading and error states rather than a blank map.

## Requirements *(mandatory)*

### Functional Requirements

**Tab and placement**

- **FR-001**: The VNG dashboard MUST offer an additional top-level tab labelled "Usage Explorer" (localised in both dashboard languages), alongside the existing tabs.
- **FR-002**: The Usage Explorer MUST operate on the same active space/initiative selection and the same include-source toggles as the other VNG dashboard tabs, and MUST re-compute when those change.
- **FR-003**: The Usage Explorer tab MUST be exclusive to the VNG dashboard and MUST NOT appear in the other dashboards unless explicitly enabled for them.

**Map and markers**

- **FR-004**: The view MUST render a map of the Netherlands occupying the upper portion of the tab, with a ranked initiative list beneath it.
- **FR-005**: The map MUST place one marker per Dutch municipality in the reference municipality list — all 342 gemeentes that carry an official municipality code — positioned at that municipality's location.
- **FR-005a**: Municipality locations MUST be obtained from Alkemio for **every** Dutch gemeente, including those that participate in no initiative and therefore never appear in the current selection's graph.
- **FR-005b**: The gemeente location set MUST be cached and reused across sessions and selections; it MUST NOT be re-fetched per selection change, per zoom, or per tab visit.
- **FR-005c**: Entries in the reference list that are not Dutch municipalities (no official municipality code) MUST NOT be placed on the NL map, and MUST NOT be counted in the visible-area totals.
- **FR-006**: A municipality participating in one or more initiatives in the current selection MUST be rendered as a circular dot; a municipality participating in none MUST be rendered as a grey square.
- **FR-007**: Dot size MUST vary **linearly with the municipality's initiative count**, anchored so that a count of exactly 1 always yields the smallest dot and the highest count among all municipalities in the current selection yields the largest.
- **FR-008**: The largest dot MUST be exactly 3× the size of the smallest participating-municipality dot; no participating dot may fall outside that range.
- **FR-008a**: A municipality whose count sits at a given fraction of the way from 1 to the selection's highest count MUST have a dot size at that same fraction of the way from the smallest size to 3× it.
- **FR-008b**: When the highest count in the current selection is 1, every participating municipality MUST render at the smallest dot size (no dot is enlarged for want of a range).
- **FR-009**: The grey square marking a zero-initiative municipality MUST be visually smaller than or equal to the smallest participating dot and MUST be distinguishable from it by both shape and colour.
- **FR-010**: Hovering a marker MUST reveal the municipality's name and its number of initiatives in the current selection.
- **FR-011**: Markers MUST be drawn so that smaller markers remain reachable for hover and selection when overlapped by larger ones.

**Zoom, pan and province selection**

- **FR-012**: The map MUST support zooming in and out and panning, with a control to reset to the full national view.
- **FR-013**: The map MUST offer a province selector listing all twelve Dutch provinces plus an "all of the Netherlands" option; choosing a province MUST reframe the map so that province fits the map area.
- **FR-013a**: Province selection MUST reframe only — the area outside the chosen province MUST NOT be masked or hidden, and municipalities of adjoining provinces that fall within the resulting viewport MUST remain visible and MUST be counted in the ranking.
- **FR-014**: After a province is chosen, manual zoom or pan MUST continue to work and the derived results MUST follow the resulting view rather than the province boundary.
- **FR-015**: Markers MUST keep a **constant on-screen size at every zoom level** — zooming changes only their separation, never their size — so the smallest-to-largest ratio is identical at every zoom and a size legend remains valid throughout.
- **FR-015a**: A size legend MUST be shown relating dot size to initiative count, including the grey zero-initiative marker, and MUST remain correct at every zoom level.

**Visible-area analysis**

- **FR-016**: The set of municipalities used for analysis MUST be exactly those whose markers fall within the currently displayed map area.
- **FR-017**: The view MUST display the number of municipalities currently in the visible area, and how many of those participate in at least one initiative.
- **FR-018**: The ranked list MUST contain every initiative used by at least one municipality in the visible area, and no others.
- **FR-019**: Each list entry MUST show the initiative's name followed by the number of visible municipalities using it.
- **FR-019a**: Each list entry MUST also express that number as a share of the visible area (e.g. "5 of 12 in view"), so the count stays interpretable as the visible area shrinks or grows.
- **FR-019b**: The denominator used for that share MUST be the **total number of municipalities in the visible area including those participating in no initiative** — so that low adoption in a well-covered area is visible — and MUST be identical across every entry in the list.
- **FR-020**: The list MUST be ordered by the number of visible municipalities using each initiative, descending, with ties broken alphabetically by initiative name.
- **FR-021**: The list MUST update whenever the visible area changes (zoom, pan, province choice, or reset).
- **FR-022**: When the visible area contains no participating municipality, the list MUST show an explicit empty state rather than an error or a blank area.
- **FR-023**: Choosing an initiative in the list MUST open that initiative's existing detail view.

**Municipality focus**

- **FR-024**: The advisor MUST be able to focus a single municipality by selecting its marker, and to clear that focus.
- **FR-025**: When a municipality is focused, the view MUST list that municipality's own initiatives separately from the visible-area ranking.
- **FR-026**: When a municipality is focused, initiatives in the area ranking that the focused municipality also uses MUST be visually distinguished from those used only by other municipalities in view.
- **FR-027**: The focused municipality MUST offer a route into the existing city detail view.

**Data integrity and resilience**

- **FR-028**: Each municipality MUST be counted at most once in any initiative's count, regardless of how many times it appears in the underlying data.
- **FR-029**: A municipality's initiative count in this view MUST match the count shown for the same municipality in the existing Cities view under the same selection.
- **FR-030**: Municipalities that cannot be placed on the map (no location available from Alkemio, or absent from the reference list) MUST be excluded from map and ranking, and their number MUST be disclosed in the view.
- **FR-030a**: A stale cached location set MUST still render the map; a failure to refresh locations MUST NOT blank the tab.
- **FR-031**: Missing optional data (unknown province, unknown population, missing initiative name) MUST NOT prevent the map or list from rendering.
- **FR-032**: The tab MUST reuse the dashboard's existing loading, empty-selection, and error presentations.

### Key Entities

- **Municipality marker**: one Dutch municipality as shown on the map — identity (name, official code), geographic position, province, and the number of distinct initiatives it participates in under the current selection. Drives marker shape (dot vs grey square) and size.
- **Gemeente location set**: the cached position of every Dutch gemeente known to Alkemio, independent of any selection. Refreshed on its own schedule, and the source of every marker's position.
- **Visible area**: the geographic extent currently displayed, whether reached by zoom, pan, or province selection. Determines which municipality markers are counted.
- **Area initiative ranking**: for the current visible area, the list of initiatives with, for each, the count of distinct visible municipalities participating, expressed against the total number of municipalities in view. Ordered by count then name.
- **Focused municipality**: the optional single municipality the advisor has selected, with its own initiative list used for comparison against the area ranking.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From opening the Usage Explorer tab, an advisor can identify the initiatives in use around a named municipality in under 30 seconds without leaving the tab.
- **SC-002**: All 342 Dutch municipalities in the reference list are represented on the national view — every one either as a sized dot or as a grey square — with any exclusions explicitly disclosed and numbering zero under normal conditions.
- **SC-003**: The largest and smallest participating-municipality markers differ in on-screen size by a factor of exactly 3, and each marker measures the same on screen at every zoom level.
- **SC-004**: Every initiative count in the ranked list matches an independent count of distinct participating municipalities within the visible area, for at least 10 sampled visible areas including all twelve provinces.
- **SC-005**: The ranked list reflects a zoom, pan, or province change within 1 second of the map settling, with no intermediate stale ranking shown as final.
- **SC-006**: The national view renders with all municipality markers within 3 seconds of the tab opening on an already-loaded selection.
- **SC-007**: Zooming and panning remain smooth (no perceptible stutter) with all municipalities rendered.
- **SC-008**: In usability checks, advisors correctly identify at least one municipality with zero initiative participation within 15 seconds of first seeing the national map.

## Assumptions

- **A-001**: "Cities" means Dutch municipalities (*gemeenten*) as already modelled by the VNG dashboard — the same reference set used by the existing Cities view, keyed by official municipality code.
- **A-002**: The map shows **all 342** Dutch municipalities, not only participating ones — this is what makes the grey zero-initiative marker meaningful and coverage gaps visible. The reference list holds 344 entries; the two without an official municipality code are not Dutch municipalities and are excluded (FR-005c).
- **A-003**: "The displayed area" means the map's current viewport after zoom/pan, not the selected province boundary. Province selection is a shortcut that sets the viewport; subsequent manual zoom overrides it. This follows directly from the stated goal of zooming into an area to see nearby usage — and is why a province view deliberately includes near neighbours across its border rather than masking them away (FR-013a).
- **A-004**: "3x in terms of size" is interpreted as marker diameter, giving a clear, directly measurable ratio between the smallest and largest dot. The scale between those endpoints is linear in initiative count and anchored at a count of 1, so the smallest dot always carries the same meaning regardless of selection.
- **A-005**: A municipality's initiative count and the initiative set both honour the dashboard's existing selection and include-source toggles (Groei / GemeenteDelers), so the Usage Explorer stays consistent with the other tabs.
- **A-006**: Province membership and population come from the reference data already committed for the existing city features. Municipality **locations** come from Alkemio, looked up once for all 342 gemeentes and cached — no new external data source and no hand-maintained coordinate file.
- **A-007**: Ranking is by number of participating municipalities only — no weighting by population or by initiative size. The share shown alongside each count is presentational context, not a second sort key.
- **A-008**: The feature is read-only analysis; nothing here creates, edits, or removes initiatives or municipalities.

## Dependencies

- The existing VNG dashboard selection model, include-source toggles, and initiative/city dataset (features 016 and 018).
- The reference Dutch municipality list with official codes, and per-municipality province and population data already used by the city views.
- Gemeente location data held in Alkemio for all 342 Dutch gemeentes, retrieved and cached independently of any space selection.
- The existing initiative detail and city detail views, which this tab links into.

## Out of Scope

- Population-weighted or per-capita views of initiative usage (feature 018 already covers population vs participation).
- Exporting the map or the ranked list as an image or file.
- Drive-time, adjacency, or radius-based "neighbour" definitions — proximity is expressed purely through what is visible on the map.
- Extending the Usage Explorer to the Explorer or GovTech dashboards.
- Any change to how initiative–municipality **relationships** are acquired or cached — the only new acquisition is the gemeente **location** set (FR-005a/b), which carries no relationship data.
