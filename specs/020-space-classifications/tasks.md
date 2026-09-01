---

description: "Task list for 020-space-classifications"
---

# Tasks: Dashboards read Space Classifications instead of tags

**Input**: Design documents from `/specs/020-space-classifications/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. This feature rewrites the counting core that every dashboard chart depends on, and `data-model.md` states ten invariants that are only meaningful if they are pinned by tests. The repo already carries the relevant suites (`vng-dashboard.test.ts`, `groei-phases.test.ts`, `initiatives.test.ts`), so these tasks extend existing coverage rather than introducing a new practice.

**Organization**: Grouped by user story. US1 and US2 are both P1 and together form the MVP — see Implementation Strategy for why they ship as one unit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5, mapping to spec.md's user stories

## Path Conventions

Express BFF at `server/`, React SPAs under `frontend/` sharing `frontend/shared` (`@ea/shared`). All paths below are repo-root-relative.

---

## Phase 1: Setup (GraphQL contract)

**Purpose**: Get `SpaceAbout.classifications` into the typed SDK. Nothing else compiles until this is done.

- [x] T001 [P] Add the `classifications { id displayLabel cardinality display sortOrder values { id label } selectedValues { id label } }` selection to `server/src/graphql/fragments/spaceAboutFragment.graphql`, per contracts/classification-model.md §1. Do NOT select `selectedValueIDs`.
- [x] T002 [P] Rename `server/src/graphql/queries/spaceProfileTags.graphql` to `server/src/graphql/queries/spaceClassifications.graphql`, rename the operation `SpaceProfileTags` → `SpaceClassifications`, and add the same `classifications` selection alongside the existing `tagsets` selection (tagsets stay — the GD layer and `commonGround` still read them).
- [x] T003 Run `pnpm run codegen` in `server/` and commit the regenerated `server/src/graphql/generated/` (Constitution II). Verify with `grep -n "ClassificationEntry" server/src/graphql/generated/graphql.ts`.

**Checkpoint**: The SDK exposes `ClassificationEntry` and `SpaceClassifications`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure transform module, the config designation, the type changes, and the cache invalidation that every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 [P] Create `server/src/transform/classifications.ts` — a pure module with no I/O, exporting: a structural `ClassificationEntryInput` type; `resolveDesignated(entries, designation)` (normalise trim/collapse-whitespace/lowercase on both sides, lowest `sortOrder` wins a tie, `null` on empty designation or no match — research R-002); `vocabularyOf(entry)` → `{ key, label }[]` in authored order; `selectionOf(entry)` → value ids intersected with the entry's own `values` (invariant I-4); `unionVocabularies(perSpaceVocabularies)` → de-duplicated by key, ordered by first appearance (research R-003); `resolveByLabel(tags, vocabulary)` → value ids whose label matches a tag case-insensitively, for the GD layer (research R-006).
- [x] T005 [P] Add `server/src/transform/classifications.test.ts` covering every row of the degradation matrix in contracts/classification-model.md §4 (absent field, `[]`, group missing, empty `values`, empty `selectedValues`, selected id not in `values`, duplicate `displayLabel`, `SINGLE_SELECT` with >1 selection, empty label) plus `unionVocabularies` across two differing snapshots. Depends on T004.
- [x] T006 [P] In `server/src/config.ts`, add `classifications: { nds: string; vng2030: string; phase: string }` to `DashboardAppConfig`, extend `DashboardYamlBlock` with the `classifications` key, and parse it in `parseDashboardConfig` with the defaults from contracts/config-designation.md (`NDS`, `VNG 2030`, `Groeifase`). Leave `tagCategoryMapping` in place for now — it is removed in T023 once its last reader is gone.
- [x] T007 [P] In `server/analytics.yml`, add the `classifications:` block with `${VNG_CLASSIFICATION_*}` / `${GOVTECH_CLASSIFICATION_*}` env substitution to both the `vng:` and `govtech:` blocks, with the comment explaining that values come from Alkemio and are never restated here.
- [x] T008 [P] Document `VNG_CLASSIFICATION_NDS`, `VNG_CLASSIFICATION_VNG2030`, `VNG_CLASSIFICATION_PHASE` and the three `GOVTECH_*` equivalents in `server/.env.default`.
- [x] T009 In `server/src/types/api.ts`, apply the data-model.md §3 changes: add `label: string | null` to `DashboardDimension.categories[]`; change `CategoryMatrix.ndsCategories` / `.vng2030Categories` from `string[]` to `{ key: string; label: string | null }[]`; add `label: string | null` to `PhaseDistribution.phases[]`; add `unclassifiedCount: number` to `VngDashboardResponse`; add `selections: Record<string, string[]>` and `hasClassifications: boolean` to `DashboardCountable`. Update the doc comments so `key` is documented as a `ClassificationValue.id` and `nr` as an authored-order index.
- [x] T010 [P] In `server/src/types/graph.ts`, add `classifications?: { label: string; display: boolean; values: { id: string; label: string }[] }[]` to `GraphNode`, and update the doc comments on `ndsCategories` / `vng2030Categories` to record that they now hold selected value **labels** rather than tag-derived category keys.
- [x] T011 In `server/src/cache/cache-service.ts`, bump `CACHE_MAINTENANCE_VERSION` from 1 to 2 and add the numbered step that clears cached graph datasets, so no pre-change dataset is served as classification-derived (FR-019, research R-008). Update `server/src/cache/cache-service.test.ts`'s `user_version` assertion from 1 to 2.

**Checkpoint**: Pure transform available and tested; config, types and cache invalidation in place. User stories can begin.

---

## Phase 3: User Story 1 — Theme charts count the curated classification (Priority: P1) 🎯 MVP

**Goal**: Every classified space is counted under the values an editor selected in Alkemio, not under whichever theme a tag string happened to match.

**Independent Test**: Select spaces of which some are classified; each classified space appears under its selected value(s) and nowhere else; counts sum to the number of spaces counted; a space whose tags disagree with its classification follows the classification (spec US1 scenario 4).

### Tests for User Story 1

- [x] T012 [P] [US1] In `server/src/services/vng-dashboard.test.ts`, replace the tag-driven `countDashboard` cases with selection-driven ones pinning invariants I-1 (tags never consulted for a `source: 'spaces'` entity), I-2 (renaming a label moves nothing), I-3 (single- vs multi-select), and I-5 (per-dimension counts sum to the entity count). Include the tags-disagree-with-classification case.
- [x] T013 [P] [US1] Add a `countDashboard` matrix case to `server/src/services/vng-dashboard.test.ts` asserting that cells are keyed by value id, that axes carry `{ key, label }`, and that an entity with several values on an axis is placed at its primary (first-in-authored-order) cell and recorded in `multiCategoryItems`.

### Server implementation for User Story 1

- [x] T014 [US1] In `server/src/services/vng-dashboard-service.ts`, rewrite the per-space fetch in `assembleDashboard` to call `sdk.SpaceClassifications`, and build each `DashboardCountable` with `selections` (via `resolveDesignated` + `selectionOf` for the `nds` and `vng2030` designations from `profile.classifications`) and `hasClassifications`. Keep `tags` populated — the GD branch still needs them.
- [x] T015 [US1] In `server/src/services/vng-dashboard-service.ts`, rewrite `countDashboard` to aggregate on value ids from `entity.selections` instead of matching `entity.tags` against a mapping, emitting `label` on each category and keeping the `uncategorised` bucket first. Depends on T014.
- [x] T016 [US1] In `server/src/services/vng-dashboard-service.ts`, update the NDS × VNG-2030 cross-tab build so cell keys and `multiCategoryItems` use value ids and the two axis lists become `{ key, label }[]`. Depends on T015.
- [x] T017 [US1] In `server/src/services/graph-service.ts`, replace the tag-based node enrichment (the `resolveCategories` calls around line 187) with classification-based enrichment: populate `node.classifications` from the space's `about.classifications` in `sortOrder`, and set `ndsCategories` / `vng2030Categories` to the selected value **labels** of the designated groups. Leave `vngThemes`, `isGemeente`, and the gemeente registry enrichment untouched.

### Frontend implementation for User Story 1

- [x] T018 [P] [US1] In `frontend/shared/src/dashboard/components/charts/CategoryBarChart.tsx`, render the server-supplied `label`, falling back to the localised `dashboard.uncategorised` only when `label` is `null`. Remove the `labelNamespace` prop and its `t()` lookup (FR-024).
- [x] T019 [P] [US1] Update `frontend/shared/src/dashboard/components/charts/NdsChart.tsx` and `Vng2030Chart.tsx` to stop passing `labelNamespace`. Depends on T018.
- [x] T020 [P] [US1] In `frontend/shared/src/dashboard/components/charts/CategoryMatrixChart.tsx`, consume the `{ key, label }[]` axes for row and column headers and tooltips instead of translating axis keys.
- [x] T021 [P] [US1] In `frontend/shared/src/dashboard/pages/InitiativesTab.tsx`, render `r.nds` / `r.vng2030` chips and build the NDS / VNG-2030 filter options directly from the label values (they are labels now), removing the `t('categories.nds.${v}')` / `t('categories.vng2030.${v}')` lookups at lines ~247, ~256, ~595 and ~598. Sorting and export columns keep working on the same arrays.
- [x] T022 [P] [US1] In `frontend/shared/src/dashboard/utils/cities.ts`, confirm the `nds` / `vng2030` pass-through still holds now that the arrays carry labels, and adjust any label lookup it performs.
- [x] T023 [P] [US1] Remove the `categories.nds.*` and `categories.vng2030.*` entries from `frontend/vng/src/i18n/en.json`, `frontend/vng/src/i18n/nl.json`, `frontend/govtech/src/i18n/en.json` and `frontend/govtech/src/i18n/nl.json`, keeping `dashboard.uncategorised` and every chart title.

**Checkpoint**: Theme charts and the Initiatives table are classification-driven. Categories are still seeded only from values actually selected — zero-count categories arrive in US2.

---

## Phase 4: User Story 2 — Categories come from the vocabulary (Priority: P1) 🎯 MVP

**Goal**: Chart categories, labels and order come from Alkemio's vocabulary; the operator keyword lists are gone.

**Independent Test**: Add a value to a vocabulary in Alkemio, reload with no config change and no restart, and see a new zero-count category in the right position with the right label. Then remove the `classifications:` block from `analytics.yml` and confirm the server still boots and charts still render.

### Tests for User Story 2

- [x] T024 [P] [US2] Add `countDashboard` cases to `server/src/services/vng-dashboard.test.ts` for invariants I-6 (every vocabulary value renders, including at count 0) and the union rule (two spaces with differing snapshot vocabularies produce the union, each value counted only for spaces whose snapshot holds it).
- [x] T025 [P] [US2] Add a case asserting that an unmatched designation yields a dimension containing only the `uncategorised` bucket — the chart renders empty rather than disappearing (contracts/config-designation.md).
- [x] T026 [P] [US2] Update `server/src/transform/initiatives.test.ts` so the GD fixtures resolve their NDS / VNG-2030 categories by vocabulary label rather than through a configured mapping, and assert a GD callout whose tag matches no vocabulary label lands in `uncategorised`.

### Implementation for User Story 2

- [x] T027 [US2] In `server/src/services/vng-dashboard-service.ts`, seed each dimension's categories from `unionVocabularies` over the selected spaces' designated vocabularies (research R-003) instead of from the values encountered, so zero-count categories render. Depends on T015.
- [x] T028 [US2] In `server/src/services/vng-dashboard-service.ts`, log one warning per request when a designation matches no classification on any selected space, naming the app, the panel and the unmatched designation — and nothing else (Constitution IV: no space data in logs).
- [x] T029 [US2] In `server/src/transform/initiatives.ts`, replace `resolveCategories(callout.tags, mapping.nds/vng2030)` with `resolveByLabel(callout.tags, vocabulary)` (research R-006), change `buildInitiativeLayer`'s `TagCategoryMapping` parameter to the two designated vocabularies, and delete the now-unused `DimensionMap` / `TagCategoryMapping` / `resolveCategories` exports. Keep `hasCommonGroundTag`, `resolveThemeTitles`, `CLASSIFICATIONS`, the year and SDG parsing untouched (spec A-006/A-007).
- [x] T030 [US2] In `server/src/services/graph-service.ts`, remove both `loadConfig().vng.tagCategoryMapping` reads (lines ~164 and ~287) and pass the designated vocabularies to `buildInitiativeLayer` instead. Depends on T029.
- [x] T031 [US2] Delete `tagCategoryMapping` from `DashboardAppConfig` and from `parseDashboardConfig` in `server/src/config.ts`, and delete both `tag_category_mapping:` blocks from `server/analytics.yml` (research R-007). Depends on T029 and T030 — this task must be last, when no reader remains.
- [x] T032 [US2] Verify `cd server && pnpm exec tsc --noEmit` passes, confirming no reader of `tagCategoryMapping` survives anywhere in the server.

**Checkpoint**: MVP complete. Charts are fully vocabulary-driven and no keyword list exists in the codebase.

---

## Phase 5: User Story 3 — Growth phase read from its classification (Priority: P2)

**Goal**: The pipeline chart reads each initiative's phase from the phase classification, in the vocabulary's authored order.

**Independent Test**: Initiatives at different phases each appear once at their selected phase; an initiative carrying an obsolete phase keyword tag is placed by its classification; with no phase selections anywhere, the chart is absent rather than empty.

### Tests for User Story 3

- [x] T033 [P] [US3] Rewrite `server/src/services/groei-phases.test.ts` for selection-driven phases: one phase per initiative, obsolete phase tag ignored, `unknown` bucket only when non-empty, `undefined` returned when nothing carries a phase selection, and `nr` reflecting the vocabulary's authored order.

### Implementation for User Story 3

- [x] T034 [US3] Rewrite `server/src/services/groei-phases.ts` to take the designated phase vocabulary plus each entity's phase selection: retire the `GROEI_PHASES` constant and the `resolvePhase` tag matcher, derive the x-axis order and `nr` from the vocabulary's authored order (research R-005), emit `label` per phase, and keep both the omit-when-nothing-has-a-phase rule and the trailing `unknown` bucket.
- [x] T035 [US3] In `server/src/services/vng-dashboard-service.ts`, resolve the `phase` designation alongside `nds` / `vng2030` and pass the phase vocabulary plus selections into `countGroeiPhases`. Depends on T034.
- [x] T036 [P] [US3] In `frontend/shared/src/dashboard/components/charts/PhaseDistributionChart.tsx`, render the server-supplied `label`, using the localised `categories.phase.unknown` only when `label` is `null`, and remove the `usePhaseLabel` i18n helper.
- [x] T037 [P] [US3] Remove the `categories.phase.*` value entries from all four i18n files, keeping only `categories.phase.unknown`. Depends on T036.

**Checkpoint**: The phase pipeline is classification-driven and no Dutch phase keyword remains in the server.

---

## Phase 6: User Story 4 — The classification gap is visible (Priority: P2)

**Goal**: A user can see how many of the counted spaces are not yet classified, and which ones they are.

**Independent Test**: Load a mix of classified and unclassified spaces; the reported count matches the unclassified ones; hovering the "no classification" bar names them; a space that is classified but selected nothing appears in the bar but not in the count.

### Tests for User Story 4

- [x] T038 [P] [US4] Add `countDashboard` cases to `server/src/services/vng-dashboard.test.ts` pinning invariant I-8: `unclassifiedCount` counts only entities with `hasClassifications === false`; a classified space with an empty selection is in `uncategorised` but not in `unclassifiedCount`; GD entities never contribute to `unclassifiedCount`.

### Implementation for User Story 4

- [x] T039 [US4] In `server/src/services/vng-dashboard-service.ts`, compute `unclassifiedCount` over `source: 'spaces'` entities with `hasClassifications === false` and return it on `VngDashboardResponse`, alongside the unchanged `uncategorisedCount` (contracts/api-dashboard.md).
- [x] T040 [US4] In `frontend/shared/src/dashboard/pages/DashboardTab.tsx`, render the rollout notice when `unclassifiedCount > 0` and nothing when it is 0, near the existing `dashboard.uncategorisedCount` summary line. Update the stale "NDS / VNG-2030 profile tags" comments at lines ~31–33 to describe classifications.
- [x] T041 [P] [US4] Add the `dashboard.unclassifiedCount` key to all four i18n files, in English and Dutch, phrased as "not yet classified" rather than "uncategorised" so it reads as distinct from the existing summary line.
- [x] T042 [US4] Confirm the `uncategorised` bar's existing tooltip lists the names of the spaces in it (FR-015) in `frontend/shared/src/dashboard/components/charts/CategoryBarChart.tsx`; extend it only if the bucket's `items` are not already surfaced.

**Checkpoint**: The rollout gap is visible and actionable, and disappears on its own when the programme completes.

---

## Phase 7: User Story 5 — Classifications visible on the initiative (Priority: P3)

**Goal**: A user inspecting one initiative can see its classifications as labelled, curated facets, distinct from its free-text keywords.

**Independent Test**: Open a classified space's details — each group appears with its label and selected values, separately from the keyword tags; a `display: false` group is hidden but still counted; a space with no classifications renders no empty section.

### Tests for User Story 5

- [x] T043 [P] [US5] Add a test asserting invariant I-7 — a `display: false` group is excluded from the presentation payload but contributes to its chart's counts unchanged — in `server/src/transform/classifications.test.ts`.

### Implementation for User Story 5

- [x] T044 [US5] In `frontend/shared/src/dashboard/pages/SpaceDetailsTab.tsx`, add a classifications section rendering `node.classifications` in `sortOrder`: each group's `label` as a heading with its selected values as chips, skipping groups with `display: false` and rendering nothing at all when the node carries no classifications. Keep it visually distinct from the free-text tag chips (FR-022).
- [x] T045 [P] [US5] Add the section heading i18n key to all four i18n files.

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T046 Run `pnpm exec tsc --noEmit` in `server/`, `frontend/shared`, `frontend/vng`, `frontend/govtech` and `frontend/ecosystem-analytics` — all must pass (Constitution, Development Workflow).
- [x] T047 Run `cd server && pnpm run test` and `cd frontend && pnpm run test`; fix any suite still asserting tag-derived category placement.
- [x] T048 [P] Explorer regression check per quickstart.md §6 — confirm the details-drawer tag chips, the "Shared Tags" chord mode, and the treemap/sunburst tag tooltips are unchanged (FR-003, invariant I-10). The Explorer must not have been touched by this feature.
- [x] T049 [P] Grep for orphans: no `tag_category_mapping`, `tagCategoryMapping`, `GROEI_PHASES`, `resolveCategories`, `labelNamespace`, or `categories.nds`/`categories.vng2030`/`categories.phase.<value>` reference should survive outside this spec directory.
- [x] T050 Run `pnpm run test:visual`; review the diffs, confirm each changed label is the one Alkemio authored, then `pnpm run test:visual:update`.
- [ ] T051 **NOT DONE — needs a live, authenticated Alkemio environment.** Walk quickstart.md §4 end to end against a live environment, one section per user story, including the pre-flight vocabulary query in §2.
- [x] T052 [P] Update the `CLAUDE.md` architecture section so the dashboard description says classifications rather than tag mappings, matching what the code now does.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. T001 and T002 are parallel; T003 depends on both.
- **Foundational (Phase 2)**: depends on Phase 1 (nothing type-checks without the regenerated SDK). **Blocks every user story.**
- **US1 (Phase 3)**: depends on Phase 2.
- **US2 (Phase 4)**: depends on US1 — T027 extends the counting core T015 rewrites, and T031 can only delete `tagCategoryMapping` once T029/T030 have removed its last readers.
- **US3 (Phase 5)**: depends on Phase 2 only. Independent of US1/US2 — it reads a different classification group and a different service file.
- **US4 (Phase 6)**: depends on US1 (T039 reads the `hasClassifications` flag T014 populates).
- **US5 (Phase 7)**: depends on Phase 2 and on T017 (which populates `node.classifications`). Independent of US2/US3/US4.
- **Polish (Phase 8)**: depends on every story being complete.

### Story dependency graph

```
Setup → Foundational ─┬─→ US1 ─┬─→ US2   (MVP: US1 + US2)
                      │        └─→ US4
                      ├─→ US3
                      └─→ US5  (needs T017 from US1)
```

### Parallel opportunities

- **Phase 1**: T001, T002 together.
- **Phase 2**: T004, T006, T007, T008, T010 all touch different files and can run together; T005 follows T004; T009 and T011 are independent of the rest.
- **Phase 3**: T012/T013 (tests) together; then the server chain T014 → T015 → T016 is strictly sequential (one file, building on itself) while T017 runs alongside it; the whole frontend set T018/T020/T021/T022/T023 runs in parallel with the server work, with T019 after T018.
- **Phase 4**: T024, T025, T026 together; T029 and T030 before T031.
- **Phase 5**: T036 and T037 run in parallel with the server work T034 → T035.
- **Phase 6**: T041 is independent of T039/T040.
- **Phase 8**: T048, T049, T052 together.

### Cross-story parallelism

Once Phase 2 is done, three people can work at once: one on US1 → US2 → US4 (the counting-core spine), one on US3 (`groei-phases.ts` + its chart, no overlap), one on US5 (`SpaceDetailsTab.tsx`, after T017 lands).

---

## Parallel Example: User Story 1

```bash
# Tests first:
Task: "Selection-driven countDashboard cases in server/src/services/vng-dashboard.test.ts"
Task: "Matrix cases (value-id cells, labelled axes) in server/src/services/vng-dashboard.test.ts"

# Then the frontend set, in parallel with the server chain T014→T015→T016:
Task: "Server labels in frontend/shared/src/dashboard/components/charts/CategoryBarChart.tsx"
Task: "Labelled axes in frontend/shared/src/dashboard/components/charts/CategoryMatrixChart.tsx"
Task: "Label chips and filters in frontend/shared/src/dashboard/pages/InitiativesTab.tsx"
Task: "Pass-through check in frontend/shared/src/dashboard/utils/cities.ts"
Task: "Retire categories.nds.* / categories.vng2030.* in the four i18n files"
```

---

## Implementation Strategy

### MVP = US1 + US2 (both P1)

Ship them together, not separately. US1 alone makes counting classification-driven but leaves categories seeded from values actually selected, so zero-count categories are missing and `tag_category_mapping` still exists in config — a state that satisfies FR-002 but not FR-007/008/011. US2 finishes the job. The split exists so US1 can be reviewed and tested on its own, not so it can be deployed on its own.

1. Phase 1: Setup (codegen)
2. Phase 2: Foundational
3. Phase 3: US1 → review and test
4. Phase 4: US2 → **STOP and VALIDATE** against quickstart §4 US1 + US2 → deployable

### Incremental delivery after MVP

5. US3 (phase pipeline) → test → deploy
6. US4 (rollout notice) → test → deploy
7. US5 (details view) → test → deploy

Each adds value without touching the others' files.

### Deployment note

This is deployable before the classification programme has reached a single space — every chart then shows one full "no classification" bar with the US4 notice explaining it. That is the designed rollout state (spec Clarifications), but decide deliberately whether to ship ahead of the data or behind it, and confirm the designation labels with quickstart.md §2's pre-flight query either way.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- The server counting core (`vng-dashboard-service.ts`) is one file touched by T014–T016, T027, T028, T035 and T039 — those are deliberately never marked `[P]` with each other.
- Commit after each task or logical group.
- Spec assumption A-004 is superseded by research R-005 (phase order from the vocabulary); T034 implements the superseding decision, not the assumption.


---

## Execution notes (post-implementation)

Recorded so the diff is readable against this plan rather than silently diverging from it.

1. **T015 and T027 landed together.** The plan had US1 seed chart categories from the values
   actually selected, and US2 replace that with the unioned vocabulary. Writing the
   intermediate version would have meant writing code whose only purpose was to be deleted
   one phase later, so `countDashboard` was written once, vocabulary-seeded. The US1 and US2
   test groups are still separate and each still fails independently if its behaviour breaks.
   Same reasoning for T016/T028/T039, which touch the same function.

2. **Three consumers the plan missed.** `CitiesTab.tsx`, `CityDetailsTab.tsx` and
   `exportDashboard.ts` also translated category keys through `categories.nds.*` /
   `categories.vng2030.*` / `categories.phase.*`. They were found by grep during T023 and
   converted the same way. `exportDashboard`'s `labelOf(namespace, key)` callback became two
   explicit `uncategorisedLabel` / `noPhaseLabel` strings, since after this change the only
   thing left to localise is the synthetic buckets.

3. **The GD layer resolves post-merge, not in `buildInitiativeLayer`.** The plan (T029) had
   the layer resolve callout tags against the vocabulary directly. It cannot: the GD subgraph
   is cached independently of any space selection (`__gd_initiatives__`), while the vocabulary
   comes from the selected spaces' snapshots. `buildInitiativeLayer` now carries the callout's
   tags onto the node and `graph-service` resolves them post-merge, where both are in hand.

4. **`GraphNode.classificationEntries` was added and is not in data-model.md.** The cache row
   is written *before* the enrichment loop runs, so a cached space must carry its raw
   classification entries for the next enrichment pass to work. The field is internal: it is
   deleted from each node after enrichment, so it is cached but never reaches the browser.

5. **`GraphNode.classifications` carries no `display` flag.** data-model.md §2 specified
   `{ label, display, values }`. `display: false` groups are filtered server-side in
   `presentClassifications`, so the flag would always be `true` in the payload. Emitting
   `{ label, values }` keeps FR-023 unambiguous and the payload smaller.

6. **Visual regression is partially covered.** `npx playwright test` runs 18 tests, of which 7
   pass and 11 skip — the skipped ones need a running app (`BASE_URL`). The 7 that ran are the
   Netherlands-only map tests (Constitution §VII) and they pass unchanged. **No chart snapshot
   was exercised**, so label drift in the category charts is not yet verified by a snapshot.
   Re-run with a live app before relying on T050.
