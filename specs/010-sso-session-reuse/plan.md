# Implementation Plan: SSO Session Reuse

**Branch**: `010-sso-session-reuse` | **Date**: 2026-03-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-sso-session-reuse/spec.md`

## Summary

Enable SSO session reuse by detecting the Alkemio platform's Kratos browser session cookie (`ory_kratos_session`). When found, the frontend sends it to the BFF, which calls Kratos's `/sessions/whoami` endpoint to validate the session and extract the session token. The user sees a confirmation prompt with their identity, and upon confirming, the token is stored locally for all subsequent BFF requests. Additionally, a persistent user profile indicator (avatar + dropdown) replaces the current standalone logout button across all authenticated pages.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, ESM)
**Primary Dependencies**: React 19, Vite 7, Express 5, `@alkemio/client-lib`, `graphql-request`, D3.js v7
**Storage**: SQLite (existing cache, no changes needed)
**Testing**: Vitest (both server and frontend)
**Target Platform**: Web (modern browsers), Node 20 server
**Project Type**: Web application (BFF + React SPA)
**Performance Goals**: SSO detection < 2s; no delay when no session exists
**Constraints**: Must preserve BFF boundary (Constitution Principle III); cookie accessible only on same domain/subdomain
**Scale/Scope**: Single-user session detection; ~5 new/modified files per package

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Kratos API Flow Auth | **PASS with extension** | Existing password flow unchanged. New SSO path uses Kratos `whoami` endpoint — same Kratos infrastructure, different flow (browser session → session token). Token still forwarded as Bearer. |
| II. Typed GraphQL Contract | **PASS** | No new GraphQL queries needed for SSO detection (uses Kratos REST, not GraphQL). Existing `me` query reused for user profile. |
| III. BFF Boundary | **PASS** | Frontend sends cookie to BFF; BFF performs Kratos whoami call. Frontend never contacts Alkemio directly. |
| IV. Data Sensitivity | **PASS** | Session cookie transmitted only to BFF over HTTPS. Token not logged. Cache scoping unchanged. |
| V. Graceful Degradation | **PASS** | Cookie detection failure silently falls back to login form. Missing avatar shows placeholder. |
| VI. Design Fidelity | **PASS** | User profile dropdown is new UI — no conflict with existing design brief. |

**Gate result: PASS** — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/010-sso-session-reuse/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── sso-endpoints.md
└── tasks.md
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── auth/
│   │   ├── login.ts              # Existing — no changes
│   │   ├── middleware.ts          # Existing — no changes
│   │   ├── me.ts                 # Existing — no changes
│   │   ├── resolve-user.ts       # Existing — no changes
│   │   └── sso.ts                # NEW — SSO session detection endpoint
│   ├── routes/
│   │   └── auth.ts               # Modified — register new SSO route
│   └── types/
│       └── api.ts                # Modified — add SsoDetectResponse type
└── tests/

frontend/
├── src/
│   ├── components/
│   │   └── UserProfileMenu.tsx   # NEW — avatar + dropdown component
│   ├── context/
│   │   └── UserContext.tsx        # NEW — user identity context provider
│   ├── pages/
│   │   └── LoginPage.tsx         # Modified — add SSO detection on mount
│   ├── services/
│   │   ├── auth.ts               # Modified — add SSO-related functions
│   │   └── api.ts                # No changes
│   ├── components/panels/
│   │   └── TopBar.tsx            # Modified — replace logout button with UserProfileMenu
│   └── hooks/
│       └── useUser.ts            # NEW — hook wrapping UserContext
└── tests/
```

**Structure Decision**: Follows existing web application structure (server/ + frontend/). New files are minimal — one new endpoint, one new component, one new context provider, one new hook.
