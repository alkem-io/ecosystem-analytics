# Tasks: SSO Session Reuse

**Input**: Design documents from `/specs/010-sso-session-reuse/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Server**: `server/src/`
- **Frontend**: `frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add types and configuration needed by multiple user stories

- [x] T001 Add `SsoDetectResponse` type to `server/src/types/api.ts` with fields: `detected` (boolean), `displayName` (string?), `avatarUrl` (string?), `token` (string?)
- [x] T002 [P] Add optional `ALKEMIO_KRATOS_PUBLIC_URL` to `server/analytics.yml` config and `server/.env.default`, with dynamic discovery fallback via Alkemio GraphQL `configuration` query
- [x] T003 [P] Add Kratos URL resolution utility in `server/src/auth/kratos-url.ts` — discovers Kratos public URL from Alkemio GraphQL config endpoint or env var, caches result

**Checkpoint**: Types and config ready for SSO endpoint implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: BFF SSO detection endpoint and frontend user context — MUST be complete before user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create SSO detection handler in `server/src/auth/sso.ts` — reads `ory_kratos_session` from `req.headers.cookie`, calls Kratos `GET /sessions/whoami` with cookie forwarded, extracts session token and user identity traits (displayName, avatarUrl), returns `SsoDetectResponse`
- [x] T005 Register SSO detection route `POST /api/auth/sso/detect` in `server/src/routes/auth.ts` — public endpoint (no authMiddleware), must handle missing cookie (return `{ detected: false }`) and Kratos errors (return `{ detected: false }`)
- [x] T006 [P] Create `UserContext` and `UserProvider` in `frontend/src/context/UserContext.tsx` — holds `UserContextState` (displayName, avatarUrl, loading), fetches from `GET /api/auth/me` after token is set, provides context to component tree
- [x] T007 [P] Create `useUser` hook in `frontend/src/hooks/useUser.ts` — wraps `useContext(UserContext)`, returns `{ displayName, avatarUrl, loading }`
- [x] T008 Add `detectSsoSession` function to `frontend/src/services/auth.ts` — calls `POST /api/auth/sso/detect` with `credentials: 'include'`, returns `SsoDetectResponse` or null on failure, includes 2-second timeout
- [x] T009 Wrap authenticated routes with `UserProvider` in `frontend/src/App.tsx` — ensures user context is available to all authenticated pages

**Checkpoint**: Foundation ready — SSO endpoint works, user context available to frontend

---

## Phase 3: User Story 1 + 3 — SSO Session Detection and Token Reuse (Priority: P1) 🎯 MVP

**Goal**: Detect existing Alkemio session, show confirmation prompt, and forward token to BFF for all subsequent requests

**Independent Test**: Log into Alkemio in one tab, open Ecosystem Analytics in another. See SSO prompt with your name. Confirm → land on Space selector. Load Spaces list and generate a graph successfully.

**Note**: US1 (detection + prompt) and US3 (token forwarding) are combined because token forwarding is integral to the SSO flow — without it, detection has no value.

### Implementation for User Story 1 + 3

- [x] T010 [US1] Modify `frontend/src/pages/LoginPage.tsx` — on mount, check if local token exists (skip if yes per FR-011); if no token, call `detectSsoSession()`; if session detected, show SSO confirmation prompt (display user's displayName and avatarUrl); if no session or detection fails, show standard login form
- [x] T011 [US1] Add SSO confirmation prompt UI to `frontend/src/pages/LoginPage.tsx` — show detected user's display name and avatar, "Continue as [name]" button, and "Use different account" link; style consistently with existing login form
- [x] T012 [US1] [US3] Handle SSO confirmation in `frontend/src/pages/LoginPage.tsx` — on confirm: call `setToken(response.token)` to store the SSO-provided token, then navigate to `/spaces`; on decline: show standard login form
- [x] T013 [US3] Verify SSO token works with existing BFF endpoints — after SSO login, the stored Bearer token must work with `GET /api/spaces`, `POST /api/graph/generate`, and `GET /api/auth/me` (no BFF changes needed per FR-005 since the token format is identical to manual login tokens)

**Checkpoint**: SSO detection and token reuse fully functional. Users with an Alkemio session can skip login.

---

## Phase 4: User Story 2 — Fallback to Manual Login (Priority: P2)

**Goal**: Ensure standard login form works perfectly when no Alkemio session exists, with no delay or errors from SSO detection

**Independent Test**: Open Ecosystem Analytics in incognito window. Login form should appear immediately with no SSO-related delay.

### Implementation for User Story 2

- [x] T014 [US2] Add loading/detection state to `frontend/src/pages/LoginPage.tsx` — show a brief loading indicator during SSO detection (max 2 seconds), then fall back to login form; if detection errors or times out, silently show login form with no error messages
- [x] T015 [US2] Handle edge case: Alkemio session expires between detection and confirmation in `frontend/src/pages/LoginPage.tsx` — if token from SSO detection fails on first use (401), clear token and show login form with message "Session expired, please log in"

**Checkpoint**: Both SSO and manual login paths work. No regressions to existing login flow.

---

## Phase 5: User Story 4 — User Profile Display in Top Bar (Priority: P1)

**Goal**: Show persistent user identity (avatar + dropdown) in top-right of all authenticated pages, replacing the standalone logout button

**Independent Test**: Log in (via either method), verify avatar appears in top-right on all pages, hover shows display name, click opens dropdown with working logout.

### Implementation for User Story 4

- [x] T016 [P] [US4] Create `UserProfileMenu` component in `frontend/src/components/UserProfileMenu.tsx` — renders user avatar (with fallback placeholder SVG/icon if avatarUrl is null), shows display name tooltip on hover, opens dropdown on click with "Logout" option; uses `useUser()` hook for data
- [x] T017 [P] [US4] Create CSS module `frontend/src/components/UserProfileMenu.module.css` — avatar circle style, hover tooltip, dropdown menu positioned below avatar, consistent with existing design tokens (colors, fonts, spacing from `styles/tokens.css`)
- [x] T018 [US4] Replace logout button with `UserProfileMenu` in `frontend/src/components/panels/TopBar.tsx` — remove existing logout button, add `UserProfileMenu` in the same top-right position; pass `onLogout` handler to the dropdown's logout action
- [x] T019 [US4] Add `UserProfileMenu` to Space selector page in `frontend/src/pages/SpaceSelector.tsx` — replace existing logout button with the same `UserProfileMenu` component for consistency across all authenticated pages
- [x] T020 [US4] Ensure `UserProvider` triggers profile fetch after both SSO and manual login in `frontend/src/context/UserContext.tsx` — profile should load immediately after token is set (via either login method) so avatar is available when authenticated pages render

**Checkpoint**: User profile visible on all authenticated pages with working logout dropdown.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, error handling, and quality improvements across all stories

- [x] T021 Add cookie-parser middleware or manual cookie parsing to `server/src/app.ts` if not already present — required for SSO endpoint to read `ory_kratos_session` from request cookies
- [x] T022 Ensure `credentials: 'include'` is configured on the frontend SSO detection fetch call and that server CORS config (`server/src/app.ts`) allows credentials from the frontend origin
- [x] T023 Handle avatar loading failure gracefully in `frontend/src/components/UserProfileMenu.tsx` — if avatar image fails to load, fall back to placeholder (Constitution Principle V)
- [x] T024 Verify SSO detection works on localhost (cookies shared across ports) and document any same-domain deployment requirements in `server/.env.default` comments

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001 (types) — BLOCKS all user stories
- **US1+US3 (Phase 3)**: Depends on Phase 2 completion (T004, T005, T008)
- **US2 (Phase 4)**: Depends on Phase 3 (builds on SSO detection in LoginPage)
- **US4 (Phase 5)**: Depends on Phase 2 (T006, T007, T009 for UserContext) — can run in parallel with Phase 3
- **Polish (Phase 6)**: Depends on Phases 3, 4, 5

### User Story Dependencies

- **US1+US3 (P1)**: Depends on foundational SSO endpoint (T004, T005) and frontend detection function (T008)
- **US2 (P2)**: Depends on US1+US3 — adds fallback/timeout handling to the same LoginPage
- **US4 (P1)**: Depends on UserContext (T006, T007, T009) — independent of US1/US2/US3

### Within Each User Story

- Types before endpoints
- Endpoints before frontend consumers
- Context providers before components that consume them
- Core implementation before edge case handling

### Parallel Opportunities

- T002 + T003 can run in parallel (config and utility, different files)
- T006 + T007 can run in parallel with T004 + T005 (frontend vs server work)
- Phase 3 (US1+US3) and Phase 5 (US4) can run in parallel after Phase 2
- T016 + T017 can run in parallel (component + CSS module)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Server-side (sequential — T005 depends on T004):
Task T004: "Create SSO detection handler in server/src/auth/sso.ts"
Task T005: "Register SSO route in server/src/routes/auth.ts"

# Frontend-side (parallel with server, and with each other):
Task T006: "Create UserContext in frontend/src/context/UserContext.tsx"
Task T007: "Create useUser hook in frontend/src/hooks/useUser.ts"
Task T008: "Add detectSsoSession to frontend/src/services/auth.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US3 Only)

1. Complete Phase 1: Setup (types, config)
2. Complete Phase 2: Foundational (SSO endpoint, UserContext)
3. Complete Phase 3: US1 + US3 (detection, prompt, token reuse)
4. **STOP and VALIDATE**: Test SSO flow end-to-end
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1+US3 → Test SSO detection → Deploy (MVP!)
3. Add US2 → Test fallback behavior → Deploy
4. Add US4 → Test user profile display → Deploy
5. Polish → Final validation → Deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US3 are combined into one phase because token forwarding is integral to SSO detection
- US4 (user profile) can be implemented in parallel with US1+US3 since it depends only on UserContext, not SSO detection
- No test tasks included (not explicitly requested in spec)
- Commit after each task or logical group
