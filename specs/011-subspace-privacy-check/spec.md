# Feature Specification: Subspace Privacy-Aware Loading

**Feature Branch**: `011-subspace-privacy-check`
**Created**: 2026-03-07
**Status**: Draft
**Input**: User description: "I want to change the loading of subspaces in spaces. The logic should be that the subspaces are first retrieved with only the about information included, and then the privileges are checked. If the user has READ privilege, then go and retrieve the contents of the space as before. However if the user only has READ_ABOUT and not READ, then mark the space as private, and put a lock symbol on the node."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View accessible subspaces with full data (Priority: P1)

A user explores a Space where they have full READ access to all subspaces. The graph loads as it does today — each subspace node shows its community members, roles, and contributor edges. The user sees no difference from current behavior for spaces they can fully access.

**Why this priority**: This is the baseline behavior that must continue working. Most users will have READ access to many subspaces, and this flow must not regress.

**Independent Test**: Can be fully tested by selecting a Space where the user is a member of all subspaces and verifying the graph renders with full community data as before.

**Acceptance Scenarios**:

1. **Given** a user with READ privilege on all subspaces within a Space, **When** they generate a graph for that Space, **Then** all subspace nodes display with full community data, contributor edges, and no lock indicator.
2. **Given** a user with READ privilege on a subspace, **When** the graph loads, **Then** the subspace node shows the same information as the current implementation (display name, avatar, members, leads, activity data).

---

### User Story 2 - View restricted subspaces with lock indicator (Priority: P1)

A user explores a Space that contains subspaces where they only have READ_ABOUT privilege (not READ). These subspaces appear in the graph as nodes with their basic "about" information (name, tagline, avatar) but are visually marked as private with a lock symbol. No community/contributor data is shown for these nodes.

**Why this priority**: This is the core new capability. Currently, restricted subspaces either fail silently or are omitted entirely. Showing them with a lock indicator gives users awareness of the full space structure while respecting access boundaries.

**Independent Test**: Can be fully tested by selecting a Space containing subspaces where the user lacks READ privilege but has READ_ABOUT, and verifying those nodes appear with a lock symbol and no community data.

**Acceptance Scenarios**:

1. **Given** a user with only READ_ABOUT privilege on a subspace, **When** the graph loads, **Then** the subspace node appears with its display name, tagline, and avatar but no community members, roles, or contributor edges.
2. **Given** a user with only READ_ABOUT privilege on a subspace, **When** the graph loads, **Then** the subspace node displays a lock symbol indicating restricted access.
3. **Given** a mixed-access Space with some READ and some READ_ABOUT subspaces, **When** the graph loads, **Then** accessible subspaces show full data and restricted subspaces show lock indicators, all within the same graph.

---

### User Story 3 - Lock symbol tooltip and interaction (Priority: P2)

When a user hovers over or clicks on a locked subspace node, they see a clear indication that they do not have access to view the full contents of this space. The hover card or detail panel shows the available "about" information without attempting to display community data.

**Why this priority**: Enhances usability by explaining why a node looks different, but the core visualization works without it.

**Independent Test**: Can be tested by hovering over a locked node and verifying the tooltip/card shows "about" info and a privacy notice.

**Acceptance Scenarios**:

1. **Given** a locked subspace node, **When** the user hovers over it, **Then** the hover card displays the space name, tagline, and a message indicating the content is restricted.
2. **Given** a locked subspace node, **When** the user clicks to open the detail panel, **Then** the panel shows available "about" information and does not show empty community sections.

---

### Edge Cases

- What happens when a subspace has neither READ nor READ_ABOUT privilege? This indicates a serious configuration error — the system MUST log the error server-side and display an error to the user on the frontend.
- What happens when privilege information is unavailable (e.g., the API doesn't return `myPrivileges`)? This indicates something has gone very wrong — the system MUST log the error server-side and display an error to the user on the frontend.
- How are L2 subspaces handled when the parent L1 is private? L2 children are skipped entirely — no fetch is attempted. The user cannot have access to children of a space they cannot read, and attempting retrieval generates errors on both this application and the Alkemio server.
- User privileges do not change mid-retrieval — no special handling is needed for concurrent privilege changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST first retrieve subspaces with only "about" information (profile, tagline, avatar, visibility) and membership privileges before attempting to load full community data.
- **FR-002**: System MUST check the user's privileges on each subspace after retrieving "about" information. The relevant privileges are READ (full access) and READ_ABOUT (restricted access).
- **FR-003**: If the user has READ privilege on a subspace, the system MUST retrieve and display the full community data (members, leads, organizations, contributor edges) as in current behavior.
- **FR-004**: If the user has only READ_ABOUT privilege (without READ) on a subspace, the system MUST mark the subspace as private and display it with limited "about" information only.
- **FR-005**: Private subspace nodes MUST display a small lock icon overlaid on the bottom-right corner of the node circle. The avatar or initial remains visible beneath the overlay.
- **FR-006**: Private subspace nodes MUST NOT have contributor edges (MEMBER, LEAD, ADMIN) in the graph, since community data is not available. However, restricted nodes MUST be included in all graph metrics calculations (node counts, connectivity scores, degree centrality) — they are treated like any other node for metrics purposes.
- **FR-007**: Private subspace nodes MUST still have CHILD edges connecting them to their parent space, preserving the hierarchy structure.
- **FR-008**: The privilege check and two-phase loading MUST apply to L1 subspaces. When an L1 subspace is private (READ_ABOUT only), its L2 children MUST be skipped entirely — no fetch is attempted.
- **FR-009**: Subspaces where the user has neither READ nor READ_ABOUT privilege MUST be omitted from the graph, but the error MUST be logged server-side and the user MUST be notified on the frontend that a subspace was inaccessible.
- **FR-010**: The hover card for a private subspace MUST show available "about" information and indicate that content is restricted, without showing empty community sections.
- **FR-011**: Any GraphQL retrieval error during graph generation MUST be logged on the server (including the full error message from the Alkemio API) AND surfaced to the user on the frontend via a toast notification or error banner at the top of the page, showing the error message received from the Alkemio server. The graph MUST still render with whatever data was successfully retrieved. Errors must never be silently swallowed.

### Key Entities

- **Subspace Node**: A graph node representing an L1 or L2 subspace. Extended with a `restricted` boolean field (separate from the existing `privacyMode`). When `restricted` is true, community data fields are empty/absent and the node displays a lock indicator. The existing `privacyMode` continues to reflect the space's own `isContentPublic` setting.
- **User Privilege**: The set of authorization privileges the current user holds on a specific subspace, queried via `myPrivileges` on the space's membership info. Key values: `READ`, `READ_ABOUT`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All subspaces visible to the user (with READ or READ_ABOUT) appear in the graph — no accessible subspaces are silently dropped.
- **SC-002**: Private subspaces are visually distinguishable from accessible subspaces within 1 second of viewing the graph (lock symbol is immediately apparent).
- **SC-003**: Graph generation time does not increase by more than 20% compared to current behavior for spaces where the user has full READ access on all subspaces.
- **SC-004**: No community data (members, organizations, roles) is exposed for subspaces where the user only has READ_ABOUT privilege.

## Clarifications

### Session 2026-03-07

- Q: When a parent L1 subspace is private, should its L2 children still be fetched? → A: Skip L2 children entirely — the user cannot have access, and attempting retrieval generates errors on both this application and the Alkemio server.
- Q: How should the new privilege-based "private" status relate to the existing `privacyMode` field? → A: Add a separate `restricted` boolean field alongside the existing `privacyMode`.
- Q: Should restricted nodes be included in graph metrics calculations? → A: Include in all metrics — treat them like any other node.
- Q: How should the lock symbol be rendered? → A: Small lock icon overlay on the bottom-right corner of the node circle, avatar still visible.
- Q: How should the "neither READ nor READ_ABOUT" case be handled? → A: Omit from graph but still log server error and notify user on frontend.
- Q: How should errors be displayed to the user on the frontend? → A: Toast notification / error banner at top of page — graph still renders with available data.

## Assumptions

- The Alkemio GraphQL API exposes `myPrivileges` (or equivalent) on the `Space` or `SpaceAboutMembership` type, returning an array of `AuthorizationPrivilege` values for the current user.
- The "about" information (profile, tagline, avatar, visibility) is always available when the user has at least READ_ABOUT privilege.
- The lock symbol is a visual overlay on the existing node shape, consistent with the current design language (no new icon library required — a Unicode lock character or SVG path is sufficient).
- The two-phase fetch (about first, then full data for accessible spaces) can be implemented within the existing GraphQL query structure, either by restructuring the query or by making separate queries per subspace.
