# Contract: Innovation Hub endpoints

**Feature**: 016-vng-frontend | BFF, session-authenticated (`ea_session`, `credentials: 'include'`). All Alkemio access via the typed codegen SDK (Principle II/III).

---

## GET /api/hubs

List the innovation hubs available to the signed-in user, plus which is the configured default.

**Auth**: required (401 + clean re-auth redirect path if no valid session).

**200 Response**

```jsonc
{
  "defaultHubNameId": "vng-kenniscentrum",   // from vng.defaultHubNameId config (may be null)
  "hubs": [
    {
      "nameId": "vng-kenniscentrum",
      "displayName": "VNG Kenniscentrum Innovatie",
      "spaceCount": 23                          // size of spaceListFilter (if known)
    }
  ]
}
```

**Behaviour**
- Backed by `innovationHubs.graphql`; returns only hubs the platform exposes to the user (FR-009).
- `defaultHubNameId` echoes config so the frontend can preselect on first load (FR-010).
- Empty list → `{ defaultHubNameId, hubs: [] }` (frontend shows "choose spaces directly" path).

---

## GET /api/hubs/:nameId/spaces

Resolve a hub's listed spaces to a selectable set.

**200 Response**

```jsonc
{
  "nameId": "vng-kenniscentrum",
  "spaces": [
    { "nameId": "stad-utrecht", "displayName": "Stad Utrecht", "visibility": "ACTIVE" }
  ]
}
```

**Behaviour**
- Backed by `innovationHubByNameId.graphql` reading `spaceListFilter`.
- Only spaces the user is authorised to view are returned; restricted ones are omitted (FR-014).
- Unknown/inaccessible hub → 404; empty `spaceListFilter` → `spaces: []` (FR-009 empty-state).

**Errors (both endpoints)**: 401 (no session), 404 (hub not found), 502 (upstream Alkemio error) with `{ error }`. Never leaks tokens (Principle IV).
