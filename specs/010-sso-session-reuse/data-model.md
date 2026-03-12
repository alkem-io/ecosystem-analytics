# Data Model: SSO Session Reuse

**Feature**: 010-sso-session-reuse | **Date**: 2026-03-04

## Entities

### SsoDetectResponse (new)

Response from the BFF SSO detection endpoint.

| Field | Type | Description |
|-------|------|-------------|
| detected | boolean | Whether an active Alkemio session was found |
| displayName | string? | User's display name (present only when detected=true) |
| avatarUrl | string? | User's avatar URL (present only when detected=true) |
| token | string? | Kratos session token for subsequent Bearer auth (present only when detected=true) |

### UserProfile (existing — no changes)

Already defined in `server/src/types/api.ts`.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Alkemio user ID |
| displayName | string | User's display name |
| avatarUrl | string \| null | User's avatar URL |

### UserContextState (new — frontend only)

React context state for user identity.

| Field | Type | Description |
|-------|------|-------------|
| displayName | string | Current user's display name |
| avatarUrl | string \| null | Current user's avatar URL |
| loading | boolean | Whether profile is being fetched |

## State Transitions

### Authentication State Machine

```
[No Token]
  → SSO detection (POST /api/auth/sso/detect with credentials: include)
    → Session found → Show SSO prompt (displayName visible)
      → User confirms → Store token → [Authenticated]
      → User declines → [Show Login Form]
    → No session → [Show Login Form]
  → Manual login (POST /api/auth/login)
    → Success → Store token → [Authenticated]

[Authenticated]
  → Fetch user profile (GET /api/auth/me) → Populate UserContext
  → 401 on any request → Clear token → [No Token]
  → Logout → Clear token → [No Token]
```

## No Storage Changes

This feature does not modify the SQLite cache schema. The session token obtained via SSO is functionally identical to one obtained via manual login — the existing cache scoping by `(user_id, space_id)` works unchanged.
