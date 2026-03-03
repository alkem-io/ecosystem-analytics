# Feature Specification: Role-Based Filters & Connection Colors

**Feature Branch**: `006-role-filters`  
**Created**: 2026-02-26  
**Status**: Draft  
**Input**: User description: "Want to quickly be able to see members, admins, leads. Also want to be able to only see these. Add role-based filters like people and orgs filters for admins, leads, and members. Update connection colors to reflect roles — use a better color than brown for leads."

## Clarifications

### Session 2026-02-26

- Q: The spec assumed "admins" maps to the existing LEAD role since Alkemio had no separate admin community role. You clarified that admin is a distinct authorization — members with admin authorization on a space are admins. Does the API support querying admins separately? → A: Yes. The `RoleName` enum includes `ADMIN` alongside `MEMBER` and `LEAD`. We can query `usersInRole(role: ADMIN)` to get admin users per space. Three filters: Members, Leads, Admins.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Filter Graph by Role (Priority: P1)

As an ecosystem analyst, I want to toggle visibility of connections by role (member, lead, admin) so I can isolate specific relationship types and quickly understand the role makeup of a space.

**Why this priority**: This is the core feature request. Without role-based filtering, a dense graph makes it impossible to distinguish members from leads at a glance. Filtering lets users reduce noise and focus on the relationships that matter for their analysis.

**Independent Test**: Can be fully tested by toggling the "Members", "Leads", and "Admins" checkboxes in the filter panel and verifying that only edges of the selected role types (and their connected users) remain visible. Delivers immediate value for role-based exploration.

**Acceptance Scenarios**:

1. **Given** the graph is loaded with multiple spaces and users, **When** the user unchecks "Members" in the filter panel, **Then** all MEMBER-type edges and users who are *only* members (not also leads or admins) are hidden from the graph.
2. **Given** the graph is loaded, **When** the user unchecks "Leads" in the filter panel, **Then** all LEAD-type edges and users who are *only* leads (not also members or admins) are hidden.
3. **Given** the graph is loaded, **When** the user unchecks "Admins" in the filter panel, **Then** all ADMIN-type edges and users who are *only* admins (not also members or leads) are hidden.
4. **Given** all three role filters ("Members", "Leads", "Admins") are unchecked, **When** only space nodes remain visible, **Then** the graph shows spaces and their parent-child hierarchy edges but no user→space edges.
5. **Given** a user has edges of multiple role types (e.g., member of Space A, admin of Space B), **When** "Members" is unchecked but "Admins" is checked, **Then** the user remains visible but only their ADMIN edge is drawn.
6. **Given** the "People" filter is unchecked, **When** the user checks/unchecks role filters, **Then** no user nodes or user→space edges appear regardless of role filter state (People toggle takes precedence).

---

### User Story 2 — Improved Connection Colors for Roles (Priority: P1)

As a user, I want each connection type (member, lead, parent-child) to have a distinct, easily visible color so I can immediately identify relationships by visual scanning.

**Why this priority**: The current brown color for LEAD edges is hard to see against both light and dark backgrounds. Improving visual distinction between edge types makes the entire graph more readable without any interaction required. This is co-equal with P1 because it directly supports the filtering feature's value.

**Independent Test**: Can be tested visually — load a graph with mixed MEMBER and LEAD edges and confirm each type is immediately distinguishable by color. The new lead color should be clearly visible and distinct from member edges.

**Acceptance Scenarios**:

1. **Given** the graph is loaded, **When** the user views edges between users and spaces, **Then** MEMBER edges appear in a soft blue-gray color, LEAD edges appear in a warm amber/orange color, ADMIN edges appear in a distinct color (e.g., teal or emerald), and CHILD (parent-child) edges appear in indigo.
2. **Given** a user has both MEMBER and LEAD connections, **When** viewing the graph without any selection, **Then** the two connection types are visually distinguishable by color alone without needing to hover or click.
3. **Given** a user has reduced vision or color-differentiation difficulty, **When** viewing edge colors, **Then** the color choices pass WCAG AA contrast requirements against the graph background and are distinguishable from each other.

---

### User Story 3 — Role Filter Counts in Control Panel (Priority: P2)

As a user, I want to see the count of members and leads next to their respective filter toggles so I can quickly gauge the role distribution within the ecosystem.

**Why this priority**: Useful but secondary — the counts add context but the core value is the filtering itself.

**Independent Test**: Can be tested by comparing the displayed counts against the known number of MEMBER and LEAD edges in the dataset.

**Acceptance Scenarios**:

1. **Given** the graph is loaded, **When** the user views the role filter checkboxes, **Then** each checkbox label shows the count of unique users with that role (e.g., "Members (42)", "Leads (8)", "Admins (3)").
2. **Given** the dataset has users with multiple roles across different spaces, **When** counting, **Then** a user who is a member, lead, and admin across different spaces is counted in all applicable categories (since they have edges of each type).

---

### Edge Cases

- What happens when all role filters AND the People filter are unchecked? Only spaces, organizations, and hierarchy edges remain.
- What happens when a user has multiple role edges (MEMBER, LEAD, ADMIN) to the *same* space? All matching edges are drawn when their filters are on; when a filter is off, only the matching edge types remain visible.
- What happens when a user is an admin of a space but not explicitly a member? The admin edge is shown independently — admin is a separate role, not a subset of member.
- What happens when activity pulse is active and a role filter is toggled off? Pulse animation should stop for hidden edges and resume for visible ones.
- What happens when role filters are changed while a node is selected? The selection highlighting should re-apply after the filter change, respecting the new set of visible edges for neighbor calculation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide three role-based toggle filters in the control panel: "Members", "Leads", and "Admins", each defaulting to ON (checked).
- **FR-002**: When a role filter is unchecked, system MUST hide all edges of that type and any user nodes that no longer have visible edges.
- **FR-003**: When a user node has edges of multiple types (e.g., MEMBER to Space A, ADMIN to Space B, LEAD to Space C), hiding one role type MUST only hide the matching edges; the user remains visible if they still have at least one visible edge.
- **FR-009**: The server MUST fetch admin users per space via `usersInRole(role: ADMIN)` and create ADMIN-type edges in the graph dataset. This requires adding `ADMIN` to the `EdgeType` enum and extending the GraphQL community fragment.
- **FR-004**: The "People" visibility toggle MUST take precedence — if People is off, no user→space edges or user nodes are shown regardless of role filter state.
- **FR-005**: System MUST display the count of unique users per role next to each role filter label.
- **FR-006**: System MUST use a visually distinct, accessible color for each edge type. The LEAD edge color MUST be replaced with a clearly visible alternative (not brown).
- **FR-007**: Role filters MUST compose correctly with existing features: selection highlighting, activity pulse, search highlighting, and map overlay.
- **FR-008**: Role filter changes MUST NOT cause a full graph rebuild — they should be handled as lightweight visual updates (similar to how selection highlighting works), using the existing render-optimization pattern.

### Key Entities

- **Edge Role Type**: Each edge between a user and a space has a `type` property (`MEMBER`, `LEAD`, or `ADMIN`). The ADMIN type is new and requires extending the `EdgeType` enum and the GraphQL community roles fragment to fetch `usersInRole(role: ADMIN)`.
- **Role Filter State**: Three boolean toggles (`showMembers`, `showLeads`, `showAdmins`) managed in the Explorer component, passed down to ForceGraph and FilterControls.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can isolate lead-only or member-only relationships with a single click (toggle off one role).
- **SC-002**: All four edge types (CHILD, MEMBER, LEAD, ADMIN) are immediately distinguishable by color without interaction.
- **SC-003**: Role filter state changes are reflected in the graph within 300ms (no full re-render or simulation restart required).
- **SC-004**: Role filters function correctly in combination with all existing filters (People, Organizations, Spaces, Activity Pulse, Map, Search) — no visual glitches, stale highlights, or missing edges.
- **SC-005**: Edge colors meet WCAG AA contrast ratio (≥ 3:1) against the white/light-gray graph background.

## Assumptions

- The Alkemio API's `RoleName` enum includes `ADMIN`, `LEAD`, and `MEMBER` as distinct values. Admin is an authorization role — members with admin authorization on a space are admins. The `usersInRole(role: ADMIN)` query returns these users per space community.
- Organization→space edges (which also use `MEMBER`/`LEAD` types) are governed by the existing "Organizations" filter and are not affected by the new role filters, which apply only to user→space edges.
- The counts displayed in role filter labels count unique *users* (not unique edges), since a single user can have multiple edges of the same type to different spaces.
