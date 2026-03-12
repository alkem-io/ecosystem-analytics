# Feature Specification: Map Location Filtering & Readability

**Feature Branch**: `012-map-location-filtering`  
**Created**: 2026-03-09  
**Status**: Draft  
**Input**: User description: "Improve map mode by removing clusters, reducing node sizes for readability, and filtering entity locations based on selected map boundaries with dual location concept (actual vs display location)"

## Clarifications

### Session 2026-03-09

- Q: How should free-floating nodes be positioned relative to the map? → A: Soft repulsion zone — a force gently pushes unpinned nodes away from the map rectangle, letting the simulation find natural positions.
- Q: What scale factor for node sizes in map mode? → A: 50% base multiplier (0.5×), scaling responsively with zoom level — smaller when zoomed out for map legibility, growing toward normal size as the user zooms in.
- Q: Should clustering removal also affect the non-map force graph view? → A: Map mode only — proximity clustering is removed only when a map is active; it remains available in the standard force graph view.
- Q: How should the transition look when switching map regions? → A: Animated transition — nodes smoothly drift between pinned/free-floating positions over ~600ms, providing visual continuity.
- Q: Should map region boundaries use simple rectangles or precise GeoJSON shapes? → A: GeoJSON polygon containment — use actual country/continent outlines for precise point-in-polygon checks.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Map-Filtered Node Placement (Priority: P1)

When a user selects a specific regional map (e.g., Netherlands), only entities whose real geographic location falls within that map's boundaries are pinned to their map coordinates. All other entities — those located outside the selected region or those without location data — are rendered as free-floating (unpinned) nodes that arrange themselves via the force simulation away from the map area.

**Why this priority**: This is the core behavioral change that makes regional maps usable. Currently, selecting the Netherlands map still pins people in Japan to their (off-screen or edge) coordinates, creating visual noise and confusion. Filtering by map boundaries is the single highest-impact improvement.

**Independent Test**: Select "Netherlands" map, observe that only entities geolocated within the Netherlands are pinned on the map. Entities located in Japan, the US, or with no location data float freely and do not overlap the map.

**Acceptance Scenarios**:

1. **Given** a user has the Netherlands map selected, **When** the map renders, **Then** only entities with latitude/longitude coordinates within the Netherlands bounding box are pinned to their geographic locations on the map.
2. **Given** a user has the Netherlands map selected, **When** an entity's location is in Japan, **Then** that entity is rendered as a free-floating (unpinned) node positioned away from the map area by the force simulation.
3. **Given** a user has the Netherlands map selected, **When** an entity has no location data, **Then** that entity is rendered as a free-floating node, identical in behavior to out-of-bounds entities.
4. **Given** a user switches from the Netherlands map to the World map, **When** the map renders, **Then** all entities with any valid location data are pinned to their geographic positions, since the World map includes all locations.
5. **Given** a user switches from the World map to the Europe map, **When** an entity was previously pinned in South America, **Then** that entity transitions to a free-floating state since it falls outside Europe's boundaries.

---

### User Story 2 - Remove Proximity Clustering (Priority: P2)

Proximity clustering is removed from map mode entirely. Individual nodes are always rendered as distinct entities, never grouped into cluster badges, regardless of zoom level or node density.

**Why this priority**: Clusters currently make the map unreadable — they hide too many people behind opaque badges with no easy way to interact with members. Removing clustering directly addresses the readability complaint and simplifies the interaction model.

**Independent Test**: Activate map mode with a dataset containing many co-located entities. Verify that no cluster badges appear at any zoom level. Each entity is visible as its own node.

**Acceptance Scenarios**:

1. **Given** the map mode is active with 50+ entities at the same geographic location, **When** the user views the map at any zoom level, **Then** each entity is rendered as an individual node (no cluster badges appear).
2. **Given** the map mode is active, **When** the user zooms out to the maximum extent, **Then** nodes may overlap visually but are never merged into cluster groups.
3. **Given** the map mode is active, **When** the user hovers or clicks on a densely packed area, **Then** individual nodes are targetable for interaction (tooltip, selection).

---

### User Story 3 - Reduced Node Sizes for Map Readability (Priority: P3)

Node sizes in map mode are reduced so that the underlying map detail (country borders, city names, geographic features) remains visible and readable beneath the nodes.

**Why this priority**: Even without clusters, large nodes obscure map information. Smaller nodes ensure the map itself stays legible, which is essential for geographic context.

**Independent Test**: Activate map mode and confirm that country borders, labels, and geographic features on the basemap remain legible underneath and around the nodes.

**Acceptance Scenarios**:

1. **Given** the map mode is active, **When** nodes are rendered, **Then** node radii are noticeably smaller than in non-map mode, allowing the basemap to be read.
2. **Given** the map mode is active with many pinned nodes, **When** the user inspects a dense region, **Then** the underlying map features (borders, labels) are still visible between and around the nodes.
3. **Given** the map mode is toggled off and back to the default force graph view, **When** nodes are rendered, **Then** node sizes return to their standard (current) dimensions.

---

### Edge Cases

- What happens when an entity's coordinates fall exactly on the boundary of the selected map region? Entities on the boundary are included (inclusive boundary check).
- What happens when a map region is selected and zero entities have locations within it? The map renders with no pinned nodes; all entities float freely away from the map.
- What happens when all entities are within the selected map's bounds? No free-floating nodes exist; all entities are pinned to their geographic positions.
- What happens with entities that have a country but no latitude/longitude? They are treated as having no valid location and rendered as free-floating nodes.
- How do free-floating nodes behave when co-located pinned nodes are very dense? The force simulation positions free-floating nodes in available space outside the map's visual area, avoiding overlap with the map region.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST determine whether each entity's geographic location falls within the selected map region using GeoJSON polygon containment (point-in-polygon) against the actual country or continent outlines.
- **FR-002**: System MUST pin (geo-lock) only entities whose location is within the selected map region's boundaries to their geographic coordinates on the map.
- **FR-003**: System MUST render entities outside the selected map region (or without location data) as free-floating, unpinned nodes governed by the force simulation.
- **FR-004**: System MUST recompute which entities are pinned vs. free-floating whenever the user changes the selected map region.
- **FR-005**: System MUST remove all proximity clustering behavior from map mode only — no cluster badges, no grouping, no fan-out interaction when a map is active. Proximity clustering remains available in the standard (non-map) force graph view.
- **FR-006**: System MUST render every entity as an individual node in map mode, regardless of zoom level or density.
- **FR-007**: System MUST reduce node visual sizes in map mode using a 0.5× base multiplier that scales responsively with zoom level — nodes are smallest when zoomed out (maximizing map legibility) and grow toward their standard size as the user zooms in.
- **FR-008**: System MUST restore standard node sizes when map mode is deactivated.
- **FR-009**: System MUST apply a soft repulsion force that pushes free-floating (unpinned) nodes away from the map's bounding rectangle, so the force simulation naturally positions them outside the map area without a rigid layout zone.
- **FR-010**: System MUST treat the World map as the all-inclusive region — all entities with valid coordinates are pinned when the World map is selected.
- **FR-011**: System MUST treat entities with incomplete location data (e.g., country name but no coordinates) as having no valid location for pinning purposes.
- **FR-012**: System MUST animate the transition when entities change between pinned and free-floating states on a region switch — nodes smoothly drift to their new positions over ~600ms rather than snapping instantly.

### Key Entities

- **Entity Node**: A person, organization, or space rendered on the force graph. Has an optional geographic location (latitude, longitude, country, city).
- **Map Region**: A selectable geographic area (e.g., Netherlands, Europe, World) with defined boundaries that determine which entities are pinned.
- **Display State**: Per-node computed state per map selection — either "pinned" (geo-locked to map coordinates) or "free-floating" (governed by force simulation). Derived dynamically from the selected map region and the node's actual location; not stored as persistent data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a regional map is selected, 100% of entities outside the region's boundaries are free-floating and do not overlap the map area.
- **SC-002**: When the World map is selected, all entities with valid coordinates are pinned to their geographic locations.
- **SC-003**: No cluster badges appear in map mode under any conditions (any dataset size, any zoom level).
- **SC-004**: Map labels, borders, and geographic features remain legible when up to 100 pinned nodes are displayed in a single map region at default zoom. Nodes scale smoothly with zoom level.
- **SC-005**: Switching between map regions updates the pinned/free-floating state of all nodes with a smooth animated transition (~600ms), completing within 1 second total.
- **SC-006**: Users can identify and interact with (hover, click) individual nodes in dense areas without needing to expand clusters.

## Assumptions

- **Out of scope**: Changes to the standard (non-map) force graph view. Proximity clustering, node sizing, and positioning behavior in non-map mode remain unchanged.

- Each map region (Netherlands, Europe, World) uses its GeoJSON polygon outlines for precise point-in-polygon containment checks. The existing GeoJSON data used for map rendering can be reused for boundary classification.
- The force simulation can handle all nodes individually (without clustering) at the current dataset sizes (up to ~500 nodes) without significant performance degradation.
- "Away from the map area" for free-floating nodes is achieved via a soft repulsion force applied to unpinned nodes relative to the map's bounding rectangle. The simulation finds natural positions without a rigid exclusion zone or dedicated sidebar.
- Node size reduction in map mode starts at a 0.5× base multiplier and scales responsively with zoom level. The multiplier applies uniformly across all node types (spaces, organizations, users) rather than changing relative sizing between types.
