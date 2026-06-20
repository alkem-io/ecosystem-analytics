# Contract: VNG snapshot registry & generator

**Feature**: 016-vng-frontend | A build-time generated, committed dataset that lets the BFF identify gemeentes and resolve GD initiative tags without a runtime dependency on the `vng-gemeente-delers` repo (research D6).

---

## Artifacts (committed, in `server/src/data/vng/`)

### `municipalities.json`

```jsonc
[
  { "slug": "groningen", "title": "Groningen", "alkemioNameId": "gemeente-groningen", "cbsCode": "GM0014" }
]
```
- ~342 entries. `alkemioNameId` MUST be present for every entry used in GD gemeente resolution; entries missing it are skipped for edge-building but may still serve gemeente identification by `slug`/`title`.

### `themes.json`

```jsonc
[
  { "slug": "energietransitie", "title": "Energietransitie", "priorLabels": [] }
]
```
- ~92 entries. `slug` is the canonical theme identity (`THEME` node id = `theme:<slug>`).

### `meta.json` (provenance)

```jsonc
{
  "generatedFrom": "vng-gemeente-delers",
  "municipalityCount": 342,
  "themeCount": 92,
  "initiativeCountAtGeneration": 305,
  "programme": { "name": "GemeenteDelers", "years": "2021–2025", "sourceUrl": "https://vng.nl/praktijkvoorbeelden" }
}
```
- Feeds the UI provenance note (FR-047) so the "~305 / 2021–2025 / vng.nl" copy is data-driven, not hard-coded.

---

## Generator: `server/scripts/generate-vng-snapshot.mts`

**Input**: path to a local `vng-gemeente-delers` checkout (default `../vng-gemeente-delers`, overridable by arg/env).

**Reads**:
- `vault/municipalities/*.md` frontmatter → `{ slug=basename, title, alkemioNameId=alkemio_nameid, cbsCode=cbs_code }` (skips helper files like `_logo-comparison.md`).
- `vault/gemeentedelers/themes/*.md` frontmatter → `{ slug=basename, title (or vng_label), priorLabels=vng_prior_labels }`.
- `vault/gemeentedelers/initiatives/**/*.md` count → `meta.initiativeCountAtGeneration`.

**Writes**: the three JSON files above (stable sort by `slug`, deterministic output for clean diffs).

**Run**: `pnpm -C server run gen:vng-snapshot` (script wraps `tsx scripts/generate-vng-snapshot.mts`). Re-run when the municipality/theme set changes; the regenerated JSON is committed (a **data** change, no logic change — FR-033).

**Constraints**: contains only public reference data (no tokens, no user data); deterministic; failures (missing vault path) exit non-zero with a clear message and do **not** overwrite existing snapshots.

---

## Consumption (server)

| Consumer | Uses | For |
|----------|------|-----|
| gemeente identification | `municipalities[].alkemioNameId` (+ `title`) | set `ORGANIZATION.isGemeente`; show/hide toggle (FR-032/034) |
| `transform/initiatives.ts` | `municipalities[].title → alkemioNameId`; `themes[].title/priorLabels → slug` | resolve Callout tags → INITIATIVE_GEMEENTE / INITIATIVE_THEME edges (FR-040/041) |
| provenance note | `meta.json` | FR-047 copy/link |

Matching is case-folded/trimmed exact match against `title` (∪ `priorLabels` for themes). Unmatched tags become initiative metadata, not edges.
