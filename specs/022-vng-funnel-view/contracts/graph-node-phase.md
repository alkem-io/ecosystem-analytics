# Contract: `GraphNode.phase`

**Feature**: 022-vng-funnel-view | **Module**: `server/src/types/graph.ts`,
`server/src/services/graph-service.ts`

The one server-side change. Additive and optional, so every existing consumer is unaffected.

## Shape

```ts
export interface NodePhase {
  key: string;    // ClassificationValue.id — stable, comparable across spaces
  label: string;  // authored in Alkemio, rendered verbatim
  nr: number;     // index in the vocabulary's AUTHORED order (ordering hint only)
}

// on GraphNode:
phase?: NodePhase;
```

## Resolution

Computed in the existing post-cache enrichment loop in `graph-service.ts`, in the same pass and from
the same `designations` object that already produces `ndsCategories` and `vng2030Categories`:

1. `resolveDesignated(node.classificationEntries, designations.phase)` — the app's designated phase
   classification, matched on `displayLabel`, case- and whitespace-insensitively.
2. `selectionOf(...)` — the `ClassificationValue.id`s the space has selected.
3. Of those, take the one with the **highest index** in the union vocabulary's authored order —
   "furthest along wins", identical to `countGroeiPhases` in `services/groei-phases.ts`.
4. Emit `{ key, label, nr }`. No selection, or no designated classification ⇒ leave `phase` undefined.

The union vocabulary is the one already built in that loop for the other dimensions (per-space
snapshots unioned, so a selection straddling template versions stays renderable — feature 020 R-003).

## Rules

- **Set only on `SPACE_L0` / `SPACE_L1` / `SPACE_L2` nodes.** Never on an `INITIATIVE` (GD) node: GD
  is a completed programme with no phase (spec A-005), and it is tag-derived by design.
- **Never tag-derived.** A `phase` keyword in a profile's tags MUST NOT produce a `phase` — that is
  the precise defect feature 020 removed. Classification selection is the only input.
- **Undefined, never a sentinel.** No `'unknown'` key, no empty string. The absence is the signal that
  routes an initiative to the funnel's holding area (FR-024).
- **Not logged.** Nothing new is written to logs (Constitution IV).

## Consistency requirement

`node.phase.key` for a space MUST equal the phase bucket `countGroeiPhases` places that same space in,
for the same selection and the same designation. Both now derive from the same designation resolution,
so this follows from a shared upstream rather than from two implementations agreeing by luck — and it
is what makes FR-023 hold between the funnel and `PhaseDistributionChart`.

Pinned by mirrored tests, the discipline already used for the city rule
(`vng-cities.test.ts` ↔ `cities.test.ts`):

- `server/src/services/graph-service.phase.test.ts` — enrichment sets the furthest-along value; absent
  when nothing is selected; never set on GD nodes; never tag-derived.
- `frontend/shared/src/dashboard/utils/initiatives.test.ts` — `buildInitiativeRows` carries the phase
  through unchanged and yields `null` for every GD row.

## Cache and compatibility

- **No schema change, no `CACHE_MAINTENANCE_VERSION` bump.** Enrichment runs post-cache on every read,
  and cached rows keep `classificationEntries`, so existing entries gain `phase` on their next read.
- `classificationEntries` remains internal and is still deleted before the dataset leaves the server.
- Optional field ⇒ no existing consumer breaks; the Explorer, which sends no `app`, falls back to the
  VNG designations exactly as it already does for the other dimensions.
