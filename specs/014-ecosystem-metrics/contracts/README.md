# Contracts: Ecosystem Metrics

No API contracts required. This feature is entirely frontend-only — all metrics are computed client-side from the existing `GraphDataset` already in memory.

## No Changes to Server Endpoints

The following server endpoints remain unchanged:
- `POST /api/graph/generate` — continues to return `GraphDataset` with existing `metrics` and `insights` fields
- `GET /api/graph/progress` — no changes

## No Changes to Server Types

The following shared types remain unchanged:
- `GraphDataset` — no new fields
- `GraphMetrics` — not modified (ecosystem metrics are computed separately client-side)
- `GraphInsights` — not modified (superConnectors/isolatedNodes remain as server-side computation)
- `GraphNode` — no new fields (uses existing `restricted`, `scopeGroups`, `parentSpaceId`)
- `GraphEdge` — no new fields (uses existing `scopeGroup`, `sourceId`, `targetId`, `type`)

## Frontend-Only Interfaces

All new TypeScript interfaces are defined in `frontend/src/hooks/useEcosystemMetrics.ts`. See [data-model.md](data-model.md) for the full type definitions.
