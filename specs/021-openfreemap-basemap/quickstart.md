# Quickstart: Watermark-free maps on a keyless basemap

**Feature**: 021-openfreemap-basemap | **Branch**: `021-openfreemap-basemap`

## 0. The one rule

**The guard ships before the renderer.** FR-006 requires `tests/nl-only-composited.spec.mjs` to pass against the *unmodified* product, and FR-003 requires it to be *demonstrated to fail* when the mask is removed — both before any imagery code is touched. This is the only control standing between this feature and an unverifiable rewrite of Constitution §VII. If time gets short, cut scope elsewhere.

## 1. Install

```bash
pnpm -C frontend/shared add maplibre-gl@^5.6.0   # matches client-web
pnpm install
```

No API key, no registration, no environment variable — that is the point of the change. If you find yourself adding a map credential anywhere, something has gone wrong (FR-010, SC-002).

## 2. Run the guard first

```bash
# Against the CURRENT product, before touching the renderer — must PASS
npx playwright test tests/nl-only-composited.spec.mjs
```

Then prove it can fail, which is part of the deliverable and not an optional check:

```bash
# Harness flag disables the complement mask — must FAIL on the outside points
GUARD_DISABLE_MASK=1 npx playwright test tests/nl-only-composited.spec.mjs
```

If the second command passes, the guard is measuring nothing and must be fixed before anything else proceeds. That is exactly the state the existing specs are in for a canvas basemap, and the reason this feature exists.

## 3. Run the app

```bash
pnpm dev        # BFF + Explorer :5173 + VNG :5174 + GovTech :5175
```

If the backend fails to start, check `pnpm -C server install` first — a `tsc` failure short-circuits `server dev` and presents as the whole app hanging.

## 4. Verify, by user story

### US1 — the guard is real
Covered by §2. Both commands must behave as described; record the failing run.

### US2 — no watermark, no key
Open every map surface and confirm no "API KEY REQUIRED" text at any zoom:
- VNG and GovTech: Graph tab (map on), an initiative's details map, Usage Explorer
- Explorer: world and Europe views — these are in scope too (FR-016a) and are watermarked in production today

Then `grep -ri "cartocdn\|api.key\|maptiler" frontend/ server/` — should return nothing but comments.

### US3 — Netherlands-only survives
On each surface, at three zoom levels: everything outside the border is plain background. Pan hard toward Germany and zoom in on the coast — the two places a leak shows first. Select a single province and confirm the rest of the country is blank.

### US6 — nothing lost in the rebuild
Walk every interaction before and after: pan, zoom, region and province selection, marker hover cards, marker click-through, node clustering, geographic node placement, and the **non-map modes** (map toggled off) where MapLibre must not be involved at all. Anything that changed must be recorded (FR-017b), not discovered by a user.

### US4 — attribution
Every map shows the provider credit **below** the map area. Confirm nothing is drawn over the white outside the border.

### The fallback (FR-021/FR-022)
Two cases, both worth exercising by hand:

```bash
# Service unreachable — block the style URL in devtools, or:
#   in the browser console, throttle to "Offline" and remount the map
```

Expect: region outline, markers still positioned, every marker interaction still working, and a short notice. **Not** a blank area, and **not** unmasked imagery.

For no-WebGL, disable hardware acceleration or use a browser profile without WebGL. Expect the same fallback, and confirm the surrounding dashboard is unaffected (FR-023).

## 5. Tests and checks

```bash
cd frontend/shared && pnpm exec tsc -b --force     # and vng, govtech, ecosystem-analytics
cd frontend && pnpm run test                        # incl. overlay-transform + basemap camera maths
npx playwright test                                 # incl. the new composited guard
```

Note that `pnpm exec tsc --noEmit` and `pnpm run build` are **not** equivalent here — the build's `tsc` picks up test files that an ad-hoc `--noEmit` invocation may skip. Trust the build.

## 6. Watch for

- **A silently blank map passing the guard.** The inside-points assertion exists to catch it; if you ever weaken it, the guard stops being able to tell a masked map from an empty one.
- **Writing the overlay transform on `move` instead of `render`.** It looks identical at rest and drifts by one frame during gestures — the FR-017e failure, in the less obvious direction.
- **Rotation or pitch getting enabled.** The overlay transform assumes a similarity; a rotated camera shears the markers away from the imagery and the flat mask no longer covers what it should.
- **`maplibre-gl` reaching the Explorer's non-map bundle.** It should be lazy-loaded behind the map surfaces only.
