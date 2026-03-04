# Quickstart: SSO Session Reuse

**Feature**: 010-sso-session-reuse | **Date**: 2026-03-04

## Prerequisites

- Node 20+, pnpm 9+
- Alkemio platform running (for Kratos session cookie to exist)
- BFF served on the same domain/subdomain as Alkemio (production) or localhost (development)

## Development Setup

### 1. Environment Configuration

Add optional Kratos URL to `server/.env`:

```bash
# Optional — if not set, discovered dynamically from Alkemio GraphQL config
ALKEMIO_KRATOS_PUBLIC_URL=https://identity.alkem.io
```

### 2. Start Dev Servers

```bash
cd server && pnpm run dev    # Port 4010
cd frontend && pnpm run dev  # Port 5173, proxies /api → :4010
```

### 3. Testing SSO Detection

1. Log into the Alkemio platform in your browser (creates Kratos session cookie)
2. Open Ecosystem Analytics at `http://localhost:5173`
3. If the cookie is accessible, you should see the SSO prompt with your identity
4. Confirm to proceed, or decline to use manual login

### 4. Testing Without SSO

Open Ecosystem Analytics in an incognito window — the standard login form should appear immediately with no delay.

## Key Files

| File | Purpose |
|------|---------|
| `server/src/auth/sso.ts` | BFF SSO detection endpoint — reads cookie, calls Kratos whoami |
| `frontend/src/pages/LoginPage.tsx` | Modified — SSO detection on mount |
| `frontend/src/context/UserContext.tsx` | User identity context provider |
| `frontend/src/components/UserProfileMenu.tsx` | Avatar + dropdown in TopBar |
| `frontend/src/hooks/useUser.ts` | Hook for accessing user context |

## Testing

```bash
cd server && pnpm run test
cd frontend && pnpm run test
```
