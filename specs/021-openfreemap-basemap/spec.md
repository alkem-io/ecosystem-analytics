# Feature Specification: Watermark-free maps on a keyless basemap

**Feature Branch**: `021-openfreemap-basemap`
**Created**: 2026-09-02
**Status**: Draft
**Input**: User description: "Move the Dutch dashboard maps off CARTO raster tiles onto OpenFreeMap's positron vector basemap rendered with MapLibre GL, aligned with client-web, preserving Constitution VII Netherlands-only rendering and delivering genuine verification of it against the real rendered map, plus the licence-required map attribution."

## Overview

Every map in the product is currently drawn on map imagery from CARTO. CARTO has begun stamping a repeated **"API KEY REQUIRED"** watermark across that imagery for anyone who has not registered, and has said the imagery service this product uses is being retired. The watermark is visible right now, in production, on the VNG and GovTech dashboards and on the Explorer.

The main Alkemio client already solved this: it draws its maps from a public, keyless map service that needs no registration, has no request limits, and permits commercial use. This feature moves the analytics maps onto that same service, so both products share one basemap and neither depends on a third-party key.

Two things make this more than a supplier swap.

**The Netherlands-only rule.** The constitution requires every Dutch dashboard map to show the Netherlands and nothing else — no neighbouring countries, no open sea, just plain white outside the border. That rule is currently enforced by painting an opaque white shape over everything outside the country, on top of the map imagery. The new map service draws its imagery a fundamentally different way, so the masking has to be re-established rather than inherited.

**The guard does not watch what this change breaks.** Today's protection is a chain: pixel checks prove a particular mask shape hides everything outside the country, and a unit check proves the shipped code produces exactly that shape. That chain is real, and it guards the mask's *geometry* well. What it never does is look at the finished picture — it cannot tell whether the mask is actually painted over the imagery, only that the mask is the right shape. Every one of those checks reads the drawing layer alone. Move the imagery into a second layer beneath it, as this change does, and all of them keep passing while the imagery underneath could show Germany. A check that looks at the composited result has to exist **before** the imagery moves, or this feature would quietly remove the protection the constitution treats as non-negotiable.

Separately, the licence of both the old and the new map service requires visible credit to the map data providers. The product currently shows none, on any map. This feature fixes that.

## Clarifications

### Session 2026-09-02

- Q: Where should the required map attribution appear, given the constitution says everything outside the Netherlands is plain white? → A: Below the map, outside the map area entirely — nothing is drawn over the white, so the Netherlands-only rule is untouched
- Q: Must map interaction (pan, zoom, node positions) remain exactly as it is today? → A: No — the map is rebuilt around the map technology's own camera, and markers are re-projected onto it. Interaction *feel* may change; interaction *capability* may not
- Q: Does the Explorer's world/Europe map move too, or only the Dutch dashboard maps? → A: All maps move, including the Explorer's world and Europe views — one imagery path, not two
- Q: How does the Netherlands-only guard obtain a real rendered map to inspect? → A: A dedicated harness page mounts the real map with fixture locations — no sign-in, no backend — and the guard inspects what that page actually draws
- Q: What draws the markers, edges and hover once the map technology owns the camera? → A: The existing drawing layer keeps drawing them; it re-projects through the map's camera. Only the source of coordinates changes
- Q: What exactly makes the Netherlands-only guard pass or fail? → A: Named points known to be outside the region (open sea, German and Belgian territory) must be exactly the page background, and named points inside must not be — sampled a small margin clear of the border so the antialiased coastline seam is never measured
- Q: What does a user see when the map cannot draw (service unreachable, or no support for the map technology)? → A: The region outline with the markers still positioned on it, plus a short "map detail unavailable" note — the geography and every marker interaction survive, only the street detail is lost
- Q: During a pan or zoom, may the markers lag the map? → A: No — markers stay locked to the imagery every frame, mid-gesture as well as after it

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A guard that actually watches the shipped map (Priority: P1)

Before any map imagery changes, an engineer can run one automated check that loads the product's real Netherlands map, looks at what is genuinely on screen, and fails if anything is drawn outside the Dutch border. It inspects the finished picture the user sees — not a reconstruction of it, and not just one of its layers.

**Why this priority**: This is the safety net for the constitution's hardest rule, and it must exist first. Without it the rest of the feature is a rewrite of a protected behaviour with nothing watching. It also has standalone value: it closes a gap that exists today, whichever map service is used.

**Independent Test**: Run the check against the current, unchanged product — it must pass. Then deliberately break the masking (remove the white overlay) and re-run — it must fail. A guard that cannot fail is not a guard.

**Acceptance Scenarios**:

1. **Given** the product's Netherlands map as it ships today, **When** the check runs, **Then** it passes, and it reports that it inspected the real map rather than a stand-in.
2. **Given** the masking is deliberately disabled, **When** the check runs, **Then** it fails and names where outside-the-border content appeared.
3. **Given** the map is panned and zoomed, **When** the check runs at those positions, **Then** the border rule still holds — the mask cannot be escaped by moving the map.
4. **Given** the map is drawn from two stacked layers, **When** the check inspects it, **Then** it sees the combined result, so content hidden in either layer alone cannot slip through.

---

### User Story 2 - Maps without a watermark or a key (Priority: P1)

A user opening any dashboard map sees clean map detail with no "API KEY REQUIRED" text across it. Nobody has to register for, store, rotate, or pay for a map key, and no deployment configuration is needed for maps to work.

**Why this priority**: This is the reason the feature exists. The watermark is visible to every user in production today, and it makes the product look broken.

**Independent Test**: Open every map in every product surface — both Dutch dashboards and the Explorer's world and Europe views — and confirm no watermark text appears anywhere, and that no map key exists in any configuration or environment file.

**Acceptance Scenarios**:

1. **Given** any dashboard map, **When** it loads, **Then** no watermark text appears at any zoom level.
2. **Given** a fresh checkout with no extra configuration, **When** the maps load, **Then** they render fully — no key, no registration, no per-environment setup.
3. **Given** the Netherlands map, **When** it is compared against the constitution's reference look, **Then** it still shows real street-level map detail inside the border, not an empty silhouette.
4. **Given** the map is used heavily, **When** many views are loaded, **Then** nothing degrades or is throttled by a request quota.

---

### User Story 3 - The Netherlands-only rule survives the change (Priority: P1)

A user on any Dutch dashboard map sees the Netherlands with real map detail, surrounded by plain white. Germany, Belgium, England and the North Sea are not drawn at all — not faint, not grey, not a silhouette — at any zoom level or pan position, on the network map, the initiative-details map and the Usage Explorer map.

**Why this priority**: A binding constitutional requirement. Equal in priority to US2 because shipping the new imagery without it would be a regression the constitution forbids.

**Independent Test**: On each of the three map surfaces, at several zoom levels and pan positions, confirm that everything outside the Dutch border is the plain page background.

**Acceptance Scenarios**:

1. **Given** the Netherlands map at its default view, **When** the user looks outside the border, **Then** it is plain white with nothing drawn on it.
2. **Given** the user zooms in near the coast, **When** the sea comes into view, **Then** it is still plain white.
3. **Given** the user pans towards Germany, **When** the border area is on screen, **Then** no German territory is drawn.
4. **Given** a single province is selected, **When** the map renders, **Then** only that province is drawn and the rest of the Netherlands is plain white.
5. **Given** the map is zoomed or panned rapidly, **When** the gesture is *in progress* as well as after it settles, **Then** the map imagery and the pinned locations stay locked together — no frame shows them separated.

---

### User Story 4 - Map credit is shown as the licence requires (Priority: P2)

Every map displays credit to the map data providers, as the licence of the map service requires in exchange for free use. The credit is legible and reachable, and does not obscure the map.

**Why this priority**: A licence obligation the product currently fails, on both the old and the new service. Not a blocker for the imagery switching, so it sits below the P1s — but it must not be omitted.

**Independent Test**: Open each map and confirm the required credit is visible or reachable, and that it does not break the Netherlands-only rule.

**Acceptance Scenarios**:

1. **Given** any map, **When** it renders, **Then** the required provider credit is visible or reachable in one interaction.
2. **Given** a Dutch dashboard map, **When** the credit is displayed, **Then** the Netherlands-only rule is still satisfied.
3. **Given** the map is exported or screenshotted, **When** the image is produced, **Then** the credit is part of it.

---

### User Story 5 - One basemap across Alkemio products (Priority: P3)

The analytics maps and the main Alkemio client draw from the same map service and the same visual style, so the two products look like one product and a future change to the basemap is made once.

**Why this priority**: A maintainability and consistency benefit rather than a user-visible fix. Real, but it follows from US2 rather than needing separate work.

**Independent Test**: Place a map from each product side by side and confirm they use the same cartographic style; confirm both name the same map service.

**Acceptance Scenarios**:

1. **Given** a map in each product, **When** they are compared, **Then** they use the same cartographic style and colours.
2. **Given** the map service changes in future, **When** the change is applied, **Then** both products need the same single change.

---

### User Story 6 - Nothing the user could already do is lost in the rebuild (Priority: P1)

Because the map is being rebuilt around a different camera, everything a user can do on a map today still works afterwards: panning, zooming, selecting a region or province, hovering a marker to see its card, clicking through to a space or a city, node clustering, and the layout of the network graph itself.

**Why this priority**: The author chose the rebuild over the lower-risk option, which trades build simplicity for behavioural risk in a large, heavily-used component. That risk has to be stated as a requirement rather than left to chance, so it is P1 alongside the constitutional rule.

**Independent Test**: Work through every interaction available on each map surface before and after the change and confirm each still behaves the same. Anything that changes must be an intentional, recorded difference.

**Acceptance Scenarios**:

1. **Given** any map surface, **When** the user pans and zooms, **Then** it responds — the exact feel may differ, but no capability is lost.
2. **Given** a marker, **When** the user hovers it, **Then** the hover card appears with the same content and positioned over the marker.
3. **Given** a marker, **When** the user clicks it, **Then** the same navigation happens as before.
4. **Given** the region or province selector, **When** a different region is chosen, **Then** the map reframes on it and stays masked to it.
5. **Given** the network map, **When** it renders, **Then** nodes sit at their geographic positions and clustering behaves as before.
6. **Given** any deliberate difference in behaviour, **When** the feature is delivered, **Then** that difference is recorded rather than discovered by a user.

---

### Edge Cases

- The map service is slow or unreachable → the region outline and markers are drawn with a notice, and the Netherlands-only rule still holds over whatever imagery did load.
- The user's device or browser cannot render the map technology → the same outline-and-markers fallback appears, not a blank area.
- The map is resized, or the browser window changes, or the map enters full screen → imagery and markers stay aligned and the mask stays correct.
- The user zooms far past the level the map service provides detail for → the view stays coherent and stays masked.
- The map is printed or captured for the dashboard export → the Netherlands-only rule and the credit both survive into the output.
- A map loads while the browser tab is in the background, or is hidden and re-shown → it renders correctly when revealed rather than staying blank.
- Repeated rapid zooming → markers stay locked to the imagery on every frame, and no intermediate frame shows content outside the border.
- A very large selection is on screen while the user pans → markers still track the imagery frame by frame; if that cannot be sustained, it is a defect to solve rather than a trade to accept.

## Requirements *(mandatory)*

### Functional Requirements

#### Verification (must land first)

- **FR-001**: The system MUST provide an automated check that verifies the Netherlands-only rule against the product's real, fully rendered map — not a reconstruction of its layering built inside the test.
- **FR-001a**: The check MUST be able to render that map from fixture locations alone, with no sign-in and no backend, so it runs unattended and without credentials. A guard that needs a live authenticated environment is what allowed today's gap to persist.
- **FR-001b**: The surface the check renders MUST be the same map the product ships, not a copy maintained alongside it, so the two cannot drift apart.
- **FR-002**: That check MUST inspect the complete composited picture, so content drawn in any one layer cannot escape detection.
- **FR-002a**: The check MUST sample named points known to lie outside the region (open sea, German and Belgian territory) and named points known to lie inside it. Outside points MUST be exactly the page background; inside points MUST NOT be.
- **FR-002b**: Sampled points MUST sit a margin clear of the region border, so the antialiased edge along the coastline is never measured and cannot make the check flaky.
- **FR-002c**: The check MUST NOT rely on a colour tolerance for outside points — an exact background match is what stops a faint or partial leak passing.
- **FR-003**: The check MUST be demonstrated to fail when the masking is deliberately removed, proving it can detect a regression.
- **FR-004**: The check MUST cover the network map, the initiative-details map, and the Usage Explorer map, and MUST cover both whole-Netherlands and single-province views.
- **FR-005**: The check MUST verify the rule under pan and zoom, not only at the default view.
- **FR-006**: The check MUST pass against the product as it stands today, before any map imagery is changed, establishing the baseline.
- **FR-007**: The existing checks MUST be retained where they still hold (they guard the mask's geometry) but MUST be clearly marked as covering geometry only, so no one mistakes them for proof that the finished picture is masked.
- **FR-008**: Any documentation that points at a verification MUST name a check that exists, at the path it actually lives at.

#### The basemap

- **FR-009**: Maps MUST draw their imagery from a service that requires no API key, no registration, and imposes no request quota.
- **FR-010**: No map credential MUST be required in any configuration file, environment variable, or secret store.
- **FR-011**: No map MUST display a watermark or any provider notice imposed for lack of registration.
- **FR-012**: The Netherlands map MUST continue to show real street-level detail inside the border, as the constitution's reference look requires — not a plain or empty shape.
- **FR-013**: The chosen service and visual style MUST match the one the main Alkemio client already uses, so the two products share a basemap.

#### The Netherlands-only rule

- **FR-014**: Every Dutch dashboard map MUST render only the selected region — the Netherlands, or a single province — with everything outside it as plain page background.
- **FR-015**: The rule MUST hold at every zoom level and pan position, including rapid or extreme interaction.
- **FR-016**: The rule MUST hold across all three map surfaces and both Dutch dashboards, from one shared implementation, so the surfaces cannot drift apart.
- **FR-016a**: Every map in the product MUST use the same imagery path, including the Explorer's world and Europe views, so no second mechanism is left behind to maintain or to re-break.
- **FR-017**: Map imagery and the markers drawn on it MUST be driven by a single camera, so they cannot drift apart during or after pan and zoom.
- **FR-017e**: Markers MUST stay locked to the imagery on every frame of a pan or zoom, not only once the gesture settles. Letting them catch up afterwards — or hiding them mid-gesture — is explicitly not acceptable, whatever the frame cost.

#### Preserving existing behaviour through the rebuild

- **FR-017a**: Every interaction available on a map today — pan, zoom, region and province selection, marker hover, marker click-through, node clustering, geographic node placement — MUST still be available afterwards.
- **FR-017b**: Any deliberate change in interaction behaviour MUST be recorded as part of the delivery rather than left for a user to find.
- **FR-017c**: Content drawn on top of the map (markers, hover cards, node graph) MUST keep its current appearance and content; only what draws the imagery beneath it and what masks it may change.
- **FR-017d**: Markers, edges, clustering and hover MUST continue to be drawn by the layer that draws them today, taking their positions from the map's camera rather than from their own. The graph's edges, its force simulation, and the modes that show no basemap at all MUST be unaffected.

#### Attribution

- **FR-018**: Every map MUST display the credit its map service's licence requires.
- **FR-019**: The credit MUST sit outside the map area — beneath it — so that nothing is drawn over the plain background outside the region and the Netherlands-only rule is untouched.
- **FR-020**: The credit MUST survive into any exported or captured image of the map.

#### Degradation

- **FR-021**: If the map service is unavailable, slow, or partially loaded, the map MUST draw the region outline with the markers still positioned on it, and MUST NOT show content outside the region.
- **FR-022**: If the browser cannot render the map technology at all, the user MUST see the same fallback — region outline plus positioned markers — rather than a blank area.
- **FR-022a**: The fallback MUST carry a short notice that map detail is unavailable, so the missing imagery reads as a degraded state rather than as the finished map.
- **FR-022b**: In the fallback, every marker interaction that works normally — hover, click-through, selection — MUST still work, since the information the map carries is the markers, not the imagery.
- **FR-023**: No map failure MUST break the surrounding page or the rest of the dashboard.

### Key Entities

- **Basemap service**: The external provider of map imagery. Keyless, quota-free, licence requires credit.
- **Map region**: The area a map is restricted to — the whole Netherlands, one of twelve provinces, or (for the Explorer) a wider area.
- **Region mask**: The mechanism that hides everything outside the selected region. The constitution's requirement lives or dies by it.
- **Map surface**: One of the three places a map appears — the network map, the initiative-details map, the Usage Explorer map.
- **Markers**: The locations drawn on top of the map (organisations, gemeentes) that must stay aligned with the imagery beneath them.
- **Netherlands-only guard**: The automated check that proves the region mask works on the shipped map.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero maps display a watermark, at any zoom level, on any surface — both Dutch dashboards and the Explorer's world and Europe views.
- **SC-002**: Zero map credentials exist in any configuration, environment file, or secret store, and a fresh checkout renders every map with no map-related setup.
- **SC-003**: 100% of sampled points outside the selected region are *exactly* the plain page background — no colour tolerance — across all three map surfaces, both whole-country and province views, and at a minimum of three zoom levels each; and every sampled point inside the region is not the background, proving the imagery actually rendered.
- **SC-004**: The Netherlands-only guard fails when the mask is deliberately removed — demonstrated, not assumed.
- **SC-004a**: The guard runs to completion with no credentials, no backend and no manual step, so it can run on every change rather than on request.
- **SC-005**: Map imagery and markers stay aligned: a marker's position relative to the map beneath it does not shift measurably at any point during or after a pan or zoom — sampled mid-gesture, not only at rest.
- **SC-005a**: Every interaction available on a map before the change is available after it, verified surface by surface, with any intentional difference recorded.
- **SC-006**: Every map displays its required provider credit, verified on all three surfaces.
- **SC-007**: Map load time as perceived by the user is no worse than before the change.
- **SC-008**: No map failure — slow service, unreachable service, unsupported browser — produces a blank area, a broken page, or content outside the region; in every such case the region outline, the markers and their interactions remain available.

## Assumptions

- **A-001**: The keyless map service the main Alkemio client uses remains available on the same terms (no key, no quota, commercial use permitted, credit required). Its operator offers no service-level guarantee, which is accepted as it is already accepted for the main client.
- **A-002**: The map data itself is equivalent in coverage and quality for the Netherlands, so the change is a supplier change rather than a downgrade in what users can see.
- **A-003**: The visual style is close enough to today's that the dashboards do not need a design revision; small cartographic differences are acceptable.
- **A-004**: The region boundary data the product already holds is reused unchanged — this feature does not alter which area counts as the Netherlands or a province.
- **A-005**: The markers, clustering, hovering and node interaction keep their current *appearance and capability*, but the mechanism positioning them is expected to change, since the camera does. Small differences in the feel of pan and zoom are accepted as part of the chosen rebuild.
- **A-006**: The new map technology is available in the browsers the product already supports.
- **A-007**: Delivering the verification first means the guard is written against today's map, then must keep passing after the change — that continuity is the point.

## Out of Scope

- Changing which regions can be selected, or the boundary data defining them.
- Redesigning the maps, their markers, clustering, hover behaviour, or the surrounding dashboard UI.
- Changing how locations are sourced, geocoded, or matched to organisations.
- Any change to the dashboards' data, charts, tables, or classifications.
- Offline or self-hosted map serving.
- Changing the network graph's force simulation, clustering rules, or hover-card content — these must survive the rebuild unchanged, not be redesigned.
