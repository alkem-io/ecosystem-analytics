# Contract: POST /api/graph/generate (extended) — GD initiative layer

**Feature**: 016-vng-frontend | Extends the existing graph-generation endpoint additively. BFF, session-authenticated.

---

## Request (delta)

```jsonc
{
  "spaceIds": ["stad-utrecht", "…"],   // existing — the effective selected-space set
  "forceRefresh": false,                // existing
  "includeInitiatives": true            // NEW — fold in the GemeenteDelers layer (FR-039)
}
```

- `includeInitiatives` defaults to `false` (omitted ⇒ base graph exactly as today).
- `spaceIds` count still bounded by `maxSpacesPerQuery` (server-side).

## Response (delta)

Existing `GraphDataset` shape, with the new node/edge kinds present **only when** `includeInitiatives` is true:

```jsonc
{
  "nodes": [
    { "id": "<callout-uuid>", "type": "INITIATIVE", "displayName": "…",
      "nameId": "…", "initiativeYear": 2024, "sourceUrl": "https://vng.nl/praktijkvoorbeelden/…" },
    { "id": "theme:energietransitie", "type": "THEME", "displayName": "Energietransitie", "nameId": "energietransitie" },
    { "id": "<org-uuid>", "type": "ORGANIZATION", "nameId": "gemeente-groningen", "isGemeente": true }
  ],
  "edges": [
    { "sourceId": "<callout-uuid>", "targetId": "<org-uuid>",            "type": "INITIATIVE_GEMEENTE", "scopeGroup": null },
    { "sourceId": "<callout-uuid>", "targetId": "theme:energietransitie", "type": "INITIATIVE_THEME",    "scopeGroup": null }
  ],
  "gdLayer": { "available": true, "initiativeCount": 305, "source": { "programme": "GemeenteDelers", "years": "2021–2025", "url": "https://vng.nl/praktijkvoorbeelden" } }
}
```

## Behaviour

1. Build the base graph as today (cache per `(user, space nameID)`).
2. If `includeInitiatives`:
   - Verify the user has READ on `vng.gemeentedelersSpaceNameId`; if not, return base graph with `gdLayer.available=false` and a reason (non-fatal, FR-044).
   - Load the per-user GD subgraph from cache (`space_id="__gd_initiatives__"`, TTL `gdCacheTtlHours`); on miss, fetch KB callouts (`spaceKnowledgeCallouts.graphql`), resolve tags → INITIATIVE/THEME nodes + INITIATIVE_GEMEENTE/INITIATIVE_THEME edges via the snapshot registry, resolving any missing gemeente orgs by nameID once.
   - Merge into the dataset, **deduping `ORGANIZATION` nodes by `nameId`** so initiatives attach to existing gemeente nodes (no duplicates — FR-040/043).
3. `gdLayer` metadata always present so the frontend can render the provenance note (FR-047) and empty/error states.

## Errors

- Base-graph errors unchanged. GD-layer failures are **non-fatal**: the base graph still returns, `gdLayer.available=false`, `gdLayer.error` set. 401 on missing session. No token logging.
