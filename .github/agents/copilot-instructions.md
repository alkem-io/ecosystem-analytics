# Shadcn Ui Redesign Project Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-20

## Active Technologies
- TypeScript 5.x, Node.js >= 20.9 + React 18, Vite, D3 v7, Express, `@graphql-codegen/cli` + `graphql-request`, `@alkemio/client-lib` (001-ecosystem-analytics)
- SQLite (via better-sqlite3) for per-user per-Space cache entries; file-based GeoJSON maps (001-ecosystem-analytics)
- TypeScript 5.x (strict mode), React 19.2.4 + D3 v7.9 (d3-selection, d3-force), Vite 7.3.1 (002-node-avatar-display)
- N/A (no backend changes required) (002-node-avatar-display)
- TypeScript 5.x (strict mode), React 19.2.4 + D3 v7.9 (d3-selection, d3-force, d3-transition), Vite 7.3.1 (003-node-proximity-clustering)
- N/A (no backend changes) (003-node-proximity-clustering)
- TypeScript 5.9.3 (server + frontend) + Express 5, D3.js 7, React 19, `graphql-request` 7, `@graphql-codegen/cli` 6 (004-activity-pulse)
- SQLite (better-sqlite3) for server-side cache; in-memory dataset on frontend (004-activity-pulse)
- TypeScript 5.9.3 (strict mode), React 19.x + D3 v7.9, Express 5, Vite 7.3.1, `@graphql-codegen/cli` (typed SDK) (006-role-filters)
- SQLite cache (per-user per-space, via better-sqlite3) — no schema changes (006-role-filters)
- TypeScript 5.9.3 (strict mode) + React 19.x, D3.js v7.9, Express 5, Vite 7.3.1, `@graphql-codegen/cli` (007-space-visibility)
- better-sqlite3 (per-user per-space cache) (007-space-visibility)
- TypeScript 5.9.3 (server + frontend) + Express 5, React 19, OpenAI Node SDK (>=4.x), `graphql-request` 7, `@graphql-codegen/cli` 6, D3.js 7 (011-ai-ecosystem-query)
- SQLite (better-sqlite3) for server-side graph cache; in-memory session store for conversation contex (011-ai-ecosystem-query)
- TypeScript 5.x (strict mode) + D3 v7 (d3-geo, d3-force, d3-selection, d3-zoom), React 18, Vite (012-map-location-filtering)
- N/A (all changes are frontend rendering logic) (012-map-location-filtering)
- TypeScript 5.x (strict mode, ESM), React 19 + React 19, Vite 7, D3.js v7 (existing) (014-ecosystem-metrics)
- N/A (no backend / storage changes) (014-ecosystem-metrics)

- Not applicable (documentation and design briefs) + Not applicable (content generation and analysis) (001-alkemio-design-brief)

## Project Structure

```text
src/
tests/
```

## Commands

# Add commands for Not applicable (documentation and design briefs)

## Code Style

Not applicable (documentation and design briefs): Follow standard conventions

## Recent Changes
- 014-ecosystem-metrics: Added TypeScript 5.x (strict mode, ESM), React 19 + React 19, Vite 7, D3.js v7 (existing)
- 012-map-location-filtering: Added TypeScript 5.x (strict mode) + D3 v7 (d3-geo, d3-force, d3-selection, d3-zoom), React 18, Vite
- 011-ai-ecosystem-query: Added TypeScript 5.9.3 (server + frontend) + Express 5, React 19, OpenAI Node SDK (>=4.x), `graphql-request` 7, `@graphql-codegen/cli` 6, D3.js 7


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
