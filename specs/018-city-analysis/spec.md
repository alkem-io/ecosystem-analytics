# Feature Specification: City-perspective analysis for the VNG dashboard

**Feature Branch**: `018-city-analysis`  
**Created**: 2026-07-29  
**Status**: Draft  
**Input**: User description: "I want to add the ability to the VNG dashboard to analyze from a city perspective. At the moment there are two tabs that are focused on initaitives (single + plural), I want a similar setup for cities. There should also be another chart added to the dashboard page that should be a cross plot of the city population with number of initiatives they are a part of. There should already be data in the vault related to the population of each city."

## User Scenarios & Testing *(mandatory)*

Today the VNG dashboard answers "what is this initiative doing, and which cities take part in it?". Every view is initiative-first: one tab profiles a single initiative, another lists all initiatives as a table, and the dashboard charts count initiatives. A policy advisor at VNG also needs the mirror question — "what is this city involved in, and how does its involvement compare to other cities?" — which today can only be answered by scanning initiative rows one at a time.

This feature adds the city-first counterpart: a single-city profile view, an all-cities table view, and a dashboard chart relating a city's size to how many initiatives it joins.

### User Story 1 - Compare all cities side by side (Priority: P1)

A VNG policy advisor opens the dashboard, makes their usual selection of initiatives, and switches to a new **Cities** view. They see one row per city, with the number of initiatives that city participates in, its province, its population, and the classification profile (VNG-2030 / NDS categories, themes) of the initiatives it takes part in. They sort by initiative count to find the most and least engaged cities, filter by province to brief a regional meeting, and search for a specific city by name.

**Why this priority**: This is the single highest-value slice — it turns data that exists but is only reachable one initiative at a time into a directly comparable, sortable ranking of cities. It stands alone without any other part of this feature.

**Independent Test**: With a selection of initiatives active, open the Cities view and confirm every city connected to that selection appears exactly once, with an initiative count that matches what the Initiatives table shows for the same city, and that sorting, filtering, and search narrow the list correctly.

**Acceptance Scenarios**:

1. **Given** a selection containing initiatives that together involve 40 distinct cities, **When** the advisor opens the Cities view, **Then** 40 rows are shown, each city appearing once, with a visible total count of listed cities.
2. **Given** the Cities view is open, **When** the advisor sorts by number of initiatives descending, **Then** the city participating in the most initiatives appears first.
3. **Given** the Cities view is open, **When** the advisor filters by a province, **Then** only cities in that province remain and the displayed count updates.
4. **Given** a city takes part in three initiatives, **When** the advisor inspects that city's row, **Then** the initiative count reads 3 and the names of those three initiatives are reachable from the row without leaving the view.
5. **Given** the advisor types part of a city name into the search box, **When** the search is applied, **Then** only matching cities remain.
6. **Given** the "include GemeenteDelers initiatives" option is toggled on, **When** the Cities view refreshes, **Then** city initiative counts include GemeenteDelers initiatives and the row's initiative list distinguishes them from Groei initiatives.

---

### User Story 2 - Profile a single city (Priority: P2)

The advisor picks one city from a picker and sees that city's profile on its own tab: its name and identifying details (province, population), its location on the map, and the list of initiatives it participates in — each with the classifications already shown elsewhere for initiatives. This mirrors the existing single-initiative view, but from the city's side.

**Why this priority**: Valuable, but only after the comparison view exists — an advisor typically finds an interesting city in the table first, then drills in. Independently useful for briefing a specific municipality.

**Independent Test**: Open the city profile view, select a city from the picker, and confirm the shown population, province, map position, and initiative list match that city's row in the Cities table.

**Acceptance Scenarios**:

1. **Given** the city profile view is open with no city chosen, **When** it loads, **Then** the first city (alphabetically) in the current selection is shown by default.
2. **Given** a city is shown, **When** the advisor inspects the profile, **Then** the city's population and province are displayed, or an explicit "unknown" indicator where that data is absent.
3. **Given** a city is shown, **When** the advisor looks at the map, **Then** the city's location is marked and identifiable.
4. **Given** a city participates in five initiatives, **When** its profile is shown, **Then** all five initiatives are listed with their names and classifications.
5. **Given** the advisor is looking at a city in the Cities table, **When** they choose that city, **Then** the city profile view opens with that city selected.
6. **Given** the advisor is viewing an initiative's list of participating cities, **When** they choose one of those cities, **Then** the city profile view opens with that city selected.

---

### User Story 3 - See whether city size predicts participation (Priority: P3)

On the Dashboard tab the advisor finds an additional chart plotting each city's population against the number of initiatives it participates in — one point per city. Hovering a point identifies the city with both values. The advisor uses it to spot large cities with low participation (outreach targets) and small cities punching above their weight (success stories).

**Why this priority**: A distinct analytical insight, but it depends on the same city-to-initiative relationship as US1 and adds a single chart rather than a new workflow.

**Independent Test**: Open the Dashboard tab with a selection active and confirm the chart renders one point per city with known population, positioned according to that city's population and initiative count, matching the values in the Cities table.

**Acceptance Scenarios**:

1. **Given** a selection is active, **When** the Dashboard tab loads, **Then** a population-versus-initiative-count chart is displayed alongside the existing charts.
2. **Given** the chart is displayed, **When** the advisor hovers or focuses a point, **Then** the city name, its population, and its initiative count are shown.
3. **Given** some cities have no known population, **When** the chart renders, **Then** those cities are omitted from the plot and the number omitted is stated near the chart.
4. **Given** city populations span three orders of magnitude, **When** the chart renders, **Then** small and large cities are both distinguishable rather than collapsing into a single cluster.
5. **Given** the advisor exports the dashboard, **When** the export completes, **Then** it includes the per-city population and initiative-count values alongside the existing chart data.

---

### Edge Cases

- **City with no population data** (e.g. non-Dutch municipalities in the registry): listed in the city views with an explicit "unknown" marker; excluded from the population chart, with the excluded count stated.
- **City participating in zero initiatives**: only cities connected to at least one initiative in the current selection are listed in the table and profile views (see Assumptions); the chart additionally plots non-participating Dutch municipalities at zero initiatives so outreach gaps are visible.
- **Empty selection**: the city views show the same "nothing selected" message as the existing tabs, not an empty table.
- **Selection still loading**: the city views show the same progress feedback (which initiative is being fetched) as the existing tabs, rather than an empty state that looks broken.
- **Two cities with the same display name**: each remains a separate row; the row carries enough detail (province) to tell them apart.
- **A city connected to an initiative that is later deselected**: the city disappears from the city table/profile views on the next refresh, and its counts drop accordingly.
- **Very large city sets** (hundreds of cities across a broad selection): the table stays scrollable and responsive, and the chart remains legible.
- **Filters combined so that nothing matches**: an explicit "no results" message, consistent with the Initiatives table.

## Requirements *(mandatory)*

### Functional Requirements

**City data model**

- **FR-001**: The system MUST derive a city-perspective dataset from the same selection that drives the existing initiative views, so both perspectives always describe the same underlying data.
- **FR-002**: The system MUST list each city exactly once, regardless of how many initiatives it participates in.
- **FR-003**: For each city the system MUST provide: name, province, population, the number of initiatives it participates in, and the identity of those initiatives.
- **FR-004**: The system MUST source city population from the existing stored municipality reference data and MUST NOT require the user to supply it.
- **FR-005**: The system MUST represent an unavailable population as an explicit "unknown" value rather than zero.
- **FR-006**: The city dataset MUST respect the "include GemeenteDelers initiatives" option: when on, GemeenteDelers initiatives count towards a city's participation; when off, they do not.

**Cities table view (US1)**

- **FR-007**: Users MUST be able to open a Cities view listing all cities in the current selection, as a peer of the existing Initiatives view.
- **FR-008**: The Cities view MUST show, per city: name, province, population, number of initiatives, and the aggregated classification values (VNG-2030, NDS, themes) of the initiatives that city participates in.
- **FR-009**: Users MUST be able to sort the Cities view by any of its columns, ascending and descending.
- **FR-010**: Users MUST be able to filter the Cities view by province and by classification values, with each filter option showing how many cities it matches.
- **FR-011**: Users MUST be able to free-text search the Cities view by city name.
- **FR-012**: The Cities view MUST display the number of cities currently listed after filters and search are applied.
- **FR-013**: Users MUST be able to see the names of the initiatives behind a city's initiative count without leaving the Cities view.

**City profile view (US2)**

- **FR-014**: Users MUST be able to open a City information view showing one city at a time, as a peer of the existing single-initiative view.
- **FR-015**: The City information view MUST provide a picker listing every city in the current selection, each labelled with its number of initiatives.
- **FR-016**: The City information view MUST show the selected city's population, province, and location on a map.
- **FR-017**: The City information view MUST list every initiative the selected city participates in, with each initiative's classifications, and MUST distinguish Groei from GemeenteDelers initiatives.
- **FR-018**: Selecting a city from the Cities view MUST open the City information view with that city selected.
- **FR-019**: Selecting a city from an initiative's list of participating cities MUST open the City information view with that city selected.

**Dashboard chart (US3)**

- **FR-020**: The Dashboard MUST include a chart plotting one point per city, positioned by that city's population and its number of initiatives.
- **FR-021**: The chart MUST plot both participating cities and Dutch municipalities with no participation in the current selection (at zero initiatives), and MUST visually distinguish the two groups.
- **FR-022**: The chart MUST identify a city, its population, and its initiative count on hover and on keyboard focus.
- **FR-023**: The chart MUST exclude cities with unknown population and MUST state how many cities were excluded.
- **FR-024**: The chart MUST remain legible when city populations differ by orders of magnitude.
- **FR-025**: The dashboard export MUST include the city population and initiative-count data behind the chart, consistent with how existing charts are exported.

**Consistency with the existing dashboard**

- **FR-026**: The new views MUST use the same shared selection panel, loading feedback, empty states, and error handling as the existing tabs — no separate selection mechanism.
- **FR-027**: All new user-facing text MUST be available in the dashboard's supported languages, consistent with existing views.
- **FR-028**: A city's initiative count shown in any view MUST equal the count shown for the same city in every other view for the same selection.

### Key Entities

- **City**: A municipality participating in the ecosystem. Attributes: display name, province, population (may be unknown), country. Already present in the data as a municipality organisation; this feature promotes it to a first-class analysis subject.
- **Initiative**: An existing entity (Groei initiative or GemeenteDelers initiative) carrying classifications (VNG-2030, NDS, themes, awards) and, for Groei initiatives, activity signals.
- **City participation**: The relationship between a City and an Initiative — the city takes part in that initiative. Drives every count in this feature.
- **Population reference data**: Stored per-municipality population figures already held alongside province data; read-only input to this feature, and the source of the full municipality list used for the chart's non-participating points.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An advisor can identify the five cities participating in the most initiatives within 15 seconds of opening the dashboard with a selection already active, without leaving a single view.
- **SC-002**: An advisor can produce the full list of initiatives a named city participates in within 30 seconds, versus scanning every initiative row today.
- **SC-003**: 100% of cities connected to the current selection appear exactly once in the Cities view, and their initiative counts match the initiative-side data for the same selection.
- **SC-004**: The Cities view and City information view become usable no later than the existing Initiatives view for the same selection (no additional wait introduced).
- **SC-005**: The population chart renders one point per city with a known population, and states the number of cities excluded for unknown population, so no city is silently dropped.
- **SC-006**: 90% of first-time users, given the task "find a large city with few initiatives", complete it using the new chart without guidance.

## Assumptions

- **"City" means the Dutch municipalities (gemeenten) already present in the ecosystem data.** No new geographic entity type is introduced.
- **The city table and city profile views are derived from the current selection**, exactly like the Initiatives views: only cities connected to at least one initiative in the effective selection are listed. The dashboard chart deliberately goes wider, adding non-participating municipalities at zero (FR-021), because "which large city is missing?" is the question that chart exists to answer.
- **Population data is available** in the stored municipality reference data used by the existing province and map features; no new data source or import is needed. Cities outside the Netherlands in the registry have no population and are treated as "unknown".
- **The two new views sit alongside the existing four tabs**, following the same naming pattern (a singular "City information" view and a plural "Cities" view), bringing the tab bar to six views.
- **Classification values shown per city are the union** of the classifications of the initiatives that city participates in (a city is "involved in" a category if any of its initiatives carries it).
- **The feature is scoped to the VNG dashboard.** Because the views are built in the shared dashboard code, other dashboards may inherit them, but only VNG's behaviour is specified and verified here.
- **No new activity metrics per city** (e.g. city-level activity tiers) are introduced; activity remains an initiative-level signal.
- **Population figures are point-in-time reference values**; no time series or historical population comparison is in scope.

## Out of Scope

- Editing or supplying population data through the UI.
- City-level activity tiers or per-city activity scoring.
- Comparing cities across two different selections simultaneously.
- Cross-country city analysis (non-Dutch municipalities are listed but carry no population).
- Changes to the graph visualisation.
