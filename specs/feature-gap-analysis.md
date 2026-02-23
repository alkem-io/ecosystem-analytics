# Feature Gap Analysis: ecosystem-analytics vs analytics-playground

Comparison of features between the new `ecosystem-analytics` app and the old `analytics-playground` reference repo ([alkem-io/analytics-playground](https://github.com/alkem-io/analytics-playground)).

## Already Implemented

| Feature | Notes |
|---------|-------|
| Force-directed graph (D3) | ✅ Full simulation with collision, links, charge forces |
| Zoom & pan | ✅ D3 zoom with scale extent |
| Node dragging | ✅ With geo-snap-back in map mode |
| Map overlay (Europe, World, Netherlands) | ✅ GeoJSON-based with geoMercator projection |
| Geographic node pinning (fx/fy) | ✅ Nodes with lat/lon pinned to map position |
| Node type filtering (people, orgs, spaces) | ✅ Checkbox toggles in control panel |
| Search highlighting | ✅ Search bar highlights matching nodes/badges |
| Node click → details panel | ✅ Right-side drawer with stats, related spaces |
| Proximity clustering with fan-out animation | ✅ Replaces old clustering; animated badge expand/collapse |
| Convex hull cluster backgrounds | ✅ Soft colored hulls with Catmull-Rom curves |
| Curved bezier edges (Kumu-style) | ✅ Quadratic bezier with perpendicular offset |
| Label collision culling | ✅ Priority-based label placement, no overlaps |
| JSON export | ✅ Export graph data to JSON download |
| Space add/expand from details panel | ✅ US3 — related spaces expansion |
| Node hover → side panel preview | ✅ Compact preview on hover, full on click |
| 2nd-degree connection highlighting | ✅ Full opacity → medium → faded layering |
| Avatar images on nodes | ✅ Clipped to circle, with fallback |
| Banner images in details panel | ✅ L0 parent banner for all space types |
| Space removal from scope (×) | ✅ Chip × button in scope section |
| Legend with node + edge colors | ✅ Nodes and connection type colors |

## Missing — High Impact

| # | Feature | Old Repo Location | Effort | Description |
|---|---------|-------------------|--------|-------------|
| 1 | **Zoom controls (in/out/fit)** | `zoomFit()`, `zoomPlus()`, `zoomMin()` | Small | Dedicated +/−/fit buttons on the canvas. Old repo has zoom-to-fit that calculates bounding box. Currently only scroll-to-zoom. |
| 2 | **Zoom to node** | `zoomToNode(node)` in GraphVizualization | Small | "Zoom to" button in node details panel — centers and zooms to selected node. Very useful for large graphs. |
| 3 | **Fullscreen mode** | `fullscreen-toolbar`, fullscreen toggle | Medium | Toggle canvas to fullscreen with dedicated toolbar overlay. Old repo has separate fullscreen control set. |
| 4 | **Minimum connections filter (degree slider)** | `degree-filter` range slider, `updateDegreeFilter()` | Small | Slider to hide nodes with fewer than N connections. Powerful for decluttering large graphs. |
| 5 | **Hide isolated nodes** | `hide-isolated` checkbox, `updateIsolatedNodesFilter()` | Small | Toggle to hide nodes with zero connections. Quick way to focus on connected subgraph. |
| 6 | **Network Insights Engine** | `NetworkInsightEngine`, `generateSmartInsights()` | Large | Automated analysis: super connectors, bridge nodes, geographic clusters, community detection. Shows actionable insights with highlight buttons. |

## Missing — Medium Impact

| # | Feature | Old Repo Location | Effort | Description |
|---|---------|-------------------|--------|-------------|
| 7 | **3D Graph View** | `Graph3DVisualization.ts` using `3d-force-graph` | Large | Full 3D force-directed graph with Three.js. Toggle between 2D/3D. Includes 3D node click, neighbor highlighting, camera zoom. |
| 8 | **Visual modes (centrality/community/geographic)** | `updateVisualMode()`, `communityColors` | Medium | Color nodes by centrality score, detected community, or geographic grouping. Powerful analytical lens. |
| 9 | **Node size by metric** | `node-size-metric` select, `updateNodeSizing()` | Small | Size nodes dynamically by: degree count, betweenness centrality, weight, or uniform. |
| 10 | **Node color by metric** | `node-color-metric` select, `updateNodeColoring()` | Small | Color nodes by: type (default), community, centrality, geographic region. |
| 11 | **Layout algorithms** | `layout-algorithm` select, `updateLayoutAlgorithm()` | Medium | Switch between force-directed, circular, hierarchical, geographic layouts. |
| 12 | **Shortest path finding** | `findShortestPath()` | Medium | Select two nodes and highlight the shortest path between them. |
| 13 | **Cluster member list panel** | `showClusterPanel(cluster)` | Small | When clicking a cluster badge, show a scrollable list of all members with avatars and roles. Currently only fan-out is available. |

## Missing — Low Impact / Nice-to-Have

| # | Feature | Old Repo Location | Effort | Description |
|---|---------|-------------------|--------|-------------|
| 14 | **Ireland map region** | `ireland-with-counties_geo.json` | Trivial | Additional map region option (currently have Europe, World, Netherlands). |
| 15 | **Arrow heads on edges** | `addArrowHeadDef()` in VisualDefinitions | Small | Directional arrows on edge paths showing relationship direction. |
| 16 | **Shift-click to unfix node** | Documented in `graph-controls-help.html` | Small | Shift+click a node to release it from a fixed (dragged) position. |
| 17 | **In-graph hovercard tooltip** | `Hovercard.ts`, `HovercardHtml.ts` | Small | Tooltip that appears near the node on hover (as opposed to side panel). Could complement the side panel hover. |
| 18 | **Saved views / presets** | `saveCurrentView()`, `loadView()` | Medium | Save and recall named view configurations (filter state, zoom, selection). |
| 19 | **Clear selection button** | `graph-clear-selection` button | Trivial | Explicit "Clear selection" button (currently deselect by clicking background). |
| 20 | **Link width by metric** | `updateLinkWidth()`, `link-width-metric` select | Small | Vary edge width by weight, type, or other metric. |
| 21 | **Focus on selection mode** | `focus-selection` checkbox | Small | Toggle that auto-zooms/filters to show only the selected node and its neighborhood. |

## Recommendation

**Quick wins** (1–2 hours each): #1 (zoom controls), #4 (degree filter), #5 (hide isolated), #13 (cluster member list), #14 (Ireland map), #16 (shift-click unfix), #19 (clear selection button).

**High-value, medium effort**: #2 (zoom to node), #3 (fullscreen), #6 (insights engine), #8 (visual modes).

**Deferred / explore later**: #7 (3D view — significant complexity), #12 (shortest path), #18 (saved views).
