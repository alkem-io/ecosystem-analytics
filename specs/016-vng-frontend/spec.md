# Feature Specification: VNG Kenniscentrum Innovatie Frontend

**Feature Branch**: `016-vng-frontend`
**Created**: 2026-06-19
**Status**: Draft
**Input**: User description: "I want to create a second front end, dedicated to VNG Kenniscentrum innovatie. It should use the same server for providing data, and should share a lot of its architecture with the current front end. Both should be runnable at the same time, and share the same authentication context - but accessible via different ports / urls etc. The VNG front end should be much simpler than the current front end. It should have tabs at the top a) displaying the graph like the main graph now b) displaying the details of a particular space, plus c) a dashboard showing plots/charts related to the selected spaces. The only map needed is Netherlands. In addition to being able to select spaces, there should be the ability to select an innovation hub, and then to use the spaces listed in that innovation hub for the graph. The spaces selected should be listed somewhere on the UI, and derived from a combination of the InnovationHub and direct selection of other spaces. There should be a default InnovationHub that is set, but the user should be free to change it."

> **Working name**: "VNG frontend". This experience is built for **VNG Kenniscentrum Innovatie** (the knowledge centre for innovation of the Association of Netherlands Municipalities).

## Clarifications

### Session 2026-06-19

- Q: How will the VNG frontend be served so it shares the existing session cookie with the current frontend? → A: As a sibling under one parent domain (different subdomains, e.g. `app.<domain>` and `vng.<domain>`), with the session cookie scoped to the shared parent domain and the new origin added to the backend's allowed-origins.
- Q: Which innovation hubs can a VNG user choose from when switching the active hub? → A: All innovation hubs the platform exposes to the signed-in user.
- Q: Where should the mapping from a space's raw tags to the NDS / VNG-2030 categories be defined and maintained? → A: In server-side configuration (`analytics.yml`), operator-maintained, changeable without code changes; the backend returns the categorised counts.
- Q: In the Space details tab, how does the user choose which space to view? → A: Both — clicking a node in the Graph tab opens that space's details, and the Space details tab itself provides a dedicated picker to select any space from the selected set.
- Q: How should the VNG dashboard obtain the set of ~342 gemeente nameIDs? → A: A build-time generated snapshot of nameIDs/slugs exported from the `vng-gemeente-delers` repo (`vault/municipalities/`), committed into ecosystem-analytics and refreshable; gemeente organisations are recognised by matching this list.
- Q: What should the "show / hide gemeentes" toggle affect? → A: Both the graph and the dashboard — hiding gemeentes removes the gemeente organisation nodes from the graph and excludes them from the dashboard charts, consistently.
- Q: Which languages must the VNG dashboard support? → A: Dutch (default) and English, with a language switcher.
- Q: How are a GD initiative's gemeente/theme links recovered, given they survive into Alkemio only as Callout tag strings? → A: The server parses each Callout's tags and resolves them against the build-time snapshot registry (municipality display-name → `gemeente-<name>` organisation nameID; theme label → theme identity), creating one canonical node per gemeente/theme.
- Q: What identifies the gemeentedelers space? → A: Its **nameID**, supplied via server configuration (`analytics.yml`).
- Q: How long may GD initiative data be cached? → A: Longer than the standard 24h space cache — configurable, default ~1 week — as the GD corpus is archival.
- Q: How is the design-fidelity principle (Principle VI) satisfied for the new VNG surface? → A: For now the VNG app reuses the **existing Alkemio branding and design system/tokens** (the 001 design-brief token system already in use); a VNG-specific visual identity is a deferred future enhancement. The app is still **labelled** "VNG Kenniscentrum Innovatie" in text.
- Q: What should the dashboard charts count — selected spaces or GemeenteDelers initiatives? → A: **Data-source aware** — when the GemeenteDelers initiative layer is active, the charts count GD initiatives grouped by category; otherwise each selected space counts as one initiative. The chart indicates which source is active.
- Q: What bounds a very large hub? → A: The existing server `max_spaces_per_query` limit is reused as the cap.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Explore an innovation hub's ecosystem on the graph (Priority: P1)

A VNG Kenniscentrum Innovatie staff member opens the VNG experience and is presented with a network graph of the spaces belonging to a default innovation hub, laid out over a map of the Netherlands. They can switch to a different innovation hub, and the graph and selected-space list update to reflect the spaces of the newly chosen hub.

**Why this priority**: This is the core value of the VNG experience and the minimum that delivers something useful. Without hub-driven graph display there is no reason for a separate, simpler frontend. It is the foundation every other story builds on (selected-space list, details, dashboard).

**Independent Test**: Sign in, confirm the default innovation hub's spaces load into the graph over the Netherlands map, switch to another hub, and confirm the graph and selected-space list update accordingly.

**Acceptance Scenarios**:

1. **Given** an authenticated VNG user opens the experience for the first time, **When** the page loads, **Then** the spaces of the configured default innovation hub are loaded and rendered as a network graph positioned over a map of the Netherlands.
2. **Given** the graph is displayed for the default hub, **When** the user selects a different innovation hub, **Then** the graph re-renders using the spaces belonging to the newly selected hub and the selected-space list updates to match.
3. **Given** an innovation hub is selected, **When** the user views the interface, **Then** the list of spaces currently feeding the graph is visible somewhere on the screen.
4. **Given** a chosen innovation hub contains no listable spaces, **When** the graph attempts to load, **Then** the user sees a clear empty-state message rather than a broken or blank graph.

---

### User Story 2 - Refine the space set with direct selection (Priority: P2)

Beyond the spaces inherited from the chosen innovation hub, the user can add or remove individual spaces. The effective set of "selected spaces" is the combination of the hub's spaces and the user's direct additions, and that combined set drives the graph, the details tab, and the dashboard.

**Why this priority**: Hubs give a curated starting point, but analysts frequently need to add a space the hub omits or focus on a subset. This makes the tool flexible without complicating the default flow. It depends on US1 but materially increases usefulness.

**Independent Test**: With a hub selected, add one extra space and remove one hub space; confirm the selected-space list, the graph, and the dashboard all reflect the combined set.

**Acceptance Scenarios**:

1. **Given** an innovation hub is selected, **When** the user adds a space directly, **Then** the space appears in the selected-space list and is included in the graph.
2. **Given** the combined set includes hub spaces and directly added spaces, **When** the user removes a space, **Then** it is excluded from the selected-space list, graph, and dashboard.
3. **Given** the user has made direct additions, **When** they switch to a different innovation hub, **Then** the selected-space list recomputes from the new hub combined with the user's still-applicable direct selections, and the result is clearly indicated.
4. **Given** the selected-space list, **When** the user inspects it, **Then** each space is identifiable (name) and it is clear which spaces came from the hub versus direct selection.

---

### User Story 3 - View the dashboard of charts for the selected spaces (Priority: P2)

The user opens the dashboard tab and sees a set of charts summarising the currently selected spaces — for example, counts of initiatives grouped by category (such as NDS categories and VNG-2030 themes, as illustrated in the reference image). The charts update when the selected-space set changes.

**Why this priority**: The dashboard is a distinct, high-value deliverable that turns the raw network into management-level insight for VNG. It is independent of the graph rendering but shares the same selected-space set, so it is built on US1/US2.

**Independent Test**: With a set of spaces selected, open the dashboard tab and confirm the charts render with values derived from those spaces; change the selection and confirm the charts update.

**Acceptance Scenarios**:

1. **Given** spaces are selected, **When** the user opens the dashboard tab, **Then** charts summarising those spaces are displayed.
2. **Given** the dashboard is displayed, **When** the selected-space set changes, **Then** the charts recompute to reflect the new set.
3. **Given** a category dimension has categories with zero matching items, **When** the chart renders, **Then** empty categories are handled gracefully (shown as zero or omitted) without breaking the chart.
4. **Given** the underlying data needed for a chart is unavailable for some spaces, **When** the dashboard renders, **Then** the chart still displays for the spaces that do have data and indicates that some data is missing rather than failing.

---

### User Story 4 - Inspect the details of a particular space (Priority: P3)

The user opens the space-details tab to see detailed information about a single chosen space (its profile, location, key statistics, and relationships).

**Why this priority**: Useful drill-down, but secondary to seeing the ecosystem and the summary dashboard. Reuses information the platform already exposes for a space.

**Independent Test**: Select a space and open the details tab; confirm the space's detailed information is shown.

**Acceptance Scenarios**:

1. **Given** a set of selected spaces, **When** the user opens the details tab and chooses a space from its picker, **Then** the detailed information for that space is displayed.
2. **Given** the Graph tab is shown, **When** the user clicks a space node, **Then** the Space details tab opens showing that space's details.
3. **Given** a space is missing optional information (e.g. no banner, no location), **When** its details are shown, **Then** the view degrades gracefully and shows the available fields without errors.

---

### User Story 6 - Understand the VNG branding and data-access caveat (Priority: P2)

When the user opens the VNG experience it is clearly branded as a custom dashboard for VNG Kenniscentrum Innovatie, so there is no doubt about whose tool it is. The user is also clearly warned that they only see ecosystem data they are authorised to access — so if the data looks sparse, they should check their permissions on the underlying spaces.

**Why this priority**: Branding establishes trust and identity for the dedicated audience, and the authorisation warning prevents users from misreading an access-limited view as "missing data" or a broken tool. Both are cheap to add and reduce confusion and support load, but neither blocks the core hub→graph→dashboard workflow.

**Independent Test**: Open the experience and confirm the VNG Kenniscentrum Innovatie branding is visible, and that a clearly styled warning explains that only authorised data is shown and to check space permissions if data is limited.

**Acceptance Scenarios**:

1. **Given** the VNG experience loads, **When** the user views any tab, **Then** branding identifying it as a custom dashboard for VNG Kenniscentrum Innovatie is visible.
2. **Given** the user is viewing ecosystem data, **When** they look at the interface, **Then** a clearly styled warning notice explains that they only see data they are authorised to access and advises checking their authorisation on the underlying spaces if data appears limited.
3. **Given** the warning notice, **When** the user reads it, **Then** it is presented in a recognisably "warning" style (distinct from ordinary informational text) so it draws attention.

---

### User Story 5 - Run both frontends side by side under one sign-in (Priority: P1)

An operator runs the existing (current) frontend and the new VNG frontend at the same time against the same backend, each reachable at its own URL/port. A user who has signed in is recognised across both experiences without signing in again.

**Why this priority**: An explicit requirement and a hard constraint on the architecture. If the two frontends cannot coexist or share the sign-in context, the feature fails its primary integration goal. It is foundational and must hold from the first deployable slice.

**Independent Test**: Start the backend, the current frontend, and the VNG frontend together; sign in on one and confirm the other recognises the session; confirm each frontend is reachable at its own address.

**Acceptance Scenarios**:

1. **Given** the backend is running, **When** both the current frontend and the VNG frontend are started, **Then** each is reachable at its own distinct URL/port without conflicting with the other.
2. **Given** a user has an active authenticated session, **When** they open the other frontend, **Then** they are treated as signed in without repeating the sign-in flow.
3. **Given** a user signs out from one frontend, **When** they return to the other, **Then** the session is no longer valid there either.
4. **Given** both frontends are running, **When** either requests data, **Then** both retrieve their data from the same backend.

---

### User Story 7 - See which spaces an organisation connects to (Priority: P2)

The user clicks an organisation in the graph and can see which spaces in the current graph that organisation is connected to (and navigate to them).

**Why this priority**: Organisations — especially the gemeentes — are the connective tissue of the VNG ecosystem. Seeing an organisation's reach across spaces is a primary analytical question for VNG and directly extends the graph's value. It builds on US1 (the graph exists).

**Independent Test**: Click an organisation node and confirm its connected spaces in the current graph are clearly listed/highlighted and can be opened.

**Acceptance Scenarios**:

1. **Given** the graph is displayed, **When** the user clicks an organisation node, **Then** the spaces in the current graph that the organisation is connected to are clearly indicated (listed and/or highlighted).
2. **Given** an organisation's connected spaces are shown, **When** the user selects one, **Then** they can open that space's details.
3. **Given** an organisation has no connections within the current graph, **When** it is clicked, **Then** the interface clearly states it has no connected spaces in the current selection rather than appearing broken.

---

### User Story 8 - Show or hide gemeentes (Dutch municipalities) (Priority: P3)

The experience is aware of the set of Dutch municipalities (gemeentes) published on the platform. The user can toggle whether gemeentes are shown, which consistently affects both the graph and the dashboard.

**Why this priority**: Gemeentes are numerous (~342) and can dominate the view; being able to hide them lets users focus on other actors, and showing them restores the full municipal picture. Valuable but secondary to the core hub→graph→dashboard flow.

**Independent Test**: With gemeentes present, toggle "hide gemeentes" and confirm gemeente organisation nodes disappear from the graph and are excluded from the dashboard counts; toggle back and confirm they return.

**Acceptance Scenarios**:

1. **Given** the selected set includes gemeente organisations, **When** the user turns off "show gemeentes", **Then** gemeente nodes are removed from the graph and excluded from the dashboard charts.
2. **Given** gemeentes are hidden, **When** the user turns "show gemeentes" back on, **Then** gemeentes reappear in both the graph and the dashboard.
3. **Given** the experience loads, **When** it identifies gemeentes, **Then** it does so using the known set of gemeente identities derived from the `vng-gemeente-delers` source, with no false-positive non-gemeente organisations flagged.

---

### User Story 9 - Use the dashboard in Dutch (Priority: P2)

A Dutch-speaking VNG user sees the entire experience in Dutch by default, and can switch to English. All interface labels — including chart titles and category names — are localised.

**Why this priority**: The audience is Dutch municipal staff and the reference charts are in Dutch; a Dutch-first interface is essential for adoption, with English available for non-Dutch stakeholders.

**Independent Test**: Load the experience and confirm it appears in Dutch by default; switch to English and confirm labels (including chart titles) change; switch back to Dutch.

**Acceptance Scenarios**:

1. **Given** a new user opens the experience, **When** it loads, **Then** all interface text is presented in Dutch by default.
2. **Given** the experience is in Dutch, **When** the user switches language to English, **Then** all interface labels, navigation, and chart titles update to English.
3. **Given** a chart with category axes (e.g. NDS, VNG-2030), **When** the language changes, **Then** the category labels are shown in the selected language.

---

### User Story 10 - Fold GemeenteDelers initiatives into the graph (Priority: P2)

The user can turn on an **"include GemeenteDelers initiatives"** option on the graph. When enabled, the GemeenteDelers (GD) initiatives — published as posts in the Knowledge Base of the "gemeentedelers" space (~305 of them) — are folded into the main graph as additional nodes and edges. Because many GD initiatives reference themes and gemeentes, each initiative is connected to the **same** organisation nodes already in the graph (e.g. the gemeente organisations) and to theme nodes, so the initiative layer enriches rather than duplicates the existing ecosystem.

**Why this priority**: The GD initiatives are a core dataset for VNG Kenniscentrum Innovatie — they are the concrete municipal innovations the whole tool exists to illuminate. Connecting them to the gemeentes and themes already in the graph turns the network into a genuine map of "who is doing what, where". It is additive to the base graph (US1) and can be toggled off, so it is high-value but not required for the first slice.

**Independent Test**: With a graph displayed, enable "include GemeenteDelers initiatives"; confirm initiative nodes appear, each linked to the gemeente organisation(s) and theme(s) it references, reusing existing gemeente nodes rather than creating duplicates; disable it and confirm the initiative layer is removed.

**Acceptance Scenarios**:

1. **Given** a graph is displayed, **When** the user enables "include GemeenteDelers initiatives", **Then** the GD initiatives from the gemeentedelers space's Knowledge Base are added to the graph as nodes.
2. **Given** GD initiatives are included, **When** an initiative references one or more gemeentes, **Then** it is connected to the existing gemeente organisation node(s) in the graph (not to newly duplicated gemeente nodes).
3. **Given** GD initiatives are included, **When** an initiative references one or more themes, **Then** it is connected to the corresponding theme node(s), which are added to the graph if not already present.
4. **Given** GD initiatives are included, **When** the user disables the option, **Then** the initiative nodes and their edges are removed and the base space graph remains intact.
5. **Given** an initiative references a gemeente or theme that is not currently in the graph, **When** it is folded in, **Then** the experience handles it predictably (per the resolved approach) without errors or duplicate-identity nodes.
6. **Given** the gemeentedelers space or its Knowledge Base cannot be read, **When** the user enables the option, **Then** a clear non-fatal message is shown and the base graph remains usable.
7. **Given** the initiative layer is available, **When** the user views it, **Then** a short provenance note explains the GemeenteDelers programme (2021–2025, ~305 initiatives, source vng.nl/praktijkvoorbeelden).

---

### Edge Cases

- **No default hub configured / default hub unavailable**: The experience must still load and let the user choose a hub or select spaces directly, with a clear message.
- **Hub lists spaces the user cannot access**: Spaces the signed-in user is not permitted to see must be excluded or clearly marked, never exposing restricted content.
- **Empty selection**: If the combined selected-space set is empty, the graph, details, and dashboard each show an empty state rather than errors.
- **Large hubs**: A hub listing more spaces than the server `max_spaces_per_query` limit must be capped to that limit, remain usable (responsive list, graph, and dashboard), and clearly communicate that the set was truncated.
- **Session expiry mid-use**: If the shared session expires while the VNG frontend is open, the user is prompted to re-authenticate and returns to where they were.
- **Hub changed while direct selections exist**: The combined set must recompute predictably and the provenance (hub vs direct) must stay clear.
- **Dashboard category data missing**: Spaces lacking the classification a chart needs must not break the dashboard.
- **Organisation with no in-graph connections**: Clicking such an organisation must clearly state it has no connected spaces in the current selection.
- **Gemeente snapshot drift**: If a gemeente exists on the platform but is missing from the snapshot (or vice versa), the toggle simply acts on the known set; the experience must not error, and the snapshot can be refreshed to reconcile.
- **Empty selection while gemeentes hidden**: If hiding gemeentes empties the visible graph/dashboard, an empty state must be shown (with a hint that gemeentes are hidden).
- **Missing translation string**: If a label lacks a translation in the active language, a sensible fallback (the other language or a readable key) must be shown rather than a blank or raw identifier.
- **GD initiative with unresolved references**: An initiative whose gemeente/theme reference cannot be matched must still appear (connected to what can be resolved) without creating duplicate-identity nodes or erroring.
- **GD layer with gemeentes hidden**: If gemeentes are hidden while initiatives are shown, initiative–gemeente edges to hidden nodes must be handled cleanly (edge hidden with its endpoint), with no dangling edges.
- **gemeentedelers space unavailable**: Enabling the initiative layer when the space/Knowledge Base is unreadable must show a non-fatal message and keep the base graph usable.

## Requirements *(mandatory)*

### Functional Requirements

#### Coexistence, shared backend & authentication

- **FR-001**: The VNG experience MUST obtain all of its data from the same backend that serves the current frontend; it MUST NOT contact the underlying ecosystem platform directly.
- **FR-002**: The VNG experience and the current frontend MUST be runnable simultaneously, each reachable at its own distinct URL/port (in production, served as sibling subdomains under one shared parent domain, e.g. `app.<domain>` and `vng.<domain>`).
- **FR-003**: The two frontends MUST share a single authentication context, so that a user authenticated for one is recognised by the other without re-authenticating, and a sign-out in one invalidates the session for both. The session cookie MUST be scoped to the shared parent domain, and the VNG origin MUST be included in the backend's allowed-origins, so the same session applies across both subdomains.
- **FR-004**: The VNG experience MUST require the same authenticated sign-in as the current frontend before showing any ecosystem data.
- **FR-005**: The VNG experience SHOULD reuse the existing architecture and shared building blocks of the current frontend wherever practical, rather than duplicating them, to keep the two experiences consistent and maintainable.

#### Navigation & layout

- **FR-006**: The VNG experience MUST present a top-level tabbed layout with three tabs: a **Graph** tab, a **Space details** tab, and a **Dashboard** tab.
- **FR-007**: The VNG experience MUST be visually and functionally simpler than the current frontend, exposing only the controls needed for the VNG workflow.
- **FR-008**: The currently selected set of spaces MUST be visible within the interface (a persistent list or panel) regardless of which tab is active.

#### Innovation hub & space selection

- **FR-009**: The VNG experience MUST allow the user to select an innovation hub from **all innovation hubs the platform exposes to the signed-in user**, and MUST use the spaces listed by the chosen hub as input to the graph, details, and dashboard.
- **FR-010**: The system MUST apply a configurable **default innovation hub** on first load, while allowing the user to change the active hub at any time.
- **FR-011**: The user MUST be able to directly add and remove individual spaces in addition to those provided by the selected hub.
- **FR-012**: The effective "selected spaces" set MUST be the combination of the active hub's spaces and the user's direct selections, and this combined set MUST drive the graph, details, and dashboard consistently.
- **FR-013**: The selected-space list MUST make it clear which spaces originate from the hub and which were added directly.
- **FR-014**: The system MUST only include spaces the signed-in user is authorised to view; spaces the hub lists but the user cannot access MUST be excluded or clearly marked, never exposing restricted content.

#### Graph tab

- **FR-015**: The Graph tab MUST render the selected spaces as a network graph equivalent in behaviour to the current frontend's main graph (nodes, relationships, interaction). Clicking a space node MUST open that space in the Space details tab.
- **FR-016**: The Graph tab MUST display the network over a map of the Netherlands; no other map regions are required in this experience.
- **FR-017**: When the selected-space set is empty or fails to produce a graph, the Graph tab MUST show a clear empty/error state rather than a blank or broken view.

#### Space details tab

- **FR-018**: The Space details tab MUST let the user view detailed information for a single chosen space drawn from the selected set, including the information the platform already exposes for a space (profile, location, key statistics, relationships). The space may be chosen **either** by clicking its node in the Graph tab **or** via a dedicated space picker within the Space details tab itself (selecting any space from the selected set).
- **FR-019**: The details view MUST degrade gracefully when optional fields are missing, showing available information without errors.

#### Dashboard tab

- **FR-020**: The Dashboard tab MUST display charts summarising the currently selected spaces, recomputing whenever the selected-space set changes.
- **FR-021**: The dashboard MUST include bar-chart style breakdowns of counts grouped by category, following the reference image (initiatives grouped by NDS categories, and counts grouped by VNG-2030 themes). Each chart MUST indicate which data source the counts are based on (see FR-022).
- **FR-022**: The dashboard counting unit is **data-source aware**:
  - When the **GemeenteDelers initiative layer is active**, each chart counts **GD initiatives** grouped by category.
  - Otherwise, each **selected space** counts as one "initiative".
  In both cases the NDS-category and VNG-2030-theme classifications MUST be derived from the existing tags/taxonomy on the counted entity (space tags, or GD-initiative callout tags) as exposed by the platform. The mapping from raw tags to the NDS / VNG-2030 categories MUST be maintained in **server-side configuration (`analytics.yml`)** so it can be changed without code changes, and the backend MUST apply it and return categorised counts plus the active source. An entity whose tags map to a category contributes to that category's count.
- **FR-023**: For this release the dashboard MUST ship exactly the two charts shown (counts by NDS category and counts by VNG-2030 theme), but the dashboard MUST be structured so that additional charts can be added later without re-architecting it.
- **FR-024**: The dashboard MUST handle missing or partial classification data gracefully, showing the charts for the spaces that have data and indicating where data is absent.

#### GemeenteDelers initiatives layer

- **FR-039**: The Graph tab MUST provide an **"include GemeenteDelers initiatives"** toggle (off by default). When enabled, GD initiatives — the posts in the Knowledge Base of the **gemeentedelers** space (~305) — MUST be folded into the current graph as additional nodes.
- **FR-040**: Each GD initiative node MUST be connected to the **existing** organisation node(s) for the gemeente(s) it references, reusing the same gemeente organisation identity already present in the graph rather than creating duplicate gemeente nodes.
- **FR-041**: Each GD initiative MUST be connected to the **theme(s)** it references; theme nodes MUST be represented in the graph (added if not already present) and shared across initiatives that reference the same theme.
- **FR-042**: Disabling the toggle MUST remove the GD initiative nodes and their edges, leaving the base space graph unchanged.
- **FR-043**: When a referenced gemeente or theme is not otherwise present in the graph, the system MUST fold it in consistently using a single canonical identity per gemeente/theme (no duplicate-identity nodes), per the approach resolved in research.
- **FR-044**: If the gemeentedelers space or its Knowledge Base cannot be retrieved, the experience MUST show a clear, non-fatal message and keep the base graph usable.
- **FR-045**: The **nameID of the gemeentedelers space** (and any other GD-specific configuration) MUST be supplied via server configuration (`analytics.yml`), not hard-coded in application code or the frontend.
- **FR-046**: The gemeentedelers initiative data MAY be cached with a **longer time-to-live than the standard space cache** — configurable, defaulting to about **one week** — because the GD corpus is archival and changes rarely. The longer TTL MUST be independently configurable from the standard cache TTL.
- **FR-047**: When the GemeenteDelers initiative layer is available/enabled, the experience MUST show a short **provenance/overview note** describing the data source: that GemeenteDelers was a VNG programme running **2021–2025**, comprising **~305 initiatives**, originally published at **vng.nl/praktijkvoorbeelden** and now available in the gemeentedelers space. The note SHOULD be localised (Dutch default) and link to the original source.

#### Organisation connections

- **FR-030**: When the user clicks an **organisation** node in the graph, the experience MUST indicate which spaces in the current graph that organisation is connected to (listed and/or highlighted) and allow the user to open those spaces' details.
- **FR-031**: When a clicked organisation has no connections within the current graph, the experience MUST clearly state this rather than appear empty or broken.

#### Gemeentes (Dutch municipalities)

- **FR-032**: The experience MUST be aware of the set of Dutch municipalities (gemeentes) published on the platform, identifying gemeente organisations by matching against a known set of gemeente identities (nameIDs/slugs).
- **FR-033**: The gemeente identity set MUST be derived from the `vng-gemeente-delers` source (its `vault/municipalities/` slugs) as a build-time generated snapshot committed into the VNG experience, refreshable as a data update without changing application logic.
- **FR-034**: The experience MUST provide a **show / hide gemeentes** toggle. Hiding gemeentes MUST remove gemeente organisation nodes from the graph and exclude them from the dashboard charts; showing them MUST restore them — consistently across both views.
- **FR-035**: Gemeente identification MUST avoid false positives — non-gemeente organisations MUST NOT be flagged or hidden by the gemeente toggle.

#### Localization

- **FR-036**: The VNG experience MUST be language-aware, with **Dutch as the default language**.
- **FR-037**: The experience MUST allow the user to switch language between **Dutch and English**, updating all interface labels, navigation, chart titles, and category names (e.g. NDS, VNG-2030) to the selected language.
- **FR-038**: The selected language MUST persist for the duration of the user's session.

#### Branding & user guidance

- **FR-025**: The VNG experience MUST carry a clear, persistent header (visible across all tabs) that **labels it in text** as the dashboard for **VNG Kenniscentrum Innovatie**. For this release it reuses the **existing Alkemio branding and design system/tokens**; a VNG-specific visual identity is a deferred future enhancement (it MUST be straightforward to introduce later without restructuring).
- **FR-026**: The VNG experience MUST display a prominent **warning notice** explaining that the user only sees ecosystem data they are authorised to access, and advising them to check their authorisation on the underlying spaces if the data appears limited.
- **FR-027**: The authorisation warning MUST be presented in a recognisable "warning" visual style, distinct from ordinary informational content, so it draws attention.

#### Robustness

- **FR-028**: All tabs MUST tolerate missing optional data without crashing, consistent with the platform's graceful-degradation principle.
- **FR-029**: If the shared session expires while the VNG experience is in use, the user MUST be prompted to re-authenticate and returned to their prior context where feasible.

### Key Entities *(include if feature involves data)*

- **Innovation Hub**: A curated grouping that lists a set of spaces. Has an identity/name and an associated list of member spaces. One hub is designated the default for the VNG experience; the user may switch the active hub.
- **Space**: An ecosystem entity (as already modelled by the platform) with a name, profile, location, statistics, and relationships. Spaces are the unit selected (via hub or directly) and the subject of the graph, details, and dashboard.
- **Selected-Space Set**: The effective working set driving all three tabs — the union of the active hub's spaces and the user's direct additions, minus direct removals, restricted to spaces the user may access. Each member carries provenance (from-hub vs added-directly).
- **Initiative (dashboard counting unit)**: Data-source aware — when the GemeenteDelers layer is active it is a **GD initiative** (a KB callout); otherwise it is a **selected space**. Classified into category dimensions via the counted entity's existing tags/taxonomy. (Distinct from the **GemeenteDelers Initiative** entity below, which is the graph node.)
- **Category Dimension**: A way of grouping dashboard counts (e.g. "NDS category", "VNG-2030 theme"), each with a fixed set of categories used as chart axes. The dashboard ships two such dimensions and is structured to allow more later.
- **Organisation**: An ecosystem actor (as modelled by the platform) that can be connected to one or more spaces. Clicking one reveals its connected spaces within the current graph. Gemeentes are a subset of organisations.
- **Gemeente (Dutch Municipality)**: An organisation representing a Dutch municipality, published on the platform (display name `Gemeente <name>`, country NL). The known set (~342) is identified via a build-time snapshot of identities sourced from the `vng-gemeente-delers` repo, and can be shown or hidden via a toggle.
- **GemeenteDelers Initiative**: A municipal innovation case published as a post in the Knowledge Base of the gemeentedelers space (~305). Referenced by the optional initiative layer; carries references to one or more gemeentes and themes. Folded into the graph as a node when the option is enabled.
- **Theme**: A GemeenteDelers categorisation that initiatives reference. Represented as a shared node in the graph so multiple initiatives referencing the same theme connect to one theme node.
- **Language / Locale**: The active interface language. Defaults to Dutch; switchable to English; governs all labels including chart titles and category names.
- **Authentication Session**: The shared sign-in context recognised by both frontends, established and invalidated centrally by the backend.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the current frontend and the VNG frontend both running against one backend, a user who signs in on one is recognised as signed in on the other with no second sign-in, in 100% of attempts.
- **SC-002**: On first load, the VNG experience shows the default innovation hub's spaces as a graph over the Netherlands map within 5 seconds for a typical hub (≤ 30 spaces) on a standard connection.
- **SC-003**: Switching the active innovation hub updates the graph, the selected-space list, and the dashboard to the new hub's spaces within 5 seconds, with no manual page reload.
- **SC-004**: Adding or removing an individual space updates the selected-space list, graph, and dashboard consistently within 3 seconds, and the combined set always equals (hub spaces ∪ direct additions) − direct removals.
- **SC-005**: At all times the user can see the current selected-space set and tell which spaces came from the hub versus direct selection, verified across every tab.
- **SC-006**: The dashboard charts reflect the active data source: after any selection change (or toggling the GD layer), the displayed counts match the underlying entities (selected spaces, or GD initiatives when that layer is active) in 100% of test cases, and the chart states the active source.
- **SC-007**: A first-time VNG user can go from sign-in to a populated graph and dashboard for the default hub without instruction in under 2 minutes.
- **SC-008**: No restricted space the signed-in user is not authorised to view is ever shown in the selected-space list, graph, details, or dashboard.
- **SC-009**: The VNG experience exposes a deliberately reduced control surface — fewer top-level controls/options than the current frontend (qualitative comparison; verified by a side-by-side control-count review) — while still completing the hub→graph→dashboard workflow.
- **SC-010**: On every tab, a first-time user can identify within 5 seconds that the tool is the VNG Kenniscentrum Innovatie dashboard from the persistent header label (using Alkemio branding for this release).
- **SC-011**: The authorisation warning is visible to 100% of users viewing ecosystem data and is recognised as a warning (not ordinary text) in usability checks.
- **SC-012**: Clicking any organisation in the graph reveals its connected spaces within the current graph in under 1 second, and the revealed set exactly matches the organisation's space connections present in that graph.
- **SC-013**: Toggling "hide gemeentes" removes 100% of known gemeente organisations from both the graph and the dashboard (and toggling back restores them), with zero non-gemeente organisations affected.
- **SC-014**: The experience loads in Dutch by default; switching to English (and back) updates all visible interface labels, including chart titles and category names, with no untranslated strings remaining in either language.
- **SC-015**: Enabling "include GemeenteDelers initiatives" adds the GD initiative nodes and connects each to the gemeente and theme nodes it references, with zero duplicate gemeente identities created; disabling it restores the exact base graph.

## Assumptions

- **Reuse over rebuild**: The VNG experience reuses the existing backend endpoints, authentication/session mechanism, graph rendering, map (Netherlands region), and space-details presentation already built for the current frontend, adding only hub selection, the simplified tabbed shell, and the dashboard.
- **Shared session mechanism**: The shared authentication context is achieved through the backend's existing session mechanism, which both frontends already rely on. In production the two frontends are served as sibling subdomains under one parent domain, with the session cookie scoped to that parent domain and the VNG origin added to the backend's allowed-origins so the same session applies to both. (Existing config knobs `SESSION_COOKIE_DOMAIN` / `SESSION_ALLOWED_ORIGINS` cover this.)
- **Innovation hub source**: Innovation hubs and their listed spaces are obtained from the underlying ecosystem platform (the platform already models innovation hubs with a space list); the backend will expose this to the frontends as needed.
- **Default hub is configuration**: The default innovation hub is set by configuration (operator-set), not hard-coded, so it can be changed without code changes.
- **Authorisation reuse**: Space visibility/authorisation is enforced by the backend as it already is for the current frontend; the VNG experience inherits the same rules.
- **Graph parity**: "Like the main graph now" means the VNG graph reuses the current graph's core rendering and interaction; the deliberately "simpler" nature comes from fewer surrounding controls, not a different graph engine.
- **Netherlands-only map**: Only the Netherlands map region is offered in the VNG experience; region switching is not exposed.
- **Dashboard charting**: Charts are rendered with summary data computed server-side. The counting unit is data-source aware: GD initiatives when the GemeenteDelers layer is active, otherwise selected spaces. NDS-category and VNG-2030-theme groupings come from the counted entity's existing tags/taxonomy. The mapping from raw tags to the fixed category sets is maintained in server-side configuration (`analytics.yml`) and applied by the backend; entities with no matching tag are counted as uncategorised/"Overig" or omitted. The exact source tags that populate each category are confirmed against real data during implementation (the mapping is operator-editable).
- **Design fidelity via the existing Alkemio design system (Principle VI)**: The VNG app reuses the existing Alkemio branding and design tokens/typography (the 001 design-brief token system already shared via `@ea/shared`), so it inherits the established visual contract rather than introducing an unspecified new one. It is labelled "VNG Kenniscentrum Innovatie" in text; a VNG-specific visual identity (logo, palette) is a deferred, additive enhancement. This keeps Principle VI satisfied without a new pixel-level brief for this release.
- **Styling already aligned with client-web (no MUI)**: The current ecosystem-analytics frontend already uses the same styling stack as the sibling `client-web` repository's MUI-removed branch (`story/9885-remove-mui-library-and-code`) — React 19, Vite 7, Tailwind v4, Radix UI primitives, `class-variance-authority`/`clsx`/`tailwind-merge`, `lucide-react` — i.e. a shadcn/ui-style system. No framework re-alignment of the current frontend is required; the VNG experience inherits this same stack. (Minor housekeeping only: `lucide-react` major version differs between the two repos.)
- **Reusable primitives & assets from client-web**: The MUI-removed branch provides a complete `components/ui/` primitive set (tabs, alert, card, badge, select, chart, etc.) and existing VNG branding assets (e.g. `prototype/public/banners/vng-innovation-hub.png`) plus innovation-hub components, which can be lifted/adapted into the VNG experience rather than rebuilt.
- **Chart library**: The dashboard charts adopt the same charting approach as client-web's MUI-removed branch — its `ui/chart.tsx` wraps **recharts**. The current ecosystem-analytics frontend does not yet include a chart library (it uses D3 only for the network graph), so a charting dependency will be added for the dashboard.
- **Authorisation already enforced server-side**: The data-access warning reflects existing behaviour — the backend already restricts spaces to those the user may view — so the warning is informational/UX, not a new access-control mechanism.
- **Organisation→spaces already available**: The platform/backend already exposes an organisation's space connections (the current frontend's details view shows direct connections), so revealing an organisation's connected spaces reuses existing data rather than requiring new sources.
- **Gemeente identification by snapshot**: Gemeentes are published to the platform as organisations (display name `Gemeente <name>`, NL, with a `gemeente` keyword). The VNG experience identifies them using a build-time snapshot of nameIDs/slugs generated from `vng-gemeente-delers` (`vault/municipalities/`, ~342 entries) and committed into ecosystem-analytics; this snapshot can be regenerated when the municipality set changes. (The platform's `gemeente` keyword tag is a corroborating signal but the repo snapshot is the source of truth per the clarified decision.)
- **Localization scope**: Dutch and English are provided, Dutch default. Localisation covers the VNG experience's own interface (labels, navigation, chart titles, category names); user-authored space content from the platform is shown as-is in its original language. Reusable Dutch/English translation assets exist in the sibling `client-web` repo and may be adapted.

## Out of Scope

- Changes to the current frontend's own behaviour or appearance (beyond what is needed to share the session).
- Map regions other than the Netherlands within the VNG experience.
- Editing or managing innovation hubs or spaces (the experience is read/explore only).
- Authoring or administering the NDS/VNG-2030 category taxonomies.
- New authentication methods or identity providers (the existing sign-in is reused as-is).
- A VNG-specific visual identity (custom logo, palette, typography) — this release uses Alkemio branding; VNG theming is a later, additive enhancement.
