# Contract: Monitor scope and admin API

**Feature**: 027-vng-admin-area · types in [../data-model.md](../data-model.md)

Every route requires a session (401 `UNAUTHORIZED` without one). Every path names `vng`, so the
026 app-level gate applies first.

| Route | Required level | Fresh check (R4) |
|---|---|---|
| `GET /api/vng/scope` | read | no |
| `GET /api/vng/admin/*` | manage | no |
| `PUT /api/vng/admin/*` | manage | **yes** |

Below that, a refusal is 403 `ACCESS_DENIED` (026 shape). Alkemio auth errors invalidate the
session and return 401 as elsewhere. Unexpected failures return 502 `{error, message}` per section,
and never take down another section's endpoint.

---

## 1. `GET /api/vng/scope`: what the dashboard reports on

**200** `{ "revision": 7, "ecosystemKey": "vih-test", "spaceNameIds": ["…", "…"] }`

This is read from the settings store only. It never calls Alkemio, so it works even when Alkemio
is slow. It replaces `/api/hubs` for VNG.

## 2. `GET /api/vng/admin/access`

**200**

```json
{
  "viewers": [GateLink], "admins": [GateLink],
  "me": { "displayName": "…", "viewer": true, "manager": true }
}
```

`GateLink.exists: "no"` renders as "not found" with `key` (FR-010).

## 3. Included Spaces

### `GET /api/vng/admin/included-spaces`

**200**

```json
{
  "revision": 7,
  "spaces": [IncludedSpaceView],
  "lastChange": SettingsChangeView | null
}
```

Each Space is resolved with the **manager's** token. A Space the manager can't read gets
`readable: false` with `displayName/url: null`, and only its `nameId` is shown. A Space that is
gone gets `found: false`.

### `GET /api/vng/admin/included-spaces/history?limit=50&before=<revision>`

**200** `{ "changes": [SettingsChangeView], "next": <revision> | null }`, newest first.

### `PUT /api/vng/admin/included-spaces`

```json
{ "baseRevision": 7, "spaceNameIds": ["a", "b"], "confirmEmpty": false }
```

| Result | When |
|---|---|
| **200** `{ revision, spaces, lastChange }` | saved |
| **409** `{ error: "REVISION_CONFLICT", current: { revision, spaces, lastChange } }` | `baseRevision` ≠ the current revision |
| **422** `{ error: "EMPTY_NOT_CONFIRMED" }` | empty list without `confirmEmpty: true` |
| **422** `{ error: "INVALID_SPACES", problems: [{ nameId, problem: "NOT_READABLE" \| "NOT_TOP_LEVEL" \| "DUPLICATE" \| "TOO_MANY" }] }` | any **added** Space fails its check with the manager's token. Spaces already in the set are not re-checked, so a manager can keep or remove a Space they can no longer read |

Saved changes are effective for every viewer's next `GET /api/vng/scope`.

## 4. Finding a Space to add

### `GET /api/vng/admin/space-search?q=<text>`

`q` must be ≥ 2 characters. The search runs with the manager's token, top-level Spaces only, up to
20 results.

**200** `{ "results": [{ "nameId", "displayName", "url", "included": boolean }] }`

### `GET /api/vng/admin/space-resolve?ref=<url or nameID>`

**200** `{ "space": { "nameId", "displayName", "url", "included" } }`

| Status | Body |
|---|---|
| 422 | `{ error: "NOT_TOP_LEVEL" }` |
| 404 | `{ error: "NOT_READABLE" }`. Not found and not readable are deliberately the same answer |
| 422 | `{ error: "UNPARSEABLE" }` |

## 5. Initiatives

### `GET /api/vng/admin/initiatives?q=<text>`

**200** `{ "initiatives": [InitiativeRef] }`. These are the Included Spaces plus GD initiatives
(subspaces and posts), from the manager's own cached data where available. With no `q`, the
first 50 are returned in display-name order.

## 6. Classifications

### `GET /api/vng/admin/initiatives/:nameId/classifications`

**200** `InitiativeClassificationsView`. The designated set is NDS, VNG 2030, phase and TRL, by
the `config.dashboards.vng.classifications` labels.

| Case | `canEdit` | `reason` |
|---|---|---|
| `UPDATE` in `about.authorization.myPrivileges` | true | null |
| readable, no update right | false | `NO_UPDATE_RIGHT` |
| GD post | false | `GD_POST` (empty `classifications`) |
| not readable | 404 `{ error: "NOT_READABLE" }` | |

### `PUT /api/vng/admin/initiatives/:nameId/classifications`

```json
{ "changes": [ { "entryId": "…", "expectedSelectedValueIds": ["…"], "selectedValueIds": ["…"] } ] }
```

Each entry is applied in order. Before each write, the entry is re-read with the manager's token.

**200**

```json
{
  "results": [ { "entryId", "outcome": "SAVED" | "CHANGED_ON_ALKEMIO" | "VALUE_REMOVED" | "NOT_PERMITTED" | "FAILED", "current": DesignatedClassificationView } ],
  "classifications": InitiativeClassificationsView
}
```

| Outcome | Meaning |
|---|---|
| `SAVED` | the change was written |
| `CHANGED_ON_ALKEMIO` | the re-read entry no longer matches the expected selection |
| `VALUE_REMOVED` | a selected id is no longer in the vocabulary |
| `NOT_PERMITTED` | Alkemio returned FORBIDDEN |
| `FAILED` | network error or 5xx |

- Validation: single-select entries take ≤ 1 id, and every id must be in the vocabulary.
  Otherwise the whole request is 422 `{ error: "INVALID_SELECTION", entryId }` and nothing is
  written.
- Only `SAVED` entries are recorded (`classification_changes`) and invalidate the editor's cached
  rows.
- The response always reports per entry. The UI keeps unsaved edits for any entry that is not
  `SAVED` (FR-024).

## 7. `GET /api/vng/admin/gd-source`

**200** `GdSourceSummaryView`. It uses the manager's own GD row and builds it if absent (it may
take as long as a first dashboard load).

- `available: false` with `error: "GD_SPACE_UNREADABLE" | "LOAD_FAILED"` → the UI says so and
  shows no zero counts (FR-031).
- `migrationComplete` is `viaPosts === 0 && available`.

## 8. Frontend (`frontend/shared/src/admin/`)

| Section | Endpoints | Notes |
|---|---|---|
| Access | §2 | read-only |
| Included Spaces | §3, §4 | pending adds and removes shown before save; the 409 dialog shows the current set |
| Classifications | §5, §6 | picker plus editor; single-select is a radio group, multi-select a checkbox group |
| GemeenteDelers | §7 | summary plus expandable lists |

Each section fetches independently and has its own retry (FR-033). It is reached at `/admin`
(research R11). All copy uses `admin.*` i18n keys in `frontend/vng/src/i18n/{nl,en}.json`.
