<!--
Sync Impact Report
- Version change: 1.0.0 → 3.0.0
- Breaking change (2.0.0): Principle I redefined — auth moves from BFF-mediated SSO to frontend-direct popup
- Breaking change (3.0.0): Principle I redefined again — auth moves to username/password via BFF Kratos API flow (non-interactive); Principle III tightened — frontend communicates exclusively with BFF (no direct Alkemio access)
- Updated principles: I (Alkemio Identity Authentication), III (BFF Boundary)
- Updated sections: Security Requirements
- Rationale: Popup/SSO approach infeasible without Kratos tokenization infrastructure; username/password via Kratos API flow works today and matches analytics-playground pattern
- Follow-up TODOs: none
-->

# Ecosystem Analytics Constitution

## Core Principles

### I. Alkemio Identity Authentication (Kratos API Flow)

- Users authenticate with their **Alkemio credentials** (email and password) via a login form in the frontend.
- Credentials are sent to the BFF (`POST /api/auth/login`), which authenticates against Alkemio's Kratos identity service using the non-interactive API flow (`/self-service/login/api`).
- The BFF returns the Kratos `session_token` to the frontend. The frontend holds this token in memory and sends it as `Authorization: Bearer` with every BFF request.
- The BFF forwards the token to the Alkemio GraphQL API.
- User credentials MUST NOT be stored or logged by any component — they are used only for the initial Kratos authentication exchange.
- Credentials MUST NOT be supplied via `.env` files, config files, or environment variables — `.env` is only for server deployment parameters (Alkemio URLs, port, cache TTL).
- Session tokens MUST be held in frontend memory only and MUST NOT be persisted to any storage mechanism.

### II. Typed GraphQL Contract

- All GraphQL interactions with the Alkemio API MUST use the codegen-generated typed SDK (`getSdk` from `@graphql-codegen/cli`).
- Hand-written raw GraphQL query strings MUST NOT appear in service code.
- `.graphql` files in `src/graphql/queries/` and `src/graphql/fragments/` are the single source of truth for query shapes.
- `pnpm run codegen` regenerates the TypeScript SDK from the live Alkemio schema; it MUST be re-run whenever `.graphql` files change.
- The codegen endpoint is configured via `ALKEMIO_GRAPHQL_ENDPOINT` in `server/.env`.

### III. BFF Boundary

- The React frontend MUST communicate **exclusively** with the BFF server — never directly with the Alkemio platform (not for authentication, not for GraphQL, not for any other purpose).
- The BFF handles: (a) user authentication via Kratos API flow, (b) forwarding the session token to the Alkemio GraphQL API, (c) per-user per-Space caching, (d) static asset serving in production.
- This boundary keeps all Alkemio interactions server-side, avoids CORS issues, and centralises caching and access control.

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

- No user credentials in `.env` — only server deployment parameters (Alkemio URLs, Kratos URL, port, cache TTL).
- User credentials (email/password) MUST NOT be stored or logged by any component — used only for the initial Kratos authentication exchange.
- The BFF MUST validate that every protected request carries a bearer token before forwarding to the Alkemio GraphQL API.
- All SQL uses parameterised queries via better-sqlite3 prepared statements.
- Cache entries are keyed by `(user_id, space_id)` — every read verifies the requesting user matches the cache owner. The user ID is resolved by calling Alkemio's `me` query with the session token.
- The `max_spaces_per_query` limit MUST be enforced server-side to prevent excessive resource consumption.
- Session tokens are Kratos-issued; the BFF does not mint its own tokens. Token expiry is handled by the frontend (re-prompt login on 401).

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

**Version**: 3.0.0 | **Ratified**: 2026-02-21 | **Last Amended**: 2026-02-23
