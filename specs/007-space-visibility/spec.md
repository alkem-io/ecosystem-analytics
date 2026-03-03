# Feature Specification: Space Visibility Indicators

**Feature Branch**: `007-space-visibility`  
**Created**: 2026-02-26  
**Status**: Draft  
**Input**: User description: "Show which (sub)spaces are private and which are public. Currently we don't show this and it's important info. Show lock icons perhaps? Add a filter for public and private spaces."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Visual Visibility Indicator on Space Nodes (Priority: P1)

As an ecosystem analyst viewing the graph, I want to immediately see which spaces are public and which are private so that I can understand the openness and accessibility of different parts of the ecosystem at a glance.

Each space node (L0, L1, L2) in the graph displays a small icon overlay indicating its privacy mode. Public spaces show an open/unlocked icon; private spaces show a lock icon. The indicator is always visible alongside the space node and does not interfere with existing node visuals (avatar, label, selection highlighting).

**Why this priority**: This is the core value of the feature — making privacy mode visible in the graph. Without this, there is no visual distinction between public and private spaces, which is the primary user need.

**Independent Test**: Load a graph containing both public and private spaces. Verify that each space node displays the correct icon (lock for private, open indicator for public). Confirm that the icons are legible at both default and zoomed views and do not overlap with other node elements.

**Acceptance Scenarios**:

1. **Given** a graph is loaded with spaces that have mixed privacy modes, **When** the user views the graph, **Then** each space node displays a small icon indicating whether it is public (unlocked icon) or private (lock icon).
2. **Given** a private space node is rendered, **When** the user zooms in or out, **Then** the lock icon remains proportionally visible and legible.
3. **Given** a space node is selected or highlighted, **When** selection highlighting is applied, **Then** the visibility icon remains visible and does not conflict with highlight styling.
4. **Given** a space has subspaces with different privacy modes, **When** viewing the graph, **Then** each subspace independently shows its own correct visibility indicator.

---

### User Story 2 — Filter Graph by Visibility (Priority: P2)

As an ecosystem analyst, I want to filter the graph to show only public spaces, only private spaces, or both, so that I can focus my analysis on spaces with a specific access level.

The control panel includes a "Visibility" filter section with checkboxes for "Public" and "Private". Toggling these checkboxes shows or hides space nodes (and their connected edges) matching that visibility mode. When a visibility filter is toggled off, the space nodes of that type and their direct CHILD edges are hidden. People and organizations connected *only* to hidden spaces are also hidden (orphan removal). The filter operates without restarting the simulation.

**Why this priority**: Filtering enhances the analysis capability but depends on visibility data already being present in the dataset (delivered by US1). It adds analytical value on top of the visual indicator.

**Independent Test**: Load a graph with mixed visibility spaces. Toggle "Public" off — verify all public spaces disappear along with their CHILD edges and any users/orgs that become orphaned. Toggle "Public" back on and "Private" off — verify the inverse. Confirm no simulation restart occurs and node positions are preserved.

**Acceptance Scenarios**:

1. **Given** the graph shows both public and private spaces, **When** the user unchecks "Public" in the Visibility filter, **Then** all public space nodes, their CHILD edges, and any orphaned users/organizations disappear within 300ms.
2. **Given** the "Private" filter is unchecked, **When** the user re-checks it, **Then** the previously hidden private spaces and their connections reappear without simulation restart.
3. **Given** both visibility filters are checked (default), **When** the user views the filter section, **Then** it shows counts of public and private spaces (e.g., "Public (12)" and "Private (5)").
4. **Given** a user is connected to both a public and a private space, **When** only "Public" is checked, **Then** the user remains visible because they still have a visible connection.

---

### User Story 3 — Legend Entry for Visibility Icons (Priority: P3)

As a user viewing the graph for the first time, I want the legend to explain what the lock and unlocked icons mean so that I can understand the graph without external documentation.

The legend in the control panel includes a "Visibility" group with entries for the public icon and the private (lock) icon, explaining their meaning.

**Why this priority**: This is a polish/discoverability enhancement. The icons should be self-explanatory to most users, but a legend entry ensures clarity for all users.

**Independent Test**: Open the control panel legend section. Verify a "Visibility" group exists with entries matching the icons used on space nodes.

**Acceptance Scenarios**:

1. **Given** the control panel legend is visible, **When** the user scrolls to the legend, **Then** a "Visibility" group shows an entry for "Public" (with the open icon) and "Private" (with the lock icon).

---

### Edge Cases

- What happens when the API does not return privacy settings for a space (e.g., permission denied)? **Assumption**: Default to "public" and do not show a lock icon.
- What happens when all spaces have the same visibility? The filter still appears with one count at zero. The icons are still rendered for consistency.
- What happens when visibility data is unavailable for subspaces because the user lacks access? If the `settings.privacy.mode` field is not returned, treat the space as public (no lock icon).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch the privacy mode (`settings.privacy.mode`) for each space (L0, L1, L2) from the Alkemio GraphQL API.
- **FR-002**: System MUST include the privacy mode in the graph dataset delivered from the BFF to the frontend, as a new field on space `GraphNode` entities.
- **FR-003**: Each space node in the graph MUST display a small icon overlay indicating its privacy mode — a lock icon for private spaces and an open/unlocked icon for public spaces.
- **FR-004**: Visibility icons MUST remain legible and proportionally sized across all zoom levels.
- **FR-005**: Visibility icons MUST NOT interfere with existing node visuals (avatar rendering, selection highlighting, activity pulse).
- **FR-006**: The control panel MUST include a "Visibility" filter section with checkboxes for "Public" and "Private", both checked by default.
- **FR-007**: Toggling a visibility filter MUST show/hide space nodes of that privacy mode, their CHILD edges, and any orphaned users/organizations within 300ms, without restarting the simulation.
- **FR-008**: The visibility filter checkboxes MUST display the count of spaces for each privacy mode (e.g., "Public (12)").
- **FR-009**: The control panel legend MUST include a "Visibility" group explaining the public and private icons.
- **FR-010**: When privacy mode data is not available for a space, the system MUST default to treating it as public.

### Key Entities

- **GraphNode (space types)**: Extended with a `privacyMode` attribute (`'PUBLIC' | 'PRIVATE'`) for nodes of type SPACE_L0, SPACE_L1, and SPACE_L2. Users and organizations do not have this attribute.
- **SpaceSettings.privacy.mode**: The upstream Alkemio API field (`SpacePrivacyMode` enum: `PUBLIC`, `PRIVATE`) that provides the source data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify the privacy mode of any space in the graph within 2 seconds of viewing it, without clicking or hovering.
- **SC-002**: Users can filter the graph to show only public or only private spaces using the visibility filter toggles.
- **SC-003**: Visibility filter toggling completes within 300ms with no simulation restart or node position reset.
- **SC-004**: 100% of space nodes display the correct privacy icon matching the API-provided `settings.privacy.mode` value.
- **SC-005**: The legend accurately explains the meaning of both visibility icons.

## Assumptions

- The Alkemio API `settings.privacy.mode` field is accessible on all spaces the authenticated user has permission to query. If not returned, the space defaults to public.
- The `SpacePrivacyMode` enum has exactly two values: `PUBLIC` and `PRIVATE`. If new values are added in the future, they will be treated as public by default.
- Lock/unlocked icons will use inline SVG overlays on the space node circle, following the existing avatar overlay pattern in ForceGraph.tsx.
- The visibility filter is independent of the existing entity filters (Spaces, People, Organizations) and role filters (Members, Leads, Admins). All filters compose together.
