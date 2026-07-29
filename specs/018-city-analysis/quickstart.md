# Quickstart: City-perspective analysis (018)

**Feature**: 018-city-analysis | **Branch**: `018-city-analysis`

How to run the feature locally and verify each acceptance story. No new environment variables, no new services, no data generation step — the population and province data is already committed.

---

## 0. Prerequisites

> **This macOS host cannot run `tsc`, `vitest`, `vite`, or `tsx`** (Linux-only native dependencies). Run everything below **in the devcontainer**.

```bash
pnpm install                 # workspace root
pnpm run dev                 # BFF + all SPAs concurrently
```

The VNG dashboard is at **http://localhost:5174** (proxying `/api` → the BFF on :4100 by default; override with `VITE_PROXY_TARGET` in `frontend/vng/.env`).

Sign in with Alkemio credentials, then in the left selection panel pick a hub and one or more initiatives. Everything below assumes a non-empty selection.

---

## 1. Verify US1 — the Cities table

Open the **Gemeenten / Cities** tab.

| Check | Expected |
|---|---|
| Row count | One row per city connected to the selection; the count in the top-right matches the visible rows. |
| No duplicates | Each city name (with its province) appears once. |
| Sort by initiatives ↓ | The most-connected city is first; clicking again reverses. |
| Province filter | Narrows rows; the header count updates; each option shows its own match count. |
| Search | Typing part of a city name narrows the list. |
| Initiative names | Hovering the initiative-count cell lists the initiative names (mirrors the Initiatives tab's gemeente tooltip). |
| GD toggle | Turning "include GemeenteDelers initiatives" on raises counts and adds GD-typed initiatives to the tooltip. |
| No results | A filter combination matching nothing shows the "no results" message, not an empty table. |

**Cross-check (FR-028)**: pick a city, note its initiative count, then open the **Initiatieven** tab and count the rows whose gemeente tooltip lists that city. The two must be equal.

---

## 2. Verify US2 — the City information tab

Open the **Gemeente informatie / City information** tab.

| Check | Expected |
|---|---|
| Default selection | The alphabetically first city in the selection is shown; the picker shows `(N)` initiative counts. |
| Population & province | Shown for all 342 registry municipalities. The "unknown" marker is a defensive path — with today's data every gemeente that can appear as a node has a population, so you should not normally see it. It must **never** render as `0`. |
| Map | The city is pinned at its geo-location. |
| **Constitution §VII regression check** | **Only the Netherlands is rendered** — map tiles clipped to the NL boundary, everything outside plain white. No Belgium, Germany, England, or open sea. This is a hard requirement; a failure here blocks the change. |
| Initiative list | Every initiative the city participates in, with classifications, Groei vs GD distinguished. Count matches the Cities table row. |
| Navigation from the table | Choosing a city in the Cities tab opens this tab with that city selected. |
| Navigation from an initiative | In **Initiatief informatie**, choosing a gemeente from the avatar grid opens this tab with that city selected. |

---

## 3. Verify US3 — the population chart

Open the **Dashboard** tab and scroll to the population × initiatives chart.

| Check | Expected |
|---|---|
| Two series | Participating cities (filled) and non-participating municipalities at zero initiatives (small, muted, hollow), with a legend distinguishing them. |
| Tooltip | Hover a point → city name, population, initiative count. Keyboard focus does the same. |
| Excluded count | Stated only when non-zero. **Expect it to be absent**: all 342 registry municipalities have a population, so the count is 0 today. (Brugge and Gent carry no `alkemioNameId`, so they are not in the registry set at all — they are not the "2 excluded" an earlier draft of this file predicted.) |
| Point counts | The legend states both series sizes; they must sum to 342 minus any excluded. |
| Legibility (FR-024) | Measured from the real data: populations run **972 → 941 927**, just under 3 orders of magnitude. On a linear axis **89% of municipalities (306/342) fall in the leftmost 10%** of the plot; on the log axis that drops to **1% (3/342)**. If the small end looks crowded, the log scale has regressed. |
| Cross-check | A point's initiative count equals that city's Cities-table row. |
| Export | "Download XLSX" produces a workbook whose data sheet contains the per-city population and initiative-count rows, and whose charts sheet includes the new chart image. |
| Empty selection | Clearing the selection shows the standard "nothing selected" message, not a broken chart. |

---

## 3b. Automated UI verification (no Alkemio login needed)

`tests/vng-city-perspective.spec.mjs` drives the real VNG dashboard with the BFF mocked at
the network layer, so most of §1–§3 above is checked automatically:

```bash
pnpm -C frontend/vng start     # :5174, in one terminal
pnpm run test:visual           # in another — the spec runs; without the server it SKIPS
```

It asserts the six tabs and their order, one row per gemeente with no duplicates,
descending default sort, the province filter narrowing rows, the City-information map
rendering, **both** cross-tab bridges opening the *requested* entity, both chart series
being plotted with every municipality accounted for, app-locale number formatting in the
tooltip, and no raw i18n key in either language.

Fixtures (`tests/fixtures/vng-city-fixtures.json`) were generated by the real server
assembly over the real 342-municipality registry, so the payload matches production. To
regenerate after a data or shape change, write a short `tsx` script under `server/` that
imports `loadVngRegistry()` and `buildCityPopulationSeries()`, synthesises a
`GraphDataset`, and writes the same JSON shape (`{dataset, dashboard, hubs, hubSpaces, me}`).

What this does **not** cover, and §2 still must: real map tiles (the harness blocks
external PNGs, so only the clipped NL outline renders) and real avatars.

## 4. Automated gates

Run in the devcontainer before pushing:

```bash
# Server — the aggregation rule and the series assembly
pnpm -C server test
pnpm -C server exec tsc --noEmit

# VNG frontend — the mirrored aggregation test (VNG's first frontend tests)
pnpm -C frontend/vng test
pnpm -C frontend/vng run typecheck:native

# GovTech inherits the shared shell — typecheck it too
pnpm -C frontend/govtech run typecheck:native
pnpm -C frontend/ecosystem-analytics run typecheck:native
```

The two aggregation tests (`server/src/services/vng-cities.test.ts` and `frontend/vng/src/dashboard/cities.test.ts`) share one fixture and one expected-count table — see [contracts/city-aggregation.md](./contracts/city-aggregation.md). **If you change the counting rule, both must change together.**

`pnpm run codegen` is **not** needed — this feature adds no GraphQL.

---

## 5. Manual regression sweep

Because the shared dashboard shell changed from four tabs to six:

- [ ] All four original tabs still render and keep their behaviour.
- [ ] Graph-node click → **Initiatief informatie** still works (the existing `openSpace` bridge).
- [ ] **GovTech** (http://localhost:5175) renders the two new tabs with **translated** labels in both `nl` and `en` — no raw i18n keys anywhere.
- [ ] Language switcher toggles every new string in both apps.
- [ ] The GraphTab map still renders the Netherlands only (§VII).

---

## 6. Where things live

| What | Where |
|---|---|
| The counting rule (normative) | `specs/018-city-analysis/contracts/city-aggregation.md` |
| Frontend aggregation | `frontend/shared/src/dashboard/utils/cities.ts` |
| Server aggregation + series | `server/src/services/vng-dashboard-service.ts` |
| New tabs | `frontend/shared/src/dashboard/pages/{CitiesTab,CityDetailsTab}.tsx` |
| New chart | `frontend/shared/src/dashboard/components/charts/CityPopulationChart.tsx` |
| Tab registration | `frontend/shared/src/dashboard/App.tsx` (`TabKey` / `TABS`) |
| Translations | `frontend/{vng,govtech}/src/i18n/{nl,en}.json` |
| Population source data | `server/src/data/nl/municipality-facts.json` (already committed) |
