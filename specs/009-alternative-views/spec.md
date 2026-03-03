# 009 — Alternative Visualization Views

## Status: DRAFT
## Author: Copilot + Jeroen
## Created: 2026-03-02

---

## Clarifications

### Session 2026-03-02

- Q: Which views should be in scope for the initial implementation? → A: All five — Treemap, Sunburst, Chord, Activity Timeline, and a new Temporal Force Graph mode.
- Q: What should be the default sizing metric for hierarchy views? → A: Each view defaults to what it's trying to show — Treemap defaults to activity count ("energy"), Sunburst defaults to member count ("where people sit"). Fallback to member count when activity data is unavailable.
- Q: How to determine edge appearance timestamps for Temporal Force Graph? → A: Investigate Alkemio schema for role-assignment `createdDate` first; fall back to earliest activity entry date as proxy, batching no-activity edges at the space's `createdDate`.
- Q: Should server return individual event timestamps or pre-bucketed aggregates? → A: Both — pre-bucketed weekly aggregates for the Timeline view, plus `createdDate` fields on nodes/edges for the Temporal Force Graph's precise placement.
- Q: Should view state be persisted in the URL for shareability? → A: No — the app requires login and loads data per-user session, so shared URLs wouldn't work. View state lives in React state only.

---

## 1. Problem Statement

The Ecosystem Analytics tool currently offers a single visualization mode: a **D3 force-directed graph**. While powerful for exploring network topology and spatial relationships, it limits the kinds of questions users can answer. Different questions demand different visual encodings — hierarchical composition, cross-pollination between communities, temporal patterns, and comparative sizing are all poorly served by a force layout alone.

Users need the ability to switch between complementary visualization modes that expose dimensions of the ecosystem data that the force graph cannot effectively surface.

---

## 2. Proposed Solution — Five New Visualization Modes

Add a **view switcher** to the Explorer that lets users toggle between the existing Force Graph and five new D3-powered views. All five views are in scope for implementation. Each view answers a fundamentally different question about the ecosystem.

---

### View 1: Zoomable Sunburst — "Where does everyone sit?"

**D3 module:** `d3-hierarchy` → `d3.partition()` (sunburst / icicle)

**What it shows:**
A nested radial diagram where the center ring is the platform, the next ring is L0 spaces, then L1, then L2. The outer ring shows **users and organizations** placed inside the deepest space they belong to. Arc width defaults to **member count** (matching the question "where does everyone sit?"). Users can switch to activity count via dropdown.

**Why it's exciting:**
- Immediately answers "how big is each space compared to its siblings?" — something the force graph makes hard to judge
- Clicking/zooming into a space smoothly transitions to show its subspaces and members at full resolution (D3's zoomable sunburst pattern)
- Activity period filter can switch the arc sizing between member count, contribution count (day/week/month/all-time), making it a living heatmap of engagement
- Spaces with `privacyMode: PRIVATE` could render with a subtle hatch pattern

**Data needed (already available):**
- Space hierarchy (`parentSpaceId`, L0 → L1 → L2)
- User/org membership edges (`MEMBER`, `LEAD`, `ADMIN`)
- `activityByPeriod` on space nodes for sizing by activity
- `totalActivityCount` for all-time fallback

**New data that would enhance this view:**
- **`Space.createdDate`** — could color-code arcs by age/maturity (new spaces glow, old spaces are solid)
- **`SpaceAbout.metrics`** (Nvp pairs) — Alkemio already computes native metrics; these could replace or augment our own sizing
- **`InnovationFlow.currentState`** — annotate each space arc with its lifecycle stage (e.g., "Exploring", "Maturing", "Scaling") as a small icon or ring color band

---

### View 2: Chord Diagram — "Who cross-pollinates?"

**D3 module:** `d3-chord` → `d3.chord()` + `d3.ribbon()`

**What it shows:**
Each L0 space (or L1 if drilling down) is an arc on the outer ring. Ribbons flowing between arcs represent **shared members** — people who belong to both Space A and Space B. Ribbon thickness is proportional to the number of people shared. The most interconnected spaces jump out visually.

**Why it's exciting:**
- Reveals the invisible connective tissue of the ecosystem — which communities have overlapping audiences
- "Super connectors" (users in many spaces) create thick ribbons; isolated communities have thin or no connections
- Hovering a ribbon shows the list of shared members
- Can toggle between counting all roles vs. only leads/admins to see "cross-pollination at the leadership level"
- The matrix computation is straightforward from existing edges: for every user, build a set of their spaces, then increment `matrix[spaceA][spaceB]` for every pair

**Data needed (already available):**
- All `MEMBER`/`LEAD`/`ADMIN` edges (user→space)
- Space names and IDs for arc labels

**New data that would enhance this view:**
- **`Profile.tagsets`** (especially `KEYWORDS` and `SKILLS` tagsets) — instead of shared members, show a *topic chord*: ribbons represent shared tags/skills between spaces, revealing thematic overlap even when people don't overlap
- **`Organization.domain`** — aggregate by organization domain to see which companies have employees across multiple spaces
- **`Space.settings.membership.policy`** (`OPEN` / `APPLICATIONS` / `INVITATIONS`) — annotate arcs to show which spaces are easy to cross-pollinate into vs. gated

---

### View 3: Treemap — "Where is the energy?"

**D3 module:** `d3-hierarchy` → `d3.treemap()`

**What it shows:**
A space-filling rectangular treemap where every rectangle is a space. L0 spaces divide the canvas, L1 subdivides those, L2 subdivides further. Rectangle **area** defaults to **activity count** (matching the question "where is the energy?"), falling back to member count when activity data is unavailable. Users can switch via dropdown: Members | Contributions (day/week/month/all-time). Color encodes a second dimension — activity tier (LOW=light blue, MEDIUM=sky, HIGH=dark blue, matching the existing palette).

**Why it's exciting:**
- A treemap is the most efficient use of screen space for comparing proportional sizes — much easier than estimating force-graph node radii
- Dual-encoding (area = size, color = activity tier) lets users spot "big but dead" spaces (large, light) vs. "small but buzzing" spaces (small, dark)
- Can switch the size axis via dropdown: Members | Contributions (day) | Contributions (week) | Contributions (month) | Contributions (all-time)
- Clicking a space zooms into it showing its subspaces in full detail

**Data needed (already available):**
- Space hierarchy with `parentSpaceId`
- `totalActivityCount` / `activityByPeriod` per space
- `spaceActivityTier` per space
- Member edges for member-count sizing

**New data that would enhance this view:**
- **`Callout.activity`** + **`Callout.contributionsCount`** — per-callout contribution counts would enable a "collaboration intensity" metric that's richer than just member-activity; you could see spaces where lots of content is being created vs. spaces with members but no contributions
- **`CalloutsSet.tags`** (aggregated, sorted by frequency) — display top tags inside each treemap cell as a mini word-cloud or label overlay, instantly showing what each space is about without clicking
- **`Space.visibility`** (`ACTIVE` / `ARCHIVED` / `DEMO`) — filter out or visually distinguish archived/demo spaces so the treemap reflects only living parts of the ecosystem

---

### View 4: Activity Timeline — "When does the ecosystem pulse?"

**D3 module:** `d3-shape` (area/line) + `d3-scale` (time) + `d3-brush` (range selection)

**What it shows:**
A **stacked area chart** (or streamgraph variant) where the x-axis is time, and each colored band represents a space's contribution activity. Users can see waves of activity rise and fall, identify seasonal patterns, find when a space launched vs. when it went quiet, and brush a time range to filter the other views.

**Why it's exciting:**
- Time is the one dimension completely missing from the current tool — this view fills that gap
- The existing `activityFeedGrouped` query already returns `createdDate` per activity entry; we just need to preserve those timestamps instead of only counting them
- Stacked area makes it easy to see both individual space trajectories and the ecosystem total
- Brushing a time window could then filter the force graph / sunburst / treemap to show only data within that period — a powerful cross-view interaction
- Can toggle between stacked area (show composition) and streamgraph (show relative change)
- Layering `CalendarEvent` data as vertical event markers ("Demo Day", "Quarterly Review") would add narrative context

**Data needed — changes required:**
- **`activityFeedGrouped` timestamps preserved**: The server will provide **two formats**:
  - **Pre-bucketed weekly time series** for the Timeline view: `{ spaceId, buckets: [{ week: '2026-W09', count: 12 }, ...] }` — lightweight, privacy-friendly
  - **`createdDate` fields on `GraphNode` and `GraphEdge`** for the Temporal Force Graph — precise placement of when each node/edge appeared
- This dual approach avoids forcing one format that poorly serves the other

**New data that would unlock this view's full potential:**
- **`Space.createdDate`** — mark the "birth" of each space on the timeline as a vertical marker
- **`CalendarEvent[]`** via `Space.collaboration.timeline.calendar.events` — overlay scheduled events (milestones, deadlines, meetings) as markers; now you can correlate "activity spiked right after the demo day"
- **`User.createdDate`** — overlay new-user join rate as a secondary line, showing growth velocity
- **`Callout.createdDate`** + **`Post.createdDate`** — would allow breaking the timeline down by content type (posts vs. whiteboards vs. discussions) rather than just total activity

---

### View 5: Temporal Force Graph — "How did this network grow?"

**D3 module:** `d3-force` (existing) + `d3-scale` (time) + `d3-timer` (animation)

**What it shows:**
The same force-directed graph, but with a **time scrubber** that animates the network's evolution. Nodes and edges appear at the moment they were created. Dragging the scrubber forward shows the ecosystem assembling itself over time — spaces launching, users joining, connections forming. Playing it as an animation reveals growth patterns, bursts of onboarding, and periods of quiet.

**Why it's exciting:**
- Turns a static snapshot into a living story — "watch the ecosystem grow"
- Reveals temporal clustering: did 50 users join in one week? Did a new L1 space trigger a burst of connections?
- Could be implemented as an enhancement to the existing `ForceGraph.tsx` (a "temporal mode" toggle) or as a standalone component that reuses the same rendering pipeline
- The time scrubber doubles as a filter — pause at any date to see the network as it was at that point
- Nodes can fade in with an entrance animation; edges can draw themselves like growing vines
- Combined with activity pulse: nodes glow when they're "active" at the current scrubber position

**Data needed — changes required:**
- **`Space.createdDate`** — when each space node appears on the timeline
- **`User.createdDate`** — when each user node appears
- **Edge creation timestamps** — investigate Alkemio schema for role-assignment `createdDate` first. If available, use it directly. If not, fall back to:
  - The earliest activity entry date between a user and space as a proxy for "joined date"
  - Batch edges for users with zero activity at the space's `createdDate`
- **Activity timestamps** (same as Timeline view) — to drive the glow/pulse at each time position

**Interaction model:**
- A horizontal time scrubber bar below or above the graph
- Play/pause button for auto-advance animation
- Speed control (1x, 2x, 5x)
- Current date label updating as the scrubber moves
- Nodes that haven't "appeared" yet are invisible; edges likewise
- Force simulation re-stabilizes smoothly as nodes appear (warm restart, not full re-layout)

---

## 3. View Switcher UX

A compact toolbar at the top of the Explorer, replacing or augmenting the current layout:

```
[ Force Graph ] [ Temporal ] [ Sunburst ] [ Chord ] [ Treemap ] [ Timeline ]
```

- Default view remains **Force Graph**
- Switching views preserves the current space selection and filters (activity period, role filters, etc.)
- Each view has its own control panel options where relevant (e.g., Treemap has "Size by" dropdown, Timeline has brush controls)
- Selected node/space state carries across views — selecting a space in Treemap and switching to Force Graph highlights it
- View state (active view, drill-down level) lives in React state only — no URL persistence since the app requires auth and per-user data loading makes shared URLs non-functional

---

## 4. Data Enhancement Summary

### New Alkemio Fields to Fetch

| Priority | Field | Where | Unlocks |
|----------|-------|-------|---------|
| **P0** | Activity timestamps (preserve `createdDate` per entry) | `activityFeedGrouped` | Timeline view, Temporal Force Graph |
| **P1** | `Space.createdDate` | `spaceByName` query | Timeline birth markers, Sunburst age coloring, Temporal node appearance |
| **P1** | `User.createdDate` | `usersByIDs` query | Temporal node appearance, Timeline user-growth overlay |
| **P1** | `Profile.tagsets` (KEYWORDS, SKILLS) | Users + Spaces | Topic chord diagram, Treemap tag labels |
| **P2** | `InnovationFlow.currentState.displayName` | Per space via `collaboration` | Sunburst lifecycle annotation |
| **P2** | `Callout.activity` + `contributionsCount` | Per space via `calloutsSet` | Treemap "collaboration intensity" metric |
| **P2** | `Space.visibility` | `spaceByName` query | Filter archived/demo across all views |
| **P3** | `CalendarEvent[]` (startDate, type) | `collaboration.timeline.calendar` | Timeline event markers |
| **P3** | `Organization.domain` | `organizationByID` | Chord diagram by org domain |
| **P3** | `Space.settings.membership.policy` | `spaceByName` query | Chord openness annotations |

---

## 5. Implementation Considerations

- All four views use **D3 v7.9** (already installed) — no new D3 dependencies except `d3-sankey` if we decide to explore Sankey later
- Each view is a separate React component under `frontend/src/components/graph/` alongside `ForceGraph.tsx`
- Shared data fetching stays in the server; views receive the same `GraphDataset` + any new fields
- The Timeline view requires a server-side change (bucketed time series endpoint or field)
- Views should be implemented incrementally — Sunburst and Treemap are lowest-effort since they only need existing data; Chord needs a matrix computation; Timeline needs server changes

---

## 6. Phasing Suggestion

| Phase | View | Server Changes | Effort |
|-------|------|----------------|--------|
| 1 | **Treemap** | None (uses existing data) | Small |
| 1 | **Sunburst** | None (uses existing data) | Small |
| 2 | **Chord Diagram** | Minimal (matrix computed client-side from edges) | Medium |
| 3 | **Activity Timeline** | Bucketed time-series data + `createdDate` fields | Large |
| 3 | **Temporal Force Graph** | Same timestamp data as Timeline + edge creation proxies | Large |

---

## 7. Out of Scope

- Exporting / sharing individual views as images or embeds (future feature)
- Real-time streaming updates (current polling model is sufficient)
- 3D visualizations (WebGL/Three.js — exciting but a different spec)
- Sankey / alluvial diagrams (considered but deferred — less natural fit for ecosystem data without clear flow directionality)

---

## 8. Open Questions

- [x] ~~Should we implement all four views, or pick 2-3 to start?~~ → All five views (including Temporal Force Graph) are in scope.
- [ ] For the Chord diagram, should the default show shared members or shared tags (once tags are fetched)?
- [ ] For the Timeline, what time bucket resolution makes sense? Daily? Weekly? Monthly?
- [x] ~~Should view state (which view is active, drill-down level) be persisted in the URL for shareability?~~ → No — app requires auth, shared URLs wouldn't work. React state only.
