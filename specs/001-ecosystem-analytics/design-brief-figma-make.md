# Design Brief (Figma Make Prototype): Ecosystem Analytics — Portfolio Network Explorer

**Goal**: Create an interactive prototype that feels like a real analytics tool for a Portfolio Owner: selecting Spaces, generating a clustered force graph, exploring connections via filters/search/details, and optionally overlaying the graph on a map.

**Important constraint**: Data can be fake, but interactions must feel real (drag/zoom, animated clustering changes, selection highlight, details drawer, progressive loading states).

**Pixel-perfect constraint**: Recreate the exported prototype UI precisely (spacing, type scale, colors, shadows). The exported prototype uses the **Inter** font and a tokenized theme (CSS variables like `--background`, `--foreground`, `--primary`, `--text-*`, `--radius`, `--elevation-sm`).

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
- Centered login card for Ecosystem Analytics.
- Header: “Ecosystem Analytics” + “by Alkemio”.
- Card title: “Welcome, Alex”.
- Body copy: “This is a standalone tool. Your Alkemio account controls access to sensitive data.”
- Security note: “You'll only see Spaces and connections you are authorized to access as a Portfolio Owner.”
- Primary CTA: “Sign in with Alkemio”.
- Footer meta: `v1.2.0 · Build 8923`.
- After sign-in, go to Space selection.

**States**:
- Default
- Loading
- Error (auth failed)

**Loading label**: “Authenticating...”

### Screen B — Space Selection (L0 only)
- Title: “Select Top-Level Spaces”
- Description: “Choose the L0 spaces you want to include in your network graph.”
- Container: a single card with fixed height (600px) containing search + list + footer.
- Search input placeholder: “Search spaces...”.
- Actions: “Select All” and “Clear”.
- Access note: “Showing only spaces where you have Member or Lead access.”
- List is a checkbox multi-select.
- Each Space row shows:
  - Space name
  - Role badge for Lead
  - Privacy indicator (Public/Private)
  - Activity (“Active {x} ago”)
  - Health badge (High/Medium/Low)

**Primary CTA**: “Generate graph”

**Secondary actions**:
- “Load Last Selection” (stub)
- “Clear” (clears current selection)

**Footer note**: “We'll reuse cached data when available.”

**Empty state**:
- If no memberships: show guidance + link-styled CTA “Request access / Join a Space” (non-functional).

### Screen C — Graph Explorer (Main)
A full-screen-ish analytics layout:

**Top bar**
- Height: 48px.
- Left: back button to return to the Alkemio platform (“Alkemio”), then breadcrumb: “Ecosystem Analytics › Portfolio Network”.
- Center/right: search input (desktop), placeholder “Search nodes...”.
- Right: refresh icon button (spins while loading), “Last sync” time (hh:mm), and a user avatar.

**Left panel (Controls)**
- Width: 240px (desktop only).
- Scope: selected L0 Spaces shown as chips; “+ Add” button (stub).
- Clustering: two buttons — Space (default) and Org.
- Filters: switches for People and Organizations; display counts in labels.
- Legend: edge types plus activity indicator (high vs low activity styling).
- Map overlay (bottom): toggle plus region selector.
  - Presets: World, Europe, Netherlands.

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
- Slide-in drawer from the right.
- Width: 320px.
- Header: icon/thumbnail, title, type badge, optional level badge (e.g., L0/L1).
- Connection summary: counts for Spaces/Orgs/People.
- Direct connections list (clicking an item selects it).
- Suggested to Add list:
  - Accessible items show an “Add” button.
  - Inaccessible items show “Locked” and are visually disabled.
- Metadata section (ID, Status, Group).
- Footer actions:
  - “Open in Alkemio” (shown for Space nodes)
  - “Share Report” (stub)

**Overlay / modal**
- Loading overlay with step labels:
  - “Acquiring Data”
  - “Clustering Entities”
  - “Rendering Graph”

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
- Search is optimized for quick discovery.
- Exported prototype behavior: filter visible nodes to matches (and their remaining links), rather than only dimming.

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

Provide the preset maps present in the export:
- World
- Europe
- Netherlands

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
