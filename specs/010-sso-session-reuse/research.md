# Research: SSO Session Reuse

**Feature**: 010-sso-session-reuse | **Date**: 2026-03-04

## R1: Kratos Session Cookie Mechanism

**Decision**: Use the `ory_kratos_session` cookie set by Alkemio's Kratos browser flow.

**Rationale**: When users log into the Alkemio platform via the browser, Kratos sets an `ory_kratos_session` cookie (HttpOnly, Secure, SameSite=Lax). This cookie is automatically sent by the browser to any endpoint on the same domain/subdomain. The frontend can detect the cookie's *presence* (if not HttpOnly) or attempt a BFF-proxied session check. Since the cookie is likely HttpOnly, the frontend cannot read it directly via `document.cookie` — instead, the BFF endpoint receives it via the browser's automatic cookie forwarding when `credentials: 'include'` is used on the fetch request.

**Alternatives considered**:
- Reading cookie directly via `document.cookie` — rejected because Kratos session cookies are typically HttpOnly for security
- Using localStorage/sessionStorage from Alkemio — rejected because cross-origin storage is inaccessible
- Embedding an iframe to the Alkemio domain — rejected as overly complex and fragile

## R2: Session Validation via Kratos Whoami

**Decision**: BFF calls Kratos `GET /sessions/whoami` with the forwarded session cookie to validate the session and extract user identity.

**Rationale**: The Kratos `/sessions/whoami` endpoint accepts either a session cookie or a session token and returns the full session object including user identity traits (email, name). This is the standard way to check if a browser session is valid. The response includes `session_token` which the BFF can return to the frontend for subsequent Bearer auth.

**Alternatives considered**:
- Using `@alkemio/client-lib` — rejected because it only supports the API flow (password auth), not browser session validation
- Calling the Alkemio GraphQL `me` query with the cookie — rejected because the GraphQL API expects Bearer tokens, not cookies

## R3: Cookie Forwarding from Frontend to BFF

**Decision**: Frontend makes a fetch request to a new BFF endpoint (`POST /api/auth/sso/detect`) with `credentials: 'include'`. The browser automatically attaches same-domain cookies. The BFF reads the Kratos session cookie from the request headers and forwards it to Kratos whoami.

**Rationale**: Using `credentials: 'include'` on the fetch request ensures the browser sends all cookies for the BFF's domain. In production (same domain/subdomain as Alkemio), the Kratos session cookie will be included. The BFF extracts it from `req.headers.cookie`, parses the `ory_kratos_session` value, and calls Kratos whoami.

**Key requirement**: In production, the BFF must be served from the same domain or a subdomain of the Alkemio platform for cookie sharing to work. On localhost, cookies are shared across ports by default.

**Alternatives considered**:
- Having the frontend read the cookie and send it in a custom header — rejected because HttpOnly cookies are not accessible to JavaScript
- Using a separate CORS-enabled endpoint on Alkemio — rejected because it violates the BFF boundary principle

## R4: Kratos URL Discovery

**Decision**: Discover the Kratos public URL dynamically via the Alkemio GraphQL `configuration` query (same mechanism `@alkemio/client-lib` uses), or allow it to be configured via `ALKEMIO_KRATOS_PUBLIC_URL` env var.

**Rationale**: The existing `@alkemio/client-lib` already discovers `kratosPublicBaseURL` from `platform.configuration.authentication.providers[0].config.kratosPublicBaseURL`. The BFF can reuse this pattern. Adding an optional env var provides a fallback for environments where the GraphQL endpoint isn't available at startup.

**Alternatives considered**:
- Hardcoding the Kratos URL — rejected because it varies by environment
- Only using env var — rejected because dynamic discovery is more robust and consistent with existing patterns

## R5: User Profile Display Architecture

**Decision**: Create a React context (`UserContext`) that fetches and caches user profile data (displayName, avatarUrl) from `GET /api/auth/me` after authentication. A `UserProfileMenu` component consumes this context and renders in the TopBar.

**Rationale**: The `/api/auth/me` endpoint already exists and returns `{ id, displayName, avatarUrl }`. Currently the frontend never calls it. Adding a context provider ensures user identity is available to any component without prop drilling. The TopBar's existing logout button is replaced by an avatar + dropdown menu.

**Alternatives considered**:
- Returning user profile data in the login response — would work but requires changing the login endpoint contract; the `/me` endpoint already exists
- Storing user data in localStorage — rejected because it's unnecessary; a context provider is simpler and avoids stale data issues

## R6: Same-Domain Cookie Sharing — Production Deployment

**Decision**: Document that in production, the Ecosystem Analytics BFF must be deployed on the same domain or a subdomain of the Alkemio platform (e.g., `analytics.alkem.io` alongside `alkem.io`).

**Rationale**: Browser cookie policies require same-site cookies to be on the same registrable domain. The Kratos session cookie set by `alkem.io` will be sent to `analytics.alkem.io` if the cookie's domain is `.alkem.io`. On localhost, cookies are shared across ports by default.

**Alternatives considered**:
- Cross-domain cookie sharing via SameSite=None — requires Secure flag and explicit opt-in from Alkemio; fragile across browsers
- Using a reverse proxy to serve everything under one domain — viable but infrastructure-level concern outside this feature's scope
