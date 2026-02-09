# Design Brief (Figma Make Prototype): Ecosystem Analytics — Portfolio Network Explorer

**Goal**: Create an interactive prototype that feels like a real analytics tool for a Portfolio Owner: selecting Spaces, generating a clustered force graph, exploring connections via filters/search/details, and optionally overlaying the graph on a map.

**Important constraint**: Data can be fake, but interactions must feel real (drag/zoom, animated clustering changes, selection highlight, details drawer, progressive loading states).

---

## 1) Primary User

**Portfolio Owner** (organization/portfolio-level stakeholder): wants fast insight across multiple initiatives without deep operational work.

Key questions to support:
- Which Spaces are isolated vs strongly connected?
- Which organizations/people connect multiple Spaces?
- If I follow a connector, what other accessible Spaces should I add to the view?

---

## 2) Prototype Structure (Screens / Frames)

### Screen A — Login / Identity Gate
- Minimal login screen with “Sign in with Alkemio” primary CTA.
- Secondary text: “This is a standalone tool. Your Alkemio account controls access.”
- After sign-in, go to Space selection.

**States**:
- Default
- Loading
- Error (auth failed)

### Screen B — Space Selection (L0 only)
- Title: “Select top-level Spaces (L0) to analyze”
- Description: “You must be a member of a Space to include it.”
- Component: searchable multi-select list (checkbox list or tokenized multi-select).
- Each Space row shows:
  - Space name
  - Privacy badge (Public/Private)
  - Role badge (Member/Lead)
  - Optional: last activity timestamp or “health” indicator (fake)

**Primary CTA**: “Generate graph”

**Secondary actions**:
- “Load last selection”
- “Clear selection”

**Empty state**:
- If no memberships: show guidance + link-styled CTA “Request access / Join a Space” (non-functional).

### Screen C — Graph Explorer (Main)
A full-screen-ish analytics layout:

**Top bar**
- Left: breadcrumb: “Ecosystem Analytics / Portfolio Network”
- Center: Search input (typeahead feel)
- Right: “Refresh data” button + “Last updated: …” timestamp

**Left panel (Controls)**
- Space scope selector: shows selected L0 Spaces as removable chips
- Cluster mode dropdown:
  - Cluster by Space (default)
  - Cluster by Organization
- Filters (toggle switches):
  - Show People
  - Show Organizations
  - Show Subspaces
  - Show only Leads (optional)
- Graph controls:
  - Zoom in / out
  - Fit to view
  - Reset layout
- Map mode controls:
  - Toggle “Show map overlay”
  - Map dropdown (4–5 presets)
  - Toggle “Pin nodes with location to map” (optional)

**Main canvas (Graph)**
- A clustered force graph that visibly moves/settles.
- Clear node differentiation:
  - Spaces (L0/L1/L2): larger nodes with label
  - Organizations: medium nodes, distinct color
  - People: smaller nodes with avatar/initial
- Edge differentiation:
  - Parent-child (Space → Subspace): thin neutral link
  - Role edges (Member/Lead): thicker or color-coded, with subtle legend

**Right panel (Details drawer)**
- Appears when a node is clicked.
- Shows:
  - Node title + type badge
  - Mini “stats” row (counts)
  - List of connected entities (tabs: Neighbors / Spaces / Orgs / People)
  - CTA: “Add connected Space to graph” (only for accessible spaces)
  - CTA: “Open in Alkemio” (link-styled; non-functional)

**Overlay / modal**
- “Loading data…” progress overlay with stepper feel:
  - Acquire
  - Transform
  - Load

---

## 3) Interaction Requirements (Must Feel Real)

### Graph physics + direct manipulation
- Nodes drift and settle (continuous motion for a few seconds after load or cluster change).
- Dragging a node:
  - Node follows cursor smoothly.
  - On release, the graph gently re-stabilizes.

### Zoom + pan
- Mouse wheel zoom (or plus/minus buttons).
- Click-drag pan on canvas.
- “Fit to view” animates camera/viewport to include all visible nodes.

### Cluster mode switching
- Switching “Cluster by” triggers a visible re-layout animation.
- Clusters should be separated with whitespace.
- Optional: show faint cluster labels/hulls (e.g., “Space: X” or “Org: Y”).

### Selection + highlighting
- Click node:
  - Selected node becomes emphasized.
  - 1-hop neighbors are highlighted.
  - Non-neighbor nodes fade to low opacity.
- Click empty canvas:
  - Clears selection and restores full opacity.

### Search
- Typing highlights matching nodes (by display name).
- When a match exists:
  - Matches are highlighted.
  - Non-matches are dimmed.
  - Optional: auto-pan/zoom to first match.

### Filters
- Toggling node-type filters updates the canvas immediately.
- Filters should preserve selection if the selected node remains visible; otherwise selection clears.

### Map overlay mode
- When enabled:
  - A map appears behind the graph.
  - Nodes with location metadata can optionally “snap” toward their geographic position.
- If location data is missing:
  - Nodes remain clustered normally.
  - UI displays a subtle note: “Some entities have no location set.”

---

## 4) Visual Design Guidelines

- Professional analytics look: calm neutrals, clear typography, strong contrast for selected/highlighted states.
- Use subtle motion: easing, smooth transitions, no jarring jumps.
- Provide a legend for node and edge types.
- Emphasize readability: labels appear on hover and for selected nodes; avoid label clutter.

---

## 5) Fake Data Specification (Prioritize Known Data)

### Node Types (first pass)
1. **Space (L0)**
2. **Space (L1 / Subspace / Challenge)**
3. **Space (L2)**
4. **Organization**
5. **Person (User)**

Optional later node types (only if helpful in prototype):
- Virtual Contributor
- Topic/Tag

### Edge Types (first pass)
1. **Parent–Child**: Space → Subspace relationship
2. **Membership**: Person/Org → Space (member)
3. **Leadership**: Person/Org → Space (lead)

### Node metadata (for UI realism)
- All nodes: `id`, `type`, `displayName`, `url (optional)`
- Space nodes: `level (L0/L1/L2)`, `privacy (public/private)`, `lastActive (fake)`, `healthStatus (fake)`
- Person nodes: `avatar/initials`, `roleInSelectedSpaces (member/lead)`
- Org nodes: `logo/initials`, `orgType (fake)`
- Location (optional but important for map mode): `country`, `city`, `lat`, `long`

### Dataset size targets (for a convincing prototype)
- L0 Spaces: 3–6
- L1 Subspaces: 8–20
- L2: 10–30
- Orgs: 8–25
- People: 25–80
- Edges: enough to create a few dense clusters + some cross-links

Include deliberate patterns:
- 1–2 “bridge” organizations connecting multiple L0 spaces
- 1 isolated L0 space with minimal overlap
- A few “lead” edges that visibly stand out

---

## 6) Map Presets (Prototype)

Provide 4–5 selectable maps, e.g.:
- World
- Europe
- Netherlands (regions)
- Ireland (counties)
- (Optional) Custom/Blank grid map

Map selection should update immediately.

---

## 7) Copy (Microcopy)

- “Select Spaces you’re a member of.”
- “Generate graph” / “Refresh data”
- “Cluster by: Space / Organization”
- “Some entities have no location set.”
- “Last updated: {timestamp}”

---

## 8) What ‘Success’ Looks Like in the Prototype

A stakeholder can:
- Select 3 L0 spaces
- Watch the graph load and settle
- Switch cluster modes and see the layout reorganize
- Search for an org/person and see highlights
- Click a connector and see related spaces in the details drawer
- Toggle map overlay and switch maps

All without feeling like the UI is “static screenshots”.
