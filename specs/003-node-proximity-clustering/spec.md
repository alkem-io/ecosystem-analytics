# Feature Specification: Node Proximity Clustering

**Feature Branch**: `003-node-proximity-clustering`
**Created**: 2026-02-23
**Status**: Draft
**Input**: User description: "The nodes are really hard to read when they come close together. In the original project we had code that helped with clustering nodes when they came close together; this was especially useful for map mode."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Grouped Badge for Overlapping Nodes (Priority: P1)

As a portfolio analyst viewing a crowded graph (especially in map mode), I want nodes that overlap or are very close together to be visually grouped into a single badge showing the count, so that the graph remains readable instead of becoming an indecipherable pile of overlapping circles.

**Why this priority**: This is the core problem — overlapping nodes make the graph unreadable. Grouping them into a counted badge is the fundamental fix. Without it, map mode is nearly unusable for spaces with many co-located members.

**Independent Test**: Can be tested by loading a space with users in the same city (e.g., DigiCampus has many members in Amsterdam/The Hague). In map mode, nodes at similar coordinates should collapse into a `+N` badge instead of stacking on top of each other.

**Acceptance Scenarios**:

1. **Given** the graph is rendered and two or more nodes are within a proximity threshold of each other, **When** the simulation stabilizes, **Then** those nodes are hidden and replaced by a single grouped badge displaying the number of nodes in the group.
2. **Given** a grouped badge is displayed, **When** the user hovers over it, **Then** a tooltip or visual indicator shows that it is a group that can be expanded.
3. **Given** nodes are spread apart (not within the proximity threshold), **When** the graph renders, **Then** all nodes display individually as normal — no grouping occurs.

---

### User Story 2 - Expand a Cluster to See Individual Nodes (Priority: P2)

As a portfolio analyst, I want to click on a grouped badge to expand it and see the individual nodes fanned out around the group center, so that I can inspect who is in the cluster and interact with individual nodes.

**Why this priority**: Grouping without the ability to expand would make clustered nodes inaccessible. This provides the essential interaction to access the underlying data.

**Independent Test**: Can be tested by clicking on any grouped badge and verifying the individual nodes animate outward in a circular arrangement.

**Acceptance Scenarios**:

1. **Given** a grouped badge with N nodes is displayed, **When** the user clicks the badge, **Then** the individual nodes fan out in a circle around the badge center, becoming individually visible and interactive.
2. **Given** a cluster has been expanded (nodes fanned out), **When** the user clicks on individual fanned-out nodes, **Then** normal node click behavior works (opens details panel).
3. **Given** a cluster has been expanded, **When** the user clicks on the background (empty area), **Then** the nodes collapse back into the grouped badge.

---

### User Story 3 - Clustering Respects Current Filters and Layout (Priority: P3)

As a portfolio analyst, I want the clustering behavior to work correctly regardless of which layout mode I'm using and which node types are visible, so that I have a consistent experience.

**Why this priority**: The feature must integrate with all existing graph modes. Without this, clustering might only work in one layout and feel incomplete.

**Independent Test**: Can be tested by switching between force, cluster, and map layouts and toggling people/organization visibility, verifying that clustering recalculates correctly after each change.

**Acceptance Scenarios**:

1. **Given** I am in map mode with clustering active, **When** I switch to force-directed mode, **Then** clustering recalculates based on the new node positions.
2. **Given** I have people hidden (toggle off), **When** clustering calculates groups, **Then** hidden nodes are not included in any cluster.
3. **Given** I am in map mode, **When** nodes at the same geographic location are clustered, **Then** the badge appears at that geographic position on the map.

---

### Edge Cases

- What happens when a cluster of 2 is formed? A `+2` badge should display — the minimum cluster size is 2 nodes.
- What happens when one node in an expanded cluster is dragged? The dragged node should detach from the fan-out; the remaining nodes stay in their fanned positions.
- What happens with a very large cluster (50+ nodes)? The fan-out radius should scale to accommodate the count, or the nodes should arrange in concentric rings.
- What happens when the graph has more than 300 nodes? Clustering calculations should have a performance ceiling — disable proximity clustering above a threshold to avoid O(n²) performance issues.
- What happens when search highlighting is active? Nodes matching the search should still be visible, even if they belong to a cluster. The cluster badge should indicate how many members match.
- What happens when a selected node is inside a cluster? The cluster should auto-expand to reveal the selected node.
- What happens when zoom level changes? Clustering should recalculate on zoom, since nodes that appear close at one zoom level may not be close at another.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect groups of two or more nodes whose screen-space positions are within a configurable proximity threshold of each other.
- **FR-002**: The system MUST replace overlapping nodes with a single grouped badge showing the count of nodes in the group (e.g., `+5`).
- **FR-003**: The system MUST hide individual nodes that belong to a cluster and show only the badge in their place.
- **FR-004**: The system MUST allow the user to click a grouped badge to expand the cluster, fanning out individual nodes in a circular pattern around the group center.
- **FR-005**: The system MUST collapse an expanded cluster back into a badge when the user clicks on the background (empty area of the graph).
- **FR-006**: The system MUST recalculate clusters when the graph layout changes (mode switch, filter toggle, zoom, simulation tick).
- **FR-007**: The system MUST work in all layout modes: force-directed, clustered, and map.
- **FR-008**: The system MUST preserve normal node interactions (click for details, drag) on individually visible nodes and on fanned-out nodes from an expanded cluster.
- **FR-009**: The system SHOULD disable proximity clustering when the total visible node count exceeds 300 to avoid performance degradation.
- **FR-010**: The system MUST position the grouped badge at the average position of its member nodes.
- **FR-011**: The system SHOULD visually distinguish the grouped badge from regular nodes (different appearance — e.g., neutral color, border, count text).

### Key Entities

- **Proximity Cluster**: A group of 2+ nodes whose screen-space positions are within the proximity threshold. Has a center position (average of members), a count, and a list of member nodes.
- **Grouped Badge**: The visual representation of a cluster — a circle with a count label. Clickable to expand.
- **Fan-Out State**: When a cluster is expanded, its member nodes are positioned in a circle around the cluster center. Collapsible back to the badge.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In map mode with 30+ co-located nodes, the number of visible overlapping node circles is reduced by at least 80% compared to without clustering.
- **SC-002**: Users can expand any cluster and access individual node details within 2 clicks (click badge → click node).
- **SC-003**: Cluster calculation completes within one animation frame (16ms) for graphs with up to 300 nodes.
- **SC-004**: The feature works consistently across all three layout modes without visual regressions.
- **SC-005**: Expanding and collapsing clusters feels responsive — transitions complete within 500ms.

## Assumptions

- The proximity threshold is measured in screen-space pixels, not geographic coordinates. This means clustering behavior is consistent regardless of projection or zoom level at the time of calculation.
- A reasonable default proximity threshold is ~10-15 pixels (matching the old project). This may be tuned during implementation.
- Clusters are non-hierarchical — a cluster cannot contain other clusters. If two clusters are close, they merge into one.
- The fan-out radius scales with the number of members in the cluster to avoid fanned-out nodes overlapping each other.
- Avatar images (from the 002 feature) should display on fanned-out nodes just as they do on regular nodes.
