# Contract: the shared basemap module

**Feature**: 021-openfreemap-basemap | **Module**: `frontend/shared/src/map/` | **Consumers**: `ForceGraph` (network map + initiative details), `UsageMap`

The module's defining property — stated in its own header today — is that it is the **single implementation** of the Netherlands-only rule, so the map surfaces cannot drift apart. That property is preserved: both consumers keep calling one module, and `InitiativeMap` inherits the change through `ForceGraph`.

## Interface

```ts
renderBasemap({
  container,          // NEW — positioned element hosting the canvas behind the SVG
  svg, group,         // unchanged
  region,             // unchanged — world | europe | netherlands | <province>
  width, height,      // unchanged
  onGeoJson,          // unchanged — consumers pin nodes and build forces here
  onError,            // unchanged
}) => {
  projection,         // unchanged — geoMercator for the region
  mapGroup,           // unchanged — layer 3 group
  syncOverlay(),      // NEW  — writes the overlay transform (see camera-overlay.md)
  destroy(),          // NEW  — tears down the WebGL context
  status,             // NEW  — 'ready' | 'fallback'
}
```

`renderTiles(zoomK)` is **removed**. Its two call sites (`ForceGraph.tsx` via `applyLOD._renderTiles`, `UsageMap.tsx:251`) move to the camera path.

`container` is the only new input. `UsageMap` already has one (`UsageMap.tsx:320`); `ForceGraph` currently renders a bare `<svg>` (`ForceGraph.tsx:2727`) and gains a wrapper.

## What is preserved verbatim

These are the §VII-critical parts and they are **not** to be rewritten:

- `buildComplementPath` and its exported signature — pinned byte-for-byte by `frontend/vng/src/dashboard/nl-basemap.test.ts` against the pixel-verified reference.
- The even-odd fill applied via both `attr` and `style` (some engines honour only one).
- The complement's position **inside** the zoom group — not a `clipPath` (the bug this design exists to prevent).
- Layer order within the group: mask → borders → consumer content.
- `mapConfig.ts` in full: regions, centres, scales, and the `masked` flag choosing complement-vs-clip.

## Degradation matrix

Every row resolves without throwing. This is the test matrix for FR-021/FR-022/I-10.

| Condition | Detected by | `status` | Layer 1 | Layer 3 | Notice |
|---|---|---|---|---|---|
| WebGL unavailable | Probe **before** constructing the map | `fallback` | region outline | drawn, masked | shown |
| Style URL unreachable | MapLibre `error` event | `fallback` | region outline | drawn, masked | shown |
| Style loads, some tiles fail | MapLibre `error` event, non-fatal | `ready` | partial imagery | drawn, masked | none |
| Region GeoJSON fails to load | Existing `onError` | `fallback` | none | borders absent, **mask absent** | shown |
| Container has zero size (hidden tab) | Resize observer | `ready` | deferred | drawn | none |
| Component unmounts mid-load | Effect cleanup | — | `destroy()` | — | — |

The GeoJSON-failure row is the one that deserves attention: with no region geometry there is no mask, so the safe response is to render **no imagery at all** rather than unmasked imagery. Failing closed is the only reading consistent with §VII.

Probing WebGL before construction (rather than catching a throw) matters because MapLibre throws on a missing context, and an uncaught throw inside the render effect would take the surrounding dashboard down with it (FR-023).

## Attribution

Rendered by the consumer **below** the container, outside the map surface (R-009) — not by this module and not inside the canvas. Deliberately unlike `client-web`, which has no Netherlands-only rule to satisfy.

## Non-goals

- No caching, prefetching or offline tile storage.
- No change to which regions exist or to their boundary data.
- No change to markers, clustering, hover cards or the force simulation.
