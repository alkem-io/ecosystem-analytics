# Feature Specification: Redirect-Based Alkemio OIDC Login (Hosted + Local-Against-Production)

**Feature Branch**: `015-oidc-auth`  
**Created**: 2026-06-16  
**Status**: Draft  
**Input**: User description: "Alkemio has recently changed to OIDC. Alkemio recognizes ecosystem-analytics as an OAuth2 client. I need this project to redirect to the Alkemio login page for authentication and reuse the Alkemio session for access. I want to cover both cases: using Alkemio OIDC in the browser at `ecosystem-analytics.alkem.io`, and running locally while pointing at production data through the Alkemio API."

## Overview

Alkemio has migrated its identity platform to OIDC. Ecosystem Analytics (EA) is registered with Alkemio as its own OAuth2/OIDC client (`ecosystem-analytics`). Authentication is no longer an in-app email/password form. Instead, when a visitor is not signed in, EA's backend starts the standard redirect-based sign-in: it sends the visitor to Alkemio's hosted login page, where they choose whichever method Alkemio offers — username/password or a social provider such as Microsoft or LinkedIn. After the visitor authenticates with Alkemio, Alkemio returns them to an EA return address; EA's backend completes the sign-in, establishes **its own** signed-in EA session, and from then on uses the credential Alkemio issued to EA to authorize every request for data — so what a person sees always matches what their Alkemio account is allowed to see.

This replaces the previous approach, where EA collected Alkemio credentials directly and detected a legacy Kratos browser session.

**EA acts as its own client — it does not borrow Alkemio's browser session.** Because EA holds its own client identity and obtains its own credential on the visitor's behalf, the same sign-in works in two deployment situations the feature must both support:

1. **Hosted in the browser** at `ecosystem-analytics.alkem.io` (production deployment).
2. **Running locally** (developer machine) while pointing at **production** Alkemio data through the production Alkemio API.

The only thing that differs between these two situations is configuration (the return address Alkemio sends the visitor back to, and the EA session-cookie scope). The sign-in behavior, the data authorization, and the visitor experience are identical. A design that depended on silently inheriting Alkemio's `*.alkem.io` browser cookie would work only in the hosted case and would break local development against production; this feature therefore does not depend on that cookie.

## System Context & Architecture

Ecosystem Analytics is a single application made of two cooperating parts that together form "EA"; the authentication design depends on this split:

- **Frontend (browser-side app)**: a single-page application delivered to and run inside the visitor's browser. Its code is public — anything shipped to it is readable by anyone. It therefore holds **no secrets and no tokens**; it talks exclusively to the EA backend.
- **Backend (BFF — backend-for-frontend)**: a server process that EA operates. It is the **only** part that communicates with Alkemio, the only holder of the EA client secret, and the only place tokens are stored. It also serves the frontend's files.

In the hosted deployment these two parts are served from a **single origin** (one process serves both the application files and the data API), so the EA session reference and the data API share an origin. In local development they run as two processes on the developer's machine, with the frontend forwarding data requests to the backend. In both situations the rule is identical: **the backend is the secret-holding boundary; the browser only ever receives an opaque, deployment-scoped EA session reference.**

This boundary is what makes the own-client model (FR-005) safe: the confidential client secret and the Alkemio-issued credentials live behind the BFF and are never exposed to public browser code, while the browser carries only a session reference that is useless outside EA.

## Clarifications

### Session 2026-06-16 (initial)

- Q: With Alkemio registering Ecosystem Analytics as an OAuth2 client, how should the redirect-and-return mechanism work? → A: EA redirects unauthenticated visitors to Alkemio's hosted login page; after authentication, Alkemio returns the visitor to an EA return address and EA completes sign-in. EA collects no credentials and renders no method-specific UI.
- Q: Which sign-in methods must be supported? → A: Every method Alkemio's login page offers — username/password and social providers (Microsoft, LinkedIn). Method selection and authentication happen entirely on Alkemio's page.
- Q: How is the Alkemio session validated on each request? → A (default): EA authorizes each data request with the credential Alkemio issued to it and treats an Alkemio rejection as the trigger to refresh or re-authenticate; Alkemio remains the source of truth.
- Q: Who authorizes use of Ecosystem Analytics? → A (default): Alkemio decides — any account authorized for the EA client is granted access, and EA adds no further gate.

### Session 2026-06-16 (clarify)

- Q: Where must the backend keep the EA session + Alkemio tokens (refresh/access)? → A: Persist server-side in the existing SQLite store, encrypted-at-rest, keyed by an opaque session id; the browser receives only that opaque session-id cookie. State is shared (single shared SQLite), so the hosted deployment is not tied to a single in-memory replica.
- Q: How long does an EA session stay valid? → A: It is bounded by Alkemio's renewal-grant lifetime (no separate EA absolute cap) — the session ends when renewal can no longer succeed — plus a configurable idle/inactivity timeout (default 8 hours) that ends an unused session sooner to limit replay of a stolen session id. Alkemio remains the source of truth for session validity.
- Q: On sign-out / session end, must EA revoke its stored Alkemio tokens at Alkemio? → A: On explicit sign-out, EA MUST revoke its own access + refresh tokens at Alkemio's revocation endpoint and then delete the server-side session record. On renewal-failure expiry the token is already dead, so EA only deletes the record. This invalidates EA's own held credentials (distinct from global single-logout, which stays out of scope) so a leaked refresh grant cannot outlive sign-out.

### Session 2026-06-16 (revision — dual deployment + own-client model)

- Q: Should EA reuse Alkemio's existing browser session cookie, or run its own client sign-in? → A: **EA runs its own redirect-based OIDC sign-in as the registered `ecosystem-analytics` client and establishes its own EA session.** Reusing Alkemio's `*.alkem.io` browser cookie was the previous assumption; it is dropped because (a) EA is a distinct registered client and (b) the cookie cannot reach EA when EA runs locally. EA authorizes Alkemio API calls with the credential Alkemio issues to EA, not with Alkemio's own browser cookie.
- Q: Must the same sign-in work both when EA is hosted at `ecosystem-analytics.alkem.io` and when EA runs locally against production? → A: **Yes — both are first-class supported cases.** They differ only by configuration (return address registered with Alkemio, and EA session-cookie scope). All sign-in and authorization behavior is identical.
- Q: When a visitor is already signed into Alkemio in the same browser, must they still see a login screen? → A: No — in the hosted case, an already-authenticated Alkemio visitor should be signed into EA without re-entering credentials (silent single sign-on). In the local case this convenience may not apply, but sign-in must still succeed via the normal login screen.

### Session 2026-06-17 (implementation — discovered during first end-to-end local-against-production sign-in)

- Q: Why did sign-in succeed (session created) yet every data request fail / loop back to login in the local deployment? → A: The session cookie was set on the OIDC callback, which in the local case is a **cross-site** redirect (localhost ← identity.alkem.io). A `SameSite=Lax` cookie set on that redirect is dropped by the browser, so the session was never sent back. The hosted case is **same-site** (both under `alkem.io`), so `Lax` is fine there. Fix: the session/pre-auth cookies are `SameSite=None; Secure` when no session-cookie domain is configured (local), and `SameSite=Lax` when one is (hosted). `Secure` is honored on `http://localhost` (a secure context). → **FR-021**.
- Q: Why did Alkemio's GraphQL reject EA's access token with `UNAUTHENTICATED` even though the visitor was signed in? → A: Alkemio's Bearer validator requires the access token's `aud` to be in an allow-list (`alkemio-web, synapse-client, element-client, ecosystem-analytics`) **and** requires an `alkemio_actor_id` claim on the access token. By default no audience was requested, so `aud` was empty. Fix: request audience `ecosystem-analytics` (an allow-listed value) so Hydra stamps it on the issued token. → **FR-005a**.
- Q: Does requesting an audience also satisfy the `alkemio_actor_id` requirement on the access token? → A: Yes in practice — the ID token always carries `alkemio_actor_id` (used to create the EA session), and once an audience is requested the access token carries it too; both are required by the Alkemio Bearer validator.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in through Alkemio (Priority: P1)

A person opens Ecosystem Analytics without an active session. Instead of being asked for a username and password inside Ecosystem Analytics, they are sent to Alkemio's login page, where they choose whichever method they prefer — username/password, Microsoft, or LinkedIn. They sign in with Alkemio (the way they already do for every other Alkemio product), and they are returned to Ecosystem Analytics signed in, landing on the place they originally tried to reach. From that point on they can view spaces and graphs exactly as their Alkemio account permits.

**Why this priority**: This is the core of the feature and the minimum that delivers value. Without it, no one can authenticate at all once the legacy credential flow is removed. It is independently shippable: a working redirect-and-return sign-in that grants access to data is a complete, demonstrable product.

**Independent Test**: Open Ecosystem Analytics in a browser with no Alkemio session. Confirm the visitor is redirected to Alkemio's login page, can authenticate there, is returned to Ecosystem Analytics signed in, lands on the originally requested page, and can load space and graph data.

**Acceptance Scenarios**:

1. **Given** a visitor with no active session opens any protected page of Ecosystem Analytics, **When** the page loads, **Then** the visitor is redirected to Alkemio's hosted login page rather than shown an in-app credential form.
2. **Given** a visitor on Alkemio's login page enters valid Alkemio credentials, **When** authentication succeeds, **Then** the visitor is returned to Ecosystem Analytics in a signed-in state and arrives at the page they originally requested.
3. **Given** a signed-in visitor, **When** they load spaces or generate a graph, **Then** the data returned reflects exactly the access their Alkemio account is granted.
4. **Given** a visitor whose Alkemio account is not authorized to use Ecosystem Analytics as a client, **When** they attempt to sign in, **Then** they are shown a clear "not authorized" message rather than a broken or empty application.
5. **Given** a visitor on Alkemio's login page, **When** they sign in with a social provider (Microsoft or LinkedIn) rather than a password, **Then** they are returned to Ecosystem Analytics signed in exactly as with username/password, with no method-specific handling inside Ecosystem Analytics.

---

### User Story 2 - One sign-in that works hosted and locally against production (Priority: P1)

A developer runs Ecosystem Analytics on their local machine but configures it to read **production** Alkemio data. When they open the local app, they go through the very same Alkemio login as a visitor on `ecosystem-analytics.alkem.io` would, are returned to their local app signed in, and then see exactly the production data their own Alkemio account is permitted to see. The hosted production visitor and the local-against-production developer follow an identical sign-in; only configuration distinguishes the two.

**Why this priority**: The user explicitly requires both situations to work, and they cannot both work under a session-reuse design. This story is what forces (and validates) the own-client sign-in model. It is co-equal with Story 1 because the architecture must satisfy it from the start, not be retrofitted. It is independently testable on a developer machine without deploying.

**Independent Test**: With EA configured locally to point at production Alkemio, open the local app with no session, complete Alkemio login, confirm return to the local app signed in, and confirm production data loads scoped to the developer's own account. Separately confirm the identical flow on `ecosystem-analytics.alkem.io`. Confirm the only differences are configuration values, not behavior.

**Acceptance Scenarios**:

1. **Given** EA is configured to run locally against production Alkemio, **When** an unauthenticated developer opens the local app, **Then** they are redirected to Alkemio's production login and, after authenticating, returned to the **local** app signed in.
2. **Given** the same EA build, **When** it is deployed at `ecosystem-analytics.alkem.io`, **Then** sign-in works identically and returns the visitor to the hosted app — without code changes, only configuration.
3. **Given** a developer signed in via the local app, **When** they load data, **Then** they see production data scoped to **their own** Alkemio permissions, never another account's.
4. **Given** a misconfigured return address (one Alkemio has not been told to allow), **When** sign-in is attempted, **Then** the visitor receives a clear failure rather than being silently redirected to an untrusted destination.

---

### User Story 3 - Seamless single sign-on for already-logged-in users (Priority: P2)

A person who is already logged into Alkemio in the same browser opens the hosted Ecosystem Analytics. Because Alkemio already recognizes their session, they reach Ecosystem Analytics signed in without having to type credentials again.

**Why this priority**: This is the day-to-day convenience that makes the hosted product feel like part of Alkemio rather than a separate login. It builds on Story 1's machinery and is the primary reason cookie/session reuse was originally requested, but the product is still usable without it (Story 1 alone lets people sign in). It applies to the hosted case; it need not hold for the local case.

**Independent Test**: In a browser already logged into Alkemio, open the hosted Ecosystem Analytics and confirm the visitor reaches the application without being prompted to enter credentials a second time.

**Acceptance Scenarios**:

1. **Given** a visitor already authenticated with Alkemio in the current browser, **When** they open hosted Ecosystem Analytics, **Then** they reach the application signed in without re-entering credentials.
2. **Given** a signed-in visitor, **When** they refresh the page or open Ecosystem Analytics in a new tab, **Then** they remain signed in without an additional login step.
3. **Given** a signed-in visitor, **When** they make repeated requests for data over the life of the session, **Then** each request is authorized using their existing session without further prompts, including transparently renewing a short-lived credential when needed.

---

### User Story 4 - Session expiry and sign-out (Priority: P3)

A person's session ends — the credential EA holds for them expires and cannot be renewed, or they sign out — while they still have Ecosystem Analytics open. The next time they act, Ecosystem Analytics recognizes that access is no longer valid and cleanly routes them back through the Alkemio login instead of showing errors. A person can also explicitly sign out of Ecosystem Analytics.

**Why this priority**: Sessions inevitably end, and graceful handling prevents confusing error states, but the feature delivers value before this is polished. It depends on Stories 1–3 being in place.

**Independent Test**: While signed in, invalidate or expire the session, then perform an action in Ecosystem Analytics; confirm the visitor is routed back to the Alkemio login rather than shown a broken page. Separately, use the sign-out control and confirm the session ends.

**Acceptance Scenarios**:

1. **Given** a signed-in visitor whose access has since expired and cannot be renewed, **When** they perform an action that requires data, **Then** they are treated as unauthenticated and routed back through the Alkemio login.
2. **Given** a signed-in visitor, **When** they choose to sign out, **Then** their Ecosystem Analytics session ends and a subsequent visit requires signing in again.
3. **Given** a visitor returning to login after expiry, **When** they re-authenticate, **Then** they resume with a valid session and regain access to their data.

---

### Edge Cases

- **Cancelled or failed login**: The visitor reaches Alkemio's login page but cancels or fails authentication — they must be returned to a clear state in Ecosystem Analytics (e.g., a "sign in to continue" screen), not a broken page or an infinite redirect loop.
- **Missing or unusable session**: Ecosystem Analytics is reached but no valid EA session exists (the visitor never completed login, or the EA session expired) — the visitor is treated as unauthenticated and sent to login rather than shown empty data.
- **Short-lived credential expiry mid-task**: The credential EA holds for the visitor is short-lived; when it expires during use, EA renews it transparently if possible, and only falls back to re-authentication when renewal is no longer possible — without surfacing raw errors.
- **Forged or replayed return**: A manipulated or replayed authentication return (wrong/missing anti-forgery value) must be rejected and must not establish a session.
- **Untrusted return target**: A tampered "return to" destination must not redirect the visitor to an external/untrusted site after login (open-redirect protection); the post-login destination must be a trusted Ecosystem Analytics location for the active deployment.
- **Wrong-environment return address**: A return address not registered with Alkemio for the active deployment (e.g., a local address in a hosted build, or vice versa) must fail clearly rather than appear to succeed.
- **Concurrent tabs**: Multiple Ecosystem Analytics tabs sharing one EA session behave consistently; signing out in one and acting in another routes the second cleanly back to login.
- **Authorized at Alkemio but not for this client**: A valid Alkemio account that is not permitted to use Ecosystem Analytics receives a clear, non-crashing "not authorized" outcome.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an unauthenticated visitor requests any protected part of Ecosystem Analytics, the system MUST redirect them to Alkemio's hosted login page instead of presenting an in-application credential form.
- **FR-002**: The system MUST NOT collect, transmit, or store Alkemio usernames or passwords itself, and MUST NOT render any method-specific sign-in UI (including social-provider buttons); all credential entry and method selection happen only on Alkemio's login page.
- **FR-003**: After a visitor successfully authenticates with Alkemio, the system MUST return them to the location within Ecosystem Analytics they originally requested (or a sensible default landing page when none was specified).
- **FR-004**: Upon a successful authenticated return, the system MUST establish its own signed-in Ecosystem Analytics session for the visitor, distinct from Alkemio's own browser session.
- **FR-005**: The system MUST sign in as the registered `ecosystem-analytics` OAuth2/OIDC client and obtain, on the visitor's behalf, the credential Alkemio issues to that client; it MUST authorize Alkemio data requests with that credential so results reflect the visitor's Alkemio permissions. The system MUST NOT depend on inheriting Alkemio's own `*.alkem.io` browser session cookie.
- **FR-005a**: The access credential EA presents to the Alkemio API MUST satisfy Alkemio's Bearer-token validation: its audience (`aud`) MUST be one of the values Alkemio allow-lists (which includes `ecosystem-analytics`), and it MUST carry the `alkemio_actor_id` claim. The system MUST therefore request an allow-listed audience during sign-in (configurable; default `ecosystem-analytics`). A credential without an accepted audience is rejected by Alkemio as unauthenticated even though the visitor authenticated successfully.
- **FR-006**: The system MUST support two deployment situations with identical behavior, differing only by configuration: (a) hosted at `ecosystem-analytics.alkem.io`, and (b) running locally while pointing at production Alkemio. No code change may be required to switch between them — only configuration (the return address registered with Alkemio and the EA session scope).
- **FR-007**: In the hosted situation, a visitor already authenticated with Alkemio in the same browser MUST be able to reach Ecosystem Analytics signed in without re-entering credentials (silent single sign-on). This convenience MAY be unavailable in the local situation, but sign-in MUST still succeed there via the normal login screen.
- **FR-008**: The system MUST transparently renew a short-lived access credential when it expires during an active session, without prompting the visitor, for as long as renewal is possible.
- **FR-009**: When the session is absent, expired, or rejected and cannot be renewed, the system MUST treat the visitor as unauthenticated and route them back through the Alkemio login, without surfacing raw errors.
- **FR-009a**: An EA session's validity MUST be bounded by Alkemio's renewal-grant lifetime — when renewal can no longer succeed the session ends — with no separate EA-imposed absolute cap. The system MUST additionally enforce a configurable idle/inactivity timeout (default 8 hours) that ends an unused session sooner; on expiry by either bound, FR-009 routing applies.
- **FR-010**: The system MUST continue to scope each visitor's cached data to that visitor's own identity, so no visitor can see another visitor's cached results.
- **FR-011**: The system MUST resolve and display the signed-in visitor's identity (such as display name and avatar) as provided by Alkemio.
- **FR-012**: The system MUST provide a way for a visitor to sign out, ending their Ecosystem Analytics session.
- **FR-012a**: On explicit sign-out, the system MUST revoke its own stored Alkemio credentials (access and refresh grants) at Alkemio's token-revocation endpoint and then delete the server-side session record. On session end caused by renewal failure, the system MUST delete the server-side session record (the credential is already invalid). This invalidation applies only to EA's own held credentials and does NOT terminate Alkemio's broader browser session (global single-logout remains Out of Scope).
- **FR-013**: The system MUST validate the authentication return/callback to reject forged or replayed sign-in responses (including anti-forgery/state and one-time-use protections), and MUST reject return destinations that are not trusted Ecosystem Analytics locations for the active deployment.
- **FR-014**: The system MUST NOT write session identifiers, cookie values, tokens, or client secrets to logs.
- **FR-015**: When a visitor's Alkemio account is not authorized to use Ecosystem Analytics, the system MUST present a clear, non-crashing message explaining they lack access.
- **FR-016**: Once authenticated, all existing Ecosystem Analytics capabilities (space selection, graph generation, filtering, search, detail panels, queries) MUST function as they did before, with no loss of functionality.
- **FR-017**: The system MUST support every sign-in method offered by Alkemio's login page (username/password and social providers such as Microsoft and LinkedIn) without per-method handling in Ecosystem Analytics, since method selection and authentication occur entirely on Alkemio.
- **FR-018a**: The system MUST persist the EA session and the Alkemio-issued credentials (access and renewal grants) server-side in the existing SQLite store, encrypted at rest, keyed by an opaque session identifier. The session store MUST be shared rather than per-process so that the hosted deployment can run more than one backend replica without losing sessions; the browser MUST receive only the opaque session-id reference (never the tokens themselves).
- **FR-018**: The system MUST keep any confidential client credential (the secret Alkemio issues for the `ecosystem-analytics` client) only on the backend and never expose it to the browser. No access credential, renewal grant, or client secret may be delivered to, stored in, or reachable by the browser-side application; the browser MUST hold only an opaque, deployment-scoped Ecosystem Analytics session reference with no value usable outside Ecosystem Analytics.
- **FR-019**: Local-against-production deployments MUST NOT require the production confidential client secret to be present on developer machines. The system MUST obtain Alkemio credentials for the local situation by a means that does not place the production secret outside the hosted backend — e.g., a separate Alkemio client registration for local development, or a secret-less sign-in for the local situation. (Mechanism selected during planning; the requirement is that the production secret never lands on a laptop.)
- **FR-020**: The browser-side application MUST communicate exclusively with the Ecosystem Analytics backend (BFF) and MUST NOT call Alkemio (its API, identity provider, or token endpoints) directly. All Alkemio communication — sign-in orchestration, token exchange/refresh, and data requests — happens only on the backend, which is the sole holder of credentials and tokens. (This is the BFF-boundary the own-client, secret-behind-the-backend model depends on; see System Context & Architecture and Constitution Principle III.)
- **FR-021**: The Ecosystem Analytics session (and pre-auth) cookie MUST be stored and returned by the browser in **both** deployments, including the local case where the identity provider is on a different site than the app. Because the local sign-in callback is a cross-site redirect, the system MUST set the cookie with attributes that survive it: when no session-cookie domain is configured (local), the cookie MUST be `SameSite=None; Secure` (relying on `http://localhost` being a secure context); when a domain is configured (hosted, same-site as the IdP), `SameSite=Lax` MUST be used. A session that is created but whose cookie the browser discards (manifesting as a sign-in→data-request→re-login loop) is a defect against this requirement.

### Key Entities

- **EA OAuth2 client identity**: Ecosystem Analytics's own registration with Alkemio (`ecosystem-analytics`), including its allowed return addresses and a backend-only secret. This is what lets EA obtain its own credential rather than borrow Alkemio's browser session.
- **Issued access credential**: The short-lived credential Alkemio issues to EA for a signed-in visitor, used to authorize Alkemio API calls. It expires quickly and is renewed transparently while a longer-lived renewal grant remains valid.
- **Ecosystem Analytics session**: The signed-in state a visitor holds within Ecosystem Analytics for the duration of a visit, established by EA itself on the visitor's return from Alkemio. It is persisted server-side in the existing SQLite store (encrypted at rest), keyed by an opaque session id; the browser holds only that opaque id. Its scope (e.g., cookie host) is configuration that differs between the hosted and local deployments.
- **Visitor identity**: The signed-in person as known to Alkemio — at minimum a stable identifier plus display attributes (name, avatar) used for personalization and for scoping cached data.
- **Cached dataset**: Per-visitor, per-space results retained to speed up repeat views; always isolated to the identity that produced it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor with valid Alkemio credentials can go from opening Ecosystem Analytics to viewing their data with no in-app credential entry — the only credentials they type are on Alkemio's own login page.
- **SC-002**: The identical Ecosystem Analytics build authenticates and loads data both when hosted at `ecosystem-analytics.alkem.io` and when run locally against production Alkemio, with configuration as the only difference (verifiable by running the same build in both situations).
- **SC-003**: A visitor already logged into Alkemio in the same browser reaches hosted Ecosystem Analytics signed in without typing credentials, 100% of the time.
- **SC-004**: Ecosystem Analytics stores zero Alkemio passwords and zero long-lived personal credentials, and never exposes its client secret to the browser (verifiable by inspecting browser-delivered assets, storage, and logs).
- **SC-005**: When a short-lived credential expires mid-session, access continues without a visible interruption for as long as renewal is possible; when renewal is no longer possible, 100% of subsequent data requests result in a clean redirect back to login rather than an error or blank screen.
- **SC-006**: No visitor can ever load another visitor's data or cached results; access always matches the signed-in Alkemio account.
- **SC-007**: After the change, every previously available analytics capability still works once a visitor is authenticated — zero regressions in existing graph, query, and space features.
- **SC-008**: A typical sign-in (visitor not yet logged into Alkemio) completes in no more than two redirects and under 30 seconds of visitor-perceived time on a normal connection.

## Assumptions

- **Own-client model (decision)**: EA authenticates as the registered `ecosystem-analytics` client and establishes its own EA session, rather than inheriting Alkemio's `*.alkem.io` browser cookie. This is required because the local-against-production case cannot receive that cookie, and because EA is a distinct registered client. (Supersedes the earlier "reuse `alkemio_session` cookie" assumption.)
- **Dual deployment is configuration-only**: Switching between hosted and local-against-production requires changing configuration values (the return address registered with Alkemio for the active deployment, and the EA session scope) — not code.
- **Return addresses are pre-registered with Alkemio**: Alkemio must allow EA's return address for each deployment situation (at least the hosted `ecosystem-analytics.alkem.io` address and a local-development address). Sign-in to an unregistered return address is expected to fail.
- **Short-lived access, longer-lived renewal**: The credential EA uses to call the Alkemio API is short-lived and renewed transparently using a longer-lived renewal grant, so visitors are not forced to re-authenticate frequently. Exact lifetimes are governed by Alkemio's configuration of the EA client.
- **Hosted single sign-on**: In the hosted deployment, an existing Alkemio browser session lets EA sign the visitor in without a visible login screen. This is a hosted-case convenience, not a requirement for the local case.
- **Client authorization is Alkemio's decision**: Alkemio determines which accounts may use Ecosystem Analytics. EA enforces nothing beyond requiring a valid, authorized session.
- **Replacement, not addition**: The previous in-app email/password login and the legacy Kratos browser-session detection (`ory_kratos_session`) are retired and replaced by the redirect-based flow; they are not maintained in parallel.
- **Security baseline being replaced (and improved)**: The current implementation persists the Alkemio session token in browser-side storage and sends it from the browser as a bearer credential — meaning a real token lives in public browser code today. This feature removes that exposure: under FR-018 the token moves entirely behind the backend and the browser retains only an opaque EA session reference. The change is therefore a security improvement over the present state, not merely a feature swap.
- **Two-part architecture (confirmed)**: EA already consists of a public browser-side frontend and a backend-for-frontend that is the sole party communicating with Alkemio; the hosted deployment serves both from a single origin. This existing structure is what the own-client, secret-behind-the-backend design relies on (see System Context & Architecture).
- **Identity source unchanged in spirit**: The signed-in visitor's identity and permissions continue to be sourced from Alkemio; per-visitor cache scoping continues to key off that identity.
- **Sign-out scope**: Signing out of Ecosystem Analytics ends the Ecosystem Analytics session and revokes EA's own Alkemio-issued tokens at Alkemio's revocation endpoint (FR-012a). Whether it also terminates the broader Alkemio browser session (global single-logout) is out of scope unless later specified.

## Dependencies

- Alkemio's OIDC provider must recognize Ecosystem Analytics as a registered client (`ecosystem-analytics`) with valid return/redirect destinations for **both** the hosted (`ecosystem-analytics.alkem.io`) and local-development deployments, and must grant it the scope needed to authorize Alkemio API access on the visitor's behalf. For local development a separate **public** client (PKCE, no secret, e.g. `ecosystem-analytics-local`) is used; its registration must whitelist the localhost callback (`http://localhost:5173/api/auth/oidc/callback`) and permit requesting an allow-listed audience.
- Alkemio's Bearer-token validator must accept EA's requested audience: the audience EA requests (default `ecosystem-analytics`) must be present in Alkemio's `BEARER_AUD_ALLOW_LIST`, and the issued token must carry `alkemio_actor_id` (FR-005a). Both the access and ID tokens are produced by Alkemio's Hydra token hook.
- A backend-only client secret for the `ecosystem-analytics` client must be available to EA's backend in each deployment situation.
- For the hosted case, Ecosystem Analytics must be deployed at `ecosystem-analytics.alkem.io`; for the local case, EA must be configured to point at the production Alkemio API and identity provider.
- **Governance**: This feature changes the project's authentication method and conflicted with the former Constitution Principle 1 ("Kratos API Flow auth — username/password via BFF"). The required amendment has been **applied** — Principle I was redefined to "Alkemio OIDC Authentication (Authorization Code + PKCE via BFF)" at constitution **v4.0.0**. The governance gate is satisfied; no further amendment is needed before implementation.

## Out of Scope

- Building or theming any login, password-reset, or account-provisioning screens (these remain Alkemio's responsibility).
- Role- or permission-based authorization decisions inside Ecosystem Analytics beyond honoring Alkemio's access decision.
- Global single sign-out that terminates the underlying Alkemio session from within Ecosystem Analytics.
- Selecting among multiple identity providers from within Ecosystem Analytics.
- Exposing credential or renewal management to the visitor.
- Supporting deployments other than the two named situations (hosted at `ecosystem-analytics.alkem.io`, and local-against-production).
