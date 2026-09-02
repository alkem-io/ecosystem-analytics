# Phase 0 Research: Watermark-free maps on a keyless basemap

**Feature**: 021-openfreemap-basemap | **Date**: 2026-09-02

Every claim below about the current code was checked against the files named. Every claim about the two external services was checked against their documentation and, for CARTO, against a fetched tile.

---

## R-001: The basemap and how it is consumed

**Decision**: OpenFreeMap's `positron` style (`https://tiles.openfreemap.org/styles/positron`) rendered by `maplibre-gl`, matching `client-web`'s `^5.6.0`. **Do not** adopt `react-map-gl`, even though `client-web` uses it.

**Rationale**: `client-web/src/crd/components/map/ContributorMap.tsx:19` already ships this exact style, and its code comment states the reason plainly — *"no API key → no infra change"*. OpenFreeMap requires no registration, no key and no cookies, imposes no request limit, and permits commercial use; the only condition is attribution.

The `react-map-gl` half of `client-web`'s stack does not transfer. That wrapper exists to express a map as a declarative React tree (`<Map><Marker/><Popup/></Map>`), which is exactly how `ContributorMap` is written. EA's maps are the opposite: `ForceGraph` and `UsageMap` are imperative D3 code that creates and owns its own DOM across a 2,700-line effect. Wrapping MapLibre in React state we would immediately have to escape from would add a dependency and a reconciliation layer for no benefit. Alignment that matters — same service, same style, same cartography, one place to change it — is achieved by `maplibre-gl` alone.

**Alternatives considered**:
- *Keep raster tiles, point at another keyless provider* — none exists with this style. OSM's standard tiles forbid this usage under their tile policy, and every positron-like raster service (MapTiler, Stadia) requires a key. Verified: OpenFreeMap serves no raster endpoint at all — `styles/positron` returns JSON, and `styles/positron/{z}/{x}/{y}.png`, `raster/positron/…` and `positron/…` return 404/403.
- *Register for a CARTO key and keep the `<image>` compositor* — one line, and it works. Rejected as the destination because CARTO documents the raster service as being retired, so it buys time rather than a solution. It remains available as a stopgap independent of this feature.
- *Adopt `react-map-gl` for symmetry with `client-web`* — symmetry of dependency lists is not the goal; symmetry of basemap is.

---

## R-002: Who owns the camera, and how the overlay keeps up

**Decision**: MapLibre owns pan and zoom. The existing SVG overlay follows by writing **one affine transform per frame** onto the group it already transforms today — it does **not** re-project nodes.

**Rationale**: This is the finding that makes FR-017e ("markers locked to the imagery on every frame") cheap instead of the feature's main cost.

Today, pan/zoom is a single affine on a single group: `g.attr('transform', event.transform)` (`ForceGraph.tsx:814`). Nodes are pinned once at projected coordinates (`node.fx`/`node.fy`, `ForceGraph.tsx:950-980`) and never re-projected while zooming; tiles and nodes move together because they are children of the same `<g>`. That is why the map is smooth today with hundreds of nodes.

MapLibre, with rotation and pitch disabled (R-004), is also a pure scale-and-translate over Web Mercator. So the composition of "d3 projection at a fixed scale" and "MapLibre's current camera" is itself a similarity transform, and the overlay can be kept exactly locked by updating one attribute. The cost is O(1) per frame regardless of node count, and the force simulation, clustering, edges, hover and drag all continue to operate in the same untransformed coordinate space they use now.

The transform is derived **empirically from MapLibre itself** rather than from its zoom formula: project two reference longitudes/latitudes through `map.project()`, compare against their fixed d3-projected positions, and solve for scale and translation. Two points determine a similarity transform exactly, and this is immune to MapLibre's internal tile-size and world-size conventions — see [contracts/camera-overlay.md](./contracts/camera-overlay.md).

**Alternatives considered**:
- *Re-project every node on each camera event* — O(nodes) per frame, and it would force the pinned `fx`/`fy` coordinates to be recomputed continuously, dragging the force simulation into the render loop. Rejected: strictly more work for an identical result.
- *Compute the transform from MapLibre's zoom arithmetic* (`worldPx = tileSize · 2^zoom`) — correct in principle but couples us to a convention (512 px tiles) that is MapLibre's to change. Used only as a cross-check in the unit test.
- *Let d3-zoom keep the camera and drive MapLibre* — the author explicitly chose the opposite during clarification, and it would leave two authorities for one camera.

---

## R-003: The §VII mask does not change

**Decision**: Keep `buildComplementPath`, the even-odd fill, the border drawing and their position inside the zoom group **exactly as they are**. Only what lies beneath them changes.

**Rationale**: The masking is not a `clipPath` — `nl-basemap.ts`'s header is emphatic about why, and records that the distinction has "been re-broken more than once". It is an opaque white *complement* path drawn inside the zoom group, so it pans and zooms with the content and cannot be escaped.

That mechanism is indifferent to what it covers. An opaque white path above a WebGL canvas hides the canvas exactly as it hides `<image>` elements, provided the SVG sits above the canvas and has no background of its own. So the constitutionally-sensitive geometry — the same path string that `frontend/vng/src/dashboard/nl-basemap.test.ts` pins against the pixel-verified reference — stays byte-identical.

This concentrates all §VII risk into two new things: the **layering** (is the canvas actually behind the SVG?) and the **camera alignment** (is the mask over the right part of the imagery?). Both are precisely what the new composited guard measures, which is why that guard is worth building rather than reasoning about.

**Alternatives considered**:
- *Mask inside MapLibre with an inverted fill layer* — the idiomatic MapLibre approach, and it would work. Rejected because it would discard a pixel-verified implementation in favour of an unverified one, in the single place the constitution says must never regress. Reconsider only if the SVG complement proves unworkable over a canvas.
- *Reinstate a `clipPath`* — explicitly the bug the current design exists to prevent.

---

## R-004: Rotation and pitch are disabled

**Decision**: Construct the map with rotation, pitch, bearing and the compass control disabled.

**Rationale**: Two independent reasons, either sufficient. First, R-002's affine assumption holds only for a north-up, unpitched camera; a rotated or tilted camera is no longer a similarity transform in screen space and the overlay would shear away from the imagery. Second, §VII: a tilted camera renders a horizon and off-region geometry that the flat complement path was never shaped to cover.

Neither capability exists in the product today, so nothing is lost — this is a constraint made explicit, not a feature removed.

---

## R-005: Aligning the two projections

**Decision**: Initialise the MapLibre camera to the `ResolvedMapConfig` region's centre, at the zoom whose world scale matches `geoMercator().scale(mapCfg.scale)`, and treat that as the reference state where the overlay transform is the identity.

**Rationale**: `mapConfig.ts` already carries each region's `center` and `scale` (e.g. Netherlands at `[5.3, 52.2]`, scale 7000), and `renderNlBasemap` builds `geoMercator().center(c).scale(s).translate([w/2, h/2])` — so the region centre is at the viewport centre by construction. Setting MapLibre to the same centre makes the two agree at one point; matching world scale makes them agree everywhere.

The zoom that matches is `log2(2π · scale / tileSize)`. Rather than hard-code the tile size, the implementation solves for the transform from `map.project()` (R-002), and the unit test asserts the two methods agree — so a MapLibre convention change surfaces as a failing test rather than a drifting map.

Province regions need no special handling: `resolveMapConfig` already derives each province's centre and scale, and the same formula applies.

---

## R-006: How the guard gets a real rendered map

**Decision**: A dedicated harness page — a small Vite entry that mounts the **real** map component with fixture locations, no sign-in and no BFF. Playwright loads it and screenshots the composited result.

**Rationale**: FR-001a requires the guard to run unattended and without credentials, because a guard that needs a live authenticated environment is exactly the arrangement that let today's gap persist. A map needs only a viewport, a region and some located nodes — none of which require authentication. `InitiativeMap` already demonstrates that `ForceGraph` renders correctly from a hand-built dataset of located nodes and no edges, so the fixture is small.

Critically the harness mounts the shipped component, not a copy (FR-001b). If it drifted from the product the guard would be worthless in the same way today's specs are.

**Alternatives considered**:
- *Intercept the app's API in Playwright and stub auth* — closest to production, but it means maintaining stubs for the whole dashboard payload and carrying a standing auth bypass, to test a component that needs neither.
- *Playwright component testing* — mounts the real component and composites correctly, but adds a second test-runner configuration to a repo that already has Playwright and Vitest.
- *Run against a live authenticated environment* — needs credentials, cannot run per-change, and is the status quo that failed.

---

## R-007: What makes the guard pass or fail

**Decision**: Sample named points known to lie outside the region (open sea, German and Belgian territory) and named points known to lie inside it. Outside points must be **exactly** the page background — no colour tolerance. Inside points must **not** be the background. All sampled a margin clear of the border.

**Rationale**: A colour tolerance is precisely what a faint, partial or semi-transparent leak would hide behind, so it is excluded where it matters. The flakiness that a tolerance would normally absorb comes from the antialiased seam along the coastline, and that is dealt with geometrically instead — by not sampling there.

The inside-points assertion is load-bearing in a way that is easy to miss: it is what stops a **blank map passing**. If MapLibre fails to initialise in CI, or WebGL is unavailable, everything is background and an outside-points-only guard would report success. Requiring inside points to be non-background makes "nothing rendered" a failure.

The named points can be inherited from the existing specs, which already sample sea, Germany and Belgium and have been pixel-verified.

**Alternatives considered**:
- *Dense grid classified against the boundary, with a tolerance* — broader coverage, but reintroduces the tolerance that a real leak hides behind, and needs point-in-polygon at every sample.
- *Full-image comparison against a stored reference* — catches unintended visual change too, but vector map imagery varies run to run, so it needs its own tolerance and frequent re-baselining. Rejected as a primary gate; reasonable as a later addition.

---

## R-008: The fallback, and detecting that it is needed

**Decision**: When the basemap cannot render — service unreachable, style load failure, or no WebGL — draw the region outline with markers still positioned on it, plus a short notice. Probe WebGL availability **before** constructing the map, and treat MapLibre's `error` event as the runtime trigger.

**Rationale**: The region outline is already loaded — it is the same GeoJSON the complement mask is built from — so the fallback costs nothing to source and preserves what the map actually carries: which places participate and where they are. Every marker interaction keeps working (FR-022b), so the degraded state stays useful rather than merely non-broken. This is Principle V applied specifically rather than generically.

Probing before construction matters because MapLibre throws on a missing WebGL context, and an uncaught throw inside the render effect would take down the surrounding dashboard (FR-023).

The notice is what stops a fallback being mistaken for the finished map — an outline with pins and no explanation looks like a design choice, not a degradation.

---

## R-009: Where the attribution goes

**Decision**: A single line of credit rendered **below the map area**, outside the map surface entirely, on every map.

**Rationale**: OpenFreeMap's licence requires *"OpenFreeMap © OpenMapTiles Data from OpenStreetMap"*; CARTO's required the same for OpenStreetMap. The product currently renders no credit on any map — a licence breach under both the old and the new provider, independent of this migration.

Placing it below the map resolves the tension with §VII without needing anyone to reinterpret the constitution: nothing is drawn over the plain background outside the border, because nothing is drawn over the map at all. It is also always visible, where MapLibre's default compact control is collapsed behind an "ⓘ" that a user must find.

This deliberately differs from `client-web`, which uses MapLibre's in-canvas `AttributionControl` — `client-web` has no Netherlands-only rule to satisfy.

**Alternatives considered**:
- *MapLibre's built-in attribution control* — maximum symmetry with `client-web`, but it puts ink over the white area outside the Netherlands.
- *Inside the landmass* — satisfies §VII's letter, but sits on real map detail and moves as the user pans.

---

## R-010: The Explorer's world and Europe maps

**Decision**: Same canvas, same module, same code path. They stay **unmasked**, keeping today's `clipPath`-to-region behaviour, and gain the attribution.

**Rationale**: FR-016a requires one imagery path across the product — leaving the Explorer on `<image>` tiles would mean maintaining two renderers and leaving a watermark visible in production. `renderTiles` is already unconditional across regions, so these regions come along by default; the only branch that survives is `mapCfg.masked`, which chooses complement-vs-clip exactly as it does now.

They are also the *easier* case: with no mask, a leak outside the region is not a constitutional matter, so the composited guard's Netherlands assertions do not apply to them. They still need the watermark-free and attribution assertions (SC-001, SC-006).
