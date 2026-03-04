# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ecosystem Analytics is a BFF + React SPA for visualizing Alkemio ecosystem connectivity and activity. Users authenticate with Alkemio credentials, select Spaces, and explore force-directed network graphs of users, organizations, and spaces.

## Architecture

```
frontend/   React 19 + Vite 7 + D3.js v7 SPA (port 5173)
server/     Express 5 BFF — Kratos auth, GraphQL relay, SQLite cache (port 4010)
```

- Frontend communicates **exclusively** with the BFF (never directly with Alkemio)
- BFF authenticates via Kratos API flow, forwards session tokens to Alkemio GraphQL API
- Cache is SQLite, scoped per-user per-Space with configurable TTL
- Frontend imports server types via path alias: `import type { ... } from '@server/types/graph.js'`
- Both packages use ESM (`"type": "module"`) and TypeScript strict mode

### Key data flow

1. **Auth**: Frontend sends credentials to BFF → BFF exchanges with Kratos → returns session_token → Frontend sends as `Authorization: Bearer` on all requests
2. **Graph generation**: Frontend POST `/api/graph/generate` with spaceIds → BFF acquires space hierarchies (L0/L1/L2) + users/orgs/roles via GraphQL → transforms to nodes/edges → computes metrics/insights → caches in SQLite → returns `GraphDataset`
3. **Visualization**: Frontend renders `GraphDataset` as D3 force-directed graph with clustering, filtering, search, and detail panels

### Server module layout (`server/src/`)

- `auth/` — Kratos login, Bearer middleware, user resolution
- `graphql/` — Codegen SDK (`generated/`), client factory, `.graphql` queries/fragments
- `services/` — Space fetching, data acquisition, graph orchestration
- `transform/` — Nodes/edges transformation, metrics computation, insights detection
- `cache/` — SQLite cache (better-sqlite3)
- `types/` — Shared TypeScript interfaces (consumed by both server and frontend)

### Frontend module layout (`frontend/src/`)

- `pages/` — LoginPage, SpaceSelector, Explorer
- `components/graph/` — ForceGraph (D3 force simulation), HoverCard, clustering
- `components/panels/` — ControlPanel, TopBar, DetailsDrawer, MetricsBar, FilterControls
- `hooks/` — useSpaces, useGraph (data fetching + state)
- `services/` — auth (token management), api (fetch wrapper)
- `styles/` — CSS Modules + CSS custom properties (design tokens)

## Development Commands

### Server (`cd server`)

```bash
pnpm run dev          # Watch mode (tsx watch, port 4010)
pnpm run build        # TypeScript compilation → dist/
pnpm run test         # Vitest run
pnpm run test:watch   # Vitest watch
pnpm run codegen      # Regenerate typed GraphQL SDK from Alkemio schema
```

### Frontend (`cd frontend`)

```bash
pnpm run dev          # Vite dev server (port 5173, proxies /api → :4010)
pnpm run build        # tsc check + Vite build → dist/
pnpm run test         # Vitest run
pnpm run test:watch   # Vitest watch
```

### Visual regression (root)

```bash
pnpm run test:visual         # Playwright snapshot tests
pnpm run test:visual:update  # Update snapshots
```

### Docker

```bash
docker build -t ecosystem-analytics .
docker run -p 4000:4010 --env-file server/.env ecosystem-analytics
```

## Configuration

Server config is in `server/analytics.yml` with `${ENV_VAR}:default` substitution syntax. Environment variables go in `server/.env` (copy from `server/.env.default`). Key variables:

- `ALKEMIO_SERVER_URL` — Alkemio server base URL
- `ALKEMIO_GRAPHQL_ENDPOINT` — Alkemio GraphQL endpoint
- `ALKEMIO_KRATOS_PUBLIC_URL` — Kratos public API URL

## Constitution (Binding Principles)

The project constitution (`.specify/memory/constitution.md`) defines six mandatory principles:

1. **Kratos API Flow auth** — username/password via BFF, no credentials in .env or storage
2. **Typed GraphQL contract** — all queries use codegen SDK; no raw query strings in service code; run `pnpm run codegen` after changing `.graphql` files
3. **BFF boundary** — frontend talks only to BFF, never directly to Alkemio
4. **Data sensitivity** — per-user per-Space cache scoping, no token logging, parameterized SQL
5. **Graceful degradation** — missing optional fields must not crash; fallback UI for failed assets
6. **Design fidelity** — UI matches design brief (`specs/001-ecosystem-analytics/design-brief-figma-make.md`); visual conflicts defer to design brief, behavioral conflicts defer to spec

## Code Style

- TypeScript strict mode, ESM modules
- Prettier: single quotes, semicolons, trailing commas, 100 char width, 2-space indent
- ESLint: flat config, `@typescript-eslint/recommended`, unused vars prefixed with `_`
- `server/src/graphql/generated/` is auto-generated — do not edit manually

## Speckit Workflow

Feature specifications live in `specs/NNN-feature-name/` with `spec.md`, `tasks.md`, `research.md`, `design.md`. The speckit agent workflow (agents in `agents/`, prompts in `prompts/`, templates in `.specify/templates/`) supports: clarify → plan → specify → analyze → tasks → checklist → implement → constitution validation.

## Active Technologies
- YAML (GitHub Actions, Kubernetes manifests), HCL (Terraform), existing TypeScript/Node 20 app unchanged + GitHub Actions (`docker/build-push-action@v6`, `docker/metadata-action@v5`, `docker/login-action@v3`, `azure/k8s-set-context@v4`), Traefik CRDs (`traefik.containo.us/v1alpha1`), Azure DNS (`azurerm` Terraform provider) (005-k8s-deploy-cicd)
- N/A (no storage changes; existing SQLite cache runs inside container) (005-k8s-deploy-cicd)
- TypeScript 5.x (strict mode, ESM) + React 19, Vite 7, Express 5, `@alkemio/client-lib`, `graphql-request`, D3.js v7 (010-sso-session-reuse)
- SQLite (existing cache, no changes needed) (010-sso-session-reuse)

## Recent Changes
- 005-k8s-deploy-cicd: Added YAML (GitHub Actions, Kubernetes manifests), HCL (Terraform), existing TypeScript/Node 20 app unchanged + GitHub Actions (`docker/build-push-action@v6`, `docker/metadata-action@v5`, `docker/login-action@v3`, `azure/k8s-set-context@v4`), Traefik CRDs (`traefik.containo.us/v1alpha1`), Azure DNS (`azurerm` Terraform provider)
