# Tasks: Ecosystem Metrics

**Input**: Design documents from `/specs/014-ecosystem-metrics/`  
**Prerequisites**: plan.md ✅, spec.md ✅, data-model.md ✅, research.md ✅, quickstart.md ✅, contracts/README.md ✅

**Tests**: Not explicitly requested — test tasks omitted. Manual testing via quickstart.md.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- All file paths relative to repository root

---

## Phase 1: Setup (Type Definitions)

**Purpose**: Define all TypeScript interfaces consumed by the hook and UI components

- [x] T001 Define ecosystem metrics TypeScript interfaces (`EcosystemMetrics`, `AggregateMetrics`, `BridgeConnector`, `MultiSpaceUser`, `SpaceRanking`, `TopConnector`, `OrgDistribution`, `HeadlineInsight`, `InsightAction`, `NudgeData`) at the top of `frontend/src/hooks/useEcosystemMetrics.ts` — export all types; implement the hook as a stub returning empty/zero defaults so consuming code can import immediately. See `specs/014-ecosystem-metrics/data-model.md` for exact field definitions.

---

## Phase 2: Foundational (Core Computation + Wiring)

**Purpose**: Implement the metrics computation hook and wire it into Explorer. MUST complete before any user story UI work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Implement full `useEcosystemMetrics(dataset, filters)` computation in `frontend/src/hooks/useEcosystemMetrics.ts` — single `useMemo` over `[dataset, showPeople, showOrganizations, showSpaces]`. Computation steps per plan.md: (1) build node lookup `Map<id, GraphNode>`, (2) filter out `node.restricted === true` and visibility-toggled types, (3) build visible node ID `Set`, (4) filter edges where both endpoints visible, (5) compute aggregates, (6) compute bridge connectors via distinct L0 `scopeGroup` count ≥ 2 on user edges, (7) compute multi-space users via L1/L2 grouping within same L0, (8) compute space rankings sorted by member count descending (deduplicate users per space via `Set<nodeId>`), (9) compute top connectors by distinct space count descending (exclude < 2 connections, break ties alphabetically), (10) compute org distribution per L0, (11) evaluate headline insights against thresholds. Set `hasRestrictedNodes` flag.
- [x] T003 Wire `useEcosystemMetrics` into `frontend/src/pages/Explorer.tsx` — call hook with `dataset` and `{ showPeople, showOrganizations, showSpaces }`, pass resulting `EcosystemMetrics` object as prop to `MetricsBar`. Add `metricsExpanded` state (`useState<boolean>(false)`) and toggle callback. Add `onHighlightNodes: (ids: string[]) => void` callback that calls `setHighlightedNodeIds`. Add `onSelectNode: (nodeId: string) => void` callback that finds the node in `dataset.nodes` and calls `setSelectedNode`.

**Checkpoint**: Hook computes metrics, Explorer passes data down. No visible UI change yet.

---

## Phase 3: User Story 1 — Ecosystem Overview at a Glance (Priority: P1) 🎯 MVP

**Goal**: Users see aggregate counts and headline insights in the collapsed MetricsBar immediately on graph load.

**Independent Test**: Load any graph with 2+ L0 spaces → collapsed bar shows semantic counts (users, orgs, subspaces) and 0–4 headline insight chips without any user interaction.

### Implementation for User Story 1

- [x] T004 [US1] Enhance `MetricsBar` props interface in `frontend/src/components/panels/MetricsBar.tsx` — accept `ecosystemMetrics: EcosystemMetrics`, `expanded: boolean`, `onToggleExpand: () => void`, `onInsightClick: (action: InsightAction) => void`. Keep `metrics: GraphMetrics` prop for backward compatibility (used as fallback when `ecosystemMetrics` is undefined).
- [x] T005 [US1] Replace raw graph-theory counts with semantic labels in `frontend/src/components/panels/MetricsBar.tsx` collapsed state — render "N users · N organisations · N subspaces" using `ecosystemMetrics.aggregates`. Show `totalEdges` as a secondary item.
- [x] T006 [US1] Add headline insight chips to `frontend/src/components/panels/MetricsBar.tsx` collapsed state — render `ecosystemMetrics.headlineInsights` (0–4 items) as clickable chip elements. Each chip shows `insight.message` and calls `onInsightClick(insight.action)` on click.
- [x] T007 [US1] Add restricted-data indicator to `frontend/src/components/panels/MetricsBar.tsx` — when `ecosystemMetrics.hasRestrictedNodes` is true, render an asterisk with a tooltip: "Some data excluded due to access restrictions".
- [x] T008 [US1] Add expand/collapse toggle button (chevron icon) to `frontend/src/components/panels/MetricsBar.tsx` — clicking calls `onToggleExpand()`. Chevron rotates based on `expanded` prop.
- [x] T009 [US1] Update `frontend/src/components/panels/MetricsBar.module.css` — add styles for `.collapsed` layout (flex-wrap for insights overflow), `.insightChip` (clickable pill with `var(--accent)` border, hover state), `.restrictedIndicator` (subtle asterisk + tooltip), `.expandToggle` (chevron button), responsive breakpoints for narrow viewports.
- [x] T010 [US1] Handle empty/minimal graphs in `frontend/src/components/panels/MetricsBar.tsx` — when all aggregate counts are zero, show "No data available" message. When `ecosystemMetrics` is undefined (dataset not loaded), fall back to original `GraphMetrics` display.

**Checkpoint**: Collapsed MetricsBar shows ecosystem counts + headline insights. Clicking insights highlights nodes on graph.

---

## Phase 4: User Story 2 — Cross-Space Connection Discovery (Priority: P1)

**Goal**: Users see bridge connector count and can click to highlight bridging users on the graph.

**Independent Test**: Load graph with 2+ L0 spaces where ≥ 1 user belongs to multiple spaces → bridge connector count > 0 in collapsed bar → click highlights those users.

### Implementation for User Story 2

- [x] T011 [US2] Add bridge connector count to collapsed MetricsBar in `frontend/src/components/panels/MetricsBar.tsx` — render `ecosystemMetrics.aggregates.bridgeConnectorCount` as a distinct metric item alongside users/orgs/subspaces. Clickable — on click, dispatch highlight action with all bridge connector node IDs.
- [x] T012 [US2] Wire bridge connector highlight action in `frontend/src/pages/Explorer.tsx` — handle `onInsightClick` from MetricsBar. When action type is `'highlight'`, call `setHighlightedNodeIds(action.nodeIds)`. When type is `'select'`, find node and call `setSelectedNode`. When type is `'focus'`, highlight and optionally log (focus/pan deferred to polish).
- [x] T013 [US2] Add bridge connector headline insight to the threshold evaluation in `frontend/src/hooks/useEcosystemMetrics.ts` — ensure bridge connectors > 0 generates insight with message "N users active across M+ ecosystems" (priority 1) with highlight action containing all bridge connector node IDs. Verify single-L0 graphs produce 0 bridge connectors without error.

**Checkpoint**: Bridge connector count visible in collapsed bar. Clicking highlights bridging users on graph. Single-L0 graphs show 0 gracefully.

---

## Phase 5: User Story 3 — Space Engagement Rankings (Priority: P2)

**Goal**: Users see subspaces ranked by member count in the expanded MetricsPanel and can click to highlight members.

**Independent Test**: Load graph with multiple L1/L2 subspaces of varying sizes → expand panel → Rankings tab shows sorted list → click entry highlights its members.

### Implementation for User Story 3

- [x] T014 [P] [US3] Create `frontend/src/components/panels/MetricsPanel.tsx` — panel component receiving `ecosystemMetrics: EcosystemMetrics`, `onHighlightNodes: (ids: string[]) => void`, `onSelectNode: (nodeId: string) => void`, `onClose: () => void`. Internal tab state: `'overview' | 'rankings' | 'connectors'`. Render tab bar with three tabs. Default to 'overview' tab.
- [x] T015 [P] [US3] Create `frontend/src/components/panels/MetricsPanel.module.css` — overlay panel positioned above MetricsBar (`position: absolute; bottom: <bar-height>; left: 0; right: 0`), `max-height: 40vh`, scrollable content area, `background: var(--surface)`, `border-top: 1px solid var(--border)`, slide-up animation via `max-height` CSS transition (≤ 300ms). Tab bar styles, active tab indicator, close button.
- [x] T016 [US3] Implement Overview tab in `frontend/src/components/panels/MetricsPanel.tsx` — display all aggregate counts in a grid layout (users, organisations, subspaces, L0 spaces, edges, bridge connectors). Show multi-space user count and list (`ecosystemMetrics.multiSpaceUsers`) with clickable entries that highlight the user on the graph. Show all headline insights as full-width clickable rows (not chips). Show org distribution per L0 ecosystem if multiple L0s loaded.
- [x] T017 [US3] Implement Rankings tab in `frontend/src/components/panels/MetricsPanel.tsx` — render `ecosystemMetrics.spaceRankings` as a table/list: rank number, space name (with L1/L2 badge), member count, parent space name. Each row clickable — on click, collect all user/org node IDs connected to that space from the dataset edges and call `onHighlightNodes(memberNodeIds)`. Show "No subspaces" message if rankings array is empty.
- [x] T018 [US3] Render `MetricsPanel` in `frontend/src/pages/Explorer.tsx` — conditionally render when `metricsExpanded && dataset` is truthy. Position within the Explorer layout below the graph canvas container, above MetricsBar. Pass `ecosystemMetrics`, `onHighlightNodes`, `onSelectNode`, and `onClose` (sets `metricsExpanded(false)`).

**Checkpoint**: Expanded panel opens with Overview and Rankings tabs. Space rankings sorted correctly. Clicking a space highlights its members on graph.

---

## Phase 6: User Story 4 — Most Connected People & Organisations (Priority: P2)

**Goal**: Users see top connectors leaderboard and bridge connector details in the expanded panel's Connectors tab.

**Independent Test**: Load graph with varied connectivity → expand panel → Connectors tab shows top 5+ entries sorted by distinct space count → click entry selects node and opens DetailsDrawer.

### Implementation for User Story 4

- [x] T019 [US4] Implement Connectors tab in `frontend/src/components/panels/MetricsPanel.tsx` — two sections: **Top Connectors** leaderboard and **Bridge Connectors** detail list.
- [x] T020 [US4] Implement Top Connectors leaderboard in the Connectors tab of `frontend/src/components/panels/MetricsPanel.tsx` — render `ecosystemMetrics.topConnectors` (top 10 or all if fewer): rank number, avatar thumbnail (from `avatarUrl`, fallback to initials), display name, type badge (USER/ORG), distinct space count. Each row clickable — calls `onSelectNode(connector.nodeId)`. Show "No connectors found" if list is empty. Verify nodes with < 2 connections are excluded (already handled by hook).
- [x] T021 [US4] Implement Bridge Connectors detail list in the Connectors tab of `frontend/src/components/panels/MetricsPanel.tsx` — render `ecosystemMetrics.bridgeConnectors`: user name, L0 space count, comma-separated L0 space names. Each row clickable — calls `onHighlightNodes([connector.nodeId])` to highlight that single bridge connector. Show "No cross-ecosystem bridges found" if empty.
- [x] T022 [US4] Add avatar thumbnail and type badge styles to `frontend/src/components/panels/MetricsPanel.module.css` — `.avatar` (24×24 rounded), `.avatarFallback` (initials on colored background), `.typeBadge` (small pill label for USER/ORG), `.leaderboardRow` (hover highlight), `.bridgeRow` styles.

**Checkpoint**: Connectors tab shows top connectors leaderboard + bridge connector details. Clicking leaderboard entry selects node and opens drawer. Clicking bridge connector highlights on graph.

---

## Phase 7: User Story 5 — Exploration Nudges (Priority: P3)

**Goal**: Floating nudge cards appear on the graph canvas with contextual insights and clickable CTAs.

**Independent Test**: Load graph with 10+ nodes → 1+ floating nudge cards appear → click CTA triggers graph interaction → dismiss removes card.

### Implementation for User Story 5

- [x] T023 [P] [US5] Create `frontend/src/components/panels/NudgeCard.tsx` — receives `nudge: NudgeData`, `onAction: (action: InsightAction) => void`, `onDismiss: (id: string) => void`. Renders a compact floating card with `nudge.message`, a CTA button labeled `nudge.cta`, and a dismiss (×) button. CTA click calls `onAction(nudge.action)`, dismiss calls `onDismiss(nudge.id)`.
- [x] T024 [P] [US5] Create `frontend/src/components/panels/NudgeCard.module.css` — floating card styles: `position: absolute`, `bottom: 80px; right: 16px` (stacked vertically if multiple), `background: var(--surface)`, subtle box-shadow, rounded corners, fade-in animation, `max-width: 280px`, `.cta` button with `var(--accent)` color, `.dismiss` button (×) top-right corner. Must not obscure graph center content.
- [x] T025 [US5] Add nudge generation logic to `frontend/src/hooks/useEcosystemMetrics.ts` — generate `NudgeData[]` array (max 3 nudges) from computed metrics. Nudge candidates: (1) bridge connectors > 0 → "N users bridge all M ecosystems — click to explore", CTA "Explore →"; (2) busiest subspace ≥ 10 members → "Space X has Y members — the busiest subspace", CTA "View →"; (3) top connector ≥ 3 spaces → "Name connects N spaces — most connected person", CTA "See →". Include nudges array in the `EcosystemMetrics` return type.
- [x] T026 [US5] Wire nudge display and dismissal in `frontend/src/pages/Explorer.tsx` — maintain `dismissedNudgeIds` state (`useState<Set<string>>`). Filter `ecosystemMetrics.nudges` to exclude dismissed IDs. Render remaining `NudgeCard` components positioned in the graph canvas area. On dismiss, add ID to `dismissedNudgeIds`. On CTA action, dispatch highlight/select via existing callbacks. Suppress all nudges when total visible nodes < 10.

**Checkpoint**: Floating nudge cards appear contextually. Clicking CTA interacts with graph. Dismissing removes card for session. Minimal graphs suppress nudges.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Performance validation, accessibility, edge cases, and cleanup

- [x] T027 [P] Verify performance: confirm `useEcosystemMetrics` computation completes in < 10ms for 500-node dataset by adding a `console.time` / `console.timeEnd` wrapper in development mode only in `frontend/src/hooks/useEcosystemMetrics.ts`
- [x] T028 [P] Add keyboard accessibility to `frontend/src/components/panels/MetricsBar.tsx` and `frontend/src/components/panels/MetricsPanel.tsx` — ensure expand toggle, insight chips, ranking rows, and leaderboard rows are focusable (`tabIndex={0}`) and activatable via Enter/Space. Add `aria-expanded` to toggle, `role="tablist"` / `role="tab"` to panel tabs.
- [x] T029 [P] Verify coexistence with all graph modes in `frontend/src/pages/Explorer.tsx` — ensure MetricsBar and MetricsPanel render correctly in force, map, timeline, and chord view modes. MetricsPanel overlay must not interfere with view-specific controls.
- [x] T030 Validate against quickstart.md checklist in `specs/014-ecosystem-metrics/quickstart.md` — manually verify all items in the Verification Checklist section. Confirm filter reactivity (toggle hide people/orgs/spaces → counts update within 500ms), empty graph zeros, single-L0 bridge = 0, restricted node exclusion with indicator.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ──► Phase 2 (Foundational) ──┬──► Phase 3 (US1 – P1)
                                               │
                                               ├──► Phase 4 (US2 – P1)
                                               │
                                               ├──► Phase 5 (US3 – P2)
                                               │      │
                                               │      ▼
                                               ├──► Phase 6 (US4 – P2) *depends on US3 panel*
                                               │
                                               └──► Phase 7 (US5 – P3)
                                                       │
                                               All ────▼
                                                  Phase 8 (Polish)
```

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only. No dependency on other stories.
- **US2 (P1)**: Depends on Phase 2 only. Can run in parallel with US1 (different areas of MetricsBar).
- **US3 (P2)**: Depends on Phase 2 only. Creates the MetricsPanel component.
- **US4 (P2)**: Depends on **US3** (T014–T015) — needs the MetricsPanel shell and tab structure to exist before adding the Connectors tab content.
- **US5 (P3)**: Depends on Phase 2 only. Independent component (NudgeCard), wired separately in Explorer.

### Within Each User Story

- Types/interfaces before computation logic
- Computation logic before UI components
- Component structure before styling refinements
- Core rendering before interaction handlers

### Parallel Opportunities

- **T014 + T015** (US3): MetricsPanel component + CSS can be created in parallel
- **T023 + T024** (US5): NudgeCard component + CSS can be created in parallel
- **T027 + T028 + T029** (Polish): All on different files, fully parallel
- **US1 + US2**: Can be worked in parallel after Phase 2 (US1 modifies MetricsBar content, US2 adds bridge-specific items — merge-friendly if one completes first)
- **US3 + US5**: Can be worked in parallel after Phase 2 (different components)

---

## Parallel Example: After Phase 2 Completes

```
Thread A (P1 MVP):                    Thread B (P2):               Thread C (P3):
  T004–T010 (US1: collapsed bar)       T014+T015 (US3: panel)       T023+T024 (NudgeCard)
  T011–T013 (US2: bridge connectors)   T016–T018 (US3: rankings)    T025–T026 (nudge wiring)
                                        T019–T022 (US4: connectors)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Type definitions (T001)
2. Complete Phase 2: Hook computation + Explorer wiring (T002–T003)
3. Complete Phase 3: Collapsed bar with ecosystem counts + insights (T004–T010)
4. Complete Phase 4: Bridge connector display + interaction (T011–T013)
5. **STOP and VALIDATE**: MetricsBar shows semantic counts, headline insights, bridge connector count. Clicking insights/bridges highlights nodes. Filters update metrics reactively.
6. Deploy/demo — core value delivered

### Incremental Delivery

1. **Setup + Foundational** → Hook ready, no visible change
2. **+ US1** → Collapsed bar shows aggregate counts and insights → Deploy (visible value!)
3. **+ US2** → Bridge connectors clickable → Deploy (cross-space insight!)
4. **+ US3** → Expanded panel with space rankings → Deploy (actionable intelligence!)
5. **+ US4** → Top connectors leaderboard → Deploy (find key people!)
6. **+ US5** → Nudge cards for engagement → Deploy (exploration prompts!)
7. **Polish** → Accessibility, performance, validation → Final release

### File Impact Summary

| File | Action | Stories |
|------|--------|---------|
| `frontend/src/hooks/useEcosystemMetrics.ts` | NEW | All |
| `frontend/src/components/panels/MetricsBar.tsx` | MODIFY | US1, US2 |
| `frontend/src/components/panels/MetricsBar.module.css` | MODIFY | US1 |
| `frontend/src/components/panels/MetricsPanel.tsx` | NEW | US3, US4 |
| `frontend/src/components/panels/MetricsPanel.module.css` | NEW | US3, US4 |
| `frontend/src/components/panels/NudgeCard.tsx` | NEW | US5 |
| `frontend/src/components/panels/NudgeCard.module.css` | NEW | US5 |
| `frontend/src/pages/Explorer.tsx` | MODIFY | US1, US2, US3, US5 |

---

## Notes

- No server changes required — all metrics from existing `GraphDataset` in client memory
- Existing `GraphMetrics` and `GraphInsights` on the dataset are **not modified** — ecosystem metrics are complementary
- The `superConnectors` insight (degree > mean + 2σ) differs from `topConnectors` (distinct space count) — both coexist
- Restricted node exclusion happens once at filter step, flows through all computations
- Users counted once per space regardless of role count (MEMBER + LEAD = 1 connection)
- Headline insights are deterministic — same data always produces same insights
- Panel overlay approach avoids force simulation restart or map re-render
