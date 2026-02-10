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

---

## 9) UI Contract (Export-Derived, Pixel-Perfect)

This appendix is extracted from the Figma Make export implementation (React/Tailwind + CSS variables). Treat it as a *contract* for pixel-level fidelity.

**Component primitives**: The export is built using Tailwind + shadcn/ui-style primitives (e.g., Button, Card, Input, Badge, Switch, Select, ScrollArea, Separator, Avatar). For pixel-perfect reproduction, prefer using the same component approach rather than re-inventing primitives.

### 9.1 Font Loading (Critical)

The export uses `font-family: 'Inter', sans-serif` throughout, but **does not bundle Inter font files** (no `.woff/.woff2/.ttf/.otf` assets were found, and `fonts.css` was empty). To avoid pixel drift:

- The implementation MUST explicitly load Inter (and required weights) at runtime.
- Minimum weights observed in styles: **400, 500, 600, 700, 800**.
- Acceptable approaches:
  - Self-host Inter with `@font-face` (preferred for production parity and offline dev).
  - Webfont import (OK for prototype), e.g. Google Fonts or the official Inter CSS distribution.

### 9.2 Theme Tokens (CSS Variables)

**Typography scale**

| Token | Value |
| --- | ---: |
| `--font-size` | 16px |
| `--text-4xl` | 48px |
| `--text-3xl` | 30px |
| `--text-2xl` | 24px |
| `--text-xl` | 20px |
| `--text-base` | 16px |
| `--text-sm` | 14px |

**Core colors (Light)**

| Token | Value |
| --- | --- |
| `--background` | rgba(255,255,255,1) |
| `--foreground` | rgba(29,56,74,1) |
| `--card` | rgba(255,255,255,1) |
| `--muted` / `--accent` / `--secondary` | rgba(241,245,249,1) |
| `--muted-foreground` | rgba(100,116,139,1) |
| `--primary` | rgba(29,56,74,1) |
| `--primary-foreground` | rgba(255,255,255,1) |
| `--border` | rgba(226,232,240,1) |
| `--ring` | rgba(29,56,74,0.5) |
| `--destructive` | rgba(239,68,68,1) |

**Core colors (Dark)**

| Token | Value |
| --- | --- |
| `--background` | rgba(29,56,74,1) |
| `--foreground` | rgba(255,255,255,1) |
| `--card` | rgba(30,41,59,1) |
| `--muted` / `--accent` / `--secondary` | rgba(51,65,85,1) |
| `--muted-foreground` | rgba(148,163,184,1) |
| `--primary` | rgba(255,255,255,1) |
| `--primary-foreground` | rgba(29,56,74,1) |
| `--border` | rgba(51,65,85,1) |
| `--ring` | rgba(226,232,240,0.5) |
| `--destructive` | rgba(220,38,38,1) |

**Chart palette**

| Token | Light | Dark |
| --- | --- | --- |
| `--chart-1` | rgba(29,56,74,1) | rgba(255,255,255,1) |
| `--chart-2` | rgba(100,116,139,1) | rgba(203,213,225,1) |
| `--chart-3` | rgba(148,163,184,1) | rgba(148,163,184,1) |
| `--chart-4` | rgba(203,213,225,1) | rgba(100,116,139,1) |
| `--chart-5` | rgba(241,245,249,1) | rgba(71,85,105,1) |

**Radius + elevation**

| Token | Value |
| --- | --- |
| `--radius` | 6px |
| `--elevation-sm` | `0px 4px 6px 0px rgba(0,0,0,0.09)` |

### 9.3 Base Typography Rules (from tokens)

These are the base element styles used by the export when a Tailwind `text-*` class is not present:

- `h1`: 48px, weight 800, line-height 1
- `h2`: 30px, weight 600, line-height 1.2
- `h3`: 24px, weight 600, line-height 1.33
- `h4`: 20px, weight 600, line-height 1.4
- `p`: 16px, weight 400, line-height 1.75
- `label`: 14px, weight 500, line-height 1.43
- `button`: 16px, weight 500, line-height 1.5
- `input`: 16px, weight 400, line-height 1.5

### 9.4 Layout + Component Constants

**Login / Identity gate**

- App background: `var(--background)`; all typography: Inter.
- Logo tile: 64×64 (`w-16 h-16`), `rounded-2xl`, `box-shadow: var(--elevation-sm)`, background `var(--primary)`.
- Login card max width: Tailwind `max-w-md` (448px); border: `2px solid var(--border)`; shadow: `var(--elevation-sm)`.

**Space selector**

- Container max width: Tailwind `max-w-3xl` (768px).
- Selector card fixed height: **600px**; border: `2px solid var(--border)`; shadow: `var(--elevation-sm)`.
- Access note banner:
  - font size: 11px
  - background: `color-mix(in srgb, var(--primary) 5%, var(--background))`
  - border: `1px solid color-mix(in srgb, var(--primary) 12%, transparent)`
- Row selection highlight uses `color-mix(in srgb, var(--primary) 5%, var(--background))` and selected border `color-mix(in srgb, var(--primary) 30%, transparent)`.
- Primary CTA minimum width: Tailwind `min-w-[140px]`.

**Graph explorer**

- Top bar: height **48px** (`h-12`), `border-bottom: 1px solid var(--border)`, shadow `0 1px 3px rgba(0,0,0,0.04)`.
- Left controls panel (desktop): width **240px**, padding 16px, `gap: 20px`, background `var(--card)`.
- Search pill (top bar): width 220px; input height 32px; `border-radius: 999px`; background `var(--muted)`; left icon inset 10px.
- Graph controls overlay: bottom/left offset 20px (`bottom-5 left-5`), padding 4px, `backdrop-filter: blur(8px)`.
- Loading overlay:
  - backdrop: `color-mix(in srgb, var(--background) 70%, transparent)` + blur(6px)
  - modal: `padding: 32px 40px`, `min-width: 300px`, border `1px solid var(--border)`, shadow `0 8px 32px rgba(0,0,0,0.12)`, radius `calc(var(--radius) + 4px)`.
- Details drawer:
  - width **320px**, slide transform `translateX(100%) → 0`
  - transition: `transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)`
  - active shadow: `-4px 0 24px rgba(0,0,0,0.08)`.

### 9.5 Graph Visual Contract (Force Graph)

**Node sizing + hit area**

- Base sizes:
  - Space L0: 64px
  - Space L1: 42px
  - Space L2: 34px
  - Organization: 44px
  - Person: 34px
- Node hit padding: **14px** (hit area is `size + 28px`).

**Node visuals**

- Default node shadow: `0 2px 8px rgba(0,0,0,0.08)`.
- Highlight (selected/hover/neighbor): `0 0 0 3px var(--primary), 0 4px 20px rgba(0,0,0,0.15)` + `border: 2px solid var(--primary)`.
- Label rules:
  - shown when highlighted OR (Space L0) OR Organization
  - base label font: 11px; selected label uses `var(--text-sm)` (14px)
  - label background: selected `var(--primary)`; otherwise `var(--background)`
  - label border: selected none; otherwise `1px solid var(--border)`
  - label shadow: `var(--elevation-sm)`.

**Edge visuals + activity animation**

- Curved edges (quadratic bezier) with curvature 0.15 for short links (<100px) else 0.08.
- Base edge (when no activity flow):
  - color: inactive `var(--muted-foreground)`, active `var(--primary)`
  - width: parent-child 2, lead 1.8, member 1.2, active 3
  - opacity: active 0.65; otherwise 0.12 (dimmed: 0.03)
- Activity flow (when `activity > 0` and not dimmed): animated dashed stroke using `@keyframes edgeFlow { to { stroke-dashoffset: -60; } }`.

### 9.6 AI Implementation & Pixel-Perfect Verification

In this project the “engineers” may be AI agents. That’s OK, but it increases the importance of objective acceptance checks.

**Definition of done (UI fidelity)**

- The built UI matches this design brief’s **layout constants**, **tokens**, and **microcopy**.
- Inter is actually loaded (see 9.1) so typography metrics match.

**Required visual regression snapshots (minimum set)**

Capture screenshots at a consistent viewport and theme so results are comparable.

- Viewport: **1440×900** (desktop). Theme: **light mode**.
- Screen A (Login): default state.
- Screen A (Login): loading state with label “Authenticating...”.
- Screen B (Space selection):
  - default (no search)
  - with search text entered (“Search spaces...”) and empty-result state (“No spaces found matching …”).
- Screen C (Explorer):
  - base graph visible with left panel present
  - details drawer open (selected node)
  - map overlay enabled with region selector visible
- Loading overlay: each step label rendered at least once:
  - “Acquiring Data”
  - “Clustering Entities”
  - “Rendering Graph”

**Tolerance guidance**

- Aim for strict pixel matching. If the tooling supports thresholds, use a very small threshold and document it (fonts and subpixel AA can cause tiny diffs across OS/browser versions).
- If strict matching is unreliable across environments, prefer running snapshots in a fixed environment (pinned browser version, consistent rendering settings) rather than loosening thresholds.

**Behavioral checks to pair with snapshots**

In addition to images, keep at least a few functional assertions so the UI doesn’t “look right but behave wrong”:

- Search changes visible nodes (filters to matches rather than only dimming).
- Selecting a node opens the drawer; clicking empty canvas clears selection.
- Refresh triggers the progressive loading overlay.

