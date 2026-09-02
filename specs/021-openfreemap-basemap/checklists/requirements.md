# Specification Quality Checklist: Watermark-free maps on a keyless basemap

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Validation pass 1 (2026-09-02) — findings and fixes:

- **Fixed**: the first draft named the providers, the rendering library and the source files
  throughout. Rewritten so requirements describe the outcome ("a service requiring no key,
  no registration, no quota") rather than the vendor. The vendors belong in the plan, not here.
- **Fixed**: "verification must be genuine" was untestable as written. Split into FR-001…FR-008,
  with FR-003 the load-bearing one — the guard must be *demonstrated to fail* when the mask is
  removed. A guard that cannot fail is the exact problem this feature exists to correct.
- **Fixed**: SC-003 originally said outside-the-region points are "blank". Restated as a
  sampled, countable assertion (100% of sampled points, three surfaces, both region kinds,
  ≥3 zoom levels) so it can be checked rather than judged.
- **Fixed**: added FR-017 / SC-005 (imagery stays aligned with markers). The first draft did not
  cover it, yet it is the most likely user-visible defect when the imagery is drawn by a
  different mechanism from the markers above it.
- **Resolved by the author**: three scope-changing questions were put rather than guessed, because
  the previous feature in this repo shipped on a guessed default that turned out to be wrong.
  All three are recorded in Clarifications:
  1. Attribution sits **below the map, outside the map area** — nothing is drawn over the plain
     background outside the region, so the constitutional rule needs no reinterpretation.
  2. The map is **rebuilt around the map technology's own camera** (the larger of the two options).
  3. **Every map migrates**, including the Explorer's world and Europe views.

- **Revised after answer 2**: choosing the rebuild trades build simplicity for behavioural risk in
  a large, heavily-used component, so that risk is now stated as requirements rather than left
  implicit — new User Story 6 (P1, nothing the user could already do is lost), FR-017a/b/c, and
  SC-005a. FR-017 was reframed: with one camera driving both imagery and markers, drift becomes
  structurally impossible rather than something to guard against.

- **Revised after answer 3**: FR-016a added (one imagery path across the whole product, no second
  mechanism left behind), and SC-001 widened to the Explorer's views.

- **Note on sequencing**: FR-006 requires the new guard to pass against the product *before* the
  imagery changes. With the rebuild chosen, that ordering is the only thing standing between this
  feature and an unverifiable rewrite of a constitutional requirement — it should not be relaxed
  during planning.

Clarify pass (2026-09-02) — 5 questions asked and answered, all integrated:

1. **Guard harness** → a dedicated page mounts the real map from fixture locations, no sign-in and
   no backend (FR-001a/b, SC-004a). A guard needing a live authenticated environment is what let
   the present gap persist, so this is the load-bearing answer of the five.
2. **Marker rendering** → the existing layer keeps drawing markers, edges, clustering and hover,
   re-projecting through the map's camera (FR-017d). Keeps the force simulation, the edges and the
   no-basemap modes untouched.
3. **Guard pass condition** → named points outside the region must be *exactly* the page
   background with no colour tolerance; named points inside must not be; all sampled a margin clear
   of the coastline seam (FR-002a/b/c, SC-003). Tolerance is precisely what a faint leak would hide
   behind, hence its explicit exclusion.
4. **Fallback** → region outline plus positioned markers and a short notice, with every marker
   interaction still working (FR-021, FR-022a/b, SC-008). Replaces two vague "meaningful/clear
   fallback" phrasings the first validation pass flagged.
5. **Marker lag** → none permitted; markers stay locked to the imagery on every frame of a gesture
   (FR-017e, SC-005). This is the main cost of the rebuild, named explicitly so it cannot be
   quietly traded away for frame rate during implementation.

**Correction made during this pass**: the spec's Overview originally claimed the real-component
verification did not exist. It does — `frontend/vng/src/dashboard/nl-basemap.test.ts`, not the path
`nl-basemap.ts` cites. It asserts the shipped mask-building code produces exactly the path the
Playwright specs pixel-verified, so the chain pixels → reference path → shipped code is real. The
narrower point survives and is what the feature rests on: every existing check reads the drawing
layer alone, so none of them can see imagery moved to a layer beneath it. Overview and FR-007/008
were rewritten accordingly.
