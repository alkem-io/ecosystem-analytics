# Implementation Plan: Ecosystem Analytics — Portfolio Network Explorer

**Branch**: `001-ecosystem-analytics` | **Date**: 2026-02-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ecosystem-analytics/spec.md`

## Summary

Build an interactive portfolio network explorer that lets authenticated Alkemio users select L0 Spaces, acquire live data via GraphQL, transform it into a versioned graph dataset, and explore an interactive force-directed visualization with clustering, search, filtering, map overlay, and a details drawer. The system is split into two applications — a thin BFF server (Node.js/Express) that proxies auth and GraphQL, manages per-user caching, and serves the SPA — and a React frontend that communicates only with the BFF.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js >= 20.9
**Primary Dependencies**: React 18, Vite, D3 v7, Express, `@graphql-codegen/cli` + `graphql-request`, `@alkemio/client-lib`
**Storage**: SQLite (via better-sqlite3) for per-user per-Space cache entries; file-based GeoJSON maps
**Testing**: Vitest (unit + integration), Playwright (E2E), React Testing Library
**Target Platform**: Linux server (Docker), modern browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: web (frontend + backend)
**Performance Goals**: None for v1 (NFR-004)
**Constraints**: Same-domain deployment for auth redirect; bearer token in memory only; no user credentials stored
**Scale/Scope**: Single-user portfolio exploration; typically 2–10 L0 Spaces, hundreds to low-thousands of nodes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is unpopulated (placeholder template). No gates to enforce. **PASS** — proceed to Phase 0.

*Post-Phase 1 re-check*: Constitution still unpopulated. No violations. **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/001-ecosystem-analytics/
├── plan.md              # This file
├── research.md          # Phase 0 output — technology decisions
├── data-model.md        # Phase 1 output — entity definitions
├── quickstart.md        # Phase 1 output — developer setup guide
├── contracts/           # Phase 1 output — OpenAPI schema
│   └── openapi.yaml
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── app.ts               # Express app setup
│   ├── index.ts              # Entry point
│   ├── auth/                 # Auth redirect + callback handlers
│   ├── graphql/              # GraphQL proxy + codegen queries
│   │   ├── queries/          # .graphql query files (from analytics-playground)
│   │   ├── fragments/        # .graphql fragment files
│   │   └── generated/        # Codegen output (alkemio-schema.ts, graphql.ts)
│   ├── transform/            # Raw API → graph dataset conversion
│   ├── cache/                # Per-user per-Space cache layer (SQLite)
│   ├── routes/               # BFF API route handlers
│   └── config.ts             # Server configuration
├── codegen.ts                # GraphQL codegen config
├── package.json
├── tsconfig.json
└── tests/

frontend/
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root component + routing
│   ├── components/
│   │   ├── graph/            # D3 force graph, canvas, interactions
│   │   ├── map/              # GeoJSON map overlay
│   │   ├── panels/           # Left control panel, details drawer
│   │   ├── search/           # Search input + highlighting
│   │   └── ui/               # Shared UI primitives (tokens from design brief)
│   ├── pages/
│   │   ├── LoginPage.tsx     # Identity gate (Screen A)
│   │   ├── SpaceSelector.tsx # Space selection (Screen B)
│   │   └── Explorer.tsx      # Graph explorer (Screen C)
│   ├── services/
│   │   ├── api.ts            # BFF API client (bearer token in memory)
│   │   └── auth.ts           # Auth state management
│   ├── hooks/                # React hooks (useGraph, useAuth, etc.)
│   ├── types/                # Shared TypeScript types
│   └── assets/
│       └── maps/             # GeoJSON basemaps (World, Europe, Netherlands)
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tests/
```

**Maps**: v1 ships 3 static GeoJSON basemaps (World, Europe, Netherlands). Future step: migrate to a dynamic tile-based provider (e.g., MapLibre GL) for arbitrary regions and zoom levels.

**Structure Decision**: Web application (Option 2) — two separate packages (`server/` and `frontend/`) as required by TR-014. The server proxies auth and GraphQL, manages caching, and serves the SPA in production. The frontend communicates only with the server (FR-020).

## Complexity Tracking

> No constitution violations to justify.
