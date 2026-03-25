# Research: Ecosystem Metrics

**Feature**: 014-ecosystem-metrics  
**Date**: 2026-03-24

## Research Questions

### RQ-1: How should bridge connectors be identified from the existing GraphDataset?

**Decision**: Count distinct L0 `scopeGroup` values from a user's edges. A user with 2+ distinct L0 scope groups is a bridge connector.

**Rationale**:
- Every `GraphEdge` already carries a `scopeGroup` field indicating which L0 ecosystem the edge belongs to.
- The `scopeGroup` value corresponds to the L0 space's `nameId` (or similar identifier), so counting distinct values directly yields the cross-ecosystem count.
- This avoids traversing the node hierarchy to determine L0 ancestry — the data is already denormalized on edges.
- The existing `clustering.ts` already uses `node.scopeGroups` to group nodes by L0 ecosystem, confirming this as the established pattern.

**Alternatives Considered**:
- **Walk parentSpaceId chain**: Would require building a parent lookup map and traversing up to L0 for each space node. More complex, same result.
- **Use node.scopeGroups on USER nodes**: Viable but less precise — a user's `scopeGroups` lists all L0 ecosystems they belong to, which is the same information. However, computing from edges allows filtering by edge type (e.g., exclude CHILD edges) if needed in the future.

### RQ-2: How should "top connectors" ranking work — total edges or distinct spaces?

**Decision**: Rank by the number of **distinct spaces** (L0/L1/L2) a user or organisation is connected to, not total edge count.

**Rationale**:
- A user who is a MEMBER + LEAD in the same space would have 2 edges but only 1 distinct space connection. Total edge count over-weights users with multiple roles in one space.
- The spec (FR-005) explicitly says "number of distinct spaces they are connected to".
- The stakeholder decision (from the user) confirms: "Top connectors ranked by distinct space count (not total edges)".
- Implementation: For each USER/ORG node, collect `Set<targetId>` from their edges where the target is a space node. The set size is the ranking value.

**Alternatives Considered**:
- **Total edge count (degree centrality)**: Simpler but misleading — penalises users in one space with many roles less than users spread across spaces.
- **Weighted degree**: Complex, no clear weighting scheme requested.

### RQ-3: Where should metric computation live — server or client?

**Decision**: All metrics computed client-side in a React hook (`useEcosystemMetrics`).

**Rationale**:
- The spec explicitly states: "All metrics computed client-side from existing GraphDataset."
- The `GraphDataset` is already fully loaded in frontend memory. Re-sending it to the server for computation adds latency with no benefit.
- For typical ecosystem sizes (≤500 nodes, ≤2000 edges), Map/Set-based computations complete in <10ms — well within React rendering budget.
- Client-side computation also means filter changes (showPeople, showOrgs, showSpaces) can be re-computed instantly via `useMemo` without network round-trips.
- The existing `computeInsights` function on the server computes `superConnectors` and `isolatedNodes` — the new ecosystem metrics are complementary and don't duplicate that logic.

**Alternatives Considered**:
- **Server-side pre-computation**: Would require a new endpoint, adds latency, and wouldn't react to filter changes without re-fetching.
- **Web Worker**: Overkill for <10ms computation. Could be added later if ecosystems grow to 5000+ nodes.

### RQ-4: How should the expandable bottom panel be implemented?

**Decision**: Enhance the existing `MetricsBar` component with a collapsed/expanded toggle. Expanded content rendered in a new `MetricsPanel` component that appears as an overlay above the bar.

**Rationale**:
- The existing `MetricsBar` is already positioned at the bottom of the Explorer layout, below the graph canvas. It's the natural anchor for expanded metrics.
- Using CSS `max-height` transition from a slim bar to a full panel provides smooth animation without layout reflows.
- An overlay approach (positioned above the bar, not pushing the graph canvas up) avoids disrupting the force simulation or map view during expansion.
- The tab-based content structure (Overview │ Rankings │ Connectors) keeps the expanded panel organised without horizontal scrolling.

**Alternatives Considered**:
- **Sidebar panel**: Already used by ControlPanel (left) and DetailsDrawer (right). Adding a third would feel cramped.
- **Modal dialog**: Blocks graph interaction, counter to the "visible alongside the graph" requirement.
- **Push layout (resize graph)**: Causes force simulation restart and map re-render. Bad UX.

### RQ-5: How should restricted nodes be handled in metrics?

**Decision**: Exclude restricted nodes (`node.restricted === true`) entirely from all metric computations and rankings. Show a visible indicator when restricted nodes exist.

**Rationale**:
- The spec (FR-010) says: "restricted nodes and their connections MUST be excluded entirely from metric computations and rankings."
- The `restricted` field is already present on `GraphNode` (set when user has `READ_ABOUT` but not `READ` access).
- Exclusion is applied at the filtering step (step 1 in the computation flow), before any metrics are calculated. This ensures consistency — the same filtered node/edge sets are used for all computations.
- The indicator is a small footnote or tooltip on the MetricsBar: "* Some data excluded due to access restrictions".

**Alternatives Considered**:
- **Include restricted nodes with reduced weight**: Complicates every computation, unclear what "reduced" means.
- **Show restricted metrics separately**: Over-complicates the UI for an edge case.

### RQ-6: How should headline insights be selected?

**Decision**: Threshold-based selection: evaluate up to 4 insight candidates in priority order, include only those exceeding meaningful thresholds. Show 0–4 insights depending on data.

**Rationale**:
- The spec assumption says: "Headline insights use threshold-based selection — only insights exceeding meaningful thresholds are shown (e.g. bridge connectors > 0, subspace with 10+ members). This means 0–4 insights may appear depending on the data."
- Priority-ordered candidates (evaluated in sequence):
  1. **Bridge connectors** (threshold: > 0): "N users active across M+ ecosystems"
  2. **Busiest subspace** (threshold: ≥ 10 members): "Space X has Y members — busiest subspace"
  3. **Top connector** (threshold: ≥ 3 spaces): "Top connector: Name — N spaces"
  4. **Organisation diversity** (threshold: ≥ 5 orgs): "N organisations across the ecosystem"
- This is deterministic — same data always produces same insights. No AI or randomisation.

**Alternatives Considered**:
- **Always show 4**: Empty or minimal graphs would show meaningless "0 bridge connectors" insights.
- **AI-generated text**: Spec explicitly says nudges are deterministic, no AI text.
- **Statistical anomaly detection**: Over-engineered for 4 fixed insight types.

### RQ-7: How should multi-space users be identified?

**Decision**: For each USER node, group their space edges by L0 ancestor. Within each L0 group, count distinct L1/L2 target space nodes. Users with 2+ distinct L1/L2 spaces in any single L0 group are multi-space users.

**Rationale**:
- FR-003 says: "users who participate in multiple subspaces (L1/L2) within the same L0 ecosystem."
- The `scopeGroup` on edges identifies the L0 ancestor. Edges to L1/L2 space targets within the same `scopeGroup` indicate multi-space participation.
- Implementation: For each user, filter edges to space targets (L1/L2 types). Group by `scopeGroup`. Check if any group has ≥ 2 distinct space targets.

### RQ-8: How should the user count handle deduplication across roles?

**Decision**: Each user is counted once per space regardless of how many roles (MEMBER, LEAD, ADMIN) they have in that space.

**Rationale**:
- The spec edge case explicitly states: "If the same user appears in multiple roles (member + lead) in the same space, they should be counted once per space, not once per role."
- Implementation: When counting members per space for rankings, use `Set<nodeId>` to deduplicate.
- When counting distinct spaces per user for top connectors, edges to the same space via different edge types (MEMBER + LEAD) should resolve to 1 space.

## Summary

- Bridge connectors: distinct L0 `scopeGroup` count from edges ≥ 2
- Top connectors: distinct space count (not total edges)
- All computation client-side in `useEcosystemMetrics` hook with `useMemo`
- Expandable bottom panel: enhanced MetricsBar + overlay MetricsPanel
- Restricted nodes: excluded at filtering step, footnote indicator
- Headlines: threshold-based, 0–4 shown, deterministic
- Multi-space: grouped by L0 via scopeGroup, ≥ 2 L1/L2 targets
- Deduplication: users counted once per space regardless of role count
