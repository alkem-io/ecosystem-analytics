# Implementation Plan: Watermark-free maps on a keyless basemap

**Branch**: `021-openfreemap-basemap` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-openfreemap-basemap/spec.md`

## Summary

Replace the CARTO raster tiles that every map in the product draws on with OpenFreeMap's `positron` vector style rendered by MapLibre GL — the same basemap `client-web` already uses. CARTO now watermarks unauthenticated raster tiles and is retiring the raster service; OpenFreeMap needs no key, no registration and imposes no quota.

The central discovery of this planning pass is that **the Constitution §VII masking does not change**. Today the white complement path lives *inside the d3 zoom group in the SVG*, painted above the tiles. Move the imagery to a MapLibre canvas *behind* that SVG and the same opaque path keeps covering it — the geometry, the even-odd fill, and the pixel-verified path string are all untouched.

The second discovery makes FR-017e (markers locked to imagery on every frame) cheap rather than expensive. Today pan/zoom is a **single affine transform on one SVG group** containing both tiles and nodes — nothing re-projects per frame. With rotation and pitch disabled, MapLibre's camera is also a pure scale+translate over Web Mercator, so the overlay can be kept in lockstep by writing **one transform attribute per frame**, not by re-projecting N nodes. Node pinning (`fx`/`fy` from `geoMercator`) stays exactly as it is.

So the work is: put a MapLibre canvas behind the existing SVG, hand it the camera, mirror its camera onto the SVG group as an affine transform, delete the `<image>` tile code, add the fallback and the attribution — and, first, build a guard that can actually see the composited result.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM), React 19
**Primary Dependencies**: **New**: `maplibre-gl` (matching `client-web`'s `^5.6.0`). Existing: D3 v7 (`d3-geo`, `d3-zoom`, `d3-force`), Vite 7, Playwright 1.58.2, Vitest. **Not** adopting `react-map-gl` — `client-web` needs it because its map is a declarative React tree; EA's maps are imperative D3 code that owns its own DOM, so the wrapper would be pure overhead.
**Storage**: None. No server, API, cache or data change — this feature is entirely inside `frontend/shared/src/{map,graph}` plus a test harness.
**Testing**: Playwright (the §VII guard, new harness-based), Vitest (mask geometry, camera maths)
**Target Platform**: Browsers already supported by the product; WebGL required for the basemap, with a defined non-WebGL fallback (FR-022)
**Project Type**: Web application — shared frontend library consumed by three SPAs
**Performance Goals**: Marker–imagery lock costs O(1) per camera frame (one transform write), not O(nodes). No regression in perceived map load time (SC-007).
**Constraints**: Constitution §VII (Netherlands-only) is a HARD requirement and must be verifiably preserved. FR-006 requires the new guard to pass against today's product *before* the renderer changes.
**Scale/Scope**: 3 map surfaces (network map, initiative details, Usage Explorer), 2 consumers of the basemap module (`ForceGraph`, `UsageMap` — `InitiativeMap` delegates to `ForceGraph`), 15 regions (world, europe, netherlands, 12 provinces).

### What the code does today (verified while planning)

| Fact | Where | Why it matters |
|---|---|---|
| Tiles are `<image>` elements appended to a `tile-layer` group inside the zoom group | `nl-basemap.ts:170-190` | The only provider coupling is one `href` template. |
| §VII mask is an opaque white **complement path inside the zoom group**, not a `clipPath` | `nl-basemap.ts` header + `buildComplementPath` | It pans/zooms with the content, so it cannot leak — and it will cover a canvas just as well as it covers tiles. |
| Pan/zoom is one affine transform on one `<g>` (`g.attr('transform', event.transform)`) | `ForceGraph.tsx:814-822` | Markers do not re-project per frame today; they must not need to afterwards either. |
| Nodes are pinned at projected coordinates (`node.fx`/`fy`) computed once | `ForceGraph.tsx:950-980` | Node pinning, the force simulation and clustering are untouched by a camera change that stays affine. |
| `ForceGraph` renders a bare `<svg>` with no wrapper | `ForceGraph.tsx:2727` | A wrapper div is needed to host the canvas behind it. `UsageMap` already has one (`UsageMap.tsx:320`). |
| `InitiativeMap` renders `ForceGraph` in map mode | `InitiativeMap.tsx` | Third surface comes free. |
| Every region — including the Explorer's world/europe — draws CARTO tiles | `nl-basemap.ts` `renderTiles` is unconditional | The Explorer is watermarked too; FR-016a puts it in scope. |

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1. Constitution v4.3.0.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Alkemio OIDC auth** | Untouched. The new test harness deliberately renders from fixture data with **no** sign-in and no backend (FR-001a) — it introduces no auth bypass into the product, only a page that never needed auth. | ✅ PASS |
| **II. Typed GraphQL contract** | No GraphQL change; no `.graphql` files touched, no codegen run. | ✅ PASS |
| **III. BFF boundary** | The frontend gains a direct call to a third-party **static map tile service**, exactly as it does today with CARTO. This is asset fetching, not data — no Alkemio data crosses it, and the BFF boundary governs Alkemio traffic. Unchanged in kind from the status quo. | ✅ PASS |
| **IV. Data sensitivity** | No user or Alkemio data reaches the map service — only tile coordinates. No new logging, storage or caching of anything user-derived. | ✅ PASS |
| **V. Graceful degradation** | Strengthened, not weakened: FR-021/FR-022 replace today's undefined behaviour with a specified fallback (region outline + positioned markers + notice) covering both an unreachable service and a browser without WebGL. | ✅ PASS |
| **VI. Design fidelity** | The chosen style is the positron family — the same cartography CARTO's `light_nolabels` belongs to and the same one `client-web` ships. Small cartographic differences are accepted per spec A-003; layout, tokens and typography are untouched. | ✅ PASS |
| **VII. Dutch-dashboard map scope (HARD)** | **The masking mechanism is unchanged** — the same complement path, in the same group, with the same pixel-verified geometry, now covering a canvas instead of `<image>` elements. What changes is what lies beneath it, which is why FR-001…FR-008 require a guard that sees the composited result *before* the imagery moves. | ✅ PASS, with the gate below |

**Result: PASS.** Complexity Tracking is empty and omitted.

**§VII gate (binding on the task order):** no task may change what draws the imagery until the composited-result guard exists and passes against the unmodified product. This is FR-006, and it is the single control that stops this feature becoming an unverifiable rewrite of a constitutional requirement. Post-Phase-1 re-check: still PASS — the design keeps the mask code byte-identical, so §VII risk is concentrated entirely in layering and camera alignment, which is exactly what the new guard measures.

## Project Structure

### Documentation (this feature)

```text
specs/021-openfreemap-basemap/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — 10 decisions
├── data-model.md        # Phase 1 — the camera/overlay model and its invariants
├── quickstart.md        # Phase 1 — run, verify, and prove the guard can fail
├── contracts/
│   ├── basemap-module.md      # The shared basemap module's interface + degradation matrix
│   ├── camera-overlay.md      # Camera ↔ overlay contract (the FR-017e lock)
│   └── nl-only-guard.md       # What the §VII guard renders, samples and asserts
└── checklists/
    └── requirements.md  # Spec quality checklist (complete)
```

### Source Code (repository root)

```text
frontend/shared/
├── package.json                              # MODIFIED — + maplibre-gl
└── src/
    ├── map/
    │   ├── basemap.ts                        # NEW — MapLibre canvas + camera, replaces the tile compositor
    │   ├── basemap.test.ts                   # NEW — camera maths (d3 projection ↔ MapLibre camera)
    │   ├── overlay-transform.ts              # NEW — camera → SVG affine, the FR-017e lock
    │   ├── overlay-transform.test.ts         # NEW
    │   ├── nl-basemap.ts                     # MODIFIED — tile `<image>` code removed; mask + borders KEPT VERBATIM
    │   ├── MapAttribution.tsx                # NEW — the licence-required credit, below the map
    │   ├── MapFallback.tsx                   # NEW — outline + markers + notice (FR-021/022)
    │   └── UsageMap.tsx                      # MODIFIED — canvas into the existing container; camera swap
    └── graph/
        ├── ForceGraph.tsx                    # MODIFIED — wrapper div, canvas layer, camera handover
        └── ForceGraph.module.css             # MODIFIED — container/canvas/svg layering

frontend/vng/
├── src/dashboard/nl-basemap.test.ts          # MODIFIED — docstring corrected; still guards mask geometry
└── harness/                                  # NEW — the §VII harness page (Vite entry, no auth, no BFF)
    ├── index.html
    └── main.tsx

tests/
├── nl-only-composited.spec.mjs               # NEW — THE guard: real map, composited screenshot
├── vng-map-nl-only.spec.mjs                  # MODIFIED — retained, re-labelled as geometry-only
├── govtech-map-nl-only.spec.mjs              # MODIFIED — same
└── vng-usage-explorer-nl-only.spec.mjs       # MODIFIED — same
```

**Structure Decision**: Everything lands in `frontend/shared` and one new harness entry. `nl-basemap.ts` keeps its name and its mask/border code untouched; the tile compositor inside it is what gets replaced. Both consumers (`ForceGraph`, `UsageMap`) keep calling the same module, so the "single implementation of §VII" property the module's own header claims stays true, and `InitiativeMap` inherits the change for free.

## Phase 0 — Research

See [research.md](./research.md). Ten decisions, no NEEDS CLARIFICATION remaining:

| # | Decision |
|---|---|
| R-001 | OpenFreeMap `positron` via `maplibre-gl` only — no `react-map-gl` in EA. |
| R-002 | MapLibre owns the camera; the SVG overlay follows via one affine transform per frame. |
| R-003 | §VII masking is unchanged — the complement path now covers a canvas. |
| R-004 | Rotation and pitch disabled. This is what makes the affine assumption true. |
| R-005 | The d3 `geoMercator` and the MapLibre camera are aligned at a single reference zoom. |
| R-006 | The guard renders the real map on a fixture-fed harness page (no auth, no BFF). |
| R-007 | Guard asserts named outside points are *exactly* the page background, sampled clear of the coastline. |
| R-008 | Fallback = region outline + positioned markers + notice; WebGL probed before MapLibre is constructed. |
| R-009 | Attribution sits below the map, outside the map area — §VII needs no reinterpretation. |
| R-010 | World/Europe use the same canvas path, unmasked, keeping today's clip behaviour. |

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the camera/overlay model, what stays pinned, and the invariants each requirement pins.
- [contracts/basemap-module.md](./contracts/basemap-module.md) — the shared module's interface (kept compatible with both consumers) and its degradation matrix.
- [contracts/camera-overlay.md](./contracts/camera-overlay.md) — the camera ↔ overlay lock that satisfies FR-017e, with the exact transform.
- [contracts/nl-only-guard.md](./contracts/nl-only-guard.md) — what the guard renders, which points it samples, and what makes it fail.
- [quickstart.md](./quickstart.md) — running it, and the mandatory "prove the guard can fail" step.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| The overlay drifts from the imagery by a fraction of a pixel, visible as shimmer while panning. | R-005 pins both projections to one reference; `overlay-transform.test.ts` asserts round-trip agreement at several zooms; the guard samples mid-gesture (SC-005). |
| MapLibre's canvas renders asynchronously, so a frame can show imagery from the previous camera. | The overlay transform is written on MapLibre's own `render` event, not on a timer, so both settle on the same frame. |
| WebGL unavailable in CI, making the guard silently test the fallback instead of the map. | The guard asserts inside-region points are **not** background (FR-002a) — a fallback with no imagery fails that, so it cannot masquerade as a pass. |
| `maplibre-gl` is a large dependency entering the shared bundle used by all three SPAs. | Lazy-loaded behind the map surfaces, as `client-web` does; the Explorer's non-map modes must not pull it in. |
| OpenFreeMap offers no SLA. | Accepted (spec A-001) — `client-web` already accepts it, and FR-021's fallback is the mitigation. |
| The retained Playwright specs keep passing while measuring only geometry, and are mistaken for §VII cover. | FR-007 re-labels them explicitly; FR-008 fixes the docstring that points at the wrong path. |

## Next step

`/speckit.tasks` — with the §VII gate above as the ordering constraint: guard first, renderer second.
