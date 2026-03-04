# Feature Specification: SSO Session Reuse

**Feature Branch**: `010-sso-session-reuse`
**Created**: 2026-03-04
**Status**: Draft
**Input**: User description: "Allow single sign on using existing Alkemio login sessions when the application is opened within a browser that has an existing Alkemio session."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Session Detection and Reuse (Priority: P1)

A user who is already logged into the Alkemio platform opens the Ecosystem Analytics application in the same browser. Instead of seeing a login form, the application detects their existing Alkemio session and displays a prompt asking whether they want to continue as their current Alkemio user. If they confirm, they are immediately taken to the Space selector without entering credentials.

**Why this priority**: This is the core value of the feature — eliminating redundant login for users who already have an active Alkemio session. It directly reduces friction for the most common production use case.

**Independent Test**: Can be fully tested by having a user log into Alkemio in one tab, then opening Ecosystem Analytics in another tab. The user should see their name/identity and a prompt to continue, and upon confirming, land on the Space selector.

**Acceptance Scenarios**:

1. **Given** the user has an active Alkemio session in their browser, **When** they open Ecosystem Analytics, **Then** the application displays a prompt showing their Alkemio identity (display name) and asks if they want to continue as that user.
2. **Given** the user sees the SSO prompt, **When** they confirm they want to continue, **Then** they are authenticated and redirected to the Space selector without entering credentials.
3. **Given** the user sees the SSO prompt, **When** they decline, **Then** they are shown the standard login form to authenticate with different credentials.

---

### User Story 2 - Fallback to Manual Login (Priority: P2)

A user opens Ecosystem Analytics without an existing Alkemio session in their browser. The application detects no existing session and shows the standard login form, exactly as it works today.

**Why this priority**: Ensures the existing login flow remains fully functional and the SSO detection does not break the default experience.

**Independent Test**: Can be tested by opening Ecosystem Analytics in a fresh browser or incognito window. The standard login form should appear immediately with no SSO-related delay or error.

**Acceptance Scenarios**:

1. **Given** the user has no active Alkemio session, **When** they open Ecosystem Analytics, **Then** the standard login form is displayed promptly with no noticeable delay from session detection.
2. **Given** the session detection check fails or times out, **When** the login page loads, **Then** the standard login form is shown without error messages.

---

### User Story 3 - SSO Token Forwarded to BFF (Priority: P1)

After the user confirms SSO session reuse, the authentication token from their existing session is forwarded to the BFF so that all subsequent data requests (spaces, graph generation, etc.) use the user's Alkemio permissions.

**Why this priority**: Without this, the SSO session detection has no practical value — the BFF needs a valid token to query Alkemio's GraphQL API on behalf of the user.

**Independent Test**: After SSO login, the user can successfully load their Spaces list and generate a graph, confirming the token is valid and properly forwarded.

**Acceptance Scenarios**:

1. **Given** the user authenticated via SSO session reuse, **When** they request their Spaces list, **Then** the BFF successfully returns Spaces using the SSO-provided token.
2. **Given** the user authenticated via SSO session reuse, **When** they generate a graph, **Then** the graph is generated using their Alkemio permissions (same data they would see on the Alkemio platform).

---

### User Story 4 - User Profile Display in Top Bar (Priority: P1)

At all times when the user has a valid session (whether via SSO or manual login), the top-right area of the application (where the logout button currently is) displays a user profile indicator. The indicator always shows the current user's avatar and, on hover, reveals the user's display name. Clicking the avatar opens a dropdown menu with a logout option (additional menu items may be added in the future).

**Why this priority**: Provides persistent identity feedback so users always know which account they are using. Essential for SSO reuse where the user may not have manually entered credentials and needs confirmation of their active identity.

**Independent Test**: Can be tested by logging in (via either method) and verifying the avatar appears in the top-right, the display name shows on hover, and clicking opens a dropdown with a working logout option.

**Acceptance Scenarios**:

1. **Given** the user is authenticated, **When** any page loads, **Then** the top-right area displays the current user's avatar image (or a fallback placeholder if no avatar is available).
2. **Given** the user is authenticated, **When** they hover over the avatar, **Then** a tooltip or popover shows the user's display name.
3. **Given** the user is authenticated, **When** they click the avatar, **Then** a dropdown menu appears with at least a "Logout" option.
4. **Given** the user clicks "Logout" in the dropdown, **When** the action completes, **Then** the local session is cleared and the user is redirected to the login page.

---

### Edge Cases

- What happens when the existing Alkemio session expires between detection and confirmation? The system should handle this gracefully by showing the login form with an informative message.
- What happens when the browser blocks cross-origin cookie access (e.g., Safari ITP, incognito mode)? The system should fall back to the standard login form silently.
- What happens if the user has multiple Alkemio sessions (e.g., different profiles)? The system uses whichever session the browser provides (the active cookie) — only one identity is shown.
- What happens on localhost during development? The feature should work when the Alkemio platform and Ecosystem Analytics are accessible on localhost.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST detect an existing Alkemio session in the user's browser when the login page loads.
- **FR-002**: When an existing session is detected, the application MUST send the session cookie to the BFF, which queries the Alkemio GraphQL API to retrieve the current user's identity (display name) and returns it to the frontend.
- **FR-003**: The application MUST display a confirmation prompt showing the detected user's identity and offering to continue as that user or to log in with different credentials.
- **FR-004**: Upon user confirmation, the application MUST extract the session token and send it to the BFF for use in subsequent authenticated requests.
- **FR-005**: The BFF MUST accept and use the SSO-provided session token in the same way it uses tokens obtained through the manual login flow.
- **FR-006**: If no existing session is detected, the application MUST display the standard login form with no visible delay or error from the detection attempt.
- **FR-007**: Session detection MUST complete within a reasonable time so that the login page does not feel slow.
- **FR-008**: The feature MUST work in production (where Alkemio and Ecosystem Analytics share a domain or subdomain) and on localhost.
- **FR-009**: If the detected session becomes invalid after confirmation, the application MUST redirect the user to the login form with an appropriate message.
- **FR-010**: When a user who authenticated via SSO logs out of Ecosystem Analytics, only the local session MUST be cleared; the underlying Alkemio session MUST remain active.
- **FR-011**: SSO session detection MUST only run when no valid local token exists. If the user already has a stored token, the application MUST skip detection and proceed directly to the app.
- **FR-012**: When the user has a valid session, the top-right area of the application MUST display the current user's avatar (with a placeholder fallback if unavailable).
- **FR-013**: Hovering over the user avatar MUST display the user's display name.
- **FR-014**: Clicking the user avatar MUST open a dropdown menu containing at least a "Logout" option.
- **FR-015**: The user profile display MUST appear on all authenticated pages, replacing the current standalone logout button.

### Key Entities

- **Alkemio Session**: The existing browser session established by the Alkemio platform, represented by a session cookie. Contains the user's authentication state.
- **User Identity**: The display name of the currently authenticated Alkemio user, retrieved to show in the confirmation prompt.
- **Session Token**: The authentication token extracted from the existing session and forwarded to the BFF for use with the Alkemio GraphQL API.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users with an active Alkemio session can access Ecosystem Analytics in under 10 seconds (from opening the app to reaching the Space selector), compared to the current flow requiring manual credential entry.
- **SC-002**: The SSO session detection adds no more than 2 seconds to the login page load time when no session exists.
- **SC-003**: 100% of users without an existing Alkemio session see the standard login form with no SSO-related errors or confusion.
- **SC-004**: Users who authenticate via SSO session reuse have full access to the same Spaces and data as if they had logged in manually.

## Clarifications

### Session 2026-03-04

- Q: Should the frontend query the Alkemio GraphQL API directly or go through the BFF for session detection? → A: Frontend sends detected cookie to BFF; BFF queries Alkemio GraphQL API and returns user identity (preserves BFF boundary principle).
- Q: Should logging out of Ecosystem Analytics also invalidate the Alkemio session? → A: No. Only clear the local Ecosystem Analytics session; the Alkemio session remains active.
- Q: Should SSO detection run when the user already has a valid local token? → A: No. Skip detection if a valid local token exists; go straight to the app.

## Assumptions

- The Alkemio platform sets a browser-accessible session cookie (e.g., a Kratos session cookie) that persists across tabs and is accessible to Ecosystem Analytics when served from the same domain or subdomain.
- In production, Ecosystem Analytics is deployed on the same domain or a subdomain of the Alkemio platform, allowing cookie access without cross-origin restrictions.
- On localhost, cookies set by one port are accessible to other ports on the same host (standard browser behavior for localhost).
- The session token format obtained from the cookie is compatible with the BFF's existing Bearer token authentication mechanism.
