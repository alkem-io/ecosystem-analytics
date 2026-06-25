# Contract: App-Aware BFF Routes

GovTech reuses every generic BFF endpoint unchanged and reaches its **own** dashboard profile through an app id. The VNG-namespaced routes generalise to `/api/:app/*`; `/api/vng/*` is preserved verbatim (FR-051).

`:app` / `?app` ∈ `{ vng, govtech }` (the keys of `config.dashboards`). Unknown values → `400 UNKNOWN_APP`. All routes require the shared `ea_session` (auth middleware) — identical to VNG.

---

## GET `/api/hubs?app=<id>`  *(extended)*

Returns the innovation hubs visible to the user plus the **app's** configured default hub.

- **Query**: `app` (optional) — selects which profile's default hub to return. Absent ⇒ `vng` (back-compat).
- **Response** (unchanged shape):
  ```json
  {
    "defaultHubNameId": "govtech-hub-nameid | null",
    "hubs": [{ "nameId": "…", "displayName": "…", "spaceCount": 12 }]
  }
  ```
- **Behaviour**: identical to today, except `defaultHubNameId` is read from `config.dashboards[app].defaultHubNameId` (resolved by nameID and prepended if not store-listed, as now). The hub list itself is app-independent (all hubs the user may see).
- Frontend: shared `useHubs` calls `/api/hubs?app=${appConfig.appId}`.

## GET `/api/hubs/:nameId/spaces`  *(unchanged)*

App-independent; reused as-is by both apps.

---

## POST `/api/:app/dashboard`  *(generalised from `/api/vng/dashboard`)*

Category counts for the dashboard charts (FR-023/025). Resolves taxonomy from `config.dashboards[:app].tagCategoryMapping` and the GD space from `config.dashboards[:app].gemeentedelersSpaceNameId`.

- **Path param**: `app` — `vng` or `govtech`.
- **Request body** (unchanged):
  ```json
  { "spaceIds": ["…"], "includeGemeentes": false,
    "includeInitiatives": false, "includeGemeenteDelers": false }
  ```
- **Validation** (unchanged): `spaceIds` required & non-empty; ≤ `limits.max_spaces_per_request` else `400 TOO_MANY_SPACES`.
- **Response** (unchanged shape): dimensions (`nds`, `vng2030`) with categorised counts + active source + `gemeenteDistribution`.
- `/api/vng/dashboard` continues to resolve `:app = vng` (alias mount) — VNG unaffected.
- Frontend: shared `useDashboard` posts to `/api/${appConfig.apiNamespace}/dashboard`.

## GET `/api/:app/initiatives`  *(generalised from `/api/vng/initiatives`)*

Lists GemeenteDelers initiatives (id, name, gemeentes, themes) for the selection panel (US10). Reads `config.dashboards[:app].gemeentedelersSpaceNameId` — which for GovTech **defaults to the same `gemeentedelers` space as VNG**, so both apps return the same corpus and share the cache.

- **Path param**: `app` — `vng` or `govtech`.
- **Response** (unchanged): `GdInitiative[]` sorted by display name.
- `/api/vng/initiatives` preserved.
- Frontend: shared `useGdInitiatives` calls `/api/${appConfig.apiNamespace}/initiatives`.

---

## Unchanged shared endpoints (reused as-is by GovTech)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/graph/generate` | POST | GraphDataset for spaceIds (+`includeInitiatives`) |
| `/api/graph/progress` | GET | Graph generation progress |
| `/api/spaces` | GET | Authorised L0 spaces for the picker |
| `/api/meta` | GET | Build info + settings (About dialog) |
| `/api/features` | GET | Public flags (Alkemio server URL on login) |
| `/api/auth/*` | — | OIDC login/callback/logout/refresh (shared session) |

---

## Error contract (unchanged)

| Status | `error` | When |
|---|---|---|
| 400 | `UNKNOWN_APP` | `:app`/`?app` not a known dashboard profile |
| 400 | `INVALID_REQUEST` | missing `spaceIds` |
| 400 | `TOO_MANY_SPACES` | over `max_spaces_per_request` |
| 401 | (redirect) | no/expired session → re-auth |
| 502 | `DASHBOARD_FAILED` / `GD_LIST_FAILED` / `HUB_*` | upstream Alkemio failure |
