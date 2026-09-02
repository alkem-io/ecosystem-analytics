# Contract: the Netherlands-only guard

**Feature**: 021-openfreemap-basemap | **Implements**: FR-001…FR-008, SC-003, SC-004 | **Files**: `frontend/vng/harness/`, `tests/nl-only-composited.spec.mjs`

This is the feature's safety net and its first deliverable. It must pass against the **unmodified** product before any imagery code changes (FR-006).

## What it renders

A harness page mounting the **shipped** map component — not a copy — with:

- a committed fixture of located nodes, including points near the German and Belgian borders and on the coast, so a leak has something to reveal it;
- no sign-in, no BFF, no network beyond the basemap itself;
- a fixed viewport (1400×900, matching the existing specs) so sampled coordinates are stable;
- the region under test selected by query parameter, covering `netherlands` and at least one province.

## What it samples

Screenshots the **container**, so layer 1 (canvas) and layer 3 (SVG) are composited exactly as the user sees them. This is the whole point: today's specs serialise `document.querySelector('svg')` and therefore cannot see a canvas at all.

Two sets of named points, inherited from the pixel-verified specs:

| Set | Points | Assertion |
|---|---|---|
| Outside | Open sea, German territory, Belgian territory | **Exactly** the container background. No colour tolerance. |
| Inside | Points well within the landmass | **Not** the background. |

All points sit a margin clear of the border, so the antialiased coastline seam is never sampled (FR-002b).

**The inside assertion is not decoration.** It is what stops a blank map passing. If MapLibre fails to initialise in CI, or WebGL is unavailable, every pixel is background and an outside-only guard reports success — the precise failure mode this feature exists to eliminate.

## When it samples

- at the default view;
- at a zoomed-in view near the coast, where a leak is most likely;
- panned toward the German border;
- **mid-gesture**, while a pan is in flight, satisfying SC-005 — markers and imagery must be locked on every frame, not merely at rest.

## What makes it fail

Any outside point that is not exactly the background; any inside point that is. No tolerance on either.

## Proving it can fail

**Mandatory, and part of the deliverable** (FR-003, SC-004). A guard that has never failed is not known to work.

The harness accepts a flag that disables the complement mask. With it set, the guard MUST fail on the outside points. This is run and recorded during development, and the negative case is retained as a test so the guard's own sensitivity is protected against future regression.

## Relationship to the existing specs

They are **retained**, not deleted (FR-007), and re-labelled to say what they actually cover:

| Check | Covers | Does not cover |
|---|---|---|
| `tests/vng-map-nl-only.spec.mjs`, `govtech-…`, `vng-usage-explorer-…` | That a given complement path hides everything outside the region, verified by real pixels | The shipped component; anything drawn outside the SVG |
| `frontend/vng/src/dashboard/nl-basemap.test.ts` | That the shipped `buildComplementPath` produces exactly that pixel-verified path | Whether the mask is actually painted over the imagery |
| **`tests/nl-only-composited.spec.mjs`** (new) | The composited picture of the real component | — |

The chain was already **pixels → reference path → shipped code**, which is real and worth keeping; its gap is that every link reads the drawing layer alone. The new guard closes it by looking at the finished picture instead.

`nl-basemap.ts`'s header currently cites `frontend/shared/src/map/nl-basemap.test.ts`, which does not exist — the test lives at `frontend/vng/src/dashboard/nl-basemap.test.ts`. Correcting that path is FR-008.
