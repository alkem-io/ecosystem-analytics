# Research: Ecosystem Analytics — Portfolio Network Explorer

**Date**: 2026-02-21 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## 1. Server Framework

**Decision**: Express (Node.js)

**Rationale**: The BFF is intentionally thin — it proxies auth redirects, forwards GraphQL queries with bearer tokens, and manages a cache layer. Express is the most widely supported Node.js framework, has trivial setup for middleware/routing, and aligns with the existing Alkemio ecosystem (the Alkemio server itself is Node.js/TypeScript). No need for a heavier framework (NestJS, Fastify) given the BFF's narrow scope.

**Alternatives considered**:
- **Fastify**: Better performance characteristics, but performance is explicitly not a v1 concern (NFR-004). Adds learning curve without tangible benefit here.
- **NestJS**: Too heavy for a thin BFF; would over-engineer the proxy layer.
- **Hono**: Lightweight but less ecosystem support for Ory Kratos middleware.

## 2. Frontend Framework & Bundler

**Decision**: React 18 + Vite

**Rationale**: The spec mandates a React frontend (TR-014). Vite provides fast dev builds, native TypeScript support, and straightforward production builds. The analytics-playground uses webpack, but Vite is the modern standard for new React projects and eliminates significant boilerplate.

**Alternatives considered**:
- **Next.js**: SSR/SSG not needed for a SPA tool; adds complexity without benefit. Same-domain BFF deployment would conflict with Next.js's own server.
- **webpack**: Proven in the playground but requires more configuration. Vite is simpler for a new project.

## 3. Visualization Library

**Decision**: D3 v7 (force-directed graph) with React integration via `useRef` + `useEffect`

**Rationale**: The analytics-playground already implements the exact visualization patterns needed (force-directed graph, clustering, map overlay, zoom/pan, node dragging) using D3 v7. Reusing these proven patterns minimizes risk. D3 gives full control over the force simulation, which is essential for cluster-mode switching and geographic node pinning.

**Alternatives considered**:
- **react-force-graph-2d** (`react-force-graph`): Convenient React wrapper around `force-graph`, but limits customization for cluster hulls, dual layout modes, and the design-brief's specific interaction patterns.
- **Sigma.js / Graphology**: Good for large graphs but the playground's D3 approach is already proven for this exact domain. Switching adds risk with no clear benefit at expected scale.
- **3d-force-graph**: Available in the playground for 3D mode but not required by the spec. Can be added later as an enhancement.

## 4. Map Overlay

**Decision**: D3-geo with GeoJSON basemaps (same approach as analytics-playground)

**Rationale**: The playground already uses `d3-geo` projections with GeoJSON vector maps for the map overlay mode. This avoids tile-server dependencies, keeps everything self-contained, and is straightforward to implement with properly licensed GeoJSON files. TR-007 requires GeoJSON basemaps; TR-010 requires proper licensing.

**Map sources**: Natural Earth (public domain) GeoJSON for World, Europe, Netherlands outlines.

**Future step**: Migrate to a dynamic tile-based map provider (e.g., MapLibre GL with vector tiles) to support arbitrary regions and zoom levels beyond the initial 3 basemaps.

**Alternatives considered**:
- **Leaflet / MapLibre GL**: Full-featured map libraries, but overkill for v1's static overlay. Would introduce tile-server dependencies and complicate the same-domain deployment. Planned as the evolution path when more map regions are needed.

## 5. Authentication Flow

**Decision**: Redirect to Alkemio (Ory Kratos browser flow) → callback → BFF issues session + bearer token

**Rationale**: The spec explicitly mandates redirect-based auth (FR-001, TR-002). Alkemio uses Ory Kratos for identity. The browser-flow variant of Kratos supports redirect-based login at the Alkemio domain. The BFF handles the callback, obtains a session/JWT, and issues a bearer token to the frontend. This keeps credentials entirely on the Alkemio side (NFR-002a).

The analytics-playground uses server-side admin credentials via `.env` — this is explicitly rejected by the spec.

**Key implementation detail**: The BFF needs endpoints for:
1. `GET /auth/login` → redirect to Alkemio's Kratos login URL
2. `GET /auth/callback` → handle Kratos callback, extract session, return bearer token
3. `GET /auth/me` → verify token and return current user profile

**Alternatives considered**:
- **Direct Kratos API from frontend**: Would expose Kratos endpoints and complicate CORS; the BFF pattern is cleaner and mandated by TR-013.
- **OAuth2/OIDC via Ory Hydra**: Alkemio may support this, but the simpler Kratos browser flow with redirect is sufficient and doesn't require a separate OAuth provider setup.

## 6. GraphQL Client & Codegen

**Decision**: `graphql-request` + `@graphql-codegen/cli` (same stack as analytics-playground)

**Rationale**: The playground's codegen setup is battle-tested with the Alkemio schema. It generates a typed `getSdk()` function from `.graphql` query files, providing full type safety. The exact queries needed (me, mySpacesHierarchical, spaceByName, usersByIDs, organizationByID) and fragments (SpaceGraphInfoFragment, communityRolesFragment) already exist in the playground and can be reused directly.

**Codegen configuration**: Introspect schema from running Alkemio server, generate `alkemio-schema.ts` (types) and `graphql.ts` (SDK). Use `import-types` preset to keep files separate.

**Alternatives considered**:
- **Apollo Client**: Heavier, includes caching layer we don't need server-side (we have our own cache). `graphql-request` is simpler for the BFF's server-to-server calls.
- **urql**: Good React integration but we need the client on the server side (BFF), not the frontend.

## 7. Caching / Storage

**Decision**: SQLite via `better-sqlite3`

**Rationale**: The spec requires server-side persistent per-user per-Space caching (FR-012, FR-012a, FR-012b). SQLite is zero-configuration, embeddable, and sufficient for single-server deployment. Cache entries store serialized graph datasets with TTL metadata. No external database service needed.

**Schema sketch**:
- Table: `cache_entries(user_id TEXT, space_id TEXT, dataset_json TEXT, created_at INTEGER, expires_at INTEGER, PRIMARY KEY(user_id, space_id))`

**Alternatives considered**:
- **PostgreSQL**: Overkill for a cache store in a single-server deployment. Adds operational dependency.
- **Redis**: Good for TTL-based cache but adds an external service. SQLite is simpler for v1.
- **File-based JSON**: The playground writes JSON files to disk. Works for CLI scripts but doesn't support concurrent access or TTL expiry cleanly.

## 8. Graph Data Transformation

**Decision**: Reuse the analytics-playground's `AlkemioGraphTransformer` pattern, adapted as a server-side service

**Rationale**: The playground's transformer already implements the exact logic needed: traverse Space hierarchies, extract community role sets, create typed nodes (L0/L1/L2 Spaces, Users, Organizations) with weights, create typed edges (MEMBER, LEAD, CHILD) with scope grouping. The shared `lib/` model types (NodeType, EdgeType, weights) can be adopted directly.

**Key adaptation**: Instead of writing static JSON files, the transformer runs as an in-process service called after GraphQL acquisition, and the result is cached in SQLite and served via the BFF API.

## 9. Testing Strategy

**Decision**: Vitest for unit/integration tests (both server and frontend), Playwright for E2E, React Testing Library for component tests

**Rationale**: Vitest is the natural match for Vite-based projects and works well for Node.js server tests too. Playwright handles the full auth redirect flow in E2E tests. React Testing Library for component-level interaction tests.

**Alternatives considered**:
- **Jest**: Works but Vitest has better Vite integration and faster execution.
- **Cypress**: Good E2E tool but Playwright has better multi-browser support and handles redirect flows more naturally.

## 10. CSS / Theming

**Decision**: CSS custom properties (design tokens from design brief) + CSS modules

**Rationale**: The design brief defines a tokenized theme (`--background`, `--foreground`, `--primary`, `--text-*`, `--radius`, `--elevation-sm`) using Inter font. CSS custom properties map directly to these tokens. CSS modules provide scoping without a runtime cost.

**Alternatives considered**:
- **Tailwind CSS**: Popular but the design brief's fixed token set maps more naturally to CSS custom properties. Tailwind's utility classes would need extensive customization to match the brief's exact tokens.
- **styled-components / Emotion**: Runtime CSS-in-JS adds bundle weight without benefit when the token set is static.
