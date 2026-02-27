# Feature Specification: Node Avatar Display

**Feature Branch**: `002-node-avatar-display`  
**Created**: 2026-02-23  
**Status**: Draft  
**Input**: User description: "I want the nodes for people to display profile images in the circle for that node instead of the color for that node."

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

### User Story 1 - View People as Avatars on the Graph (Priority: P1)

As a portfolio analyst exploring the ecosystem graph, I want to see profile images (avatars) inside the circular nodes representing people, so that I can quickly recognize individuals without having to hover or click on each node.

**Why this priority**: This is the core ask — replacing the solid gray circles for person nodes with their actual profile images. It directly improves the visual richness and usability of the graph by making people instantly identifiable.

**Independent Test**: Can be fully tested by loading any space that contains user nodes and verifying that user nodes with profile images display those images clipped inside the circle. Delivers immediate visual recognition value.

**Acceptance Scenarios**:

1. **Given** a space is loaded with user nodes that have profile images, **When** the graph renders, **Then** each user node displays the profile image clipped to a circle instead of a solid color fill.
2. **Given** a user node has a profile image, **When** the user zooms in or out on the graph, **Then** the avatar image scales proportionally with the node circle.
3. **Given** the graph is in any layout mode (force, clustered, or map), **When** user nodes are rendered, **Then** avatars display consistently across all layout modes.

---

### User Story 2 - Graceful Fallback for Missing Avatars (Priority: P2)

As a portfolio analyst, when a person in the ecosystem does not have a profile image set, I want to see a clear visual indicator (the existing color fill) so that the graph remains visually consistent and readable.

**Why this priority**: Not all users have profile images. Without a fallback, nodes could appear broken or empty. This ensures robustness.

**Independent Test**: Can be tested by loading a space containing users without profile images and verifying those nodes still render with the existing solid color fill.

**Acceptance Scenarios**:

1. **Given** a user node has no profile image (null or empty avatar URL), **When** the graph renders, **Then** the node displays with the existing solid color fill as it does today.
2. **Given** a user node's profile image fails to load (broken URL, network error), **When** the graph renders, **Then** the node falls back to the solid color fill gracefully without visual glitches.

---

### User Story 3 - Avatars for Organization Nodes (Priority: P3)

As a portfolio analyst, I want to see organization logos inside organization nodes too, so that organizations are also visually identifiable at a glance.

**Why this priority**: Organizations also have avatar/logo data available. Extending the same treatment to organization nodes further enriches the graph. Lower priority because the primary request is about people.

**Independent Test**: Can be tested by loading a space that contains organization nodes with logos and verifying they display inside the circles.

**Acceptance Scenarios**:

1. **Given** an organization node has an avatar/logo image, **When** the graph renders, **Then** the organization node displays its logo clipped to a circle.
2. **Given** an organization node has no avatar, **When** the graph renders, **Then** the node displays with the existing solid color fill.

---

### Edge Cases

- What happens when a profile image URL returns a 404 or is unreachable? The node should fall back to its default color fill.
- What happens when a profile image is very large (high resolution)? The display should not degrade performance — images should be rendered at node size, not at full resolution.
- What happens when many user nodes (100+) all have avatars? The graph should remain performant without noticeable rendering lag.
- What happens when the node circle is very small (low-weight nodes)? Avatars on very small nodes may become unrecognizable — they should still display but the experience gracefully degrades at tiny sizes.
- What happens when the user drags a node with an avatar? The avatar should move smoothly with the node during drag interactions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display profile images inside the circular node for user-type nodes that have an avatar URL available.
- **FR-002**: The system MUST clip the profile image to the circular shape of the node, maintaining the existing node size and border treatment.
- **FR-003**: The system MUST fall back to the existing solid color fill when a user node does not have an avatar URL (null or empty).
- **FR-004**: The system MUST fall back to the existing solid color fill when a profile image fails to load (network error, 404, etc.).
- **FR-005**: The system MUST display avatars consistently across all graph layout modes (force-directed, clustered, and map).
- **FR-006**: The system MUST preserve existing node interactions (click, hover, drag) when avatars are displayed — no change to interactive behavior.
- **FR-007**: The system SHOULD display organization logos/avatars inside organization-type nodes when available, using the same circular clipping treatment.
- **FR-008**: The system MUST maintain acceptable rendering performance when displaying avatars on graphs with 100+ user nodes.

### Key Entities

- **User Node**: A graph node representing a person in the ecosystem. Has a `displayName`, a `weight` (determines node size), and an `avatarUrl` (the profile image URL, may be null).
- **Organization Node**: A graph node representing an organization. Also has an `avatarUrl` for its logo/visual, may be null.
- **Avatar Image**: A profile image hosted externally. Fetched via URL, must be clipped to circular shape, must handle loading failures gracefully.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of user nodes with available profile images display those images inside their node circles upon graph load.
- **SC-002**: 100% of user nodes without profile images continue to display with the existing solid color fill — no visual regressions.
- **SC-003**: Avatar images load and display within 2 seconds of the graph rendering for a typical network connection.
- **SC-004**: Graph interactions (zoom, pan, drag, click) remain smooth and responsive with avatars displayed on 100+ nodes.
- **SC-005**: The feature works identically across all three layout modes (force-directed, clustered, map).

## Assumptions

- Profile image URLs provided by the platform are publicly accessible (no additional authentication required to fetch them from the browser).
- Profile images are reasonably sized (standard avatar dimensions) — no need to handle extremely large image files.
- The existing node sizing logic (based on weight) is unchanged; avatars are displayed within whatever size the node already is.
- Space-type nodes intentionally do not have avatars and will continue to render with their existing color fills.
