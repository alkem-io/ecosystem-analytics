# ecosystem-analytics

Allowing the visualisation and analysis of ecosystem level connectivity and activity.

## Architecture

```
frontend/   React 18 + Vite + D3 v7 SPA
server/     Express BFF (auth proxy, GraphQL relay, SQLite cache)
```

The frontend never talks to Alkemio directly. All requests go through the BFF server, which handles Ory Kratos authentication and proxies GraphQL queries.

## Prerequisites

- Node.js >= 20.9
- pnpm >= 9
- Access to an Alkemio instance (server URL, GraphQL endpoint, Kratos public URL)

## Quick start

### 1. Configure environment

```bash
cp server/.env.default server/.env
```

Edit `server/.env` with your Alkemio instance details.

### 2. Install dependencies

```bash
cd server && pnpm install
cd ../frontend && pnpm install
```

### 3. Start development servers

In two terminals:

```bash
# Terminal 1 — BFF server (port 4000)
cd server
pnpm run dev

# Terminal 2 — Frontend dev server (port 5173, proxies /api to :4000)
cd frontend
pnpm run dev
```

Open http://localhost:5173 in your browser.

### 4. Login

See [Authentication](#authentication) below for details on the two auth modes.

For local development, `DEV_AUTH_BYPASS=true` is set in `.env.default`, so the login page will show an email/password form. Enter your Alkemio credentials — they are sent to the BFF which authenticates against Kratos directly (API flow). Your credentials are never stored.

## Authentication

The tool supports two authentication modes. In both cases the user authenticates with their **Alkemio identity** — credentials are never stored by this tool.

### Production — SSO redirect (Kratos browser flow)

In production the tool is deployed on the **same primary domain** as Alkemio. The login flow is:

```
User clicks "Sign in with Alkemio"
  → GET /api/auth/login
  → 302 redirect to Kratos /self-service/login/browser?return_to=<callback>
  → User authenticates on the Alkemio domain (SSO / OIDC)
  → Kratos redirects back to GET /api/auth/callback
  → BFF validates Kratos session, issues a bearer token
  → Frontend receives token, stores in memory (never persisted)
```

The `return_to` callback URL works because the tool and Alkemio share the same domain, so it is whitelisted by Kratos automatically.

### Local development — API flow (`DEV_AUTH_BYPASS=true`)

Alkemio's Kratos instance does not whitelist `localhost` in its `return_to` URLs, so the SSO redirect fails during local development. Setting `DEV_AUTH_BYPASS=true` in `server/.env` enables a dev-only endpoint:

```
User enters email + password in the login form
  → POST /api/auth/dev-login { email, password }
  → BFF calls Kratos /self-service/login/api (no browser redirect)
  → Kratos validates credentials, returns session token
  → BFF issues a bearer token
  → Frontend receives token, stores in memory
```

The login page auto-detects which mode is available and shows the appropriate UI (SSO button vs. email/password form with a "Dev mode" badge).

**Important**: `DEV_AUTH_BYPASS` must **never** be enabled in production. The dev-login endpoint returns 404 when the flag is not set.

### Bearer token lifecycle

- Issued by the BFF after successful authentication (either flow)
- Held in memory only (FR-001 / TR-015) — never written to localStorage, cookies, or disk
- Sent as `Authorization: Bearer <token>` on every API request
- 24-hour TTL — after expiry the user is redirected back to the login page
- Contains the Kratos session cookies needed for proxying GraphQL requests to Alkemio

## Usage

1. **Select Spaces** — Pick one or more Spaces from your portfolio
2. **Explore** — Pan, zoom, drag nodes in the force-directed graph
3. **Filter** — Toggle People/Organisations, switch clustering mode (by Space or Organisation)
4. **Search** — Find nodes by name with real-time highlighting
5. **Insights** — Highlight super-connectors or isolated nodes
6. **Expand** — Click a node to see details, discover related Spaces, add them to the graph
7. **Export** — Download the current graph dataset as JSON

## Production build

```bash
cd server && pnpm run build
cd ../frontend && pnpm run build
cd ../server && NODE_ENV=production pnpm start
```

In production the server serves the frontend static files from `frontend/dist/`.

## Docker

```bash
docker build -t ecosystem-analytics .
docker run -p 4000:4000 --env-file server/.env ecosystem-analytics
```

## GraphQL Codegen

To regenerate the typed GraphQL SDK (requires access to a running Alkemio server):

```bash
cd server
pnpm run codegen
```

## Project structure

```
server/
  src/
    auth/           Kratos login flow, callback, middleware, me, logout
    cache/          SQLite per-user per-Space cache (better-sqlite3)
    graphql/        Queries, fragments, client factory
    routes/         /api/auth, /api/spaces, /api/graph
    services/       space-service, acquire-service, graph-service
    transform/      Graph transformer, metrics, insights
    types/          Shared TypeScript types (graph.ts, api.ts)
    config.ts       Environment configuration
    app.ts          Express app setup
    index.ts        Entry point

frontend/
  src/
    components/
      graph/        ForceGraph (D3), clustering, LoadingOverlay
      map/          MapOverlay (GeoJSON basemaps)
      panels/       ControlPanel, TopBar, DetailsDrawer, MetricsBar
      search/       SearchBar
    hooks/          useSpaces, useGraph
    pages/          LoginPage, SpaceSelector, Explorer
    services/       auth (token management), api (fetch wrapper)
    styles/         Design tokens (CSS custom properties)
  public/
    maps/           GeoJSON basemap files (placeholder)
```

## Visual Regression (Pixel-Perfect)

This repo includes a Playwright visual regression harness to keep the UI aligned with the pixel-perfect contract in [specs/001-ecosystem-analytics/design-brief-figma-make.md](specs/001-ecosystem-analytics/design-brief-figma-make.md).

### Option A: Run against the local Figma Make export (recommended for now)

This works if you have the extracted export at `.prototype/alkemio-redesign`.

- Install dependencies: `pnpm install`
- Install the prototype dependencies: `pnpm run setup:prototype`
- Install Playwright browsers: `npx playwright install`
- Run visual tests (starts the prototype dev server automatically): `pnpm run test:visual:prototype`

To approve/update screenshots:
- `pnpm run test:visual:update`

### Option B: Run against an external app URL

If you have the real app running elsewhere:

- `BASE_URL=http://localhost:5173 pnpm run test:visual`
