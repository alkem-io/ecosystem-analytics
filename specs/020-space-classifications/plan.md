# Implementation Plan: Dashboards read Space Classifications instead of tags

**Branch**: `020-space-classifications` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-space-classifications/spec.md`

## Summary

Move the Dutch dashboards (VNG, GovTech, and every dashboard added later) off free-text tag string-matching and onto Alkemio's `SpaceAbout.classifications` as the source of truth for the NDS theme chart, the VNG-2030 theme chart, the NDS × VNG-2030 cross-tab, the growth-phase pipeline, and the Initiatives table's category columns and filters.

Technically this is: extend two GraphQL documents with the `classifications` selection, add one pure transform module that turns classification entries into a vocabulary + a selection, rewrite the counting core to aggregate on stable **value ids** and seed its categories from the **union of vocabularies** rather than from `analytics.yml` keyword lists, delete `tag_category_mapping` in favour of a three-line per-dashboard designation block, carry server-authored labels through the API so the frontend stops translating category keys, and invalidate the graph cache once on deploy. Spaces with no classification data land in the "no classification" bucket — there is no tag fallback.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, ESM); Node 24 (server), React 19 (frontends)
**Primary Dependencies**: Server — Express 5, `graphql-request` + codegen SDK, `better-sqlite3`. Frontend — React 19, Vite 7, `recharts`, `react-i18next`, Radix UI + Tailwind v4. **No new dependencies.**
**Storage**: Existing SQLite cache. **No schema change** — one bump of `CACHE_MAINTENANCE_VERSION` (1 → 2) to clear cached `GraphDataset` rows once per environment, so no pre-change dataset is served as classification-derived (FR-019).
**Testing**: Vitest (`server/`, `frontend/*`), Playwright visual regression at the root.
**Target Platform**: Linux container (one BFF serving Explorer :4000 / VNG :4001 / GovTech :4002)
**Project Type**: Web application — Express BFF + multiple React SPAs sharing `@ea/shared`
**Performance Goals**: No regression in dashboard load time (SC-006). The classification data rides along on GraphQL documents already being issued — zero additional round trips per space.
**Constraints**: Missing/empty/unreadable classification data must never fail a request (FR-018, Constitution V). Category labels are server-authored and must not be re-translated client-side (FR-024).
**Scale/Scope**: Up to 100 spaces per request (`max_spaces_per_request`); vocabularies of roughly 5–15 values per classification; 3 designated classifications per dashboard.

### Verified against the live Alkemio schema (2026-09-01)

Introspected at `https://alkem.io/api/public/graphql` and `https://acc-alkem.io/api/public/graphql` — both carry the field; a live query against the `gemeentedelers` space returns `classifications: []` (the rollout has not reached it yet), confirming both the selection shape and the empty-state path.

```graphql
SpaceAbout.classifications: [ClassificationEntry!]!   # "in sortOrder. Empty array when none exist — never null, never an error."

type ClassificationEntry {           # "One vocabulary group on a host entity"
  id: UUID!                          # per-Space instance id (NOT stable across spaces)
  displayLabel: String!              # "defaults to the source template's, overridable to resolve a conflict"
  cardinality: ClassificationCardinality!   # SINGLE_SELECT | MULTI_SELECT
  display: Boolean!                  # "Render-only: false means 'not shown on the Space page'. NOT an access control."
  sortOrder: Int!                    # "order of addition, oldest first"
  values: [ClassificationValue!]!    # "The snapshot vocabulary, in authored order. Never re-sorted."
  selectedValues: [ClassificationValue!]!
  selectedValueIDs: [UUID!]!
}

type ClassificationValue {
  id: UUID!     # "Stable identifier — aggregation key. Copied verbatim into every snapshot; never re-derived on rename."
  label: String!  # "Human-readable, single-language label."
}
```

Two consequences drive the whole design: value `id` is copied verbatim into every snapshot, so it is the **cross-space aggregation key** (FR-005); and `ClassificationEntry` exposes **no source-template id**, so the only cross-space handle on a *group* is its `displayLabel` — which is what the per-dashboard designation matches on (FR-010, see research R-002).

`server/src/graphql/generated/` predates this field, so `pnpm run codegen` is a hard prerequisite for the first task.

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design. Constitution v4.3.0.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Alkemio OIDC auth** | No change to auth. Classification data is read on the existing authenticated GraphQL calls using the session's access token. No new credential, scope, or storage. | ✅ PASS |
| **II. Typed GraphQL contract** | The `classifications` selection is added to `fragments/spaceAboutFragment.graphql` and `queries/spaceProfileTags.graphql` (renamed `spaceClassifications.graphql`); `pnpm run codegen` regenerates the SDK and the result is committed. No raw query strings introduced. | ✅ PASS |
| **III. BFF boundary** | All classification reading stays in the BFF. The SPAs receive only the existing `/api/<app>/dashboard` and `/api/graph/generate` payloads, extended with labels and selections. | ✅ PASS |
| **IV. Data sensitivity** | Classification data is Alkemio-derived and inherits the existing per-user per-Space cache scoping. No new logging of identifiers; no SQL change, so parameterisation is untouched. The one-time cache clear is a `DELETE` through the existing prepared-statement helpers. | ✅ PASS |
| **V. Graceful degradation** | This is the core of FR-018: absent `classifications`, an empty array, an entry with an empty vocabulary, and a selected id absent from its snapshot each degrade to "no classification" for that space and dimension. A designated group that no selected space carries yields a chart of zero-count categories, not a crash and not a missing chart. | ✅ PASS |
| **VI. Design fidelity** | Chart geometry, colours, stacking, tooltip structure, and the leading "no classification" bar position are all unchanged. Only the *source* of category keys and labels changes. Visual-regression snapshots are expected to be stable except where a label string changes. | ✅ PASS |
| **VII. Dutch-dashboard map scope** | No map code is touched. `ForceGraph`, both `InitiativeMap`s, and the `mapRegion` gating are out of scope. | ✅ PASS |

**Result: PASS, no violations.** Complexity Tracking is therefore empty and omitted.

Post-Phase-1 re-check: still PASS. The design adds no project, no dependency, and no persistence layer; it removes configuration (`tag_category_mapping`) rather than adding it, and the one new server module (`transform/classifications.ts`) is a pure function module in the existing `transform/` layer.

## Project Structure

### Documentation (this feature)

```text
specs/020-space-classifications/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — 8 decisions
├── data-model.md        # Phase 1 — entities, invariants, derivations
├── quickstart.md        # Phase 1 — how to run, configure and verify
├── contracts/
│   ├── classification-model.md      # The Alkemio-facing read contract + degradation matrix
│   ├── api-dashboard.md             # POST /api/<app>/dashboard response delta
│   └── config-designation.md        # analytics.yml designation block (replaces tag_category_mapping)
└── checklists/
    └── requirements.md  # Spec quality checklist (complete)
```

### Source Code (repository root)

```text
server/
├── analytics.yml                              # MODIFIED — tag_category_mapping → classifications designation (both apps)
└── src/
    ├── config.ts                              # MODIFIED — DashboardAppConfig.tagCategoryMapping → .classifications
    ├── cache/cache-service.ts                 # MODIFIED — CACHE_MAINTENANCE_VERSION 1 → 2, clear graph datasets
    ├── graphql/
    │   ├── fragments/spaceAboutFragment.graphql   # MODIFIED — + classifications selection
    │   ├── queries/spaceClassifications.graphql   # RENAMED from spaceProfileTags.graphql, + classifications
    │   └── generated/                             # REGENERATED via pnpm run codegen (committed)
    ├── transform/
    │   ├── classifications.ts                 # NEW — pure: entries → vocabulary + selection + label resolution
    │   ├── classifications.test.ts            # NEW
    │   └── initiatives.ts                     # MODIFIED — GD callouts resolve by value LABEL (R-006)
    ├── services/
    │   ├── vng-dashboard-service.ts           # MODIFIED — countDashboard aggregates on value ids
    │   ├── groei-phases.ts                    # MODIFIED — phase from its classification, vocabulary order
    │   └── graph-service.ts                   # MODIFIED — node enrichment from classifications, not tags
    └── types/
        ├── api.ts                             # MODIFIED — + category label, + unclassifiedCount
        └── graph.ts                           # MODIFIED — + GraphNode.classifications

frontend/shared/src/dashboard/
├── components/charts/
│   ├── CategoryBarChart.tsx                   # MODIFIED — server label, drop labelNamespace
│   ├── CategoryMatrixChart.tsx                # MODIFIED — labelled axes
│   ├── NdsChart.tsx, Vng2030Chart.tsx         # MODIFIED — drop labelNamespace prop
│   └── PhaseDistributionChart.tsx             # MODIFIED — server label
└── pages/
    ├── DashboardTab.tsx                       # MODIFIED — "not yet classified" notice (FR-016)
    ├── InitiativesTab.tsx                     # MODIFIED — label chips + filters, no i18n lookup
    └── SpaceDetailsTab.tsx                    # MODIFIED — classifications section (FR-022/023)

frontend/vng/src/i18n/{en,nl}.json             # MODIFIED — retire categories.*, add unclassified notice
frontend/govtech/src/i18n/{en,nl}.json         # MODIFIED — same
```

**Structure Decision**: The existing multi-SPA layout is unchanged. Every behavioural change lands either in the BFF (`server/src/{transform,services,graphql,types}`) or in `@ea/shared`'s dashboard code, so VNG and GovTech both inherit it from one implementation and a future dashboard gets it for free (FR-021). Per-dashboard divergence is expressed only as which classification `displayLabel` drives which panel, in that app's `analytics.yml` block.

## Phase 0 — Research

See [research.md](./research.md). Eight decisions, all resolved; no NEEDS CLARIFICATION remains:

| # | Decision |
|---|---|
| R-001 | Aggregate on `ClassificationValue.id`; display `label`. |
| R-002 | Designate a group per panel by `displayLabel`, matched case/whitespace-insensitively; ties broken by lowest `sortOrder`. |
| R-003 | Chart categories = union of the selected spaces' vocabularies, ordered by first appearance in authored order. |
| R-004 | Read classifications on the GraphQL documents already issued — no extra round trip. |
| R-005 | Phase order comes from the phase vocabulary's authored order; `GROEI_PHASES` is retired. **Supersedes spec assumption A-004.** |
| R-006 | GD callouts resolve against the vocabulary's value **labels** — keeps FR-020 without any keyword list. |
| R-007 | `tag_category_mapping` is deleted, not deprecated; a three-key designation block replaces it. |
| R-008 | Cache invalidated once via `CACHE_MAINTENANCE_VERSION` 1 → 2. |

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the classification entities, the derived counting entities, and the invariants each requirement pins.
- [contracts/classification-model.md](./contracts/classification-model.md) — exactly what is read from Alkemio and the full degradation matrix behind FR-018.
- [contracts/api-dashboard.md](./contracts/api-dashboard.md) — the `POST /api/<app>/dashboard` response delta (added `label`, added `unclassifiedCount`, matrix axes become labelled objects).
- [contracts/config-designation.md](./contracts/config-designation.md) — the `analytics.yml` block that replaces `tag_category_mapping`, with the env vars and the no-designation behaviour.
- [quickstart.md](./quickstart.md) — codegen, config, running, and a verification walkthrough per user story.

## Spec deltas discovered during planning

Two spec statements need adjusting; both are recorded here rather than silently diverged from:

1. **A-004 is superseded by R-005.** The spec assumed phase ordering stays a hard-coded dashboard concern. It does not need to be: `ClassificationEntry.values` is documented as "in authored order, never re-sorted", so the phase pipeline order comes from the vocabulary, and the `GROEI_PHASES` constant (with its `nr` values −1…3) is retired. This carries a **deployment expectation**: whoever authors the phase classification template must author its values in pipeline order (pre-intake → beheer). Recorded in quickstart.md as a prerequisite for the classification programme.

2. **FR-020's "current tag-derived behaviour" is preserved by R-006, not by keeping the keyword list.** GD callouts are Callouts and carry no `SpaceAbout.classifications`. Rather than retain `tag_category_mapping` for the GD layer alone (which would contradict FR-011), a GD callout's tags are matched case-insensitively against the *labels* of the same vocabulary the spaces use. For the VNG taxonomy this is very nearly the identity mapping the keyword list encoded, so GD's counting behaviour is retained with zero configuration.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| The classification programme has not reached any space when this ships, so every chart shows one full "no classification" bar. | Accepted and by design (spec Clarifications). The FR-016 notice names it explicitly, and FR-015 lets an editor see exactly which spaces to classify. Ship order is a deployment decision, not a code one. |
| The NDS / VNG-2030 vocabularies are authored with labels that differ from today's keyword list, changing chart labels. | Labels are server-authored by design (FR-024). quickstart.md includes a pre-flight query that prints each designated vocabulary so the labels can be reviewed before deploy. |
| Designation by `displayLabel` breaks if a template's label is renamed. | The designation is one config string per panel; a rename is a one-line `analytics.yml` / env-var change. The no-match case degrades to an all-zero chart plus a startup warning rather than a failure (R-002). |
| Losing NL/EN switching on category names. | Deliberate — `ClassificationValue.label` is documented single-language. i18n is retained for chart titles, the "no classification" bucket, and all surrounding copy. |
| Visual-regression snapshots drift on label changes. | Expected; `pnpm run test:visual:update` after the labels are confirmed correct. |

## Next step

`/speckit.tasks` to generate the dependency-ordered `tasks.md`.
