# Phase 0 Research: Dashboards read Space Classifications instead of tags

**Feature**: 020-space-classifications | **Date**: 2026-09-01

All findings below were verified against the **live** Alkemio schema on 2026-09-01 by GraphQL introspection of `https://alkem.io/api/public/graphql` (production) and `https://acc-alkem.io/api/public/graphql` (acceptance), plus one live document execution against the public `gemeentedelers` space. The generated SDK in `server/src/graphql/generated/` predates the field, so every decision here assumes `pnpm run codegen` has been re-run first.

---

## R-001: What identifies a category

**Decision**: Aggregate counts on `ClassificationValue.id`. Carry `ClassificationValue.label` alongside it for display only. Never key a count, a bucket, a filter, or a matrix cell on label text.

**Rationale**: The schema documents `ClassificationValue.id` as *"Stable identifier — aggregation key. Copied verbatim into every snapshot; never re-derived on rename."* Two properties fall out of that sentence and both are load-bearing:

1. **It survives renames.** FR-005 requires that renaming a value in Alkemio does not move any space between categories. Only the id gives that.
2. **It is shared across spaces.** Because it is *copied verbatim into every snapshot*, two spaces classified from the same template carry the same value id, which is what makes cross-space aggregation meaningful at all. (Contrast `ClassificationEntry.id`, which is the per-space instance and is *not* comparable across spaces — see R-002.)

`label` is documented as *"Human-readable, single-language label"*, i.e. explicitly not an identifier and explicitly not multilingual.

**Alternatives considered**:
- *Key on normalised label text* — this is exactly today's tag matching wearing a new hat: it reintroduces spelling, casing and translation sensitivity, which is the defect the feature exists to remove. Rejected.
- *Key on `ClassificationEntry.id` + value index* — positional, so it breaks when a vocabulary gains a value in the middle. Rejected.

---

## R-002: How a dashboard says which classification drives which panel

**Decision**: Each dashboard designates a group per panel by its `displayLabel`, matched case-insensitively after trimming and collapsing internal whitespace. On multiple matches within one space, the entry with the lowest `sortOrder` wins. On no match, the panel renders its categories empty rather than disappearing, and the server logs one warning per request naming the designation that matched nothing.

**Rationale**: `ClassificationEntry` exposes `id`, `displayLabel`, `cardinality`, `display`, `sortOrder`, `values`, `selectedValues`, `selectedValueIDs`, `createdDate`, `updatedDate` — and critically **no source-template identifier**. The instance `id` is per-space, so it cannot appear in a per-dashboard config that must apply to a hundred spaces at once. That leaves `displayLabel` as the only cross-space handle on a group, so the designation must key on it.

This satisfies FR-010 without restating the vocabulary: the operator writes three strings ("which group is the NDS chart", "which is VNG-2030", "which is the phase pipeline") and nothing about the values inside them. It also satisfies FR-011, because those three strings are a *designation*, not a category definition — the categories still come from Alkemio (R-003).

The tie-break exists because the schema warns that `displayLabel` is *"overridable to resolve a conflict"*, which concedes that duplicate labels are possible. Lowest `sortOrder` means "the one added first", which is the stable, predictable reading, and it is exactly the spec's edge case *"two classification groups on the same Space share a display label"*.

**Alternatives considered**:
- *Designate by the entry's `id`* — impossible; per-space.
- *Designate by position (`sortOrder` index)* — silently wrong the moment one space has an extra classification. Rejected.
- *Ask Alkemio to expose the template id* — the right long-term fix, but it is a platform change outside this feature. Noted as a future simplification; the config shape would not change for the operator.
- *Infer the group by checking which vocabulary contains a known value* — clever but circular, and undiagnosable when it picks wrong. Rejected.

---

## R-003: Where chart categories come from

**Decision**: A chart's categories are the **union of the designated vocabularies across the selected spaces**, de-duplicated by value id, ordered by first appearance walking the spaces in selection order and each vocabulary in its authored order. The synthetic `uncategorised` bucket is prepended, keeping its present leading position.

**Rationale**: FR-007 puts the vocabulary in charge and FR-008 requires zero-count categories to render, so the category list must come from `values` (the whole snapshot vocabulary) and not from `selectedValues` (only what is used). `values` is documented as *"The snapshot vocabulary, in authored order. Never re-sorted"* — the authored order is a deliberate editorial decision, so it is the display order.

The union is what handles the spec's edge case *"the classification vocabularies of two selected Spaces differ (different template versions)"*: because vocabularies are per-space **snapshots**, a selection can straddle template versions. Taking the union means a value that exists in only some snapshots still renders, counted only for the spaces whose snapshot contains it — no space is dropped and no phantom category appears for a value nobody has.

Prepending `uncategorised` preserves today's behaviour exactly (`vng-dashboard-service.ts` seeds it first so its bar sits in the same position across both charts), which keeps Constitution VI satisfied.

**Alternatives considered**:
- *Intersection of vocabularies* — silently hides categories during a template migration. Rejected.
- *First space's vocabulary wins* — makes the chart depend on selection order. Rejected.
- *Fetch the vocabulary once from the classification template set* — `TemplatesSet.classificationTemplates` exists, but a template's current state can differ from the snapshot a space actually holds, so counts and categories could disagree. The snapshots are the truth. Rejected.

---

## R-004: How the data is fetched

**Decision**: Add the `classifications` selection to the two documents already being issued — `fragments/spaceAboutFragment.graphql` (used by graph generation, so every space node gets its classifications) and `queries/spaceProfileTags.graphql`, renamed `spaceClassifications.graphql` (used per-space by `assembleDashboard`). No new query, no new round trip.

**Rationale**: `assembleDashboard` already issues one `SpaceProfileTags` call per selected space and graph generation already pulls `spaceAboutFragment` per space. Both hit `SpaceAbout`, which is where `classifications` lives, so the data rides along on requests that are already in flight. That is what makes SC-006 ("load time no worse than before") hold by construction rather than by optimisation.

Selecting `values { id label }`, `selectedValues { id label }`, `displayLabel`, `cardinality`, `display` and `sortOrder` was executed live against the public `gemeentedelers` space and returned `"classifications": []` — confirming both that the document is valid and that the empty-state path is real and reachable today.

`selectedValueIDs` is *not* selected: `selectedValues { id label }` already carries the ids, and selecting both invites the two lists disagreeing.

**Alternatives considered**:
- *A separate `SpaceClassifications` query* — doubles the per-space call count for data available on a call already being made. Rejected.
- *Fetch through the classification templates and join client-side* — see R-003; wrong source. Rejected.

---

## R-005: Growth-phase ordering

**Decision**: The phase pipeline's order and membership come from the designated phase vocabulary's authored order. The hard-coded `GROEI_PHASES` constant (`pre-intake` −1 … `beheer` 3) is retired; `nr` becomes the value's index in that authored order. **This supersedes spec assumption A-004.**

**Rationale**: A-004 assumed the pipeline order had to stay in code because it is semantic (a pipeline) rather than alphabetical. That assumption pre-dated confirming that `values` is *"in authored order. Never re-sorted"* — an editor authoring a phase vocabulary writes the phases down in pipeline order because that is the only order that makes sense, and Alkemio preserves it verbatim. Reading the order from the vocabulary means adding a phase (or renaming one) needs no code change, which is the same property FR-007 buys for the theme charts.

Retiring `GROEI_PHASES` also removes the last place where a Dutch phase keyword is hard-coded in the server.

**Cost, stated plainly**: this introduces a deployment expectation — whoever authors the phase classification template must author its values in pipeline order. If they author them alphabetically the chart's x-axis is wrong, and nothing in the data can detect that. This is recorded as a prerequisite in quickstart.md and flagged in plan.md's spec-deltas section rather than left implicit.

**Alternatives considered**:
- *Keep `GROEI_PHASES` and match vocabulary values to it by label* — reintroduces label matching for exactly the facet the feature is de-labelling, and breaks on rename. Rejected.
- *List the phase value ids in pipeline order in `analytics.yml`* — robust, but the ids are UUIDs that do not exist yet, so the config cannot be authored ahead of the rollout, and it edges back toward restating the vocabulary (FR-010). Rejected.

---

## R-006: The GemeenteDelers layer

**Decision**: GD initiatives keep resolving from their callout tags, but resolve against the **labels of the designated vocabulary** (case-insensitive, trimmed) instead of against a configured keyword list. No GD-specific configuration is introduced.

**Rationale**: This resolves a real tension between FR-020 ("GD retains its current tag-derived behaviour") and FR-011 ("retire the keyword lists"). GD initiatives are **Callouts**, not Spaces: introspection confirms `Callout` carries only the older `classification: Classification` (a tagset holder) and *not* `SpaceAbout`'s `classifications: [ClassificationEntry!]!`. So the new model is simply unavailable to them, and FR-020 already puts them out of scope.

The insight that removes the tension: today's `tag_category_mapping` maps Dutch theme labels ("cloud", "data", "artificiële intelligentie") to internal category keys. Once categories come from the vocabulary, the vocabulary's own labels *are* those Dutch theme labels — so matching a GD tag against vocabulary labels is very nearly the identity function the keyword list was encoding. GD keeps its behaviour, the keyword list still dies, and no operator has to maintain a second mapping.

It is honest about what it is: label matching, with all the fragility that implies — but applied *only* to the layer the spec explicitly declares tag-derived and separately attributed, never to a Space.

**Alternatives considered**:
- *Keep `tag_category_mapping` for the GD layer only* — directly contradicts FR-011 and leaves two mapping systems alive. Rejected.
- *A new `gd_tag_value_map` of tag → value id* — the ids do not exist until the rollout runs, so it cannot be authored, and it is a keyword list by another name. Rejected.
- *Drop GD from the theme charts entirely (all GD into "no classification")* — simplest, and defensible given most GD initiatives already land uncategorised, but it is a visible behaviour change the spec did not ask for (FR-020). Rejected in favour of preserving behaviour.

---

## R-007: What happens to `tag_category_mapping`

**Decision**: Delete it from `analytics.yml`, from `DashboardAppConfig`, and from every call site, in the same change. Replace it with a three-key `classifications:` designation block per dashboard. No deprecation window, no dual-read.

**Rationale**: FR-011 requires the dashboard to *"start and operate correctly with no such lists configured"*. A dual-read period would mean a space could be counted by classification in one panel and by tag in another depending on config state — precisely the silent mixing of two data qualities the rollout decision (no tag fallback) exists to prevent. The config is operator-owned and small (two blocks of twelve lines), the parser applies defaults for absent blocks, and nothing outside this repo reads it.

Both `nds` and `vng2030` designations are what a dashboard *names*; the values inside them come from Alkemio. GovTech's block stays a copy of VNG's, preserving the "seeded from VNG, operator-editable to diverge" arrangement from feature 017.

**Alternatives considered**:
- *Keep the mapping as a fallback when a space is unclassified* — this is the tag fallback the author explicitly rejected in the spec's Clarifications. Rejected.
- *Deprecate over one release* — see above; the transitional state is worse than either end state. Rejected.

---

## R-008: Not serving pre-change cached results

**Decision**: Bump `CACHE_MAINTENANCE_VERSION` from 1 to 2 and add a step that clears cached graph datasets, so each environment recomputes once on first boot after deploy.

**Rationale**: FR-019 requires that no pre-change cached data is presented as classification-derived. Cached `GraphDataset` rows carry `ndsCategories` / `vng2030Categories` on their nodes, computed from tags, and the graph cache TTL is 24h (the GD subgraph's is 168h) — so without an explicit clear, a user could see tag-derived category chips in the Initiatives table next to classification-derived charts for up to a week.

The mechanism already exists and is precisely shaped for this: `runDeploymentCacheMaintenance()` uses SQLite's `user_version` as a per-DB-file marker so a numbered step runs at most once per environment, even across restarts and replicas. Feature 016's GD-image fix used it as step 1; this is step 2. Spec assumption A-008 already grants that a one-off recomputation is acceptable.

**Alternatives considered**:
- *Let the TTL expire naturally* — up to 168h of mixed-provenance data. Rejected.
- *Add a schema version to each cached dataset and invalidate on mismatch* — more general and more machinery than one deploy needs; the existing `user_version` step does the job. Rejected for now.
- *Require operators to clear the cache manually* — unreliable across three environments. Rejected.
