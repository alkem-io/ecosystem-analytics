# Specification Quality Checklist: Dashboards read Space Classifications instead of tags

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-01
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

Validation pass 1 (2026-09-01) — findings and fixes:

- **Fixed**: initial FR set named the configuration file and the field names that hold the
  keyword lists. Reworded to "per-dashboard tag-to-category keyword lists" (FR-011) so the
  requirement stays behavioural.
- **Fixed**: the "no classification" and phase-omission behaviours were implicit in US1/US3.
  Made explicit as FR-009 and FR-013 so they are testable as stated.
- **Fixed**: SC-004 originally said counts "add up"; restated as an exact identity
  (categories + no-classification bucket = counted Spaces) so it is verifiable.
- **Confirmed by the author**: three scope decisions were put to the author and answered —
  (1) unclassified Spaces go to the "no classification" bucket with NO tag fallback,
  (2) the GemeenteDelers layer stays tag-derived and out of scope,
  (3) chart categories come from the classification vocabulary and the per-dashboard keyword
  lists are retired. All three are recorded in Clarifications.
- **Revised after answer (1)**: US4, FR-014–FR-018, SC-001/002/005/007 and A-002 were rewritten
  to drop the tag fallback the first draft assumed. The rollout gap is now surfaced as a
  visible, named "no classification" bucket rather than as a tag-derived count.
- **Open dependency (not a spec defect)**: the parallel classification programme (A-002)
  determines when the "no classification" bucket empties out. Tracked as an assumption.
