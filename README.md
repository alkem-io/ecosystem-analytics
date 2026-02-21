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

Click "Sign in with Alkemio" to authenticate via the Ory Kratos browser flow. After login you'll be redirected back with a session token.

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
