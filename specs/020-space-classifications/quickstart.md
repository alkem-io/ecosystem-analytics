# Quickstart: Dashboards read Space Classifications instead of tags

**Feature**: 020-space-classifications | **Branch**: `020-space-classifications`

## 0. Prerequisite outside this repo

The classification programme must author, per candidate Space, the classifications the dashboards designate. Two expectations this feature depends on:

1. **Labels**: the designated groups' `displayLabel`s must match `analytics.yml` (defaults `NDS`, `VNG 2030`, `Groeifase`) — or the config must be changed to match them.
2. **Phase order**: the phase classification's values must be authored in **pipeline order** (pre-intake → intake → initiatief → formalisatie → beheer). The chart's x-axis reads that authored order directly (research R-005) and nothing in the data can detect an alphabetical authoring mistake.

Until spaces are classified, the dashboards run correctly and show everything in the "no classification" bucket with the FR-016 notice. That is the intended rollout state, not a bug.

## 1. Regenerate the GraphQL SDK

`server/src/graphql/generated/` predates `SpaceAbout.classifications`, so codegen is the first task and nothing else compiles without it.

```bash
cd server
# ALKEMIO_GRAPHQL_ENDPOINT must point at an environment that has the field
# (both alkem.io and acc-alkem.io do, verified 2026-09-01)
pnpm run codegen
git add src/graphql/generated   # generated files are committed (Constitution II)
```

Sanity check that the field arrived:

```bash
grep -n "ClassificationEntry" server/src/graphql/generated/graphql.ts | head
```

## 2. Configure

Nothing is required for local dev — `analytics.yml` ships working defaults. To point a dashboard at differently-named classifications:

```bash
# server/.env
VNG_CLASSIFICATION_NDS="NDS"
VNG_CLASSIFICATION_VNG2030="VNG 2030"
VNG_CLASSIFICATION_PHASE="Groeifase"
```

See [contracts/config-designation.md](./contracts/config-designation.md). Note that `tag_category_mapping` is gone — if a deployment still sets it, it is ignored.

### Pre-flight: what are the real labels?

Before deploying, confirm the designations against live data. This prints every classification on a space with its vocabulary:

```bash
curl -s -X POST "$ALKEMIO_GRAPHQL_ENDPOINT" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"query{lookupByName{space(NAMEID:\"<space-nameid>\"){about{classifications{displayLabel cardinality sortOrder display values{id label} selectedValues{id label}}}}}}"}' \
  | python3 -m json.tool
```

An empty `classifications: []` means the programme has not reached that space yet.

## 3. Run

```bash
pnpm run dev          # from the repo root — BFF + Explorer :5173 + VNG :5174 + GovTech :5175
```

On first boot after this change the BFF clears cached graph datasets once per database file (`CACHE_MAINTENANCE_VERSION` 1 → 2, research R-008). Expect the first dashboard load to be a cold generation; subsequent loads are cached as before.

## 4. Verify, by user story

### US1 — theme charts count the classification

1. Open the VNG dashboard, select a set of spaces including at least one classified space.
2. Each classified space appears under its selected value(s) and nowhere else.
3. Hover a bar: the tooltip names the expected initiatives.
4. **The decisive check** — find a space whose free-text tags disagree with its classification. It must be counted by the classification (spec US1 scenario 4). If it follows the tag, `assembleDashboard` is still reading tagsets.

### US2 — categories come from the vocabulary

1. Add a value to a designated classification's template in Alkemio.
2. Reload the dashboard with **no config change and no restart**.
3. The new category renders at count 0, in authored order.
4. Then check the negative: remove the whole `classifications:` block from `analytics.yml`, restart, and confirm the server boots, the charts render, and a warning names each unmatched designation.

### US3 — growth phase

1. Select initiatives at different phases; each appears at exactly one phase.
2. Find an initiative whose profile still carries an obsolete phase keyword tag but whose classification says otherwise — it must sit where the classification says (spec US3 scenario 2).
3. With no phase selections anywhere in the selection, the phase chart is absent, not empty.

### US4 — the rollout gap is visible

1. Select a mix of classified and unclassified spaces.
2. The notice reports exactly the number of unclassified spaces.
3. Hover the "no classification" bar — it names them, so an editor knows what to go and classify.
4. A space that is classified but has selected nothing must appear in the bar but **not** in the notice count (invariant I-8).

### US5 — details view

1. Open a classified space's details: groups appear with labels and selected values, separate from its keyword tags.
2. A group with `display: false` is hidden here but still counted in its chart (invariant I-7).
3. A space with no classifications renders no empty section.

## 5. Tests

```bash
cd server && pnpm run test         # classifications transform, counting, phases, dashboard route
cd frontend && pnpm run test       # chart labelling, Initiatives filters
pnpm run test:visual
```

Visual snapshots will drift wherever a category label string changed. Confirm the new labels are the ones Alkemio authored, then `pnpm run test:visual:update`.

Type checking must pass across all packages (Constitution, Development Workflow):

```bash
cd server && pnpm exec tsc --noEmit
cd frontend/shared && pnpm exec tsc --noEmit
cd frontend/vng && pnpm exec tsc --noEmit
cd frontend/govtech && pnpm exec tsc --noEmit
cd frontend/ecosystem-analytics && pnpm exec tsc --noEmit
```

## 6. Explorer regression check

The Explorer (`:5173`) must be untouched by this feature (FR-003, invariant I-10). Confirm its tag chips in the details drawer, the "Shared Tags" chord mode, and the treemap/sunburst tag tooltips all still work — they read `node.tags`, which this feature does not change.
