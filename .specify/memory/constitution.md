<!--
Sync Impact Report
- Version change: 3.1.0 → 4.0.0
- Breaking change (4.0.0): Principle I redefined — auth moves from username/password via BFF Kratos
  API flow to redirect-based Alkemio OIDC (Authorization Code + PKCE) with EA as its own registered
  OAuth2 client; tokens move entirely server-side (encrypted at rest), browser holds only an opaque
  session-id cookie. Principle III updated (BFF orchestrates OIDC, not Kratos password exchange).
  Principle IV expanded (token encryption at rest, shared server-side session store).
- Updated principles: I (Alkemio Identity Authentication → Alkemio OIDC Authentication),
  III (BFF Boundary), IV (Data Sensitivity)
- Updated sections: Security Requirements
- Rationale: Alkemio retired the Kratos password API in favor of OIDC (Ory Hydra); EA is registered
  as the `ecosystem-analytics` OAuth2 client. The old flow no longer functions against production.
  The redirect-based own-client model also enables local-against-production development (a `*.alkem.io`
  cookie cannot reach localhost) and removes the present exposure of a real token in browser storage.
  See specs/015-oidc-auth/ (spec.md, plan.md).
- Earlier history (2.0.0): Principle I — auth moved from BFF-mediated SSO to frontend-direct popup.
  (3.0.0): Principle I — auth moved to username/password via BFF Kratos API flow; Principle III tightened.
  (3.1.0): Principle I .env policy expanded to allow third-party service API keys (e.g., OpenAI).
- Templates: ✅ .specify/templates/plan-template.md (generic Constitution Check, no change needed)
  ✅ .specify/templates/spec-template.md (no principle-specific text) ✅ .specify/templates/tasks-template.md
  (no principle-specific text)
- Follow-up TODOs: none
-->

# Ecosystem Analytics Constitution

## Core Principles

### I. Alkemio OIDC Authentication (Authorization Code + PKCE via BFF)

- Users authenticate through **Alkemio's hosted OIDC login** (Ory Hydra), not an in-application
  credential form. Ecosystem Analytics is registered as its own OAuth2/OIDC client
  (`ecosystem-analytics`) and runs the redirect-based **Authorization Code + PKCE (S256)** flow.
- The BFF orchestrates the entire flow server-side: it builds the authorization redirect (generating
  `state`, `nonce`, and a PKCE `code_verifier`), handles the callback, exchanges the code at the token
  endpoint, validates the ID token, and establishes EA's **own** server-side session. EA MUST NOT
  collect Alkemio usernames or passwords, and MUST NOT render any method-specific sign-in UI
  (including social-provider buttons) — method selection happens entirely on Alkemio's page.
- EA authorizes Alkemio GraphQL calls with the access token Alkemio issues to the EA client (sent as
  `Authorization: Bearer` from the BFF to the Alkemio API), refreshing it transparently via the
  refresh-token grant while the grant remains valid. EA MUST NOT depend on inheriting Alkemio's
  `*.alkem.io` browser session cookie.
- All tokens (access, refresh) and the client secret MUST live only on the backend. The browser MUST
  receive only an opaque, deployment-scoped session-id cookie — never a token, refresh grant, or
  client secret. Tokens MUST NOT be persisted in any browser storage.
- The flow MUST work identically in two deployments, differing only by configuration: hosted at
  `ecosystem-analytics.alkem.io` (confidential client) and local-against-production (a separate public
  PKCE client, so the production secret never lands on a developer machine).
- Credentials and secrets MUST NOT be stored or logged by any component. `.env` is only for server
  deployment parameters (Alkemio/OIDC URLs, client id, port, cache TTL, session encryption key) and
  third-party service API keys (e.g., OpenAI); the confidential client secret is supplied to the
  hosted backend by secret management, never to a developer machine.

### II. Typed GraphQL Contract

- All GraphQL interactions with the Alkemio API MUST use the codegen-generated typed SDK (`getSdk` from `@graphql-codegen/cli`).
- Hand-written raw GraphQL query strings MUST NOT appear in service code.
- `.graphql` files in `src/graphql/queries/` and `src/graphql/fragments/` are the single source of truth for query shapes.
- `pnpm run codegen` regenerates the TypeScript SDK from the live Alkemio schema; it MUST be re-run whenever `.graphql` files change.
- The codegen endpoint is configured via `ALKEMIO_GRAPHQL_ENDPOINT` in `server/.env`.

### III. BFF Boundary

- The React frontend MUST communicate **exclusively** with the BFF server — never directly with the Alkemio platform (not for authentication, not for GraphQL, not for any other purpose).
- The BFF handles: (a) the redirect-based OIDC flow as the registered `ecosystem-analytics` client (authorization redirect, callback, token exchange, transparent refresh, revocation on sign-out), (b) authorizing Alkemio GraphQL API calls with the EA-issued access token, (c) per-user per-Space caching, (d) static asset serving in production.
- This boundary keeps all Alkemio interactions server-side, avoids CORS issues, and centralises caching and access control.

### IV. Data Sensitivity

- All Alkemio-derived data (graph datasets, user profiles, organisation profiles, community roles) MUST be treated as sensitive user data.
- Cache entries MUST be scoped per-user and per-Space; data MUST NOT leak across users.
- OIDC access/refresh tokens, the client secret, session identifiers, cookie values, and the
  `code_verifier`/`state`/`nonce` MUST NOT be logged at any level (including debug).
- OIDC access and refresh tokens MUST be persisted only server-side, **encrypted at rest**, keyed by
  an opaque session id, in a shared store (not per-process), so the hosted deployment can run multiple
  backend replicas without losing sessions. The browser holds only the opaque session-id reference.
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

- No user credentials in `.env` — only server deployment parameters (Alkemio/OIDC URLs, OIDC client
  id, port, cache TTL, session encryption key) and third-party service API keys (e.g., OpenAI). The
  confidential client secret is provided to the hosted backend via secret management only.
- EA MUST NOT collect, store, or log Alkemio usernames or passwords; all credential entry happens on
  Alkemio's hosted login page.
- The BFF MUST resolve a valid server-side session for every protected request before authorizing the
  Alkemio GraphQL API call; a missing, expired, or unrefreshable session results in 401 and a clean
  redirect back through the Alkemio login.
- The OIDC callback MUST be validated against forgery and replay: one-time pre-auth state, timing-safe
  `state` comparison, `nonce` validation, and an allow-list check on the post-login return
  destination (no open redirect).
- All SQL uses parameterised queries via better-sqlite3 prepared statements.
- Cache entries are keyed by `(user_id, space_id)` — every read verifies the requesting session's
  user matches the cache owner. The user id is the stable Alkemio identity (`alkemio_actor_id` claim)
  carried on the session.
- The `max_spaces_per_query` limit MUST be enforced server-side to prevent excessive resource consumption.
- Tokens are Alkemio/Hydra-issued; the BFF does not mint its own tokens, but it does mint its own
  opaque EA session id. Access tokens are refreshed transparently server-side; session validity is
  bounded by the refresh-grant lifetime plus a configurable idle timeout (default 8 hours). On
  explicit sign-out the BFF MUST revoke its access and refresh tokens at Alkemio's revocation endpoint
  and delete the session record.

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

**Version**: 4.0.0 | **Ratified**: 2026-02-21 | **Last Amended**: 2026-06-16
