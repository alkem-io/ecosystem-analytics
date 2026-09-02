# Phase 1 Data Model: Watermark-free maps on a keyless basemap

**Feature**: 021-openfreemap-basemap | **Date**: 2026-09-02

No persisted data, no API payloads, no schema. The "model" here is the runtime relationship between two coordinate systems and the layers stacked between them — which is where every requirement in this feature is won or lost.

---

## 1. The layer stack

Bottom to top, within one positioned container per map surface:

| # | Layer | Owner | Purpose |
|---|---|---|---|
| 0 | Container | The map component | Positioning context. Carries the page background colour, which is what "outside the region" must equal. |
| 1 | Basemap canvas | MapLibre | Draws the imagery. Owns pan and zoom. Never masked by itself. |
| 2 | SVG root | The map component | Transparent. Sits above the canvas so everything below is painted over by layer 3. |
| 3 | Zoom group `<g>` | The map component | Carries the overlay transform. Contains, in order: **the white complement mask**, the region borders, then edges, nodes and labels. |
| 4 | Attribution | The map component | Rendered **outside** the container, beneath it. Not part of the map surface (R-009). |

The §VII guarantee is the ordering of 1 → 3: an opaque path in layer 3 covers layer 1. Nothing else about §VII changes.

---

## 2. Coordinate systems

Three, and confusing any two of them is the most likely way to break this feature.

| System | Units | Set by | Used for |
|---|---|---|---|
| **Geographic** | lon/lat degrees | The data | Node locations, region boundaries, camera centre |
| **Base projection space** | SVG user units at the region's reference scale | `geoMercator().center(cfg.center).scale(cfg.scale).translate([w/2, h/2])` | **Everything in layer 3**: pinned node positions (`fx`/`fy`), the complement path, borders, the force simulation |
| **Screen** | CSS pixels in the container | MapLibre's current camera | What the user sees; what the guard samples |

The overlay transform is the one and only bridge from base projection space to screen. Layer 3 never changes: the simulation, the pinning, the mask geometry all stay in base projection space, exactly as today.

---

## 3. Runtime entities

### `BasemapHandle` — what the shared module returns

Replaces today's `NlBasemap` while keeping both consumers compiling against the same shape.

| Field | Change | Notes |
|---|---|---|
| `projection` | unchanged | The `geoMercator` for the region. Consumers still project node locations through it. |
| `mapGroup` | unchanged | Layer 3's group, for consumers appending their own content. |
| `renderTiles(zoomK)` | **removed** | There are no tiles to render. Its callers moved to the camera event. |
| `syncOverlay()` | **new** | Writes the current transform onto layer 3. Called from MapLibre's render event, not from a timer. |
| `destroy()` | **new** | Tears down the MapLibre instance. Absent today because `<image>` elements needed no teardown; a WebGL context does. |
| `status` | **new** | `'ready' \| 'fallback'`. Tells the consumer whether imagery exists, so the notice and the outline can be shown. |

### `OverlayTransform`

```
{ k: number; tx: number; ty: number }   // written as `translate(tx,ty) scale(k)`
```

Derived per frame from two reference points (see [contracts/camera-overlay.md](./contracts/camera-overlay.md)). Uniform scale, no rotation, no skew — guaranteed by R-004.

### `MapRegion` (unchanged)

`world | europe | netherlands | <12 provinces>`, resolved by `resolveMapConfig` to `{ center, scale, url, kind, masked }`. Untouched by this feature — `masked` still selects complement-vs-clip.

### Fixture set (new, test-only)

The located nodes the harness page mounts. Small, committed, and deliberately including points near the German and Belgian borders and on the coast so the guard has something to catch.

---

## 4. Invariants

Each is directly testable and maps to the requirement it pins.

| # | Invariant | Pins |
|---|---|---|
| **I-1** | Every point outside the selected region is exactly the container's background colour. | FR-014, SC-003 |
| **I-2** | At least one point inside the region is **not** the background — proof imagery actually rendered, so a blank map cannot pass. | FR-002a, R-007 |
| **I-3** | I-1 and I-2 hold at every zoom level and pan position, including mid-gesture. | FR-015, SC-005 |
| **I-4** | The complement path string produced by the shipped code is byte-identical to the pixel-verified reference. | FR-007, §VII |
| **I-5** | The overlay transform is a similarity: uniform scale, zero rotation, zero skew. | R-004, FR-017 |
| **I-6** | Projecting a location through `projection` then applying the overlay transform equals projecting it through the map's own camera, within sub-pixel tolerance. | FR-017, FR-017e |
| **I-7** | Node pinning (`fx`/`fy`), the force simulation, clustering and edges operate on unchanged base-projection coordinates. | FR-017d, US6 |
| **I-8** | Layer 3 is painted above layer 1 at all times — the canvas is never composited over the mask. | §VII, FR-002 |
| **I-9** | No map credential exists anywhere in configuration, environment or source. | FR-010, SC-002 |
| **I-10** | When `status === 'fallback'`, the region outline and every marker interaction are present, and I-1 still holds. | FR-021, FR-022b, SC-008 |
| **I-11** | Every map surface renders the provider credit. | FR-018, SC-006 |

---

## 5. Lifecycle

The only state machine is the basemap's own, and it exists to make FR-021/FR-022 concrete:

| State | Entered when | Layer 1 | Layer 3 | Notice |
|---|---|---|---|---|
| `probing` | Component mounts | absent | drawn | none |
| `ready` | WebGL present and the style loads | imagery | drawn, masked | none |
| `fallback` | No WebGL, style fails, or the service errors | region outline instead of imagery | drawn, masked | shown |

`ready → fallback` is one-way within a mount: a mid-session failure degrades and stays degraded until remount, rather than flickering between states. `fallback` is never silent — the notice (FR-022a) is what distinguishes a degraded map from a finished one.

Transitions do not change layer 3. The mask, the borders, the nodes and the simulation are identical in both states, which is why I-1 holds in `fallback` for free rather than needing its own implementation.
