# Contract: camera ↔ overlay lock

**Feature**: 021-openfreemap-basemap | **Implements**: FR-017, FR-017d, FR-017e, SC-005 | **Module**: `frontend/shared/src/map/overlay-transform.ts`

This is the contract that makes markers stay glued to the imagery. It is the only new coupling this feature introduces, and the only place a sub-pixel error becomes a visible shimmer.

## The problem

Layer 3 (mask, borders, nodes, edges) is drawn in **base projection space** — SVG user units from `geoMercator().center(cfg.center).scale(cfg.scale).translate([w/2, h/2])`. It never moves. Layer 1 (the imagery) is drawn by MapLibre in **screen space**, and moves whenever the user pans or zooms.

A transform must map base projection space onto screen space, on every frame.

## The derivation

Do **not** compute this from MapLibre's zoom arithmetic. Derive it from MapLibre itself, using two reference points:

```
given two geographic points G1, G2 (well separated, both on screen at the reference view)

  a1 = projection(G1),  a2 = projection(G2)     // base projection space, CONSTANT
  b1 = map.project(G1), b2 = map.project(G2)    // screen space, current camera

  k  = |b2 - b1| / |a2 - a1|
  tx = b1.x - k * a1.x
  ty = b1.y - k * a1.y

  overlay transform = `translate(tx, ty) scale(k)`
```

Written to the same `<g>` that `g.attr('transform', …)` writes today, so nothing downstream of it changes.

**Why two points rather than the zoom formula.** `worldPx = tileSize · 2^zoom` requires knowing MapLibre's tile-size convention (512, not the 256 the existing tile maths assumes). That is MapLibre's to change. Two points ask the library where things actually are, so the overlay is correct by construction. The zoom formula is retained **only** as a cross-check in `overlay-transform.test.ts`; if the two disagree beyond tolerance the test fails and someone looks, rather than the map quietly drifting.

**Why a similarity is sufficient.** Rotation and pitch are disabled (R-004), so MapLibre's screen mapping is a uniform scale plus a translation. Two points fully determine it. If rotation is ever enabled this contract breaks — which is why R-004 is a constraint, not a preference.

## When it runs

On MapLibre's **`render`** event — not `move`, not `requestAnimationFrame`, not a timer.

`render` fires on the frame MapLibre has drawn. Writing the overlay transform there means both layers settle on the same frame, so no frame can show imagery from one camera and markers from another. That is FR-017e ("locked on every frame of a gesture") satisfied structurally rather than by racing.

`move` fires before the paint and would put the overlay one frame ahead of the imagery — the exact drift the spec forbids, just in the opposite direction from the obvious one.

## Cost

O(1) per frame: two `project()` calls, six arithmetic operations, one attribute write. Independent of node count.

This is the point of the design. Re-projecting nodes per frame would be O(nodes) *and* would force the pinned `fx`/`fy` values — which the force simulation reads — to be recomputed inside the render loop.

## Guarantees

| # | Guarantee | How it is checked |
|---|---|---|
| C-1 | The transform is a similarity — uniform scale, no rotation, no skew. | Unit test asserts equal x/y scale across several cameras. |
| C-2 | `overlayTransform(projection(G))` equals `map.project(G)` within 0.5 px, for any G. | Unit test over a grid of points at several zooms. |
| C-3 | The empirical derivation agrees with the zoom formula within tolerance. | Unit test; disagreement means a MapLibre convention changed. |
| C-4 | At the reference camera the transform is the identity (k=1, tx=ty=0) within tolerance. | Unit test; proves R-005's alignment. |
| C-5 | No frame shows imagery and overlay from different cameras. | The `render`-event rule, plus the guard sampling mid-gesture (SC-005). |

## What this contract does not cover

- **The mask.** It rides inside the same group and is transformed by the same attribute, so it needs nothing here. Its geometry is unchanged (R-003).
- **The force simulation.** It runs in base projection space and never sees this transform.
- **Non-map modes.** With no basemap there is no MapLibre camera; d3-zoom keeps the camera exactly as it does today, and this module is not involved.
