# Feature Specification: Ecosystem Metrics

**Feature Branch**: `014-ecosystem-metrics`  
**Created**: 2026-03-24  
**Status**: Draft  
**Input**: User description: "Enhance the force graph with discoverable ecosystem metrics — org/user counts per space, cross-space user connections, most connected users, busiest subspaces — surfaced alongside the graph and interactive (click to explore), with the potential to also serve as visual nudges that encourage exploration."

## Context

The force graph already visualises users, organisations, and spaces across the Alkemio ecosystem, but the rich structural insights hidden in the data are not surfaced to users. Stakeholders (e.g. the BZK discussion) describe their data as a "black box" — they know connections exist but cannot see patterns. This feature cracks open that box by computing and presenting ecosystem-level metrics that reveal who bridges communities, which subspaces are most active, and how organisations and people are distributed across the network. These metrics are **visible alongside the graph** in an expandable bottom panel (enhancing the existing metrics bar) so users can passively absorb ecosystem-level insights, and **interactive** so that clicking a metric reveals the underlying data in the graph. Optional floating nudge cards on the graph canvas can further encourage exploration.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ecosystem Overview at a Glance (Priority: P1)

A programme manager loads the force graph for their L0 space ecosystem. Before clicking any node, they immediately see a summary of key ecosystem metrics: how many users, organisations, and subspaces exist across the entire loaded network, along with a handful of headline insights (e.g. "12 users active across 3+ spaces", "Top connector: Jane Doe — 8 spaces"). This gives them an instant sense of scale and health without needing to manually count or click through nodes.

**Why this priority**: This is the foundational value — surfacing what the data already knows. Without an overview, every other metric lacks context.

**Independent Test**: Can be fully tested by loading any graph with at least two L0 spaces and verifying that ecosystem summary metrics appear without any user interaction beyond initial load.

**Acceptance Scenarios**:

1. **Given** a user has loaded a force graph with one or more L0 spaces, **When** the graph renders, **Then** the user sees an ecosystem metrics summary showing total user count, total organisation count, total subspace count (L1+L2), and headline insights for any metrics exceeding meaningful thresholds (e.g. bridge connectors > 0, subspace with 10+ members).
2. **Given** a user has loaded a graph with no nodes (empty ecosystem), **When** the graph renders, **Then** the metrics summary displays zeros and a message indicating no data is available.
3. **Given** the user applies filters (e.g. hides organisations), **When** filters change, **Then** the ecosystem metrics update to reflect only the currently visible nodes.

---

### User Story 2 — Cross-Space Connection Discovery (Priority: P1)

A policy advisor wants to understand which users bridge multiple spaces — people who are members of more than one L0 ecosystem or who participate in several subspaces within the same L0. They see a "bridge connectors" metric that highlights users connected to multiple spaces, with the ability to click through and see those users highlighted on the graph.

**Why this priority**: Cross-space bridges are the highest-value insight for stakeholders like BZK who want to understand knowledge flow between communities. This is the "aha moment" that demonstrates the platform can crack the black box.

**Independent Test**: Can be fully tested by loading a graph where at least one user belongs to two or more L0 spaces, verifying the bridge connector count appears, and clicking it to highlight those users on the graph.

**Acceptance Scenarios**:

1. **Given** a graph with users who belong to multiple L0 spaces, **When** the user views ecosystem metrics, **Then** they see a count of "bridge connectors" (users in 2+ L0 ecosystems) and can click to highlight those users on the graph.
2. **Given** a graph where no user belongs to more than one L0 space, **When** the user views ecosystem metrics, **Then** the bridge connector count shows zero.
3. **Given** the user clicks a bridge connector highlight, **When** the graph updates, **Then** the bridging user's nodes are visually emphasised (e.g. glow, scale-up) and their cross-space edges are highlighted, while other nodes dim.

---

### User Story 3 — Space Engagement Rankings (Priority: P2)

A community manager wants to see which subspaces (L1 and below) have the most members connected, which ones are most active, and which are under-populated. They see a ranked list of subspaces by membership count and can click any subspace to focus the graph view on it.

**Why this priority**: Understanding relative engagement across subspaces helps community managers allocate attention and resources. This turns the graph from a pretty picture into actionable intelligence.

**Independent Test**: Can be fully tested by loading a graph with multiple L1/L2 subspaces of varying membership sizes and verifying the ranked list appears sorted correctly.

**Acceptance Scenarios**:

1. **Given** a graph with multiple L1/L2 subspaces, **When** the user views space engagement rankings, **Then** they see subspaces ranked by member count (descending), showing the subspace name and member count.
2. **Given** the user clicks a subspace in the ranking, **When** the graph updates, **Then** the view highlights that subspace and its members and edges on the graph.
3. **Given** a graph with a single subspace, **When** the user views rankings, **Then** just one entry appears with no ranking position.

---

### User Story 4 — Most Connected People & Organisations (Priority: P2)

A stakeholder wants to find the most connected individuals and organisations in the ecosystem — people/orgs who participate in the most spaces or have the most relationships. They see a "top connectors" leaderboard and can click any entry to select that node on the graph.

**Why this priority**: Identifying key connectors helps stakeholders find champions, influencers, and potential collaboration partners. It delivers on the "who are the most connected?" question from the BZK discussion.

**Independent Test**: Can be fully tested by loading a graph with varied node degrees and verifying the leaderboard shows the top entries sorted by connection count.

**Acceptance Scenarios**:

1. **Given** a graph with users and organisations of varying connectivity, **When** the user views the top connectors list, **Then** they see users and organisations ranked by the number of distinct spaces they are connected to, showing the top entries.
2. **Given** the user clicks an entry in the top connectors list, **When** the node is selected, **Then** the graph highlights that node and its connections, and the details drawer opens.
3. **Given** all nodes are connected to the same number of spaces, **When** the user views the list, **Then** entries are shown in alphabetical order with their shared space count.

---

### User Story 5 — Exploration Nudges (Priority: P3)

A first-time user arrives at the force graph and feels overwhelmed by the visual noise. Beyond the passive metric display and click-to-explore interactivity (covered in P1/P2 stories), the system could optionally present a few contextual prompts like "5 users bridge all 3 ecosystems — click to explore" or "Innovation Hub has 42 members — the busiest subspace". These nudges give the user a reason to start clicking and exploring.

**Why this priority**: This is an optional engagement layer on top of the core metrics. The nudges could convert passive viewers into active explorers by providing entry points into the graph. This is a lower priority because the interactive metrics themselves (P1/P2) already provide exploration pathways.

**Independent Test**: Can be fully tested by loading any graph and verifying that at least one actionable nudge appears, and clicking it triggers graph interaction (highlight, focus, or filter).

**Acceptance Scenarios**:

1. **Given** a graph has loaded with sufficient data, **When** the user views the metrics area, **Then** at least one contextual nudge is displayed with a clickable call-to-action.
2. **Given** the user clicks a nudge, **When** the graph responds, **Then** the relevant nodes/edges are highlighted, focused, or filtered based on the nudge content.
3. **Given** a graph with minimal data (e.g. one space, two members), **When** the graph loads, **Then** nudges gracefully degrade — showing simpler prompts or omitting nudges if no interesting patterns exist.

---

### Edge Cases

- What happens when a user has restricted nodes in the graph? Restricted nodes (where the user has READ_ABOUT but not READ access) are excluded entirely from metric computations and rankings. A visible indicator tells the user that some data may not be reflected due to access restrictions.
- How does the system handle a graph with only one L0 space? Cross-space bridge metrics should gracefully show "N/A" or zero rather than erroring.
- What happens when the user rapidly toggles filters? Metric recalculations should not cause visual flicker or stale data display.
- How should metrics behave when a graph is very large (500+ nodes)? Computation and display must remain responsive.
- What happens if the same user appears in multiple roles (member + lead) in the same space? They should be counted once per space, not once per role.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compute aggregate ecosystem metrics from the loaded graph data: total users, total organisations, total subspaces (L1+L2), and total edges.
- **FR-002**: System MUST identify and count "bridge connectors" — users who are connected to two or more L0 space ecosystems in the loaded graph.
- **FR-003**: System MUST identify users who participate in multiple subspaces (L1/L2) within the same L0 ecosystem and report a count of such "multi-space" users.
- **FR-004**: System MUST rank subspaces (L1 and below) by the number of connected members (descending) and present a ranked list.
- **FR-005**: System MUST rank users and organisations by total connection count (number of distinct spaces they are connected to) and present a "top connectors" list showing at least the top 5.
- **FR-006**: System MUST compute the organisation count per L0 ecosystem (how many distinct organisations are connected to this L0 and its subspaces).
- **FR-007**: System MUST support contextual nudge messages derived from the computed metrics (e.g. "X users bridge Y ecosystems", "Space Z has the most members"). Nudges are in scope as P3 — implemented after the core P1/P2 metrics are working.
- **FR-008**: When the user clicks a metric, ranking entry, or nudge, the system MUST trigger a corresponding graph interaction — highlighting, focusing, or filtering the relevant nodes and edges.
- **FR-009**: Ecosystem metrics MUST update when the user applies or changes filters (node type visibility, edge type filters, privacy filters).
- **FR-010**: System MUST respect node privacy — restricted nodes (spaces the user lacks full access to) and their connections MUST be excluded entirely from metric computations and rankings. A visible indicator (e.g. asterisk, tooltip, or footnote) MUST inform the user that some data may be excluded due to access restrictions.
- **FR-011**: System MUST present ecosystem metrics in an expandable bottom panel (building on the existing metrics bar). **Collapsed state** (visible by default): shows aggregate counts only — total users, organisations, subspaces, and bridge connectors. **Expanded state**: shows full rankings, top connectors leaderboard, space engagement details, and interactive drill-downs. Optionally, floating nudge cards may appear on the graph canvas to highlight notable insights and prompt exploration — these cards must be dismissable and should not obscure critical graph content.
- **FR-012**: System MUST handle empty or minimal graphs gracefully — displaying zero counts, omitting irrelevant rankings, and suppressing nudges when no meaningful patterns exist.

### Key Entities

- **Ecosystem Metrics**: Aggregate statistics computed from the full loaded graph — total counts by node type, density, and distribution measures. Derived in real-time from existing `GraphDataset` nodes and edges.
- **Bridge Connector**: A user node connected to two or more distinct L0 space ecosystems. Determined by counting distinct L0 scope groups in a user's edges.
- **Multi-Space User**: A user connected to two or more L1/L2 subspaces within the same L0 ecosystem. Derived from edge relationships grouped by parent space.
- **Space Engagement Ranking**: A sorted list of L1/L2 subspaces ordered by connected member count. Computed from edge counts per space node.
- **Top Connector**: A user or organisation node ranked by total distinct space connections. Computed from outgoing edge diversity.
- **Exploration Nudge**: A generated insight message with an associated graph action (highlight, focus, or filter). Derived from the most notable patterns in the computed metrics.

## Assumptions

- All metrics are computed from the already-loaded `GraphDataset` — no additional server calls or data fetching is required beyond what the existing graph generation provides.
- The existing `superConnectors` insight (nodes with degree > mean + 2σ) will be incorporated into the "top connectors" ranking rather than replaced.
- Metrics are computed client-side from the graph data already in memory. For typical ecosystem sizes (up to ~500 nodes), this is expected to be performant without server-side pre-computation.
- The "bridge connector" concept uses L0 scope groups (already present as `scopeGroup` on edges) to determine cross-ecosystem participation.
- Nudge messages are deterministic — given the same graph data, the same nudges appear. No randomisation or AI-generated text is involved.
- Headline insights in the collapsed metrics bar use threshold-based selection — only insights exceeding meaningful thresholds are shown (e.g. bridge connectors > 0, subspace with 10+ members). This means 0–4 insights may appear depending on the data.
- Users with fewer than 2 connections are not included in "top connectors" to avoid noise.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify the total number of organisations, users, and subspaces in their loaded ecosystem within 5 seconds of graph load, without clicking any node.
- **SC-002**: Users can discover which individuals bridge multiple L0 ecosystems within two clicks from the default graph view.
- **SC-003**: Users can find the most populated subspace and the most connected person in under 10 seconds of interaction.
- **SC-004**: At least one exploration nudge is displayed on every graph load containing 10+ nodes, prompting the user toward a specific graph interaction.
- **SC-005**: Clicking any metric, ranking entry, or nudge results in a visible graph interaction (highlight, focus, or filter) within 1 second.
- **SC-006**: Ecosystem metrics remain accurate and responsive when filters are toggled, updating within 500 milliseconds of filter change.
- **SC-007**: The feature increases force graph exploration depth — users who see ecosystem metrics interact with at least 3 more nodes per session compared to baseline (measurable via click/interaction tracking if implemented).
