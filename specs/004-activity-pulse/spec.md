# Feature Specification: Activity Pulse Visualization

**Feature Branch**: `004-activity-pulse`  
**Created**: 2026-02-24  
**Status**: Draft  
**Input**: User description: "Add a mode to the force graph and map graph where if users enable it, the lines become animated to pulse from the user to the space they contribute towards. The more a user contributes to a space, the more the line pulses."

## Clarifications

### Session 2026-02-24

- Q: Should the system respect the OS "reduce motion" accessibility preference? → A: Yes — respect `prefers-reduced-motion` by replacing animated pulse with a static visual indicator (edge color/thickness varies by contribution level, no animation).
- Q: How should contribution counts map to activity tiers? → A: Percentile-based — tiers derived from the distribution of contribution counts in the loaded dataset (e.g., bottom 25% = low, top 25% = high), so tiers adapt to each ecosystem's actual activity levels.

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

### User Story 1 — Enable Activity Pulse Mode (Priority: P1)

An ecosystem analyst viewing the force graph or map graph wants to understand how actively users contribute to each space. They click an "Activity Pulse" toggle in the controls panel. Since contribution data was already fetched during the initial graph load, the pulse animation starts immediately — every user→space membership line begins to animate with a flowing pulse effect. Lines connected to highly active contributors pulse noticeably faster and more vibrantly than lines connected to passive members, giving the analyst an immediate at-a-glance sense of where energy flows in the ecosystem.

**Why this priority**: This is the core value proposition — without the animated pulse, the feature does not exist. It transforms the graph from a static membership map into a living representation of engagement.

**Independent Test**: Can be fully tested by toggling Activity Pulse on a loaded graph and verifying that user→space lines animate immediately with varying speeds proportional to contribution counts.

**Acceptance Scenarios**:

1. **Given** the graph is loaded with spaces and users visible (contribution data already fetched), **When** the user enables the Activity Pulse toggle, **Then** all user→space membership/lead edges immediately begin animating with a directional flowing pulse (from user toward space).
2. **Given** Activity Pulse is enabled, **When** a user has contributed 50+ activities to a space, **Then** that edge pulses visibly faster than an edge for a user with only 1-2 contributions.
3. **Given** Activity Pulse is enabled, **When** a user has zero recorded contributions to a space (member but inactive), **Then** that edge shows a very slow, dim pulse or remains static.
4. **Given** Activity Pulse is enabled, **When** the user disables the toggle, **Then** all edges smoothly transition back to their default static appearance within 1 second.

---

### User Story 2 — Contribution Data Included in Graph Load (Priority: P2)

Contribution data is fetched as part of the initial graph generation alongside space hierarchy, members, and organizations. This means Activity Pulse is always ready to activate instantly — no secondary fetch, no loading spinner on toggle. If contribution data cannot be retrieved during graph generation, the Activity Pulse toggle is hidden or disabled with a tooltip explaining why.

**Why this priority**: Bundling data fetch with graph load eliminates a separate loading state, making the feature feel instant and seamless.

**Independent Test**: Can be tested by loading a graph and verifying that contribution data is present in the dataset, and that toggling Activity Pulse activates immediately.

**Acceptance Scenarios**:

1. **Given** the user loads a space graph, **When** the graph generation completes, **Then** contribution data for all user→space edges is included in the dataset.
2. **Given** the graph has loaded with contribution data, **When** the user toggles Activity Pulse on, **Then** the animation starts immediately with no additional loading delay.
3. **Given** contribution data could not be retrieved during graph generation (API error), **When** the graph loads, **Then** the Activity Pulse toggle is disabled with a tooltip explaining that activity data is unavailable.

---

### User Story 3 — Activity Pulse Works in Both Views (Priority: P3)

The analyst switches between the force graph view and the map (geographic) view. Activity Pulse mode persists across view switches — if it was enabled in the force graph, it remains enabled when switching to the map view, and vice versa. The animation behaves consistently in both views.

**Why this priority**: Consistency across views prevents user confusion and makes the feature feel integrated rather than bolted on.

**Independent Test**: Can be tested by enabling Activity Pulse in force graph view, switching to map view, and verifying animations continue with the same contribution-based intensity.

**Acceptance Scenarios**:

1. **Given** Activity Pulse is enabled in force graph view, **When** the user switches to map view, **Then** the pulse animation continues on the corresponding edges without interruption.
2. **Given** Activity Pulse is enabled in map view, **When** the user switches to force graph view, **Then** the pulse animation continues on the corresponding edges.

---

### User Story 4 — Pulse Intensity on Node Selection (Priority: P4)

When the analyst selects a specific node (user or space), the existing selection highlighting (opacity fade, colored strokes) combines naturally with Activity Pulse. The selected node's direct connection pulses remain clearly visible, while non-connected edges are dimmed as usual. This lets the analyst focus on one contributor's activity pattern.

**Why this priority**: Selection highlighting already exists; this story ensures the two features compose well rather than conflicting visually.

**Independent Test**: Can be tested by enabling Activity Pulse, clicking a user node, and verifying that the user's connected space edges pulse prominently while unrelated edges are both dimmed and have reduced/paused animation.

**Acceptance Scenarios**:

1. **Given** Activity Pulse is enabled and a user node is selected, **When** the selection highlight is applied, **Then** the selected node's direct connection edges pulse at their contribution-based speed while remaining fully opaque.
2. **Given** Activity Pulse is enabled and a node is selected, **When** non-connected edges are dimmed, **Then** their pulse animation is also subdued (slower/fainter) to avoid visual noise.
3. **Given** Activity Pulse is enabled and a node is selected, **When** the user deselects the node, **Then** all edges return to their unfiltered pulse state.

---

### Edge Cases

- What happens when a space has hundreds of members? — Animation must remain performant; degrade gracefully by only animating visible edges (viewport culling) or reducing effects at high zoom levels.
- What happens when contribution data is stale (cached for 24 hours)? — Acceptable; the pulse represents a general activity level, not real-time data. Cache freshness is displayed to the user.
- What happens when a user is a member of multiple spaces with wildly different activity levels? — Each edge is independent; the same user can have a fast-pulsing edge to one space and a slow-pulsing edge to another.
- What happens when the graph is zoomed out with many overlapping edges? — At extreme zoom-out, individual pulse animations may blend together. This is acceptable as it creates a general "energy" impression of the network.
- What happens for organization→space edges? — Organizations do not have individual activity data. Organization edges remain static when Activity Pulse is enabled, or show aggregate activity if the platform provides it.
- What happens when a user has `prefers-reduced-motion` enabled? — The system replaces animated pulse with a static visual indicator: edge color and/or thickness varies by contribution level, but no animation plays. The Activity Pulse toggle still functions but activates the static variant.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a toggle control labeled "Activity Pulse" in the graph controls panel that enables/disables the pulse animation mode.
- **FR-002**: System MUST fetch per-user contribution counts for each space as part of the initial graph generation process, alongside space hierarchy and membership data.
- **FR-003**: Contribution data MUST be included in the cached graph dataset, sharing the same cache policy and lifecycle as other graph data (currently 24-hour TTL).
- **FR-004**: System MUST animate user→space edges with a directional flowing effect (from user node toward space node) when Activity Pulse is enabled.
- **FR-005**: System MUST vary the animation speed proportionally to the user's contribution count for that specific space — higher contribution count results in a faster pulse.
- **FR-006**: System MUST define at least 4 distinct activity tiers (e.g., inactive, low, medium, high) using percentile-based boundaries computed from the loaded dataset's contribution count distribution. Tiers adapt to each ecosystem's actual activity levels (e.g., bottom 25% = low, top 25% = high, 0 contributions = inactive).
- **FR-007**: System MUST disable the Activity Pulse toggle with an explanatory tooltip if contribution data could not be retrieved during graph generation.
- **FR-008**: System MUST NOT require any additional network requests when the user toggles Activity Pulse on or off — all data is already loaded.
- **FR-009**: System MUST persist the Activity Pulse enabled/disabled state when switching between force graph and map views.
- **FR-010**: System MUST smoothly transition edges on/off animation (fade in/out over ~300ms) when toggling Activity Pulse.
- **FR-011**: System MUST compose Activity Pulse with existing node selection highlighting — selected node connections keep their pulse, non-connected edges are visually subdued.
- **FR-012**: System MUST count contributions using platform activity events: posts created, comments made, discussions, whiteboard edits, updates sent, and calendar events created.
- **FR-013**: Organization→space edges MUST remain static (no pulse) when Activity Pulse is enabled, since organizations do not have individual activity data.
- **FR-014**: System MUST respect the `prefers-reduced-motion` OS/browser setting. When reduced motion is preferred, Activity Pulse MUST replace animated edges with a static visual indicator (varying edge color/thickness by contribution level) instead of animation.

### Key Entities

- **Contribution Count**: A numeric value representing how many activity events a specific user has generated within a specific space. Attributes: user ID, space ID, count, activity types included, date range.
- **Activity Tier**: A categorical classification (inactive/low/medium/high) derived from a user's contribution count relative to the dataset's percentile distribution. Tiers are recomputed per graph load so they adapt to each ecosystem. Used to determine pulse speed and visual intensity.
- **Pulse State**: Whether Activity Pulse mode is currently enabled. Contribution data lives in the graph dataset (always available once loaded). Toggle state is shared across force graph and map views.

### Assumptions

- The Alkemio platform API provides per-space activity logs that include the triggering user and event type. Based on the existing schema, the `activityLogOnCollaboration` and `activityFeed` queries support this.
- Contribution counts represent all-time activity unless a specific date range filter is added in a future iteration.
- Fetching contribution data during graph generation may increase initial load time. This is acceptable given it eliminates a second fetch and makes the pulse toggle instant.
- Performance is acceptable with up to ~500 animated edges simultaneously on modern browsers. Beyond that, progressive enhancement strategies (viewport culling) may be needed.
- The existing 24-hour server-side cache TTL is sufficient for activity data — real-time accuracy is not required for this visualization.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can enable Activity Pulse and see animated edges instantly (under 500ms) since contribution data is pre-loaded with the graph.
- **SC-002**: Users can visually distinguish at least 3 different activity levels (low/medium/high) when comparing edges in the same graph view.
- **SC-003**: The graph maintains smooth interaction (panning, zooming, node dragging) at 30+ frames per second with Activity Pulse enabled and up to 500 visible edges.
- **SC-004**: 80% of test users can correctly identify the most active contributor to a given space by observing the pulse visualization, without referring to raw data.
- **SC-005**: Toggling Activity Pulse on and off completes its visual transition within 1 second.
- **SC-006**: Activity Pulse state persists correctly across view switches (force graph ↔ map) 100% of the time.
