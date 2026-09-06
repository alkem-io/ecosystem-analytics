# Quickstart: VNG Innovation Funnel View

**Feature**: 022-vng-funnel-view | **Date**: 2026-09-05

## Run it

```bash
pnpm install                 # repo root — pnpm workspace
pnpm run dev                 # BFF :4000 + Explorer :5173 + VNG :5174 + GovTech :5175
```

Open **http://localhost:5174** (VNG), sign in through Alkemio, pick the `vnginnovationhub` hub, and
open the **Funnel** tab. Turn **"include GemeenteDelers initiatives"** on in the left-hand selection
panel to populate the mouth stage.

Server config that matters (`server/analytics.yml`, overridable per environment):

```yaml
vng:
  classifications:
    phase: ${VNG_CLASSIFICATION_PHASE}:Fase    # drives the funnel's stages
```

Point that at a classification that does not exist and the funnel renders FR-025's empty state — which
is itself worth seeing once.

## Verify it

```bash
cd server && pnpm run test          # includes graph-service.phase.test.ts
cd frontend && pnpm run test        # includes funnel.test.ts, initiatives.test.ts
cd server && pnpm exec tsc --noEmit
cd frontend/shared && pnpm exec tsc --noEmit
cd frontend/vng && pnpm exec tsc --noEmit
```

`funnel.test.ts` is the real safety net: it asserts the ten invariants in
[contracts/funnel-layout.md](./contracts/funnel-layout.md) over generated inputs. It asserts **no dot
coordinates** — placement is simulation-settled and not reproducible (spec A-012). If you find
yourself writing `expect(dot.x).toBe(...)`, you are testing the wrong thing.

Visual regression covers the funnel **frame only** (stages, bounding bars, labels, money/effort ramp);
the dot layer is excluded.

## Walk the acceptance scenarios

| Check | Expect | Requirement |
|---|---|---|
| Open the tab with GD **off** | Six stages drawn, mouth labelled and empty, dots only in phase stages | FR-003, FR-022b |
| Turn GD **on** | ~305 dots fill the mouth — and **every dot in every stage gets smaller**, because the mouth now sets the global scale | FR-022a, FR-012b |
| Compare a Groei and a GD dot with the same gemeente count | Identical radius, in different stages | FR-012a, I-5 |
| Find the largest initiative | Largest dot anywhere in the funnel | FR-012, SC-006 |
| Hover any dot | Name, source, gemeente count, phase, classifications; empty dimensions shown as empty, not omitted | FR-018, FR-019 |
| Tab to a dot | Same detail as hover | FR-021 |
| Look for unphased Groei initiatives | A labelled area **outside** the curves, same dot sizing and colours | FR-024, FR-024a/b |
| Resize from widest to narrowest supported width | Whole funnel stays visible; nothing clipped, no scrollbar on the funnel | FR-006, SC-004 |
| Cross-check the Dashboard tab's phase chart | Per-phase counts identical | FR-023 |
| Cross-check the Initiatives tab | Row count equals total dot count | FR-017, SC-002 |
| Rename a phase value in Alkemio and reload | Stage renamed, order preserved, drift notice shown | FR-002a, FR-026 |

## Gotchas

- **The funnel is screen-only.** It is deliberately absent from the XLSX export (FR-031). If you are
  looking for it there, that is the spec, not a bug.
- **Dots move between reloads.** Expected — relaxation, not a bug (A-012).
- **Turning GD on shrinks everything.** Expected — one global scale fitted to the densest stage
  (FR-012b). It is the visible cost of dot size meaning one thing everywhere.
- **`node.phase` is undefined, never `'unknown'`.** Absence is what routes a row to the holding area.
- **No cache bump needed.** Phase enrichment runs post-cache, so cached spaces pick it up on read. If
  the funnel looks unphased after pulling this branch, the cause is a wrong `phase` designation, not a
  stale cache.
