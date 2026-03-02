# Feature Specification: Space Activity Volume

**Feature Branch**: `008-space-activity`  
**Created**: 2026-03-02  
**Status**: Draft  
**Input**: User description: "Add a new activity view mode that shows total contributions per space/subspace. Space node size scales by contribution volume, combined with a border glow. Separate toggle alongside the existing Activity Pulse."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Space Activity Sizing (Priority: P1)

As a community manager viewing the ecosystem graph, I want space nodes to grow proportionally to their total contribution count so I can instantly identify the most active spaces and subspaces without clicking into each one.

**Why this priority**: This is the core visual insight — seeing at a glance which spaces have the most contributions. Without this, the feature has no value.

**Independent Test**: Enable "Space Activity" toggle → space nodes visibly change size based on contribution volume. A space with 200 contributions is clearly larger than one with 5. Toggling off restores original sizes.

**Acceptance Scenarios**:

1. **Given** a graph with spaces of varying contribution counts, **When** I enable "Space Activity", **Then** space nodes scale up proportionally to their total contribution count using logarithmic scaling (so high-activity spaces don't overwhelm low-activity ones).
2. **Given** "Space Activity" is enabled, **When** I disable it, **Then** all space nodes return to their original degree-based size without a simulation restart (positions preserved).
3. **Given** a space with zero contributions, **When** "Space Activity" is enabled, **Then** the space remains at its baseline size (no shrinkage below the default).
4. **Given** L0, L1, and L2 spaces each with different contribution volumes, **When** "Space Activity" is enabled, **Then** each level scales independently — an active L2 can appear larger than a less-active L1.

---

### User Story 2 — Activity Border Glow (Priority: P2)

As a user viewing the ecosystem graph with Space Activity enabled, I want active spaces to have a colored border glow (from subtle blue to bold gold/orange) so I can distinguish activity tiers even when node sizes are similar.

**Why this priority**: The glow adds a second visual channel that works alongside sizing — it helps differentiate moderate vs high activity when sizes are close, and is especially useful at zoomed-out views where size differences are harder to read.

**Independent Test**: Enable "Space Activity" → spaces with HIGH activity have a thick warm-colored (gold/orange) stroke, MEDIUM shows a moderate blue stroke, LOW shows a subtle thin stroke, INACTIVE shows no glow change.

**Acceptance Scenarios**:

1. **Given** "Space Activity" is enabled and a space has HIGH activity tier, **When** rendering, **Then** the space node displays a thick (3–4px) warm-colored border glow (gold/orange).
2. **Given** "Space Activity" is enabled and a space has MEDIUM activity tier, **When** rendering, **Then** the space node displays a moderate (2–2.5px) blue border glow.
3. **Given** "Space Activity" is enabled and a space has LOW activity tier, **When** rendering, **Then** the space node displays a thin (1–1.5px) subtle blue border glow.
4. **Given** "Space Activity" is enabled and a space has INACTIVE tier (0 contributions), **When** rendering, **Then** no glow is added — the node retains its default stroke.
5. **Given** "Space Activity" is disabled, **When** rendering, **Then** all space nodes show their default stroke (no glow).

---

### User Story 3 — Activity Toggle in Control Panel (Priority: P3)

As a user, I want a separate "Space Activity" checkbox in the Activity section of the control panel, alongside the existing "Activity Pulse" checkbox, so I can enable/disable space activity visualization independently.

**Why this priority**: The toggle is the user-facing control. The visual features (US1, US2) are useless without a way to activate them, but it's a simple UI addition that depends on the rendering logic being in place.

**Independent Test**: Open control panel → Activity section shows two checkboxes: "Activity Pulse" (existing) and "Space Activity" (new). Each toggles independently. Both can be on simultaneously.

**Acceptance Scenarios**:

1. **Given** the Activity section in the control panel, **When** the graph has activity data, **Then** both "Activity Pulse" and "Space Activity" checkboxes are shown and functional.
2. **Given** no activity data is available, **When** viewing the Activity section, **Then** both checkboxes are disabled with "Activity data unavailable" messaging.
3. **Given** both "Activity Pulse" and "Space Activity" are enabled simultaneously, **When** viewing the graph, **Then** edge pulses and space node sizing/glow coexist without visual conflict.

---

### Edge Cases

- What happens when all spaces have the same contribution count? → All spaces scale equally; glow tier is MEDIUM for all.
- What happens when activity data is unavailable? → "Space Activity" checkbox is disabled, same as Activity Pulse behavior.
- What happens when a space has contributions but is hidden by visibility filters? → Hidden spaces don't show sizing/glow; when revealed, they appear with correct activity sizing.
- What happens when Space Activity is enabled and the user toggles entity filters? → Re-rendering recomputes visible sizes; no stale sizes.
- How does this interact with the lock/private badge (007)? → Badge position adapts to the new node radius.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST aggregate **direct** contribution counts per space node (L0, L1, L2) from the existing per-user-per-space activity data on the server. Parent spaces MUST NOT roll up child space contributions.
- **FR-002**: `GraphNode` MUST include a `totalActivityCount` field (number) for space nodes, derived from server-side aggregation. Non-space nodes MUST have `totalActivityCount: 0` (or undefined).
- **FR-003**: `GraphNode` MUST include a `activityTier` field for space nodes, computed using the same percentile-based tier logic as edge activity tiers.
- **FR-004**: When "Space Activity" is enabled, space node radius MUST scale logarithmically based on `totalActivityCount`, using a max scale factor of **2.5×** relative to the highest-activity peer at each space level.
- **FR-005**: When "Space Activity" is enabled, space node stroke MUST change color and width based on `activityTier`: HIGH = 3–4px `#f59e0b` (amber/gold), MEDIUM = 2–2.5px `#3b82f6` (blue), LOW = 1–1.5px `#93c5fd` (light blue), INACTIVE = default stroke unchanged.
- **FR-006**: Enabling/disabling "Space Activity" MUST NOT restart the D3 force simulation — node positions MUST be preserved. Size and stroke changes MUST animate with a ~300ms ease transition (matching the existing Activity Pulse enter/exit pattern). Reduced-motion preference MUST be respected.
- **FR-007**: "Space Activity" MUST be a separate boolean toggle, independent of the existing "Activity Pulse" toggle. Both can be active simultaneously.
- **FR-008**: "Space Activity" checkbox MUST be disabled when `hasActivityData === false`, with the same UX as the existing Activity Pulse disabled state.
- **FR-009**: The lock badge (feature 007) MUST reposition to match the new node radius when Space Activity sizing is active.
- **FR-010**: The system MUST degrade gracefully when `totalActivityCount` is null/undefined/0 — no visual artifact, node stays at baseline size.
- **FR-011**: The details drawer MUST show a "Contributions" stat with the exact `totalActivityCount` value for space nodes (L0/L1/L2). Non-space nodes MUST NOT show this stat. The stat MUST appear regardless of whether "Space Activity" toggle is enabled.

### Key Entities

- **GraphNode.totalActivityCount** (number): Sum of all user contributions to this space. Only meaningful for SPACE_L0/L1/L2 nodes.
- **GraphNode.activityTier** (ActivityTier): Tier classification for the space's total activity, computed server-side using percentile-based thresholds.

## Clarifications

### Session 2026-03-02

- Q: Should parent spaces roll up child contributions into their total? → A: Direct only — each space counts only contributions made directly to it (no roll-up from descendants).
- Q: What max scale factor for activity-based node sizing? → A: 2.5× max — provides visible differentiation without overwhelming the layout.
- Q: Should node sizing animate on toggle or snap instantly? → A: Smooth transition (~300ms ease) — nodes grow/shrink and strokes fade in/out.
- Q: Should the details drawer show the exact contribution count for space nodes? → A: Yes — show "Contributions: N" in the stats section for space nodes.
- Q: What color ramp for the activity glow stroke? → A: Blue-to-warm shift — LOW: `#93c5fd`, MEDIUM: `#3b82f6`, HIGH: `#f59e0b` (amber/gold). Differentiates from the all-blue edge pulse.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify the top 3 most active spaces within 5 seconds of enabling Space Activity, without clicking any nodes.
- **SC-002**: Enabling/disabling Space Activity preserves all node positions (zero simulation restarts).
- **SC-003**: TypeScript strict mode passes (`tsc --noEmit`) for both server and frontend packages.
- **SC-004**: Space Activity and Activity Pulse coexist without visual conflicts when both enabled.
- **SC-005**: Spaces with zero contributions show no visual change from baseline when Space Activity is enabled.
