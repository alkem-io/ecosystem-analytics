# Quickstart: Ecosystem Analytics — Portfolio Network Explorer

**Date**: 2026-02-21 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Prerequisites

- **Node.js** >= 20.9 and **npm** >= 10
- Access to a running **Alkemio server** (for auth + GraphQL API)
- The Alkemio server's GraphQL schema (for codegen)

## Repository Structure

```
ecosystem-analytics/
├── server/         # BFF — Express, GraphQL proxy, cache, auth
├── frontend/       # React SPA — Vite, D3, graph explorer
└── specs/          # Specifications and planning artifacts
```

## 1. Clone & Install

```bash
git clone <repo-url>
cd ecosystem-analytics

# Install server dependencies
cd server && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

## 2. Environment Configuration

### Server (`server/.env`)

```env
# Alkemio server
ALKEMIO_SERVER_URL=https://your-alkemio-instance.com

# GraphQL endpoint (browser-compatible, bearer auth)
ALKEMIO_GRAPHQL_ENDPOINT=https://your-alkemio-instance.com/graphql

# Ory Kratos (proxied via Alkemio)
ALKEMIO_KRATOS_PUBLIC_URL=https://your-alkemio-instance.com/ory/kratos/public

# Server port
PORT=4000

# Session secret (generate a random string)
SESSION_SECRET=change-me-to-a-random-secret

# Max spaces per query (FR-003a)
MAX_SPACES_PER_QUERY=10

# Cache TTL in hours (FR-012a)
CACHE_TTL_HOURS=24
```

**Important**: No user credentials (`AUTH_ADMIN_EMAIL`, `AUTH_ADMIN_PASSWORD`) — the tool uses redirect-based auth only.

### Frontend (`frontend/.env`)

```env
# BFF API base URL (same domain in production)
VITE_API_URL=http://localhost:4000
```

## 3. GraphQL Codegen

The server uses `@graphql-codegen/cli` to generate a typed SDK from Alkemio's GraphQL schema. This requires a running Alkemio server for schema introspection.

```bash
cd server

# Generate typed SDK (requires Alkemio server running)
npx graphql-codegen --config codegen.ts
```

This produces:
- `src/graphql/generated/alkemio-schema.ts` — TypeScript types from the schema
- `src/graphql/generated/graphql.ts` — Typed SDK with `getSdk()` (uses `graphql-request`)

**Note**: Commit the generated files so that builds don't require a running Alkemio server. Re-run codegen when the Alkemio schema changes.

## 4. Run Development Servers

```bash
# Terminal 1 — Server (BFF)
cd server
npm run dev          # Starts Express on http://localhost:4000

# Terminal 2 — Frontend (SPA)
cd frontend
npm run dev          # Starts Vite on http://localhost:5173
```

Vite proxies `/api` requests to the BFF in development (configured in `vite.config.ts`).

## 5. Development Workflow

1. **Auth flow**: Open `http://localhost:5173` → redirected to Alkemio login → callback to BFF → session established → frontend receives token.
2. **Space selection**: Frontend calls `GET /api/spaces` → BFF forwards to Alkemio GraphQL with bearer token → returns user's L0 Spaces.
3. **Graph generation**: Frontend calls `POST /api/graph/generate` with selected Space IDs → BFF checks cache, fetches missing data from Alkemio, transforms to graph dataset, caches, returns.
4. **Exploration**: Frontend renders the graph dataset using D3 force-directed layout.

## 6. Run Tests

```bash
# Server tests
cd server && npm test

# Frontend tests
cd frontend && npm test

# E2E tests (requires both servers running)
cd frontend && npx playwright test
```

## 7. Production Build

```bash
# Build frontend
cd frontend && npm run build    # Output: frontend/dist/

# Build server
cd server && npm run build      # Output: server/dist/

# The server serves frontend/dist/ as static files in production
```

## 8. Key Dependencies

| Package | Location | Purpose |
|---------|----------|---------|
| `express` | server | BFF HTTP framework |
| `graphql-request` | server | GraphQL client for Alkemio API |
| `@graphql-codegen/cli` | server (dev) | Typed SDK generation |
| `better-sqlite3` | server | Per-user per-Space cache store |
| `react` | frontend | UI framework |
| `vite` | frontend | Build tool + dev server |
| `d3` | frontend | Force-directed graph visualization |
| `d3-geo` | frontend | GeoJSON map overlay projections |
