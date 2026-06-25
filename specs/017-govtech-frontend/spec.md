# Feature Specification: GovTech Netherlands Frontend

**Feature Branch**: `017-govtech-frontend`
**Created**: 2026-06-25
**Status**: Draft
**Input**: User description: "I want to add a third front end, this time for GovTech Netherlands. It should be similar in most ways to VNG hub, but it is a separate front end that should have its own port from the front end and also a separate end point on the server."

> **Working name**: "GovTech frontend". This experience is built for **GovTech Netherlands**. It is a **third** dashboard alongside the existing Explorer and the VNG Kenniscentrum Innovatie dashboard, served by the same backend but reachable at its own address.

## Clarifications

### Session 2026-06-25

- Q: How much of the VNG feature set should GovTech Netherlands carry? → A: **Full VNG clone** — identical feature set (3 tabs, hub picker, Netherlands-only map, dashboard charts, gemeente show/hide toggle, GemeenteDelers initiatives layer, Dutch/English localisation), differing only in branding, default innovation hub, ports, and server endpoint, with all VNG-specific behaviours configurable per-frontend.
- Q: What should the GovTech dashboard charts measure? → A: **Same as VNG, configurable** — reuse the NDS-category and VNG-2030-theme breakdowns as the starting point; the raw-tag→category mapping stays operator-editable in server configuration so GovTech can diverge later without code changes.
- Q: How should GovTech be branded and localised at launch? → A: **Reuse the Alkemio brand + Dutch/English** — reuse the existing Alkemio design tokens, label the experience "GovTech Netherlands" in text, Dutch default with an English switcher; a GovTech-specific visual identity is a deferred enhancement.
- Q: How is the new frontend served and addressed? → A: As a **third sibling under one parent domain** (its own subdomain and its own port), sharing the same backend `/api` and the parent-domain session cookie, with the new origin added to the backend's allowed-origins. It has **its own static-serving endpoint/port on the server**, distinct from Explorer and VNG.
- Q: Should GovTech's gemeente / GemeenteDelers data come from the same sources as VNG or a different corpus? → A: **Same sources as VNG** — GovTech reuses the identical gemeente snapshot and the same `gemeentedelers` space (and its 2021–2025 / vng.nl/praktijkvoorbeelden provenance). The gemeente snapshot and GemeenteDelers parsing/caching are genuinely shared, not forked.
- Q: What is the GovTech default innovation hub? → A: **Operator-set** — no hard-coded default in the spec; the default hub is a deployment configuration value supplied at rollout (independent of the Explorer/VNG defaults). SC-003 is validated against whatever hub is configured.
- Q: What is the exact header/branding label? → A: **Localised** — "GovTech Nederland" in Dutch and "GovTech Netherlands" in English. The header label is a localised string that follows the active language.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run three frontends side by side under one sign-in (Priority: P1)

An operator runs the existing Explorer frontend, the VNG frontend, and the new GovTech Netherlands frontend at the same time against the same backend, each reachable at its own URL/port. The GovTech frontend is served from its own distinct server endpoint/port, separate from the other two. A user who has signed in is recognised across all three experiences without signing in again.

**Why this priority**: This is the defining requirement of the feature — a *separate* third frontend with its own port and its own server endpoint that nonetheless coexists with and shares the sign-in context of the existing two. If it cannot coexist on a distinct address or share the session, the feature fails its primary goal.

**Independent Test**: Start the backend, the Explorer frontend, the VNG frontend, and the GovTech frontend together; confirm each is reachable at its own distinct address/port; sign in on one and confirm the other two recognise the session; sign out from one and confirm the session is invalid across all three.

**Acceptance Scenarios**:

1. **Given** the backend is running, **When** all three frontends are started, **Then** each is reachable at its own distinct URL/port without conflicting with the others, and the GovTech frontend is served from its own server endpoint/port separate from Explorer and VNG.
2. **Given** a user has an active authenticated session, **When** they open the GovTech frontend, **Then** they are treated as signed in without repeating the sign-in flow.
3. **Given** a user signs out from any one frontend, **When** they return to the GovTech frontend (or any other), **Then** the session is no longer valid there either.
4. **Given** all three frontends are running, **When** the GovTech frontend requests data, **Then** it retrieves it from the same backend `/api` the other frontends use, never contacting the underlying platform directly.

---

### User Story 2 - Explore an innovation hub's ecosystem on the graph (Priority: P1)

A GovTech Netherlands user opens the experience and is presented with a network graph of the spaces belonging to a default innovation hub, laid out over a map of the Netherlands. They can switch to a different innovation hub, and the graph and selected-space list update to reflect the spaces of the newly chosen hub.

**Why this priority**: This is the core value of the GovTech experience and the minimum that delivers something useful. Without hub-driven graph display there is no reason for a separate dashboard. It is the foundation every other story builds on.

**Independent Test**: Sign in, confirm the configured default GovTech innovation hub's spaces load into the graph over the Netherlands map, switch to another hub, and confirm the graph and selected-space list update accordingly.

**Acceptance Scenarios**:

1. **Given** an authenticated GovTech user opens the experience for the first time, **When** the page loads, **Then** the spaces of the configured default innovation hub are loaded and rendered as a network graph positioned over a map of the Netherlands.
2. **Given** the graph is displayed for the default hub, **When** the user selects a different innovation hub, **Then** the graph re-renders using the spaces belonging to the newly selected hub and the selected-space list updates to match.
3. **Given** an innovation hub is selected, **When** the user views the interface, **Then** the list of spaces currently feeding the graph is visible somewhere on the screen.
4. **Given** a chosen innovation hub contains no listable spaces, **When** the graph attempts to load, **Then** the user sees a clear empty-state message rather than a broken or blank graph.

---

### User Story 3 - Refine the space set with direct selection (Priority: P2)

Beyond the spaces inherited from the chosen innovation hub, the user can add or remove individual spaces. The effective set of "selected spaces" is the combination of the hub's spaces and the user's direct additions, and that combined set drives the graph, the details tab, and the dashboard.

**Why this priority**: Hubs give a curated starting point, but analysts frequently need to add a space the hub omits or focus on a subset. This makes the tool flexible without complicating the default flow. It depends on US2 but materially increases usefulness.

**Independent Test**: With a hub selected, add one extra space and remove one hub space; confirm the selected-space list, the graph, and the dashboard all reflect the combined set.

**Acceptance Scenarios**:

1. **Given** an innovation hub is selected, **When** the user adds a space directly, **Then** the space appears in the selected-space list and is included in the graph.
2. **Given** the combined set includes hub spaces and directly added spaces, **When** the user removes a space, **Then** it is excluded from the selected-space list, graph, and dashboard.
3. **Given** the user has made direct additions, **When** they switch to a different innovation hub, **Then** the selected-space list recomputes from the new hub combined with the user's still-applicable direct selections, and the result is clearly indicated.
4. **Given** the selected-space list, **When** the user inspects it, **Then** each space is identifiable (name) and it is clear which spaces came from the hub versus direct selection.

---

### User Story 4 - View the dashboard of charts for the selected spaces (Priority: P2)

The user opens the dashboard tab and sees a set of charts summarising the currently selected spaces — for example, counts of initiatives grouped by category (such as NDS categories and VNG-2030 themes, reused as the starting taxonomy). The charts update when the selected-space set changes.

**Why this priority**: The dashboard is a distinct, high-value deliverable that turns the raw network into management-level insight. It is independent of the graph rendering but shares the same selected-space set, so it is built on US2/US3.

**Independent Test**: With a set of spaces selected, open the dashboard tab and confirm the charts render with values derived from those spaces; change the selection and confirm the charts update.

**Acceptance Scenarios**:

1. **Given** spaces are selected, **When** the user opens the dashboard tab, **Then** charts summarising those spaces are displayed.
2. **Given** the dashboard is displayed, **When** the selected-space set changes, **Then** the charts recompute to reflect the new set.
3. **Given** a category dimension has categories with zero matching items, **When** the chart renders, **Then** empty categories are handled gracefully (shown as zero or omitted) without breaking the chart.
4. **Given** the underlying data needed for a chart is unavailable for some spaces, **When** the dashboard renders, **Then** the chart still displays for the spaces that do have data and indicates that some data is missing rather than failing.

---

### User Story 5 - Inspect the details of a particular space (Priority: P3)

The user opens the space-details tab to see detailed information about a single chosen space (its profile, location, key statistics, and relationships).

**Why this priority**: Useful drill-down, but secondary to seeing the ecosystem and the summary dashboard. Reuses information the platform already exposes for a space.

**Independent Test**: Select a space and open the details tab; confirm the space's detailed information is shown.

**Acceptance Scenarios**:

1. **Given** a set of selected spaces, **When** the user opens the details tab and chooses a space from its picker, **Then** the detailed information for that space is displayed.
2. **Given** the Graph tab is shown, **When** the user clicks a space node, **Then** the Space details tab opens showing that space's details.
3. **Given** a space is missing optional information (e.g. no banner, no location), **When** its details are shown, **Then** the view degrades gracefully and shows the available fields without errors.

---

### User Story 6 - Understand the GovTech branding and data-access caveat (Priority: P2)

When the user opens the GovTech experience it is clearly branded as a custom dashboard for GovTech Netherlands, so there is no doubt about whose tool it is. The user is also clearly warned that they only see ecosystem data they are authorised to access — so if the data looks sparse, they should check their permissions on the underlying spaces.

**Why this priority**: Branding establishes trust and identity for the dedicated audience, and the authorisation warning prevents users from misreading an access-limited view as "missing data". Both are cheap to add and reduce confusion, but neither blocks the core hub→graph→dashboard workflow.

**Independent Test**: Open the experience and confirm the GovTech Netherlands branding is visible, and that a clearly styled warning explains that only authorised data is shown and to check space permissions if data is limited.

**Acceptance Scenarios**:

1. **Given** the GovTech experience loads, **When** the user views any tab, **Then** branding identifying it as a custom dashboard for GovTech Netherlands is visible.
2. **Given** the user is viewing ecosystem data, **When** they look at the interface, **Then** a clearly styled warning notice explains that they only see data they are authorised to access and advises checking their authorisation on the underlying spaces if data appears limited.
3. **Given** the warning notice, **When** the user reads it, **Then** it is presented in a recognisably "warning" style (distinct from ordinary informational text) so it draws attention.

---

### User Story 7 - See which spaces an organisation connects to (Priority: P2)

The user clicks an organisation in the graph and can see which spaces in the current graph that organisation is connected to (and navigate to them).

**Why this priority**: Organisations — especially the gemeentes — are the connective tissue of the ecosystem. Seeing an organisation's reach across spaces is a primary analytical question and directly extends the graph's value. It builds on US2 (the graph exists).

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

A Dutch-speaking GovTech user sees the entire experience in Dutch by default, and can switch to English. All interface labels — including chart titles and category names — are localised.

**Why this priority**: The audience is Dutch public-sector staff and the reference charts are in Dutch; a Dutch-first interface is essential for adoption, with English available for non-Dutch stakeholders.

**Independent Test**: Load the experience and confirm it appears in Dutch by default; switch to English and confirm labels (including chart titles) change; switch back to Dutch.

**Acceptance Scenarios**:

1. **Given** a new user opens the experience, **When** it loads, **Then** all interface text is presented in Dutch by default.
2. **Given** the experience is in Dutch, **When** the user switches language to English, **Then** all interface labels, navigation, and chart titles update to English.
3. **Given** a chart with category axes (e.g. NDS, VNG-2030), **When** the language changes, **Then** the category labels are shown in the selected language.

---

### User Story 10 - Fold GemeenteDelers initiatives into the graph (Priority: P2)

The user can turn on an **"include GemeenteDelers initiatives"** option on the graph. When enabled, the GemeenteDelers (GD) initiatives — published as posts in the Knowledge Base of the "gemeentedelers" space (~305 of them) — are folded into the main graph as additional nodes and edges. Because many GD initiatives reference themes and gemeentes, each initiative is connected to the **same** organisation nodes already in the graph (e.g. the gemeente organisations) and to theme nodes, so the initiative layer enriches rather than duplicates the existing ecosystem.

**Why this priority**: The GD initiatives are a core dataset for the Dutch public-sector innovation picture — they are the concrete municipal innovations the tool exists to illuminate. Connecting them to the gemeentes and themes already in the graph turns the network into a genuine map of "who is doing what, where". It is additive to the base graph (US2) and can be toggled off, so it is high-value but not required for the first slice.

**Independent Test**: With a graph displayed, enable "include GemeenteDelers initiatives"; confirm initiative nodes appear, each linked to the gemeente organisation(s) and theme(s) it references, reusing existing gemeente nodes rather than creating duplicates; disable it and confirm the initiative layer is removed.

**Acceptance Scenarios**:

1. **Given** a graph is displayed, **When** the user enables "include GemeenteDelers initiatives", **Then** the GD initiatives from the gemeentedelers space's Knowledge Base are added to the graph as nodes.
2. **Given** GD initiatives are included, **When** an initiative references one or more gemeentes, **Then** it is connected to the existing gemeente organisation node(s) in the graph (not to newly duplicated gemeente nodes).
3. **Given** GD initiatives are included, **When** an initiative references one or more themes, **Then** it is connected to the corresponding theme node(s), which are added to the graph if not already present.
4. **Given** GD initiatives are included, **When** the user disables the option, **Then** the initiative nodes and their edges are removed and the base space graph remains intact.
5. **Given** an initiative references a gemeente or theme that is not currently in the graph, **When** it is folded in, **Then** the experience handles it predictably without errors or duplicate-identity nodes.
6. **Given** the gemeentedelers space or its Knowledge Base cannot be read, **When** the user enables the option, **Then** a clear non-fatal message is shown and the base graph remains usable.
7. **Given** the initiative layer is available, **When** the user views it, **Then** a short provenance note explains the GemeenteDelers programme (2021–2025, ~305 initiatives, source vng.nl/praktijkvoorbeelden).

---

### Edge Cases

- **Port/endpoint collision**: If the GovTech frontend's port or server endpoint collides with Explorer or VNG, startup must fail clearly (or be prevented by configuration) rather than silently serving the wrong app on the wrong address.
- **No default hub configured / default hub unavailable**: The experience must still load and let the user choose a hub or select spaces directly, with a clear message.
- **Hub lists spaces the user cannot access**: Spaces the signed-in user is not permitted to see must be excluded or clearly marked, never exposing restricted content.
- **Empty selection**: If the combined selected-space set is empty, the graph, details, and dashboard each show an empty state rather than errors.
- **Large hubs**: A hub listing more spaces than the server `max_spaces_per_query` limit must be capped to that limit, remain usable, and clearly communicate that the set was truncated.
- **Session expiry mid-use**: If the shared session expires while the GovTech frontend is open, the user is prompted to re-authenticate and returns to where they were.
- **Hub changed while direct selections exist**: The combined set must recompute predictably and the provenance (hub vs direct) must stay clear.
- **Dashboard category data missing**: Spaces lacking the classification a chart needs must not break the dashboard.
- **Organisation with no in-graph connections**: Clicking such an organisation must clearly state it has no connected spaces in the current selection.
- **Gemeente snapshot drift**: If a gemeente exists on the platform but is missing from the snapshot (or vice versa), the toggle simply acts on the known set; the experience must not error, and the snapshot can be refreshed to reconcile.
- **Empty selection while gemeentes hidden**: If hiding gemeentes empties the visible graph/dashboard, an empty state must be shown (with a hint that gemeentes are hidden).
- **Missing translation string**: If a label lacks a translation in the active language, a sensible fallback must be shown rather than a blank or raw identifier.
- **GD initiative with unresolved references**: An initiative whose gemeente/theme reference cannot be matched must still appear (connected to what can be resolved) without creating duplicate-identity nodes or erroring.
- **GD layer with gemeentes hidden**: If gemeentes are hidden while initiatives are shown, initiative–gemeente edges to hidden nodes must be handled cleanly (edge hidden with its endpoint), with no dangling edges.
- **gemeentedelers space unavailable**: Enabling the initiative layer when the space/Knowledge Base is unreadable must show a non-fatal message and keep the base graph usable.

## Requirements *(mandatory)*

### Functional Requirements

#### Separate frontend, coexistence, shared backend & authentication

- **FR-001**: The GovTech experience MUST be a **separate frontend** from the Explorer and VNG experiences — its own application served at its own distinct URL/port — while reusing the existing shared building blocks rather than duplicating them.
- **FR-002**: The GovTech frontend MUST be served from its **own dedicated server endpoint/port**, distinct from the endpoints/ports serving Explorer and VNG, following the existing multi-dashboard serving pattern (one backend serving multiple SPAs, each on its own port, all sharing the same `/api` and session store). In production it is fronted by its **own subdomain** under the shared parent domain.
- **FR-003**: The GovTech experience MUST obtain all of its data from the same backend that serves the existing frontends; it MUST NOT contact the underlying ecosystem platform directly.
- **FR-004**: The GovTech experience MUST be runnable **simultaneously** with the Explorer and VNG frontends, with all three reachable at their own distinct URLs/ports without conflict.
- **FR-005**: All three frontends MUST share a **single authentication context**, so that a user authenticated for one is recognised by the others without re-authenticating, and a sign-out in one invalidates the session for all. The session cookie MUST be scoped to the shared parent domain, and the GovTech origin MUST be included in the backend's allowed-origins so the same session applies across all three subdomains.
- **FR-006**: The GovTech experience MUST require the same authenticated sign-in as the existing frontends before showing any ecosystem data.
- **FR-007**: The GovTech experience MUST reuse the existing architecture and shared frontend/backend building blocks (graph rendering, Netherlands map, space-details presentation, dashboard charting, hub selection, localisation, session/auth) wherever practical, rather than duplicating them, to keep the experiences consistent and maintainable.

#### Navigation & layout

- **FR-008**: The GovTech experience MUST present a top-level tabbed layout with three tabs: a **Graph** tab, a **Space details** tab, and a **Dashboard** tab.
- **FR-009**: The GovTech experience MUST be visually and functionally simpler than the Explorer frontend, exposing only the controls needed for the GovTech workflow.
- **FR-010**: The currently selected set of spaces MUST be visible within the interface (a persistent list or panel) regardless of which tab is active.

#### Innovation hub & space selection

- **FR-011**: The GovTech experience MUST allow the user to select an innovation hub from **all innovation hubs the platform exposes to the signed-in user**, and MUST use the spaces listed by the chosen hub as input to the graph, details, and dashboard.
- **FR-012**: The system MUST apply a configurable **default innovation hub** for the GovTech experience on first load (set independently from the Explorer/VNG defaults), while allowing the user to change the active hub at any time.
- **FR-013**: The user MUST be able to directly add and remove individual spaces in addition to those provided by the selected hub.
- **FR-014**: The effective "selected spaces" set MUST be the combination of the active hub's spaces and the user's direct selections, and this combined set MUST drive the graph, details, and dashboard consistently.
- **FR-015**: The selected-space list MUST make it clear which spaces originate from the hub and which were added directly.
- **FR-016**: The system MUST only include spaces the signed-in user is authorised to view; spaces the hub lists but the user cannot access MUST be excluded or clearly marked, never exposing restricted content.

#### Graph tab

- **FR-017**: The Graph tab MUST render the selected spaces as a network graph equivalent in behaviour to the Explorer/VNG main graph (nodes, relationships, interaction). Clicking a space node MUST open that space in the Space details tab.
- **FR-018**: The Graph tab MUST display the network over a map of the Netherlands; no other map regions are required in this experience.
- **FR-019** (HARD REQUIREMENT, see constitution §VII): Every map in the GovTech dashboard (the Graph tab network map AND the initiative-details map) MUST show **ONLY the Netherlands**. Other countries and the open sea beyond the coastline MUST **NOT be rendered at all** (not greyed out, not faint) — everything outside the Netherlands is plain white/empty. Inside the Netherlands the map MUST show **real map-tile detail (roads/towns)** clipped exactly to the Netherlands boundary, with subtle province borders and avatars overlaid at their geo-locations. It is a regression if anything outside the Netherlands ever appears.
- **FR-020**: When the selected-space set is empty or fails to produce a graph, the Graph tab MUST show a clear empty/error state rather than a blank or broken view.

#### Space details tab

- **FR-021**: The Space details tab MUST let the user view detailed information for a single chosen space drawn from the selected set, including the information the platform already exposes for a space (profile, location, key statistics, relationships). The space may be chosen **either** by clicking its node in the Graph tab **or** via a dedicated space picker within the Space details tab itself.
- **FR-022**: The details view MUST degrade gracefully when optional fields are missing, showing available information without errors.

#### Dashboard tab

- **FR-023**: The Dashboard tab MUST display charts summarising the currently selected spaces, recomputing whenever the selected-space set changes.
- **FR-024**: The dashboard MUST include bar-chart style breakdowns of counts grouped by category, reusing the VNG starting taxonomy (initiatives grouped by NDS categories, and counts grouped by VNG-2030 themes) as the GovTech default. Each chart MUST indicate which data source the counts are based on (see FR-025).
- **FR-025**: The dashboard counting unit is **data-source aware**:
  - When the **GemeenteDelers initiative layer is active**, each chart counts **GD initiatives** grouped by category.
  - Otherwise, each **selected space** counts as one "initiative".
  In both cases the category classifications MUST be derived from the existing tags/taxonomy on the counted entity as exposed by the platform. The mapping from raw tags to the category dimensions MUST be maintained in **server-side configuration (`analytics.yml`)**, separately configurable for the GovTech experience, so it can be changed (and can diverge from VNG's mapping) without code changes; the backend MUST apply it and return categorised counts plus the active source.
- **FR-026**: For this release the GovTech dashboard MUST ship the same two charts as VNG (counts by NDS category and counts by VNG-2030 theme) as its default, but the dashboard MUST be structured so that additional or different charts can be added later — and the GovTech taxonomy can diverge from VNG's — without re-architecting it.
- **FR-027**: The dashboard MUST handle missing or partial classification data gracefully, showing the charts for the spaces that have data and indicating where data is absent.

#### GemeenteDelers initiatives layer

- **FR-028**: The Graph tab MUST provide an **"include GemeenteDelers initiatives"** toggle (off by default). When enabled, GD initiatives — the posts in the Knowledge Base of the **gemeentedelers** space (~305) — MUST be folded into the current graph as additional nodes.
- **FR-029**: Each GD initiative node MUST be connected to the **existing** organisation node(s) for the gemeente(s) it references, reusing the same gemeente organisation identity already present in the graph rather than creating duplicate gemeente nodes.
- **FR-030**: Each GD initiative MUST be connected to the **theme(s)** it references; theme nodes MUST be represented in the graph (added if not already present) and shared across initiatives that reference the same theme.
- **FR-031**: Disabling the toggle MUST remove the GD initiative nodes and their edges, leaving the base space graph unchanged.
- **FR-032**: When a referenced gemeente or theme is not otherwise present in the graph, the system MUST fold it in consistently using a single canonical identity per gemeente/theme (no duplicate-identity nodes).
- **FR-033**: If the gemeentedelers space or its Knowledge Base cannot be retrieved, the experience MUST show a clear, non-fatal message and keep the base graph usable.
- **FR-034**: The **nameID of the gemeentedelers space** (and any other GD-specific configuration) MUST be supplied via server configuration (`analytics.yml`), not hard-coded in application code or the frontend. GovTech reads the **same** `gemeentedelers` space as VNG (same source corpus and provenance); the GemeenteDelers acquisition/parsing/caching is shared between the two experiences rather than duplicated.
- **FR-035**: The gemeentedelers initiative data MAY be cached with a **longer time-to-live than the standard space cache** — configurable, defaulting to about **one week** — independently configurable from the standard cache TTL.
- **FR-036**: When the GemeenteDelers initiative layer is available/enabled, the experience MUST show a short **provenance/overview note** describing the data source (VNG programme running **2021–2025**, ~**305 initiatives**, originally published at **vng.nl/praktijkvoorbeelden**). The note SHOULD be localised (Dutch default) and link to the original source.

#### Organisation connections

- **FR-037**: When the user clicks an **organisation** node in the graph, the experience MUST indicate which spaces in the current graph that organisation is connected to (listed and/or highlighted) and allow the user to open those spaces' details.
- **FR-038**: When a clicked organisation has no connections within the current graph, the experience MUST clearly state this rather than appear empty or broken.

#### Gemeentes (Dutch municipalities)

- **FR-039**: The experience MUST be aware of the set of Dutch municipalities (gemeentes) published on the platform, identifying gemeente organisations by matching against a known set of gemeente identities (nameIDs/slugs).
- **FR-040**: The gemeente identity set MUST be derived from the `vng-gemeente-delers` source (its `vault/municipalities/` slugs) as a build-time generated snapshot committed into the experience, refreshable as a data update without changing application logic. GovTech MUST reuse the **same** gemeente snapshot as VNG via the shared frontend package (one shared asset, not a duplicated or forked copy).
- **FR-041**: The experience MUST provide a **show / hide gemeentes** toggle. Hiding gemeentes MUST remove gemeente organisation nodes from the graph and exclude them from the dashboard charts; showing them MUST restore them — consistently across both views.
- **FR-042**: Gemeente identification MUST avoid false positives — non-gemeente organisations MUST NOT be flagged or hidden by the gemeente toggle.

#### Localization

- **FR-043**: The GovTech experience MUST be language-aware, with **Dutch as the default language**.
- **FR-044**: The experience MUST allow the user to switch language between **Dutch and English**, updating all interface labels, navigation, chart titles, and category names to the selected language.
- **FR-045**: The selected language MUST persist for the duration of the user's session.

#### Branding & user guidance

- **FR-046**: The GovTech experience MUST carry a clear, persistent header (visible across all tabs) that **labels it in text** as the dashboard for GovTech Netherlands, distinct from the Explorer and VNG headers. The label is a **localised string** — **"GovTech Nederland"** in Dutch and **"GovTech Netherlands"** in English — that follows the active language. For this release it reuses the **existing Alkemio branding and design system/tokens**; a GovTech-specific visual identity is a deferred future enhancement (it MUST be straightforward to introduce later without restructuring).
- **FR-047**: The GovTech experience MUST display a prominent **warning notice** explaining that the user only sees ecosystem data they are authorised to access, and advising them to check their authorisation on the underlying spaces if the data appears limited.
- **FR-048**: The authorisation warning MUST be presented in a recognisable "warning" visual style, distinct from ordinary informational content, so it draws attention.

#### Robustness

- **FR-049**: All tabs MUST tolerate missing optional data without crashing, consistent with the platform's graceful-degradation principle.
- **FR-050**: If the shared session expires while the GovTech experience is in use, the user MUST be prompted to re-authenticate and returned to their prior context where feasible.

#### Scope isolation from the existing frontends

- **FR-051**: Adding the GovTech frontend MUST NOT change the behaviour, appearance, addresses, or default configuration of the existing Explorer and VNG frontends (beyond additive shared-package changes and adding the GovTech origin to allowed-origins).

### Key Entities *(include if feature involves data)*

- **GovTech Frontend (Dashboard SPA)**: The third dashboard application, served on its own port/endpoint under its own subdomain, sharing the backend `/api` and session store with Explorer and VNG. Configured independently (default hub, branding label, dashboard taxonomy) but built from the shared building blocks.
- **Innovation Hub**: A curated grouping that lists a set of spaces. One hub is designated the GovTech default (configurable, independent of other dashboards' defaults); the user may switch the active hub.
- **Space**: An ecosystem entity (as already modelled by the platform) with a name, profile, location, statistics, and relationships. The unit selected (via hub or directly) and the subject of the graph, details, and dashboard.
- **Selected-Space Set**: The effective working set driving all three tabs — the union of the active hub's spaces and the user's direct additions, minus direct removals, restricted to spaces the user may access. Each member carries provenance (from-hub vs added-directly).
- **Initiative (dashboard counting unit)**: Data-source aware — when the GemeenteDelers layer is active it is a **GD initiative**; otherwise it is a **selected space**. Classified into category dimensions via the counted entity's existing tags/taxonomy.
- **Category Dimension**: A way of grouping dashboard counts (e.g. "NDS category", "VNG-2030 theme"), each with a fixed set of categories used as chart axes. GovTech ships the same two dimensions as VNG by default, configured independently so it can diverge later.
- **Organisation**: An ecosystem actor that can be connected to one or more spaces. Clicking one reveals its connected spaces within the current graph. Gemeentes are a subset of organisations.
- **Gemeente (Dutch Municipality)**: An organisation representing a Dutch municipality, published on the platform. The known set (~342) is identified via a build-time snapshot of identities sourced from the `vng-gemeente-delers` repo, and can be shown or hidden via a toggle.
- **GemeenteDelers Initiative**: A municipal innovation case published as a post in the Knowledge Base of the gemeentedelers space (~305). Folded into the graph as a node when the optional layer is enabled; carries references to one or more gemeentes and themes.
- **Theme**: A GemeenteDelers categorisation that initiatives reference. Represented as a shared node in the graph so multiple initiatives referencing the same theme connect to one theme node.
- **Language / Locale**: The active interface language. Defaults to Dutch; switchable to English; governs all labels including chart titles and category names.
- **Authentication Session**: The shared sign-in context recognised by all three frontends, established and invalidated centrally by the backend.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With Explorer, VNG, and the GovTech frontend all running against one backend, each is reachable at its own distinct address/port (the GovTech frontend on its own dedicated endpoint/port), and a user who signs in on one is recognised as signed in on the other two with no second sign-in, in 100% of attempts.
- **SC-002**: Signing out from any one of the three frontends invalidates the shared session across all three, in 100% of attempts.
- **SC-003**: On first load, the GovTech experience shows the **operator-configured** default innovation hub's spaces as a graph over the Netherlands map within 5 seconds for a typical hub (≤ 30 spaces) on a standard connection. (No specific hub is hard-coded; the criterion is validated against whatever hub is configured at deployment.)
- **SC-004**: Switching the active innovation hub updates the graph, the selected-space list, and the dashboard to the new hub's spaces within 5 seconds, with no manual page reload.
- **SC-005**: Adding or removing an individual space updates the selected-space list, graph, and dashboard consistently within 3 seconds, and the combined set always equals (hub spaces ∪ direct additions) − direct removals.
- **SC-006**: At all times the user can see the current selected-space set and tell which spaces came from the hub versus direct selection, verified across every tab.
- **SC-007**: The dashboard charts reflect the active data source: after any selection change (or toggling the GD layer), the displayed counts match the underlying entities in 100% of test cases, and the chart states the active source.
- **SC-008**: A first-time GovTech user can go from sign-in to a populated graph and dashboard for the default hub without instruction in under 2 minutes.
- **SC-009**: No restricted space the signed-in user is not authorised to view is ever shown in the selected-space list, graph, details, or dashboard.
- **SC-010**: On every tab, a first-time user can identify within 5 seconds that the tool is the GovTech Netherlands dashboard from the persistent header label, which reads "GovTech Nederland" in Dutch and "GovTech Netherlands" in English per the active language.
- **SC-011**: The authorisation warning is visible to 100% of users viewing ecosystem data and is recognised as a warning (not ordinary text) in usability checks.
- **SC-012**: Clicking any organisation in the graph reveals its connected spaces within the current graph in under 1 second, and the revealed set exactly matches the organisation's space connections present in that graph.
- **SC-013**: Toggling "hide gemeentes" removes 100% of known gemeente organisations from both the graph and the dashboard (and toggling back restores them), with zero non-gemeente organisations affected.
- **SC-014**: The experience loads in Dutch by default; switching to English (and back) updates all visible interface labels, including chart titles and category names, with no untranslated strings remaining in either language.
- **SC-015**: Enabling "include GemeenteDelers initiatives" adds the GD initiative nodes and connects each to the gemeente and theme nodes it references, with zero duplicate gemeente identities created; disabling it restores the exact base graph.
- **SC-016**: Introducing the GovTech frontend causes zero observable change to the Explorer and VNG frontends' addresses, default behaviour, or appearance (verified by regression check before/after).

## Assumptions

- **Clone of VNG**: Per the clarified scope, the GovTech experience is a near-identical clone of the VNG dashboard (same three tabs, hub selection, Netherlands-only map, dashboard charts, gemeente toggle, GemeenteDelers initiatives layer, Dutch/English localisation). It differs only in branding label, default innovation hub, ports/endpoint, and per-frontend configuration; all VNG-specific behaviours are carried over and made configurable per-frontend where they were previously VNG-specific.
- **Separate frontend on its own port/endpoint via the established multi-dashboard pattern**: The GovTech frontend is added as a new SPA package consuming the shared frontend code, built and served on the next available port from its own static-serving endpoint, fronted by its own subdomain — exactly the "add a new dashboard" pattern the project already uses for VNG (one backend, many SPAs, distinct ports, shared `/api` and session store).
- **Shared session mechanism**: The shared authentication context is achieved through the backend's existing session mechanism that all frontends rely on. The session cookie is scoped to the shared parent domain and the GovTech origin is added to the backend's allowed-origins (existing `SESSION_COOKIE_DOMAIN` / `SESSION_ALLOWED_ORIGINS` config knobs cover this).
- **Reuse over rebuild**: The GovTech experience reuses the existing backend endpoints, authentication/session mechanism, graph rendering, Netherlands map, space-details presentation, dashboard charting, hub selection, gemeente snapshot, GemeenteDelers layer, and localisation already built for VNG — adding only the GovTech-specific configuration (default hub, branding label, dashboard taxonomy override) and wiring.
- **Default hub is configuration**: The GovTech default innovation hub is operator-set configuration, independent of the Explorer/VNG defaults, changeable without code changes.
- **Dashboard taxonomy reused, configurable**: The dashboard ships VNG's NDS-category and VNG-2030-theme charts as the GovTech default. The raw-tag→category mapping is maintained in server-side configuration, separately configurable for GovTech so it can diverge from VNG later without code changes.
- **Authorisation reuse**: Space visibility/authorisation is enforced by the backend as it already is for the existing frontends; the GovTech experience inherits the same rules. The data-access warning is informational/UX, not a new access-control mechanism.
- **Netherlands-only map**: Only the Netherlands map region is offered (constitution §VII applies to the GovTech maps exactly as to VNG); region switching is not exposed.
- **Design fidelity via the existing Alkemio design system (Principle VI)**: The GovTech app reuses the existing Alkemio branding and design tokens/typography shared via `@ea/shared`, labelled "GovTech Netherlands" in text. A GovTech-specific visual identity (logo, palette) is a deferred, additive enhancement.
- **Shared assets**: Reusable assets (gemeente snapshot, GemeenteDelers parsing, Dutch/English translation strings, chart components, Netherlands map) are consumed from the shared frontend/backend packages rather than duplicated; GovTech-only strings/branding are additive.
- **Same Dutch data sources as VNG**: GovTech reuses VNG's exact gemeente snapshot and the same `gemeentedelers` space (with its 2021–2025 / vng.nl/praktijkvoorbeelden provenance). The gemeente identity set and the GemeenteDelers acquisition/parsing/caching are a single shared implementation; GovTech does not introduce a separate or alternative corpus in this release.

## Out of Scope

- Changes to the Explorer or VNG frontends' own behaviour or appearance (beyond additive shared-package changes and adding the GovTech origin to allowed-origins).
- Map regions other than the Netherlands within the GovTech experience.
- Editing or managing innovation hubs or spaces (the experience is read/explore only).
- Authoring or administering the NDS/VNG-2030 (or any GovTech-specific) category taxonomies through the UI — taxonomy is operator-maintained in server configuration.
- New authentication methods or identity providers (the existing sign-in is reused as-is).
- A GovTech-specific visual identity (custom logo, palette, typography) — this release uses Alkemio branding; GovTech theming is a later, additive enhancement.
- Defining a brand-new GovTech dashboard taxonomy in this release — GovTech starts from VNG's taxonomy; divergence is enabled (configurable) but not authored here.
