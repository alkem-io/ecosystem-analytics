---

description: "Task list for 021-openfreemap-basemap"
---

# Tasks: Watermark-free maps on a keyless basemap

**Input**: Design documents from `/specs/021-openfreemap-basemap/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included, and not optional here. The spec makes verification the feature's first deliverable (FR-001…FR-008) and the plan attaches a binding §VII gate to it. Two of the three contracts are contracts *about* tests.

**Organization**: Grouped by user story. Four stories are P1 — see Implementation Strategy for which ship together and why.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6, mapping to spec.md's user stories

## ⚠️ The §VII gate

**No task in Phase 4 or later may run until T012 and T013 have passed.** FR-006 requires the composited guard to pass against the unmodified product, and FR-003 requires it demonstrated to fail with the mask removed. This is the single control stopping this feature from becoming an unverifiable rewrite of a constitutional requirement. If scope has to give, it gives somewhere else.

---

## Phase 1: Setup

- [x] T001 Add `maplibre-gl@^5.6.0` to `frontend/shared/package.json` (matching `client-web`'s pin) and run `pnpm install`. Do not import it yet — Phase 2 and 3 must not depend on it.
- [x] T002 Record the baseline: run `npx playwright test`, `cd frontend && pnpm run test`, and `pnpm exec tsc -b --force` in each of `frontend/{shared,vng,govtech,ecosystem-analytics}`. Note the pass counts in the PR description — every later phase is measured against them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Give every map surface a positioned container. The guard screenshots the *container* to capture the composited canvas + SVG, so this must exist before the guard can be written — and before any imagery moves into it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

This phase changes DOM and CSS only. It draws no imagery and does not touch the mask, so it sits on the safe side of the §VII gate; the existing pixel specs and `nl-basemap.test.ts` still cover the mask geometry throughout.

- [x] T003 In `frontend/shared/src/graph/ForceGraph.tsx`, wrap the bare `<svg>` at the component's return (line ~2727) in a positioned container `<div>`, keeping the SVG's sizing behaviour identical. The container is the element the guard will screenshot and the canvas will mount into.
- [x] T004 In `frontend/shared/src/graph/ForceGraph.module.css`, add the container/canvas/SVG layering per data-model.md §1: container positioned and carrying the page background colour; canvas absolutely positioned beneath; SVG absolutely positioned above with a transparent background. The background colour is what "outside the region" must equal, so it belongs on the container, not the SVG.
- [x] T005 [P] Confirm `frontend/shared/src/map/UsageMap.tsx` already provides an equivalent container (`UsageMap.tsx:320`) and align its classes with T004 so both surfaces layer identically.
- [x] T006 Verify the baseline from T002 still passes unchanged after T003–T005 — the wrapper must be visually and behaviourally inert.

**Checkpoint**: every map surface has a container that composites canvas and SVG. Nothing about the imagery has changed.

---

## Phase 3: User Story 1 — A guard that actually watches the shipped map (Priority: P1) 🎯 FIRST

**Goal**: An automated check that loads the product's real map, looks at the finished picture, and fails if anything renders outside the Dutch border.

**Independent Test**: It passes against the current, unchanged product; and with the mask deliberately disabled it fails. A guard that cannot fail is not a guard.

### Implementation for User Story 1

- [x] T007 [P] [US1] Create the located-node fixture in `frontend/vng/harness/fixture.ts` — a small committed set of `GraphNode`s with coordinates, deliberately including points near the German and Belgian borders and on the coast so a leak has something to reveal it. Model it on `InitiativeMap.tsx`, which already renders `ForceGraph` from located nodes and no edges.
- [x] T008 [US1] Create the harness page `frontend/vng/harness/index.html` + `frontend/vng/harness/main.tsx`. It mounts the **shipped** `ForceGraph` in map mode from the fixture — no sign-in, no BFF, no dataset fetch — at a fixed 1400×900 viewport, with the region selected by query parameter (`?region=netherlands`, `?region=<province>`). Depends on T007.
- [x] T009 [US1] Add the harness as a Vite entry in `frontend/vng/vite.config.ts` so Playwright can serve it, and confirm it does not enter the app's production build.
- [x] T010 [US1] Add a `?disableMask=1` flag to the harness that suppresses the complement path. This exists solely so the guard's own sensitivity can be proven (FR-003) and must never be reachable from the app.
- [x] T011 [US1] Write `tests/nl-only-composited.spec.mjs` per contracts/nl-only-guard.md: screenshot the **container** (not the SVG), sample named outside points (open sea, German and Belgian territory) asserting they are *exactly* the container background with no colour tolerance, and named inside points asserting they are **not** the background. Reuse the coordinates from the existing pixel-verified specs. Depends on T008.
- [x] T012 [US1] Run the guard against the unmodified product — it MUST pass (FR-006). This is the §VII gate's first half.
- [x] T013 [US1] Run the guard with `?disableMask=1` — it MUST fail on the outside points (FR-003, SC-004). Record the failing output, and retain the negative case as a test so the guard's sensitivity is itself protected. This is the gate's second half.
- [x] T014 [P] [US1] Correct the docstring in `frontend/shared/src/map/nl-basemap.ts` that cites a non-existent `frontend/shared/src/map/nl-basemap.test.ts`; the test lives at `frontend/vng/src/dashboard/nl-basemap.test.ts` (FR-008).
- [x] T015 [P] [US1] Re-label `tests/vng-map-nl-only.spec.mjs`, `tests/govtech-map-nl-only.spec.mjs` and `tests/vng-usage-explorer-nl-only.spec.mjs` in their header comments to say what they actually cover — the mask's *geometry*, via a reconstruction of the layering — and to point at the composited guard for the shipped picture (FR-007). Do not delete them; the geometry chain they anchor is real and worth keeping.

**Checkpoint**: 🔓 **§VII gate open.** The renderer may now be changed.

---

## Phase 4: User Story 2 — Maps without a watermark or a key (Priority: P1)

**Goal**: Every map draws from OpenFreeMap via MapLibre. No watermark, no key, no configuration.

**Independent Test**: Open every map surface — both Dutch dashboards and the Explorer's world and Europe views — and confirm no watermark at any zoom, and that no map credential exists anywhere.

### Tests for User Story 2

- [x] T016 [P] [US2] Write `frontend/shared/src/map/overlay-transform.test.ts` covering contracts/camera-overlay.md's guarantees C-1…C-4: the transform is a similarity (equal x/y scale, no rotation or skew); `overlayTransform(projection(G))` equals `map.project(G)` within 0.5 px over a grid of points at several zooms; the empirical derivation agrees with the `tileSize · 2^zoom` formula; and at the reference camera the transform is the identity.
- [x] T017 [P] [US2] Write `frontend/shared/src/map/basemap.test.ts` for the projection alignment of R-005 — that the MapLibre camera derived from a region's `center`/`scale` places the region centre at the viewport centre, for the Netherlands and at least one province.

### Implementation for User Story 2

- [x] T018 [US2] Create `frontend/shared/src/map/overlay-transform.ts` implementing the two-reference-point derivation from contracts/camera-overlay.md. Derive from `map.project()`, not from MapLibre's zoom arithmetic — the latter couples us to a tile-size convention that is MapLibre's to change.
- [x] T019 [US2] Create `frontend/shared/src/map/basemap.ts`: construct a MapLibre map into the container with `https://tiles.openfreemap.org/styles/positron`, rotation, pitch, bearing and the compass control **disabled** (R-004 — the overlay transform's similarity assumption depends on it), initialised to the region's centre and matching zoom (R-005), non-interactive except pan and zoom.
- [x] T020 [US2] Wire `syncOverlay()` to MapLibre's **`render`** event — not `move`, not a timer. `render` fires on the frame MapLibre has painted, so both layers settle together; `move` fires before the paint and would put the overlay one frame ahead of the imagery. Depends on T018, T019.
- [x] T021 [US2] In `frontend/shared/src/map/nl-basemap.ts`, delete the `<image>` tile compositor: `TILE_SUBDOMAINS`, `MAX_TILES`, the tile maths, `renderTiles`, and the CARTO `href`. **Leave `buildComplementPath`, the even-odd fill, the border drawing and their position inside the zoom group byte-identical** — that geometry is pinned by `nl-basemap.test.ts` against the pixel-verified reference and is the §VII mechanism itself.
- [x] T022 [US2] Change the module's return shape per contracts/basemap-module.md: drop `renderTiles`, add `syncOverlay()`, `destroy()` and `status`, keep `projection` and `mapGroup` unchanged. Add the `container` input. Depends on T021.
- [ ] T023 [US2] In `frontend/shared/src/graph/ForceGraph.tsx`, hand the camera to MapLibre for map modes: disable the d3-zoom behaviour when a basemap is active and drive the group transform from `syncOverlay()` instead. **Keep d3-zoom exactly as it is for non-map modes** — with no basemap there is no MapLibre camera and this module must not be involved. Remove the `applyLOD._renderTiles` hook. Depends on T020, T022.
- [x] T024 [US2] Call `destroy()` from the effect cleanup in `ForceGraph.tsx` — a WebGL context needs teardown where `<image>` elements did not, and a leak here shows up as the tab dying after a few region switches.
- [ ] T025 [US2] In `frontend/shared/src/map/UsageMap.tsx`, replace the `basemap.renderTiles(event.transform.k)` call (line ~251) with the camera handover, mirroring T023.
- [x] T026 [US2] Lazy-load `maplibre-gl` behind the map surfaces so it never enters the Explorer's non-map bundle, following `client-web`'s `React.lazy` pattern in `ContributorMap.tsx`.
- [x] T027 [US2] Verify no map credential exists: `grep -ri "cartocdn\|api.key\|apiKey\|maptiler" frontend/ server/` returns nothing but comments (SC-002), and a fresh checkout renders every map with no map-related setup.

**Checkpoint**: every map draws from OpenFreeMap. The guard from Phase 3 must still pass.

---

## Phase 5: User Story 3 — The Netherlands-only rule survives (Priority: P1)

**Goal**: Prove, on the new renderer, that nothing renders outside the selected region on any surface at any zoom.

**Independent Test**: The composited guard passes across all three surfaces, whole-country and province, at three zoom levels each, including mid-gesture.

- [x] T028 [US3] Extend `tests/nl-only-composited.spec.mjs` to the province regions via the harness's `?region=` parameter, asserting the rest of the country is background (US3 scenario 4).
- [x] T029 [US3] Extend the guard to the zoomed-in-near-the-coast and panned-toward-Germany views — the two places a leak surfaces first (FR-005).
- [x] T030 [US3] Add the mid-gesture sample: assert the rule holds *while* a pan is in flight, not only once it settles (SC-005, FR-017e). This is the assertion that would catch an overlay wired to `move` instead of `render`.
- [ ] T031 [US3] Extend the guard to the Usage Explorer surface, and to the initiative-details surface via `ForceGraph`'s map mode.
- [x] T032 [US3] Re-run T013's negative case on the new renderer — with the mask disabled the guard must still fail. A guard that stopped being able to fail during the migration is worse than none.

**Checkpoint**: §VII is verified on the shipped renderer, not argued for.

---

## Phase 6: User Story 6 — Nothing lost in the rebuild (Priority: P1)

**Goal**: Every interaction that worked before still works.

**Independent Test**: Walk every interaction on each surface before and after; anything that changed is recorded rather than discovered.

- [x] T033 [US6] Verify the non-map modes in `ForceGraph`: with the map toggled off, d3-zoom still owns the camera, MapLibre is never constructed, and `maplibre-gl` is not loaded (FR-017d).
- [x] T034 [US6] Verify markers: hover cards appear with the same content positioned over the marker, and click-through navigates as before, on all three surfaces (US6 scenarios 2–3).
- [ ] T035 [US6] Verify the graph itself: nodes sit at their geographic positions, node clustering behaves as before, edges render, and dragging still works — all of which operate on unchanged base-projection coordinates (invariant I-7).
- [ ] T036 [US6] Verify region and province selection reframes the map and stays masked to the new region (US6 scenario 4).
- [ ] T037 [US6] Record every intentional behavioural difference — most likely the feel of pan and zoom inertia — in the PR description (FR-017b). Anything not recorded is a defect, not a trade.

---

## Phase 7: User Story 4 — Map credit as the licence requires (Priority: P2)

**Goal**: Every map shows the provider credit the licence requires, which the product renders nowhere today.

**Independent Test**: Each surface shows the credit, and nothing is drawn over the white outside the border.

- [x] T038 [P] [US4] Create `frontend/shared/src/map/MapAttribution.tsx` rendering "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" as a single line, styled as secondary text.
- [x] T039 [US4] Render it **below** the container on all three surfaces — outside the map area, so nothing is drawn over the plain background outside the region and §VII needs no reinterpretation (R-009). Deliberately unlike `client-web`'s in-canvas control, which has no such rule to satisfy. Depends on T038.
- [x] T040 [US4] Confirm the credit is present on the Explorer's world and Europe views too — the licence applies regardless of masking.

---

## Phase 8: Degradation & fallback

**Purpose**: FR-021/FR-022 — the specified behaviour when the map cannot draw. Separated from the stories because it spans all of them.

- [x] T041 [P] Create `frontend/shared/src/map/MapFallback.tsx`: the region outline drawn from the already-loaded GeoJSON, markers still positioned, and a short "map detail unavailable" notice (FR-022a).
- [x] T042 Probe WebGL availability **before** constructing MapLibre in `basemap.ts`. MapLibre throws on a missing context, and an uncaught throw inside the render effect would take the surrounding dashboard down (FR-023).
- [x] T043 Handle MapLibre's `error` event as the runtime trigger for `status: 'fallback'`, and make `ready → fallback` one-way within a mount so a failing service cannot flicker the map (data-model.md §5).
- [x] T044 Handle the region-GeoJSON failure row of contracts/basemap-module.md's matrix: with no region geometry there is no mask, so render **no imagery at all**. Failing closed is the only reading consistent with §VII.
- [x] T045 Verify every marker interaction still works in the fallback state (FR-022b) — the information the map carries is the markers, not the imagery.
- [x] T046 Verify the guard's invariants hold in the fallback: outside points are still background (I-10). Note that the inside-points assertion correctly *fails* in fallback, which is why it must never be weakened — it is what stops a blank map passing as a masked one.

---

## Phase 9: User Story 5 — One basemap across products (Priority: P3)

- [x] T047 [P] [US5] Place a VNG map beside `client-web`'s contributor map and confirm they use the same cartographic style and colours (US5 scenario 1).
- [x] T048 [P] [US5] Note in `frontend/shared/src/map/basemap.ts` that the style URL is shared with `client-web/src/crd/components/map/ContributorMap.tsx`, so a future basemap change has one obvious counterpart rather than two independent discoveries.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [x] T049 Run `pnpm exec tsc -b --force` in `frontend/{shared,vng,govtech,ecosystem-analytics}`. Note that `tsc --noEmit` and `pnpm run build` are not equivalent here — the build picks up test files an ad-hoc `--noEmit` may skip. Trust the build.
- [x] T050 Run `cd frontend && pnpm run test` and `npx playwright test`; compare against the T002 baseline and account for every difference.
- [x] T051 [P] Check the bundle: `maplibre-gl` must not appear in the Explorer's non-map chunks (T026), and the shared bundle should not grow for consumers that render no map.
- [x] T052 [P] **DONE EARLY (user request).** Updated `.devcontainer/init-firewall.sh` to allow `tiles.openfreemap.org`, and temporarily `basemaps.cartocdn.com` so the §VII baseline can be taken against the pre-migration renderer. Applied and verified. **T021 must remove the cartocdn line.**
- [x] T053 [P] Update `CLAUDE.md`'s architecture notes: the basemap is OpenFreeMap via MapLibre, shared with `client-web`; §VII is enforced by an SVG complement over a canvas.
- [ ] T054 Walk quickstart.md §4 end to end, story by story.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Phase 1. **Blocks everything** — the guard screenshots the container, so the container must exist first.
- **US1 (Phase 3)**: depends on Phase 2. **Blocks Phases 4–9 via the §VII gate (T012, T013).**
- **US2 (Phase 4)**: depends on US1's gate. The renderer change.
- **US3 (Phase 5)**: depends on US2 — it verifies the new renderer.
- **US6 (Phase 6)**: depends on US2 — it verifies nothing regressed.
- **US4 (Phase 7)**: depends on Phase 2 only; independent of the renderer.
- **Fallback (Phase 8)**: depends on US2 (it is a state of the new basemap module).
- **US5 (Phase 9)**: depends on US2.
- **Polish (Phase 10)**: last.

### Story dependency graph

```
Setup → Foundational → US1 ══gate══> US2 ─┬─→ US3
                                          ├─→ US6
                                          ├─→ Fallback
                                          └─→ US5
                        (US4 branches off Foundational, independent of the renderer)
```

### Parallel opportunities

- **Phase 2**: T005 alongside T003/T004.
- **Phase 3**: T007 first; T014 and T015 are documentation-only and run alongside anything.
- **Phase 4**: T016 and T017 (tests) together; then T018 → T019 → T020 is a chain, while T021/T022 proceed alongside; T023 and T025 are different files and parallel once T022 lands.
- **Phase 6**: T033–T036 are independent verification passes.
- **Phase 7**: runs in parallel with Phases 4–6 entirely — it touches no renderer code.
- **Phase 10**: T051, T052, T053 together.

### Cross-story parallelism

After the gate opens, one person can take the renderer spine (US2 → US3 → US6 → Fallback) while another takes attribution (US4) and the polish items, which share no files with it.

---

## Parallel Example: User Story 2

```bash
# Contract tests first — they define the camera maths before it exists:
Task: "overlay-transform.test.ts — similarity, sub-pixel agreement, identity at reference"
Task: "basemap.test.ts — region centre lands at viewport centre, NL and a province"

# Then the chain T018 → T019 → T020, with the module surgery alongside:
Task: "nl-basemap.ts — delete the tile compositor, keep the mask byte-identical"
Task: "nl-basemap.ts — new return shape (syncOverlay/destroy/status)"

# Then the two consumers, different files:
Task: "ForceGraph.tsx — camera handover, keep d3-zoom for non-map modes"
Task: "UsageMap.tsx — camera handover"
```

---

## Implementation Strategy

### The gate is the plan

Phases 1–3 are not preparation for the feature; they are the part that makes the rest safe. Ship them, confirm T012 passes and T013 fails, and only then touch the renderer. If this feature is ever abandoned midway, stopping after Phase 3 leaves the product **better** than it started — a §VII guard that watches the real map, which does not exist today.

### MVP = Phases 1–6

US2, US3 and US6 are all P1 and all land on the same change; they are three lenses on one renderer swap, not three shippable increments. US2 is "it works", US3 is "the constitution still holds", US6 is "nothing was lost". Reviewing them separately is useful; deploying them separately is not possible.

1. Phases 1–2: setup and containers
2. Phase 3: the guard → **gate**
3. Phase 4: the renderer
4. Phases 5–6: verify §VII and verify nothing was lost → deployable
5. Phase 7: attribution (can land in parallel, and should — it fixes a licence breach that exists today regardless)
6. Phase 8: fallback
7. Phases 9–10

### If you need the watermark gone sooner

A CARTO key is one line (`?key=` on the tile URL) and buys time without touching any of this. It is a stopgap this feature later deletes — but it is available if production pressure outruns the plan, and taking it is better than shortening Phase 3.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- `nl-basemap.ts` is touched by T014, T021 and T022 — deliberately never marked `[P]` with each other.
- `ForceGraph.tsx` is touched by T003, T023, T024 — same.
- The mask code (`buildComplementPath`, the even-odd fill, its position in the zoom group) is **not** to be refactored by any task here. It is pixel-verified, constitutionally protected, and outside this feature's scope.


---

## Execution notes — Phase 3 (the §VII gate)

**The gate is open.** T012 passes against the unmodified product; T013 fails with the mask
removed. Recorded evidence, from the real component on the harness page:

| | mask on (shipped) | mask removed |
|---|---|---|
| Pixels differing between the two renders | — | **1,148,878 of 1,260,000** |
| North Sea / Germany / Belgium sample points | exactly `rgb(255,255,255)` | all three show map imagery |
| Points inside the country | show map detail | show map detail |

### The guard was broken twice before it was right, and both bugs were only found by insisting on the negative case

1. **The mask appeared to do nothing.** Removing it changed *zero* pixels. Cause: the
   container's tiles were never loading, because `init-firewall.sh` allowlisted
   `basemaps.cartocdn.com` while the tile code round-robins `a./b./c./d.` — which resolve to
   a wider IP set. Every tile was blocked, so the whole viewport was white and the mask had
   nothing to hide. Fixed by allowlisting all four shards (`T052`). **`tiles.openfreemap.org`
   has no sharding, so it needs only the single entry already added.**
2. **The mask came back after being removed.** With tiles loading, removal *still* changed
   zero pixels. Cause: the harness rendered under `<StrictMode>`, which double-invokes
   effects — the map was rebuilt and drew a fresh mask after the harness's one-shot strip had
   already run and stopped. Fixed by dropping `StrictMode` and making the strip a
   `MutationObserver`. The sensitivity assertion was then tightened from "at least one
   outside point leaks" to "**every** outside point leaks", because the weaker form passed
   intermittently against a fully-masked map.

Both failures are the exact shape of the problem this feature exists to fix: a check that
reports success while measuring nothing. Neither would have been visible without FR-003.

### Also found

- Sampling far outside the country is **vacuous** on the real component: the tile layer does
  not span the whole viewport the way the sibling specs' red stand-in rectangle does. The
  sample points were re-derived from the actual render (4,810 candidate points qualify) rather
  than inherited on the assumption that they would mean the same thing.
- The existing §VII specs are **flaky under parallel load** — all five time out at 30s with 6
  workers and pass in 1.3s serially. Runs here use `--workers=2`. Worth addressing separately;
  a gate that fails under load is a gate people learn to ignore.


---

## Execution notes — Phase 4 (the renderer swap), after review

Verified on the real component: 15 requests to `tiles.openfreemap.org`, one MapLibre
canvas, zero SVG tile images, no fallback. `grep -rn cartocdn frontend/*/src server/src`
returns nothing. The §VII guard passes, and still fails on demand with the mask removed.

### The first cut of this phase was wrong, in ways the tests did not catch

A `/simplify` pass (four parallel reviewers) found three regressions I had introduced and
one I had *asserted was handled*:

1. **All map-mode interaction was dead.** `pointer-events: none` on the SVG root let
   gestures reach the canvas, and the comment beside it said nodes "opt back in via
   `pointer-events: auto`". That rule was never written — every `pointer-events` in the
   component and its stylesheet was `none`. Hover, click, selection, drag and background
   click-to-collapse were all inert in map mode.
2. **Level-of-detail froze at k=1.** `applyLOD` was only ever called from the d3-zoom
   handler, which the handover detached. Node radii, avatar clip radii, edge and badge
   counter-scaling and label culling all stopped responding to zoom — in map mode
   specifically, where they do the most work.
3. **UsageMap had two cameras.** T025 was marked done having removed only the tile call:
   d3-zoom still wrote the same `transform` MapLibre writes, and — with no pointer routing
   there — swallowed the gesture so MapLibre's camera never moved at all.
4. **Programmatic zoom wrote to the wrong camera.** Cluster fan-out and province framing
   drove d3-zoom's transform, which MapLibre overwrites on its next painted frame.

All four are one mistake: camera ownership was implemented as a branch in one consumer
instead of as a property of the basemap module. The fix is `onCameraChange` (the
notification d3-zoom used to provide, now fired by whichever camera drives) and `zoomTo`
(the only supported way to move the view), plus pointer routing in the stylesheet beside
the layer stack it belongs to. T023/T025 were reopened and redone.

### A "redundant CSS" cleanup that was not redundant

Acting on a review finding, `width: 100%; height: 100%` was removed from `.svg` as
redundant with `inset: 0`. It is not: an `<svg>` falls back to its intrinsic **300×150**,
so `clientWidth`/`clientHeight` — which feed the projection, the camera reference points
and the whole overlay solve — were wrong, and the map was framed and masked in the wrong
place. The composited guard caught it immediately (an outside sample point stopped being
background); a review of the diff alone would not have. Both stylesheets now carry a
comment saying why the sizing is load-bearing.

### The fork

`frontend/ecosystem-analytics/src/components/graph/ForceGraph.tsx` held a second, verbatim
copy of the tile compositor pointed at CARTO, reached from `Explorer.tsx` — so the module's
"single implementation" claim was only half true and FR-016a was unmet. It now consumes the
shared `renderNlBasemap` (newly exported from `@ea/shared`), which deletes ~100 lines of
duplicated tile maths.

Two deliberate, visible changes to the Explorer follow from that and were accepted:
- its **Netherlands** view now uses the §VII white mask rather than a tile clip;
- its **world/Europe** views are no longer clipped to the region outline — a canvas cannot
  be clipped by the SVG's `clipPath` — and instead show the basemap with borders drawn over.

### Other review findings applied

Dead `clipPath` and the `svg` option it was the sole consumer of (which also removed a
double cast in UsageMap); a dirty check so an idle basemap does not rewrite the group
transform 60×/second; memoised + released WebGL probe (it was leaking a context per map);
latched error handler (was firing the fallback path once per failed tile); a destroy race
that orphaned a map — and the whole retained graph scope — on fast unmount; a tautological
camera test where `referenceZoom` cancelled out, leaving two identical assertions.

Deferred: moving the harness and the shared-module unit tests out of `frontend/vng` into
`frontend/shared` (needs a Vite/Vitest config there that does not exist yet); replacing the
guard's fixed `waitForTimeout` with a MapLibre `idle` signal; gating the harness dev server
so it does not start for unrelated Playwright runs.


---

## Execution notes — Phases 5 & 7

### A real §VII violation found by the new guard, pre-dating this feature

`?region=<province>` renders **inverted**: imagery everywhere, the province itself blank.
The province GeoJSON (`public/maps/provinces/*.geojson`) holds that province's
MUNICIPALITIES — 26 for Utrecht — not one dissolved outline, so `buildComplementPath`
joins them and the even-odd fill alternates across their shared borders.

It was effectively invisible before this feature: the old `<image>` tile layer did not span
the viewport, so a broken mask had little to fail to hide. A canvas basemap covers
everything and exposed it. Measured: switching the fill to `nonzero` recovers most of it
(6.9% → 78.8% of the viewport correctly blank, 2 of 3 outside points correct) but is not a
fix — the real fix is to dissolve each province's municipalities into a single outline in
`server/scripts/generate-nl-geo.mts`.

**Deliberately not patched.** The mask is constitutional, pixel-verified and pinned by
`nl-basemap.test.ts`; changing it to chase a bug outside this feature's scope is the wrong
trade. It is recorded as a `test.fail()` in the guard, so the suite stays green *and* the
test flips to a failure the moment someone fixes it.

Note this also means the existing "province" §VII spec never covered this path: it frames a
province on the NATIONAL basemap, which is a different code path and works.

### Sample coordinates cannot be assumed — twice now

Adding the attribution line shrank the map surface from 1400×900 to 1400×882 and every
hard-coded sample point drifted; the main guard assertion failed. Both times the points
were re-derived by measuring an actual render (mask-on vs mask-off) rather than reasoned
about. The guard now asserts the surface size it was calibrated against, so a future layout
change fails loudly instead of silently sampling the wrong pixels.

### Verified

- Mid-gesture sampling passes — the overlay is wired to MapLibre's `render`, not `move`.
- Node interaction survives in map mode: `elementFromPoint` at node centres returns an SVG
  `circle`, not the canvas. This is the regression the review caught, now positively verified.
- Attribution renders on all three surfaces, below the map, never over the masked area.


---

## Execution notes — Phase 8 (degradation) and polish

**Fallback verified end to end.** Blocking `tiles.openfreemap.org` in the browser produces:
the notice, the attribution still present, the mask still drawn, and all outside sample
points still exactly background. That last one is invariant I-10 — §VII holds *while
degraded* — and it is now a standing test rather than a one-off probe.

**Fail closed on missing region geometry (T044).** If the region GeoJSON cannot load there
is no mask, so the basemap is torn down and its container hidden rather than rendered
unmasked. A blank map is a degraded map; an unmasked one is a constitutional violation.

**The notice and the credit both sit below the map**, not over it, for the same reason: §VII
requires everything outside the region to be plain background, and floating chrome would be
drawn on exactly that area.

**The fallback state is why the INSIDE assertion must never be weakened.** With no imagery
every pixel is background, so an outside-only guard would pass here — indistinguishable
from a working map.

**Bundle (T051).** `maplibre-gl` splits into its own 1.05 MB async chunk; the Explorer's
`index` chunk contains only the import site (the chunk filename and the specifier), not the
library. It never enters initial load.

## Still open (4 of 54)

- **T031** — extend the composited guard to the Usage Explorer surface. Needs a
  `?surface=usagemap` harness parameter and a `GemeenteLocation`/`CityRow` fixture; the
  ForceGraph surface (which also backs initiative-details) is covered.
- **T035/T036/T037** — the manual interaction sweep and recording of intentional
  differences. T033 (non-map mode) and T034 (marker interaction) are done and automated;
  clustering, region switching and drag are not yet walked by hand.
- **T052** — done early at the user's request.
- **T054** — the quickstart walkthrough against a live authenticated environment.
