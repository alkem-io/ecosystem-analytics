# Implementation Plan: Map Location Filtering & Readability

**Branch**: `012-map-location-filtering` | **Date**: 2026-03-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/012-map-location-filtering/spec.md`

## Summary

Improve map mode in the force graph by: (1) filtering geo-pinned nodes to only those within the selected map region's GeoJSON boundaries, (2) removing proximity clustering in map mode, (3) reducing node sizes responsively with zoom, and (4) adding a soft repulsion force to push free-floating nodes away from the map area. Transitions between map regions animate over ~600ms.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: D3 v7 (d3-geo, d3-force, d3-selection, d3-zoom), React 18, Vite
**Storage**: N/A (all changes are frontend rendering logic)
**Testing**: Playwright visual regression tests (existing)
**Target Platform**: Web browser (React SPA)
**Project Type**: Web (frontend SPA + BFF)
**Performance Goals**: 60fps during force simulation; region switch completes in <1s
**Constraints**: Up to ~500 nodes rendered individually without clustering; GeoJSON point-in-polygon checks must be fast enough for per-node evaluation on region change
**Scale/Scope**: 3 map regions (World, Europe, Netherlands); ~500 entity nodes max

### Key Files

| File | Role | Lines of interest |
|------|------|-------------------|
| `frontend/src/components/graph/ForceGraph.tsx` | Main orchestrator — projection, pinning, forces, clustering, node sizing | ~1600 lines |
| `frontend/src/components/graph/proximityClustering.ts` | Proximity clustering algorithm (to be bypassed in map mode) | ~95 lines |
| `frontend/src/components/map/MapOverlay.tsx` | GeoJSON basemap rendering, projection config | ~85 lines |
| `frontend/src/components/panels/ControlPanel.tsx` | Map toggle, region selector UI | ~260 lines |
| `server/src/types/graph.ts` | `GraphNode`, `GraphLocation` types | Shared types |
| `frontend/public/maps/*.geojson` | GeoJSON boundary data for World, Europe, Netherlands | Static assets |

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Authentication | N/A | No auth changes |
| II. Typed GraphQL Contract | N/A | No GraphQL changes |
| III. BFF Boundary | PASS | All changes are frontend-only rendering logic |
| IV. Data Sensitivity | PASS | No new data exposure; location data already present on nodes |
| V. Graceful Degradation | PASS | Nodes without location data degrade to free-floating; missing GeoJSON shows existing fallback |
| VI. Design Fidelity | PASS | No design brief conflicts; map readability improvement aligns with design intent |
| Security Requirements | PASS | No new inputs, no SQL, no tokens involved |
| Development Workflow | PASS | TypeScript strict mode, pnpm, standard frontend tooling |

**Gate result: PASS** — No violations. Proceeding to Phase 0.

### Post-Design Re-evaluation (Phase 1 Complete)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Alkemio Identity Authentication | N/A | No auth changes |
| II. Typed GraphQL Contract | N/A | No GraphQL changes |
| III. BFF Boundary | PASS | All changes remain frontend-only; no new BFF endpoints |
| IV. Data Sensitivity | PASS | GeoJSON boundary checking uses public map data; no user data exposure |
| V. Graceful Degradation | PASS | `mapBoundary.ts` handles missing locations gracefully; GeoJSON fetch failure falls back to existing "Map unavailable" |
| VI. Design Fidelity | PASS | No design brief conflicts; node size reduction and clustering removal improve map readability |
| Security Requirements | PASS | No new inputs; `geoContains` operates on pre-loaded static GeoJSON; no injection vectors |
| Development Workflow | PASS | TypeScript strict mode; no new dependencies; pnpm; standard Vite tooling |

**Post-design gate result: PASS** — All principles satisfied. No constitution violations introduced by the design.

## Project Structure

### Documentation (this feature)

```text
specs/012-map-location-filtering/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── graph/
│   │   │   ├── ForceGraph.tsx          # Primary file: pinning, forces, sizing, clustering bypass
│   │   │   ├── proximityClustering.ts  # Existing file: no deletion, just bypassed when map active
│   │   │   └── mapBoundary.ts          # NEW: point-in-polygon check using GeoJSON features
│   │   ├── map/
│   │   │   └── MapOverlay.tsx          # Minor: may share GeoJSON loading utility
│   │   └── panels/
│   │       └── ControlPanel.tsx        # Minor: hint text update
│   └── types/
│       └── (no changes — existing GraphLocation suffices)
├── public/
│   └── maps/                           # Existing GeoJSON files reused for boundary checks
└── tests/
    └── visual/                         # Updated visual regression baselines
```

**Structure Decision**: All changes live within `frontend/src/components/graph/` and one new utility file `mapBoundary.ts`. No new packages, no server changes, no type changes.

## Complexity Tracking

> No constitution violations — table not required.
