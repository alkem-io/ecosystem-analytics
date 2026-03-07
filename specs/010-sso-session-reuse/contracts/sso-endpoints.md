# API Contract: SSO Endpoints

**Feature**: 010-sso-session-reuse | **Date**: 2026-03-04

## POST /api/auth/sso/detect

Detects whether the browser has an active Alkemio Kratos session by reading forwarded cookies. Public endpoint (no Bearer token required).

### Request

- **Method**: POST
- **Headers**: Standard. Browser must send cookies via `credentials: 'include'`.
- **Body**: None

### Response — Session Found (200)

```json
{
  "detected": true,
  "displayName": "Jane Doe",
  "avatarUrl": "https://alkem.io/storage/avatars/abc123.jpg",
  "token": "kratos_session_token_value"
}
```

### Response — No Session (200)

```json
{
  "detected": false
}
```

### Response — Error (500)

```json
{
  "error": "SSO detection failed"
}
```

### Notes

- The endpoint reads `ory_kratos_session` from the `Cookie` header.
- If the cookie is present, the BFF calls Kratos `GET /sessions/whoami` with the cookie forwarded.
- The Kratos whoami response contains the session token and user identity traits.
- The returned `token` is the same format as tokens from the manual login flow and can be used as a Bearer token.

## GET /api/auth/me (existing — no changes)

Already exists. Returns the authenticated user's profile. Used after authentication to populate the user context.

### Request

- **Headers**: `Authorization: Bearer {token}`

### Response (200)

```json
{
  "id": "user-uuid",
  "displayName": "Jane Doe",
  "avatarUrl": "https://alkem.io/storage/avatars/abc123.jpg"
}
```
