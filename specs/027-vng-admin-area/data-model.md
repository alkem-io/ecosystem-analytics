# Data Model: VNG Dashboard Administration Area

**Feature**: 027-vng-admin-area · decisions in [research.md](./research.md)

Shared types go in `server/src/types/admin.ts` and `server/src/types/access.ts`. Both must stay
self-contained (the 026 boundary test: no `..` imports).

---

## Access (extends feature 026)

### GateLink

A Space as shown to people.

| Field | Type | Notes |
|---|---|---|
| `key` | string | path, e.g. `programmagroei` |
| `displayName` | string | probe name, else configured fallback, else last path segment |
| `url` | string | Alkemio URL |
| `exists` | `'yes' \| 'no' \| 'unknown'` | from the anonymous probe |

### AccessSets (replaces the single `gate` in `AccessConfig.apps[app]`)

| Field | Type | Rule |
|---|---|---|
| `viewers` | `GateRef[]` | non-empty, or `null` when the app is `none` (ungated) |
| `admins` | `GateRef[]` | may be empty: no one can manage |
| `setKey` | string | `v:<sorted viewer keys>\|a:<sorted admin keys>`. Stored as `access_decisions.gate_key` |

The config is invalid, and start-up stops, if the viewer value is missing or empty, if any entry
does not parse (026 `parseGateRef`), if a key is duplicated within a set, or if an admin set is
given for an app whose viewer value is `none`.

### Level rule (`levelFromSets`)

`manage` if `ADMIN ∈ roles(s)` for some admin Space `s`; else `read` if `MEMBER ∈ roles(s)` for
some viewer Space `s`; else `none`. Outcome combination (`unverified`): research R1.

### AccessReport (changed)

`gate: GateLink | null` → `viewerSpaces: GateLink[]` (empty when ungated). The other fields are
unchanged. `level: 'manage'` is what the SPA uses to show the settings entry.

---

## Monitor settings (new, `server/src/settings/`, own tables in the single application SQLite file)

### settings_meta

| Column | Type | Notes |
|---|---|---|
| `schema_version` | INTEGER | single row; migrations step it |

### settings_state

A single row, `id = 1`.

| Column | Type | Notes |
|---|---|---|
| `revision` | INTEGER NOT NULL | +1 on every change. The row is absent until seeded |
| `ecosystem_key` | TEXT NOT NULL | the orchestrator key for the Ecosystem tab (`vih-test` in the first seed) |
| `updated_at` | TEXT (ISO) | |
| `updated_by_user_id` | TEXT NULL | NULL for a seed |
| `updated_by_name` | TEXT NULL | |

### included_spaces

| Column | Type | Notes |
|---|---|---|
| `position` | INTEGER NOT NULL | 0-based order; PK |
| `name_id` | TEXT NOT NULL UNIQUE | what the loader uses |
| `space_id` | TEXT NULL UNIQUE | Alkemio UUID once resolved (R8) |

Replaced as a whole in one transaction on every save. Rule: every row is a **top-level** Space,
checked when added (R14).

### settings_changes (append-only)

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `revision` | INTEGER NOT NULL | the revision this change produced |
| `kind` | TEXT CHECK IN (`seed`,`update`,`rename`) | |
| `at` | TEXT (ISO) NOT NULL | |
| `actor_user_id` | TEXT NULL | NULL for `seed` |
| `actor_name` | TEXT NULL | |
| `added_json` | TEXT NOT NULL | `string[]` nameIDs |
| `removed_json` | TEXT NOT NULL | `string[]` nameIDs |
| `note` | TEXT NULL | e.g. `"from starting set v1"`, `"renamed old→new"` |

### classification_changes (append-only)

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `at` | TEXT (ISO) NOT NULL | |
| `actor_user_id` / `actor_name` | TEXT NOT NULL | |
| `space_name_id` | TEXT NOT NULL | the initiative |
| `entry_id` / `entry_label` | TEXT NOT NULL | the classification |
| `from_json` / `to_json` | TEXT NOT NULL | `{id,label}[]` |

None of these tables contains tokens, session ids or Space content beyond nameIDs and the actor's
name.

### Lifecycle

```
(no file / empty store) ──start-up──▶ seeded (revision 1, kind=seed) ──save──▶ revision n+1 (kind=update)
                                                         └─ lookup finds a rename ──▶ revision n+1 (kind=rename)
```

A store that holds `settings_state` is **never** re-seeded, whatever the starting set says.

### StartingSet (`server/src/data/vng/monitor-settings.seed.json`)

```json
{
  "version": 1,
  "ecosystemKey": "vih-test",
  "includedSpaces": ["<nameID>", "…"]
}
```

| Rule | Failure |
|---|---|
| `version === 1` | start-up stops |
| `ecosystemKey` is a non-empty nameID | start-up stops |
| `includedSpaces` holds unique, non-empty nameIDs, at most `max_spaces_per_query` | start-up stops |
| an empty `includedSpaces` is valid | allowed, and a warning is logged: the monitor would start with no initiatives |

---

## Admin read models (API only, not stored)

| Model | Fields |
|---|---|
| `IncludedSpaceView` | `nameId`, `spaceId \| null`, `position`, `displayName \| null`, `url \| null`, `readable: boolean`, `found: boolean`, `classificationStatus: {set: number, designated: number} \| null` |
| `SettingsChangeView` | `revision`, `kind`, `at`, `actorName \| null`, `added: string[]`, `removed: string[]`, `note \| null` |
| `InitiativeRef` | `nameId`, `displayName`, `kind: 'included' \| 'gd-subspace' \| 'gd-post'` |
| `DesignatedClassificationView` | `key: 'nds'\|'vng2030'\|'phase'\|'trl'`, `label`, `present: boolean`, `entryId \| null`, `cardinality: 'SINGLE_SELECT'\|'MULTI_SELECT' \| null`, `values: {id,label}[]`, `selectedValueIds: string[]` |
| `InitiativeClassificationsView` | `initiative: InitiativeRef & {url}`, `canEdit: boolean`, `reason: null \| 'NO_UPDATE_RIGHT' \| 'GD_POST' \| 'NOT_READABLE'`, `classifications: DesignatedClassificationView[]` |
| `GdSourceSummaryView` | `space: {displayName, url} \| null`, `available: boolean`, `error \| null`, `total`, `viaSubspaces`, `viaPosts`, `initiatives: {nameId, displayName, source}[]`, `superseded: {postNameId, subspaceNameId, subspaceDisplayName \| null, subspaceUrl \| null, rule}[]`, `ambiguous: string[] \| null`, `readAt \| null`, `nextRefreshAt \| null`, `migrationComplete: boolean` |
| `MonitorScope` | the viewer-facing `GET /api/vng/scope`: `revision`, `ecosystemKey`, `spaceNameIds: string[]` |

## Changes to existing models

| Model | Change |
|---|---|
| `GdSubgraph` (cache row, `graph-service.ts`) | + `ambiguous`; `sources.superseded[]` + `subspaceDisplayName`, `subspaceUrl` |
| `gdLayer` | carries `readAt`/`expiresAt` from the cache entry |
| Old rows | lack the new fields; read as `null`, no cache bump |
| `DashboardAppConfig` (frontend) | + `flags.managedScope` (VNG on, GovTech off) |
| `SelectionState` (`useSelectedSpaces`) | unchanged shape. With `managedScope`, `hubSpaceIds` ← scope, `directAdded` ignored and cleared |
