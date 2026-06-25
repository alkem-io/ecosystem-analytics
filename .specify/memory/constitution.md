<!--
Sync Impact Report
- Version change: 4.2.0 → 4.3.0
- MINOR (4.3.0): Generalised Principle VII from "VNG Map Scope" to "Dutch-Dashboard Map Scope
  (Netherlands-only)" so the HARD Netherlands-only map requirement formally binds EVERY Dutch
  dashboard — VNG AND the new GovTech Netherlands dashboard (feature 017-govtech-frontend) — and
  any future Dutch dashboard. No requirement weakened; scope widened to match the multi-dashboard
  reality. Implementation note now references both apps' initiative maps (frontend/vng and
  frontend/govtech) plus the shared ForceGraph. Mirrored as spec 017 FR-019. No other principle changed.
- Earlier history:
- Version change: 4.1.0 → 4.2.0
- MINOR (4.2.0): Added Principle VII — VNG Map Scope (Netherlands-only) as a HARD REQUIREMENT:
  every VNG dashboard map (GraphTab + initiative-details) MUST show ONLY the Netherlands, tiles
  clipped to the NL boundary, nothing outside. Implemented in shared ForceGraph (region fill +
  clipped tiles + inverse cutout, gated to mapRegion==='netherlands') and mirrored in the
  initiative-details map. Mirrored as spec FR-048. No existing principle changed.
- Version change: 4.0.0 → 4.1.0
- MINOR (4.1.0): Development Workflow updated for the pnpm-workspace, multi-SPA layout
  (frontend/{shared,ecosystem-analytics,vng,…}) and the **multi-dashboard serving pattern** —
  one BFF container serving many SPAs on distinct ports (Explorer :4000, VNG :4001, …), each
  on its own subdomain with shared parent-domain `ea_session` sign-in. Documents the standard
  "add a new dashboard" steps (feature 016-vng-frontend; app-side of the vih-analytics.alkem.io
  rollout). Also records: dangerouslyAllowAllBuilds for pnpm 11; the @layer-base CSS-reset rule.
  No principle added/removed/redefined. CLAUDE.md architecture section also updated.
- Earlier history:
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

### VII. Dutch-Dashboard Map Scope (Netherlands-only) — HARD REQUIREMENT

- Every **Dutch dashboard** map — currently the **VNG** and **GovTech Netherlands** dashboards
  (and any future Dutch dashboard), each one's GraphTab network map AND its initiative-details map —
  MUST display **ONLY the Netherlands**. The other countries (England, Germany, Belgium) and the
  open sea beyond the coastline MUST **NOT be rendered at all** — not greyed out, not faint, not a
  silhouette. Everything outside the Netherlands boundary is **plain white / empty (the page/card
  background)**.
- The intended look (reference: feature 016 design images, Image #21): the Netherlands shown with
  **real map-tile detail (roads/towns)** clipped exactly to the Netherlands boundary, subtle province
  borders, and node/gemeente avatars overlaid at their geo-locations — surrounded by plain white.
  Map tiles inside the Netherlands are **essential** (not optional).
- Implementation: clip the tile layer to the Netherlands boundary via an SVG `clipPath`
  (`frontend/shared/src/graph/ForceGraph.tsx` for the GraphTab, gated to `mapRegion==='netherlands'`,
  shared by every Dutch dashboard; a static `clipPath` in each Dutch app's initiative-details map —
  `frontend/vng/.../InitiativeMap.tsx` and `frontend/govtech/.../InitiativeMap.tsx`, or the shared
  `InitiativeMap` they both consume). **Any change to any of these maps MUST preserve this
  Netherlands-only behaviour** — it is a regression if anything outside the Netherlands ever appears.
  The Explorer's multi-region map (world/europe) is out of scope.

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

- **Package manager**: pnpm (>= 9). No npm or yarn lock files. The repo is a pnpm workspace (`pnpm-workspace.yaml`: `server`, `frontend/*`). Dependency build scripts are allowed via `dangerouslyAllowAllBuilds: true` in `pnpm-workspace.yaml` (pnpm 11 makes ignored builds a fatal `--frozen-lockfile` error; this is the only key that works across 11.x).
- **Repository structure**: one BFF (`server/`, Express) plus a `frontend/` parent containing multiple SPA packages — `frontend/shared` (`@ea/shared`: graph/map/details/services/ui/tokens shared by all SPAs), `frontend/ecosystem-analytics` (the Explorer), `frontend/vng` (the VNG Kenniscentrum Innovatie dashboard), and any future dashboards. Shared server types live in `server/src/types/` and are imported via the `@server/types` path alias; shared frontend code via `@ea/shared`.
- **TypeScript strict mode**: `tsc --noEmit` MUST pass on `server/` and every `frontend/*` package before any merge to the main branch.
- **Codegen workflow**: when `.graphql` query or fragment files are added or modified, run `pnpm run codegen` in `server/` to regenerate the typed SDK. Generated files (`src/graphql/generated/`) MUST be committed.
- **Frontend tooling**: Vite + Tailwind v4 + Radix (shadcn-style) per SPA. Design tokens as CSS custom properties in `@ea/shared` `styles/tokens.css`; per-dashboard overrides go in that app's entry stylesheet. NOTE: any global CSS reset MUST be inside `@layer base` — unlayered CSS overrides ALL Tailwind utilities in v4.
- **Dev servers**: `pnpm run dev` at the root runs the BFF + all SPAs concurrently (BFF tsx watch; each SPA on its own Vite port proxying `/api` to the BFF — e.g. Explorer :5173, VNG :5174).
- **Multi-dashboard serving (one BFF, many SPAs, distinct ports)**: a SINGLE BFF container serves every SPA, each on its own port, all sharing the same `/api` routes and SQLite session/cache store. `createApp(staticDir)` is invoked once per SPA in `server/src/index.ts`; ports are `config.port` (Explorer, `../frontend/dist`) and `config.vngPort = port+1` (VNG, `../frontend-vng/dist`), with `EXPOSE`d container ports (4000, 4001, …). Each SPA is fronted by its own subdomain (e.g. `analytics.alkem.io`, `vih-analytics.alkem.io`) routed by infra to the matching port; sign-in is shared via the parent-domain `ea_session` cookie (`SESSION_COOKIE_DOMAIN=.alkem.io`, every subdomain origin in `SESSION_ALLOWED_ORIGINS`). **To add a new dashboard**: create `frontend/<name>` (consume `@ea/shared`), build it to `frontend/<name>/dist`, COPY it into the image, add a `createApp('../<name>/dist')` listener on the next port, `EXPOSE` it, and add the subdomain route + allowed-origin. This is the standard pattern — more dashboards are expected.

## Governance

- This constitution is the authoritative source for project-wide engineering principles and constraints.
- All code changes (PRs, reviews) MUST be verified against these principles before merge.
- Amendments to this constitution require:
  1. A documented rationale for the change.
  2. A version bump following semantic versioning (MAJOR for principle removals/redefinitions, MINOR for additions, PATCH for clarifications).
  3. An updated Sync Impact Report (HTML comment at top of this file).
- The feature spec (`specs/001-ecosystem-analytics/spec.md`) contains the detailed functional, non-functional, and technical requirements. This constitution captures the overarching principles that govern how those requirements are implemented.

**Version**: 4.3.0 | **Ratified**: 2026-02-21 | **Last Amended**: 2026-06-25
