# Research: Role-Based Filters & Connection Colors

**Feature**: 006-role-filters
**Date**: 2026-02-26

## Research Questions

### RQ-1: How does the existing edge creation pipeline work, and where should ADMIN edges be added?

**Decision**: Extend `addContributorEdges()` in `transformer.ts` to iterate `roleSet.adminUsers` and push `EdgeType.ADMIN` edges, mirroring the existing `memberUsers` and `leadUsers` patterns.

**Rationale**:
- The `communityRolesFragment.graphql` fetches role data via `usersInRole(role: MEMBER)` and `usersInRole(role: LEAD)` aliases on the `RoleSet` type.
- Adding `adminUsers: usersInRole(role: ADMIN) { id }` to the fragment follows the exact same pattern.
- In `transformer.ts`, `addContributorEdges()` iterates each role array and calls `createEdge(id, space.id, EdgeType.MEMBER/LEAD, scopeGroup)`. Adding a third loop for `roleSet.adminUsers` with `EdgeType.ADMIN` is a 4-line change.
- The `SpaceLike` interface in transformer.ts must be extended to include `adminUsers` in the `roleSet` shape.
- After adding to the fragment, `pnpm run codegen` regenerates the typed SDK (Constitution Principle II).

**Alternatives Considered**:
- **Separate GraphQL query for admins**: Would require a second API call per space. Unnecessary since `usersInRole` is already available on the same `RoleSet` type.
- **Derive admins from existing data**: Not possible — admin authorization is a distinct role, not derivable from member/lead status.

### RQ-2: Should role filters trigger a full graph rebuild or use visual-state updates?

**Decision**: Visual-state `useEffect` pattern (no simulation rebuild).

**Rationale**:
- FR-008 explicitly requires: "Role filter changes MUST NOT cause a full graph rebuild."
- The existing People/Orgs/Spaces filters ARE in the `renderGraph` dependency array (`[dataset, showPeople, showOrganizations, showSpaces, showMap, mapRegion]`) and trigger full SVG teardown + simulation restart.
- However, the selection highlighting, search highlighting, insight highlighting, and activity pulse effects all use separate `useEffect` hooks that manipulate D3 selections without rebuilding. This is the established pattern for lightweight visual updates.
- Role filters fit this pattern: iterate `linkSelRef.current` to show/hide edges by type, then compute which USER nodes become orphaned and hide them.
- The `graphVersion` counter (incremented after each `renderGraph`) is used as a dependency to re-apply visual-state effects when the graph IS rebuilt for other reasons (e.g., dataset change, People toggle).

**Alternatives Considered**:
- **Add to renderGraph deps**: Simpler but causes full simulation restart on every role toggle — violates FR-008 and breaks SC-003 (300ms response).
- **useMemo filtered dataset**: Would filter edges before rendering, but still requires `renderGraph` to re-run. Better than full rebuild if combined with stable simulation, but more complex than the D3 selection approach.

### RQ-3: How should role filter state compose with existing visual effects?

**Decision**: Role filter effect runs first (sets display), then selection/search/pulse effects compose on top. The `visibleEdgesRef` is updated by the role filter effect to keep neighbor calculations correct.

**Rationale**:
- The existing effect order is: renderGraph → search highlighting → insight highlighting → selection highlighting → activity pulse. Effects depend on `graphVersion` to re-apply after a graph rebuild.
- Role filter visibility should be the "base layer" — it determines which edges exist at all. Selection/search/pulse then modify opacity/color/animation on the visible subset.
- `visibleEdgesRef.current` is currently set inside `renderGraph` (it stores edges that passed the node-type filter). The role filter effect must further filter this ref to exclude role-hidden edges, so that selection highlighting computes correct 1st/2nd-degree neighbors.
- When both a role filter changes AND a selection is active, the role filter effect must re-trigger the selection highlight logic. This is achieved by having the selection effect also depend on the role filter state (or by calling a shared highlight function from both effects).

**Implementation detail**: The cleanest approach is:
1. Role filter effect updates edge display + `visibleEdgesRef`.
2. If `selectedNodeIdRef.current` is set, the role filter effect calls the same highlighting logic as the selection effect (extracted to a shared function).
3. This avoids adding role filters as deps to the selection effect (which would cause unnecessary re-runs when no selection is active).

### RQ-4: What edge color palette provides maximum distinguishability and WCAG compliance?

**Decision**: Four-color palette using Tailwind CSS color stops: indigo-700 (CHILD), orange-600 (LEAD), teal-600 (ADMIN), slate-400 (MEMBER).

**Rationale**:
- **Hue separation**: The four colors sit on different segments of the color wheel — blue-purple (240°), orange (30°), teal (175°), neutral gray. This maximizes perceptual distance, including for users with protanopia/deuteranopia (red-green color blindness), since the critical distinction is between blue-tinted (CHILD), warm (LEAD), cool-green (ADMIN), and neutral (MEMBER).
- **WCAG AA for non-text graphical elements (SC 1.4.11)**: Requires ≥ 3:1 contrast against adjacent colors. For semi-transparent edges on a white background:
  - CHILD `rgba(67,56,202,0.60)` blends to ~rgb(142,136,223) → contrast ratio ≈ 3.2:1 ✓
  - LEAD `rgba(234,88,12,0.60)` blends to ~rgb(242,188,159) → contrast ratio ≈ 2.0:1 — borderline. If insufficient, bump to 0.70 opacity → ≈ 2.8:1. Accept as trade-off with visual noise.
  - ADMIN `rgba(13,148,136,0.60)` blends to ~rgb(110,189,183) → contrast ratio ≈ 2.5:1 — similar situation. Bump to 0.65 if needed.
  - MEMBER `rgba(148,163,184,0.35)` blends to ~rgb(218,224,231) → ≈ 1.3:1 — intentionally subtle. Documented as design trade-off.
- **Current LEAD color** (`rgba(170,135,55,0.50)`, brown) is difficult to distinguish from the background and from MEMBER edges. The new amber/orange is significantly more visible and distinct.
- **Legend colors**: The control panel legend must match the new palette. Currently hardcoded as inline RGBA strings in `ControlPanel.tsx`.

**Alternatives Considered**:
- **Full-opacity thin lines**: Would meet contrast easily but look harsh and overwhelming with 100+ edges.
- **HSL rotation**: Programmatic equal-hue-spacing (0°, 90°, 180°, 270°) — produces visually unpleasant combinations. Curated palette is better.
- **Colorbrewer qualitative**: Good for maps, but limited to colorblind-safe sets of 3-4 that don't include a "subtle" option for majority edges.

### RQ-5: How should the "People" toggle and role filters interact?

**Decision**: People toggle takes absolute precedence. When People is OFF, all user→space edges and user nodes are hidden regardless of role filter state. Role filters only apply when People is ON.

**Rationale**:
- FR-004: "The People visibility toggle MUST take precedence."
- Implementation: The People toggle is in the `renderGraph` dependency array — when it goes OFF, `renderGraph` runs and excludes all USER nodes from `visibleNodes`. The role filter useEffect then has no user edges to show/hide.
- When People is toggled back ON, `renderGraph` rebuilds with all users, and the role filter effect re-applies based on current `showMembers`/`showLeads`/`showAdmins` state.
- The FilterControls UI should visually indicate that role filters are inactive when People is OFF (e.g., disabled/grayed out checkboxes).

### RQ-6: Should organization edges be affected by role filters?

**Decision**: No. Role filters apply only to user→space edges. Organization→space edges (also typed MEMBER/LEAD) are governed solely by the "Organizations" toggle.

**Rationale**:
- Spec assumption: "Organization→space edges (which also use MEMBER/LEAD types) are governed by the existing Organizations filter and are not affected by the new role filters."
- Implementation: The role filter effect checks `sourceNode.type === 'USER'` before applying show/hide logic. Organization edges pass through unaffected.
- This means when "Members" is unchecked, org-member edges still show (only user-member edges are hidden).

### RQ-7: How should role counts be computed for filter labels?

**Decision**: Count unique users per role type by iterating edge data in the dataset.

**Rationale**:
- FR-005: "Display the count of unique users per role next to each role filter label."
- The count should reflect unique users, not edges. A user who is a member of 5 spaces counts as 1 member.
- Implementation: In FilterControls, for each role type, collect `Set<sourceId>` from edges where `type === 'MEMBER'/'LEAD'/'ADMIN'` and source node is a USER. Display `Set.size`.
- This computation is lightweight (single pass over edges) and can be memoized.

## Summary

- ADMIN edges added via same fragment pattern as MEMBER/LEAD — minimal server change
- Role filters use visual-state useEffect, not renderGraph rebuild
- Four-color palette maximizes hue separation; MEMBER intentionally subtle
- People toggle takes absolute precedence over role filters
- Org edges unaffected by role filters
- Counts show unique users, computed from edge data
