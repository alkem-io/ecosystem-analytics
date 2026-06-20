# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ecosystem Analytics is a BFF + React SPA for visualizing Alkemio ecosystem connectivity and activity. Users authenticate with Alkemio credentials, select Spaces, and explore force-directed network graphs of users, organizations, and spaces.

## Architecture

```
frontend/                       pnpm-workspace parent for all SPA packages
  shared/                       @ea/shared — graph/map/details/services/ui/tokens shared by every SPA
  ecosystem-analytics/          the Explorer SPA (React 19 + Vite 7 + D3 v7), dev :5173
  vng/                          VNG Kenniscentrum Innovatie dashboard SPA, dev :5174
server/                         Express 5 BFF — OIDC auth, GraphQL relay, SQLite cache
```

- **Multi-dashboard serving**: ONE BFF container serves every SPA, each on its own port sharing the same `/api` + session store — Explorer on `config.port` (`../frontend/dist`, prod :4000) and VNG on `config.vngPort = port+1` (`../frontend-vng/dist`, prod :4001), via `createApp(staticDir)` called once per SPA in `server/src/index.ts`. Each SPA is fronted by its own subdomain (e.g. `analytics.*` / `vih-analytics.*`) with shared parent-domain `ea_session` sign-in. New dashboards follow this exact pattern — see the constitution's Development Workflow for the "add a dashboard" steps.
- Frontend communicates **exclusively** with the BFF (never directly with Alkemio)
- BFF is EA's own Alkemio OIDC client (Ory Hydra): it runs the redirect-based Authorization Code + PKCE flow, holds the access/refresh tokens server-side (encrypted), and authorizes Alkemio GraphQL calls with the access token. The browser holds only an opaque `ea_session` cookie.
- Cache is SQLite, scoped per-user per-Space with configurable TTL
- Frontend imports server types via path alias: `import type { ... } from '@server/types/graph.js'`
- Both packages use ESM (`"type": "module"`) and TypeScript strict mode

### Key data flow

1. **Auth (OIDC redirect)**: Frontend `login()` → BFF `GET /api/auth/login` (stashes state/nonce/PKCE in a pre-auth record, sets `ea_preauth` cookie) → 302 to Alkemio/Hydra → user authenticates by any method → 302 back to BFF `GET /api/auth/oidc/callback` → BFF exchanges the code for tokens, validates the ID token (incl. `alkemio_actor_id`), creates a server-side session (tokens AES-256-GCM encrypted at rest), sets the opaque `httpOnly` `ea_session` cookie → 302 to the requested page. The browser never holds a token; the BFF refreshes the access token transparently and authorizes GraphQL calls with it.
2. **Graph generation**: Frontend POST `/api/graph/generate` with spaceIds → BFF acquires space hierarchies (L0/L1/L2) + users/orgs/roles via GraphQL → transforms to nodes/edges → computes metrics/insights → caches in SQLite → returns `GraphDataset`
3. **Visualization**: Frontend renders `GraphDataset` as D3 force-directed graph with clustering, filtering, search, and detail panels

### Server module layout (`server/src/`)

- `auth/` — OIDC RP under `auth/oidc/` (client discovery, login, callback, refresh, logout, token crypto); `session.ts` (server-side session create/resolve/touch + cookie options); `middleware.ts` (session-cookie auth); `me.ts`, `resolve-user.ts`
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
- `services/` — auth (`login()`/`logout()` redirects + `fetchMe()`; session is the `ea_session` cookie, no client-side token), api (fetch wrapper, `credentials: 'include'`)
- `styles/` — CSS Modules + CSS custom properties (design tokens)

## Development Commands

### Server (`cd server`)

```bash
pnpm run dev          # Watch mode (tsx watch, port 4000)
pnpm run build        # TypeScript compilation → dist/
pnpm run test         # Vitest run
pnpm run test:watch   # Vitest watch
pnpm run codegen      # Regenerate typed GraphQL SDK from Alkemio schema
```

### Frontend (`cd frontend`)

```bash
pnpm run dev          # Vite dev server (port 5173, proxies /api → :4000)
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
docker run -p 4000:4000 --env-file server/.env ecosystem-analytics
```

## Configuration

Server config is in `server/analytics.yml` with `${ENV_VAR}:default` substitution syntax. Environment variables go in `server/.env` (copy from `server/.env.default`). Key variables:

- `ALKEMIO_SERVER_URL` — Alkemio server base URL
- `ALKEMIO_GRAPHQL_ENDPOINT` — Alkemio GraphQL endpoint
- `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_TOKEN_AUTH_METHOD` / `OIDC_REDIRECT_URI` — OIDC client (Ory Hydra). Hosted = confidential (`client_secret_basic`); local-against-production = public (`none`, no secret)
- `OIDC_SESSION_ENC_KEY` — base64 32-byte AES-256 key for token-at-rest encryption (required)
- `SESSION_COOKIE_DOMAIN` / `SESSION_ALLOWED_ORIGINS` / `SESSION_IDLE_TIMEOUT_HOURS` — session cookie scope, CORS allow-list, idle timeout

## Constitution (Binding Principles)

The project constitution (`.specify/memory/constitution.md`) defines six mandatory principles:

1. **Alkemio OIDC auth (Authorization Code + PKCE via BFF)** — EA is its own registered OAuth2/OIDC client; tokens held server-side encrypted, browser holds only an opaque session cookie; no user credentials in .env or storage
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
- TypeScript 5.x (strict mode, ESM) + React 19, Vite 7, Express 5, D3.js v7, graphql-request, @graphql-codegen/cli (011-subspace-privacy-check)
- TypeScript 5.x (strict mode, ESM), Node 24 + Express 5, `openid-client` v6 (OIDC RP: discovery, PKCE, code exchange, refresh, revocation), `cookie-parser` (session-id + pre-auth cookies), Node built-in `crypto` (AES-256-GCM token encryption at rest), `better-sqlite3` (existing), `graphql-request` + codegen SDK (existing); frontend React 19 + Vite 7 + react-router 7 (existing) (015-oidc-auth)
- Existing SQLite (`better-sqlite3`, WAL). Two new tables — `oidc_sessions` (encrypted access/refresh tokens + identity + timestamps, keyed by opaque session id) and `oidc_auth_tx` (pre-auth `state`/`nonce`/`code_verifier`/`returnTo`, short TTL). No change to `cache_entries`/`query_feedback` schemas; cache scoping key (`user_id`) now sourced from the session record. (015-oidc-auth)
- TypeScript 5.x (strict, ESM), Node 24 (server), React 19 (frontends) + Server — Express 5, `openid-client` v6, `graphql-request` + codegen SDK, `better-sqlite3`. Frontend(s) — React 19, Vite 7, react-router 7, D3 v7 (graph/map), Radix UI + Tailwind v4 + CVA/clsx/tailwind-merge + lucide-react (shadcn-style). **New**: `recharts` (dashboard charts, via shadcn `ui/chart.tsx`), `i18next` + `react-i18next` (VNG app localisation). (016-vng-frontend)
- Existing SQLite cache (`better-sqlite3`, WAL). Reuses `cache_entries (user_id, space_id)`; adds a long-TTL GD-layer entry per user (`space_id = "__gd_initiatives__"`). No schema change required (TTL carried in existing `expires_at`). (016-vng-frontend)

## Recent Changes
- 005-k8s-deploy-cicd: Added YAML (GitHub Actions, Kubernetes manifests), HCL (Terraform), existing TypeScript/Node 20 app unchanged + GitHub Actions (`docker/build-push-action@v6`, `docker/metadata-action@v5`, `docker/login-action@v3`, `azure/k8s-set-context@v4`), Traefik CRDs (`traefik.containo.us/v1alpha1`), Azure DNS (`azurerm` Terraform provider)
