# Contract: `POST /api/graph/organizations` — extended organisation profiles

**Owner**: `server/src/routes/graph.ts` → `services/organization-service.ts`

Declared by a details view that shows description / website / references for an organisation. The dashboards' core load carries only the inline core profile (R2).

## Request

```json
{ "ids": ["<orgId>", "…"] }
```

At most 50 ids per call (`400` otherwise).

## Response `200 application/json`

```json
{ "organizations": { "<orgId>": { "id": "…", "description": null, "tagline": null,
                                   "website": "https://…", "contactEmail": null,
                                   "references": [{ "name": "…", "uri": "…" }], "associateCount": 12 } },
  "missing": ["<orgId>"] }
```

- Served from `__org__:<orgId>` rows (24 h); only uncached ids are fetched, each with the static `organizationByID` document (no dynamic aliasing — Constitution II). Ids the viewer cannot read land in `missing`.
- Bounded by the cache, not by a batch document: acceptable because this is a detail-open path, not the core path (FR-013 governs the core path; FR-013a — at most once per viewer per window — holds here).

## Explorer parity

`/generate` with `includeExtendedProfiles: true` (JSON default) merges these rows into the organisation nodes server-side, fetching uncached ids first — so the Explorer keeps its DetailsDrawer fields and gains the per-organisation cache.
