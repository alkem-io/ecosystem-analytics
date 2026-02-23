<!--
Sync Impact Report
- Version change: 1.0.0 → 2.1.0
- Breaking change (2.0.0): Principle I redefined — auth moves from BFF-mediated to frontend-direct
- Minor change (2.1.0): Principle I refined — popup flow with Kratos session tokenization; Principle III clarified — frontend may access public Alkemio APIs (auth, config) but NOT GraphQL for data
- Updated principles: I (Frontend-Direct Authentication), III (BFF Boundary)
- Updated sections: Security Requirements
- Rationale: Cross-origin auth via popup + Kratos tokenize; explicit separation of public API access vs GraphQL data operations
- Follow-up TODOs: Kratos tokenizer template must be configured on Alkemio infrastructure
-->

# Ecosystem Analytics Constitution

## Core Principles

### I. Frontend-Direct Authentication (Popup Flow)

- The **frontend** MUST authenticate users directly with the Alkemio platform via a **popup window** that opens the Kratos browser login flow (password or OIDC). The BFF server is NOT involved in the authentication handshake.
- After successful login, the popup obtains a tokenized session JWT from Kratos's `/sessions/whoami?tokenize_as=...` endpoint and sends it to the parent window via `postMessage`.
- The frontend holds this JWT in memory and sends it with every request to the BFF. The BFF forwards it as an `Authorization` header to the Alkemio GraphQL API. The BFF does NOT issue its own tokens.
- Credentials MUST NOT be entered in, handled by, or stored by this tool — not in `.env` files, config files, environment variables, local storage, or logs.
- A dev-only bypass (`DEV_AUTH_BYPASS=true`) MAY exist for local development where the redirect flow is not feasible, but it MUST NOT be enabled in production.
- Bearer tokens MUST be held in frontend memory only and MUST NOT be persisted to any storage mechanism.

### II. Typed GraphQL Contract

- All GraphQL interactions with the Alkemio API MUST use the codegen-generated typed SDK (`getSdk` from `@graphql-codegen/cli`).
- Hand-written raw GraphQL query strings MUST NOT appear in service code.
- `.graphql` files in `src/graphql/queries/` and `src/graphql/fragments/` are the single source of truth for query shapes.
- `pnpm run codegen` regenerates the TypeScript SDK from the live Alkemio schema; it MUST be re-run whenever `.graphql` files change.
- The codegen endpoint is configured via `ALKEMIO_GRAPHQL_ENDPOINT` in `server/.env`.

### III. BFF Boundary

- The React frontend MUST NOT communicate directly with the Alkemio **GraphQL API** for data acquisition or visualisation — all data operations flow through the Express BFF server.
- The frontend IS allowed to access **public Alkemio APIs** directly for: (a) authentication (Kratos/OIDC browser flow via popup), (b) platform configuration/discovery endpoints.
- The BFF handles: (a) receiving the Alkemio-issued bearer token from the frontend and forwarding it to the Alkemio GraphQL API, (b) per-user per-Space caching, (c) static asset serving in production. The BFF does NOT handle login redirects, callbacks, or session cookie exchange.
- This boundary keeps data operations proxied through the BFF (caching, access control) while allowing the frontend to authenticate directly with Alkemio and fetch public configuration.

### IV. Data Sensitivity

- All Alkemio-derived data (graph datasets, user profiles, organisation profiles, community roles) MUST be treated as sensitive user data.
- Cache entries MUST be scoped per-user and per-Space; data MUST NOT leak across users.
- Bearer tokens, session cookies, and Kratos session tokens MUST NOT be logged at any level (including debug).
- SQL queries MUST use parameterised statements; no string interpolation of user-supplied values.
- Cache access-control MUST be verified at read time — stale caches MUST NOT re-introduce unauthorised data.

### V. Graceful Degradation

- The system MUST degrade gracefully when optional data fields are missing (location, avatar, tagline, URLs).
- No missing optional field SHOULD cause a crash, blank screen, or broken layout.
- When external assets fail to load (map basemaps, avatars), the UI MUST display a meaningful fallback (e.g., "Map unavailable" text, placeholder icon).
- Error states MUST be user-friendly with clear messaging and recovery paths (e.g., "Back to Space Selector").

### VI. Design Fidelity

- The UI MUST match the design brief (`specs/001-ecosystem-analytics/design-brief-figma-make.md`), which is the pixel-perfect contract.
- Theme tokens, typography (Inter), fixed layout constants (panel widths, drawer sizes, top bar height), and progressive loading copy are defined in the design brief.
- **Conflict rule**: discrepancies in visual design, spacing, typography, or tokens defer to the design brief; discrepancies in feature behaviour, access control, caching, or data schema defer to the spec.

## Security Requirements

- No user credentials in `.env` — only server deployment parameters (Alkemio URLs, port, cache TTL).
- `DEV_AUTH_BYPASS` MUST NOT be set to `true` in any production or staging deployment.
- The BFF MUST validate that every incoming request carries a bearer token before forwarding to the Alkemio GraphQL API.
- All SQL uses parameterised queries via better-sqlite3 prepared statements.
- Cache entries are keyed by `(user_id, space_id)` — every read verifies the requesting user matches the cache owner. The user ID is extracted from the bearer token (JWT decode) or by calling the Alkemio `/me` query.
- The `max_spaces_per_query` limit MUST be enforced server-side to prevent excessive resource consumption.
- Bearer tokens are Alkemio-issued; the BFF does not mint or manage its own tokens. Token expiry is handled by the frontend (re-prompt login).

## Development Workflow

- **Package manager**: pnpm (>= 9). No npm or yarn lock files.
- **Repository structure**: two separate applications — `server/` (Express BFF) and `frontend/` (React SPA). Shared types live in `server/src/types/` and are imported by the frontend via TypeScript path alias.
- **TypeScript strict mode**: `tsc --noEmit` MUST pass on both `server/` and `frontend/` before any merge to the main branch.
- **Codegen workflow**: when `.graphql` query or fragment files are added or modified, run `pnpm run codegen` in `server/` to regenerate the typed SDK. Generated files (`src/graphql/generated/`) MUST be committed.
- **Frontend tooling**: Vite for dev server and production builds. CSS Modules for component styles. Design tokens as CSS custom properties in `styles/tokens.css`.
- **Dev servers**: `pnpm run dev` in `server/` (port 4000, tsx watch) and `frontend/` (port 5173, Vite with `/api` proxy to :4000).
- **Production build**: `pnpm run build` in both packages. The server serves frontend static files from `frontend/dist/` when `NODE_ENV=production`.

## Governance

- This constitution is the authoritative source for project-wide engineering principles and constraints.
- All code changes (PRs, reviews) MUST be verified against these principles before merge.
- Amendments to this constitution require:
  1. A documented rationale for the change.
  2. A version bump following semantic versioning (MAJOR for principle removals/redefinitions, MINOR for additions, PATCH for clarifications).
  3. An updated Sync Impact Report (HTML comment at top of this file).
- The feature spec (`specs/001-ecosystem-analytics/spec.md`) contains the detailed functional, non-functional, and technical requirements. This constitution captures the overarching principles that govern how those requirements are implemented.

**Version**: 2.1.0 | **Ratified**: 2026-02-21 | **Last Amended**: 2026-02-23
