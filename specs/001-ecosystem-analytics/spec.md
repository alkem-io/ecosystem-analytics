# Feature Specification: Ecosystem Analytics — Portfolio Network Explorer

**Feature Branch**: `001-ecosystem-analytics`  
**Created**: February 9, 2026  
**Status**: Draft  
**Input**: Stakeholder call transcript + notes (Portfolio Owner–focused interactive network visualization; L0 space selection; clustering + map overlay; separate tool using Alkemio identities; protected caching; clear node/edge schema).

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Explore Portfolio Connectivity (Priority: P1)

As a **Portfolio Owner**, I want to select one or more top-level Spaces I’m a member of and explore an **interactive, clustered network graph** of Spaces, Subspaces/Challenges, Organizations, and People so that I can quickly understand how initiatives connect, who/what acts as “connectors”, and where there are gaps or isolated initiatives.

**Why this priority**: Portfolio Owners need portfolio-level insight and pattern recognition; an interactive graph provides fast situational awareness that is hard to obtain by visiting pages/spaces individually.

**Independent Test**: Can be tested by logging in as a Portfolio Owner, selecting 1–3 L0 Spaces, and verifying the user can (a) switch cluster modes, (b) search and highlight entities, (c) open entity details, and (d) identify at least one connector and one isolated Space within 5 minutes.

**Acceptance Scenarios**:

1. **Given** I am authenticated with an Alkemio identity, **When** I open the tool, **Then** I can see a list of **L0 Spaces** that I am a **member** of and can select one or more of them.
2. **Given** I have selected at least one L0 Space, **When** I choose “Generate/Load Graph”, **Then** an interactive graph is displayed with clearly distinguishable node types and relationship types.
3. **Given** the graph is displayed, **When** I change “Cluster by” between **Space** and **Organization**, **Then** the layout reorganizes into readable clusters while preserving highlighted selections and the graph remains explorable.
4. **Given** the graph is displayed, **When** I zoom/pan and drag nodes, **Then** the graph responds immediately and maintains a stable, usable layout.
5. **Given** the graph is displayed, **When** I search for an entity (Space, Organization, Person), **Then** the graph updates to make matches easy to find (e.g., filter the canvas to matching nodes and their links, or highlight matches while dimming non-matches).
6. **Given** I click a node, **When** the details panel opens, **Then** I can see key metadata (name, type, level/type badges, connection counts, and a link/action to open the entity in Alkemio when applicable).
7. **Given** I generate/load a graph dataset, **When** acquisition/transformation/rendering is in progress, **Then** the UI shows a progressive loading overlay with clear step labels (e.g., “Acquiring Data”, “Clustering Entities”, “Rendering Graph”).

---

### User Story 2 - Fast Loading via Protected Caching (Priority: P2)

As a **Portfolio Owner**, I want the tool to **reuse previously fetched data** (with a clear freshness indicator and a manual refresh option) so that I can repeatedly explore my portfolio without slow loading and without placing unnecessary load on the Alkemio backend.

**Why this priority**: Repeatedly extracting portfolio data can overload the backend and makes exploration frustrating; caching makes the tool usable and safe to operate.

**Independent Test**: Can be tested by generating a graph for the same selected Spaces twice and verifying the second run loads faster and does not require a full re-fetch, unless the user explicitly refreshes.

**Acceptance Scenarios**:

1. **Given** I generate a graph for a selection of L0 Spaces, **When** I return later and generate the same selection again, **Then** the tool reuses cached results and shows the “last updated” timestamp.
2. **Given** cached results exist, **When** I choose “Refresh data”, **Then** the tool fetches updated data and replaces the cached dataset.
3. **Given** cached data exists for only some of my selected Spaces, **When** I generate the graph, **Then** the tool reuses what it has and fetches only what is missing.

---

### User Story 3 - Expand the Graph During Exploration (Priority: P3)

As a **Portfolio Owner**, I want to discover related entities from what I click (people, organizations, related Spaces) and optionally **expand the graph** by adding additional Spaces that I have access to so that I can follow connections without starting over.

**Why this priority**: Portfolio-level insight often comes from “following the thread” of a connector; the tool should support exploration-driven expansion.

**Independent Test**: Can be tested by clicking a connector (person/org), viewing related Spaces, and adding an additional accessible Space to the current graph.

**Acceptance Scenarios**:

1. **Given** I have a graph loaded, **When** I click a person or organization node, **Then** I can see a list of connected Spaces and Subspaces, with clear indication of what I can add to the graph.
2. **Given** a related Space is available and I have membership access to it, **When** I choose “Add to graph”, **Then** the graph updates to include that Space and its connected entities.
3. **Given** a related Space is not accessible to me, **When** I view it from the details panel, **Then** it is clearly marked as not addable and cannot be loaded into my graph.

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- User has **no L0 Space memberships** (empty state + guidance).
- User selects many L0 Spaces leading to a very large graph (progress indicator, graceful fallback, and usable filtering).
- Entities with **missing profile fields** (no avatar, missing display name, missing location data).
- Space hierarchy depth varies (no L1/L2; or missing subspace collections).
- Location data is incomplete or absent, but map mode is enabled.
- Cached data becomes stale or partially invalid (clear refresh action; graph still loads when possible).
- Permission mismatch between cached data and current access rights (must not display restricted data).

### Assumptions & Dependencies

- The first release targets **L0 Space selection only**; L1/L2 are included as child context once a L0 Space is selected.
- Users must be authenticated and authorized via **Alkemio identity**, and Space eligibility is based on current membership.
- Map overlay is valuable but **secondary**; the tool must remain usable when most entities have missing location data.
- Caching is initially **per-user**; later iterations may introduce shared caching for identical datasets.
- This tool is a **standalone experience** (separate from the main Alkemio UI), but it depends on Alkemio as the source of truth for memberships and entity metadata.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST authenticate users using **Alkemio identities**.
- **FR-002**: System MUST only allow users to select Spaces from the set of **L0 Spaces where they are a member**.
- **FR-003**: System MUST allow users to select one or more L0 Spaces and generate/load a graph dataset for the selection.
- **FR-004**: System MUST render an interactive network visualization supporting at minimum: zoom, pan, drag, node selection, and a slide-in details panel/drawer.
- **FR-005**: System MUST support at least two clustering modes: **Cluster by Space** and **Cluster by Organization**.
- **FR-006**: System MUST support filtering controls that can hide/show at least: People nodes and Organization nodes.
- **FR-007**: System MUST support search that makes matching nodes easy to find (e.g., by filtering to matches or by highlighting matches and de-emphasizing non-matches).
- **FR-008**: System MUST provide a **map overlay mode** where the graph can be displayed on top of a selectable map.
- **FR-009**: System MUST provide a selection of predefined maps (at minimum: World, Europe, Netherlands) and allow the selection set to be expanded over time.
- **FR-010**: System MUST define and adhere to a clear **graph schema** that specifies:
  - node types
  - edge types
  - required vs optional metadata for nodes and edges
- **FR-011**: System MUST enforce access control such that users can only view and load data they are authorized to access.
- **FR-012**: System MUST store and reuse cached acquired/transformed results in a way that:
  - reduces repeated backend requests
  - shows data freshness (“last updated”)
  - supports manual refresh
  - protects cached data equivalently to any other user data
- **FR-013**: System MUST be operable as a **standalone tool** (not embedded into the main Alkemio UI), while using Alkemio identity for access.
- **FR-014**: System SHOULD compute and display basic network metrics (at minimum: total nodes, total edges, average degree, density).
- **FR-015**: System SHOULD provide “insight shortcuts” that can highlight at minimum: super-connectors and isolated nodes.
- **FR-016**: System SHOULD allow exporting the current graph dataset (and optionally computed insights/metrics) as a JSON file for offline analysis.

- **FR-017**: System MUST provide clear progressive loading states during graph generation (e.g., a modal/overlay indicating acquisition/transformation/rendering steps).

### Non-Functional Requirements

- **NFR-001 (Security/Privacy)**: System MUST treat all acquired and cached Alkemio-derived data as sensitive user data.
- **NFR-002 (Secrets Handling)**: System MUST NOT log authentication secrets or bearer tokens (even at debug level).
- **NFR-003 (Access Control)**: System MUST apply access checks at query-time and/or cache-read-time such that stale caches cannot re-introduce unauthorized data.
- **NFR-004 (Performance)**: System SHOULD remain interactive for “large graphs” by adapting layout/physics and throttling rendering updates when node/edge counts are high.
- **NFR-005 (Resilience)**: System MUST degrade gracefully when optional fields are missing (e.g., location, avatar, URLs) and when map assets fail to load.
- **NFR-006 (Accessibility)**: System SHOULD provide baseline accessibility for core interactions (keyboard navigation to nodes, focus states, readable contrast, and ARIA labeling for controls).

### Technical Requirements (Legacy Learnings)

The legacy reference project (https://github.com/alkem-io/analytics-playground) demonstrates a decoupled approach:

1. **Acquire** raw data from Alkemio (GraphQL)
2. **Transform** raw data into a display-friendly graph JSON
3. **Display** the graph in a browser with interactive controls and optional map overlay

This spec does not mandate the same repo/module split, but it does inherit a few concrete constraints and proven patterns.

#### Backend/API Integration

- **TR-001**: System MUST integrate with Alkemio via GraphQL and support a non-interactive/private GraphQL endpoint where applicable.
- **TR-002**: System MUST support auth flows that yield a bearer token usable for GraphQL requests (using Alkemio identity; implementation may vary by environment).
- **TR-003**: System SHOULD generate typed API clients (or otherwise enforce strict contracts) to reduce schema drift and runtime errors.

#### Data Pipeline & Formats

- **TR-004**: System SHOULD keep acquisition/transformation concerns separable from visualization (e.g., a service layer or job that produces a stable graph dataset consumed by the UI).
- **TR-005**: System MUST define a versioned graph dataset format that is JSON-serializable and stable across releases.
- **TR-006**: System SHOULD include “scope grouping” on edges/nodes so the UI can filter/cluster by selected L0 Space context.

**Legacy-compatible graph dataset shape (illustrative)**:
- `nodes`: `spacesL0`, `spacesL1`, `spacesL2`, `contributors`
- `edges`: list of `{ sourceID, targetID, type, weight?, group? }`

#### Maps & Geospatial Overlay

- **TR-007**: System MUST support GeoJSON basemaps for map overlay mode.
- **TR-008**: System MUST support selecting among multiple basemaps and expanding the set over time.
- **TR-009**: System SHOULD support “fixing” nodes to real-world coordinates when location is available (and not break when it is not).
- **TR-010 (Licensing)**: System MUST ensure basemap assets are properly licensed for production use (legacy project uses third-party vector sources).

#### Visualization & Interaction Patterns

- **TR-011**: System SHOULD expose basic network metrics (e.g., node/edge counts, average degree, density) to aid portfolio-level insight.
- **TR-012**: System SHOULD support highlighting derived “insights” such as super-connectors, bridge connectors, isolated nodes, and geographic clusters.

### Graph Schema (First Pass)

The specification requires a clear, documented schema so that acquisition, transformation, and visualization can evolve independently.

**Node types (v1)**:
- Space (L0)
- Space (L1)
- Space (L2)
- Organization
- Person (User)

**Edge types (v1)**:
- Parent–Child (Space hierarchy)
- Member (person/org participates in space)
- Lead (person/org leads space)

**Minimum node metadata (v1)**:
- ID (stable)
- Type
- Display name/label

**Optional node metadata (v1)**:
- Avatar/logo (for people/org)
- URL (to open in Alkemio)
- Location (country/city + coordinates when available)

**Minimum edge metadata (v1)**:
- Source ID
- Target ID
- Type

**Optional edge metadata (v1)**:
- Weight/strength (e.g., lead vs member)
- Scope grouping (which selected L0 Space context the edge belongs to)

### Key Entities *(include if feature involves data)*

- **GraphNode**: An entity displayed in the visualization.
  - Required attributes: stable ID, node type, display name/label.
  - Optional attributes: avatar/image, URL, role counts, location (country/city/lat/long), “last active” or health indicators (if available).
- **GraphEdge**: A relationship between two nodes.
  - Required attributes: source ID, target ID, edge type.
  - Optional attributes: weight/strength, role (lead/member), directionality, scope grouping (which selected L0 Space the relationship belongs to).
- **GraphDataset**: The full set of nodes/edges plus metadata needed for rendering and interaction.
- **Space (L0/L1/L2)**: Collaboration container(s) included in the graph; L0 is selectable; L1/L2 appear as children.
- **Organization**: Organizational actor participating in Spaces.
- **Person (User)**: Individual actor participating in Spaces.
- **Map**: A selectable basemap reference for overlay mode.
- **ClusterMode**: A user-selected grouping rule (e.g., by Space or by Organization).
- **CacheEntry**: A stored acquired/transformed dataset tied to a user and a set of selected Spaces.

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: A Portfolio Owner can generate a graph for 1–3 L0 Spaces and reach an interactive view in under 60 seconds on first load.
- **SC-002**: With cached data available, a Portfolio Owner can reach an interactive view for the same selection in under 10 seconds.
- **SC-003**: At least 90% of test users can complete the core exploration tasks (cluster mode switch, search, open details, toggle map) without assistance within 3 minutes.
- **SC-004**: In testing, the tool never displays Spaces outside the user’s accessible membership set (0 verified permission leaks).
- **SC-005**: For repeated exploration of the same selection, the tool does not re-fetch full datasets unless the user triggers refresh (verified by behavior/log review).

