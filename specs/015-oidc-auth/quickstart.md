# Quickstart: Redirect-Based Alkemio OIDC Login

How to configure and run EA under the new OIDC flow, in both supported deployments. The only difference between them is configuration (FR-006).

## Prerequisites (provider-side, one-time)

Alkemio must have registered EA's clients and callback URIs in Ory Hydra:
- **Hosted (confidential)**: `client_id=ecosystem-analytics`, `client_secret_basic`, redirect `https://ecosystem-analytics.alkem.io/api/auth/oidc/callback`.
- **Local dev (public)**: a separate public client (`token_endpoint_auth_method=none`, PKCE-S256, no secret), redirect e.g. `http://localhost:5173/api/auth/oidc/callback`.
- Both grant scopes `openid profile email offline_access alkemio` (the `alkemio` scope is required) and include `ecosystem-analytics` in the issued JWT `aud`.

## New configuration (`server/analytics.yml` + `.env`)

```yaml
oidc:
  issuer: ${OIDC_ISSUER}:https://identity.alkem.io/
  client_id: ${OIDC_CLIENT_ID}:ecosystem-analytics
  client_secret: ${OIDC_CLIENT_SECRET}:                 # EMPTY for local public client
  token_endpoint_auth_method: ${OIDC_TOKEN_AUTH_METHOD}:client_secret_basic  # "none" for local
  redirect_uri: ${OIDC_REDIRECT_URI}:https://ecosystem-analytics.alkem.io/api/auth/oidc/callback
  scopes: ${OIDC_SCOPES}:openid profile email offline_access alkemio
  audience: ${OIDC_AUDIENCE}:ecosystem-analytics         # REQUIRED: must be in Alkemio's BEARER_AUD_ALLOW_LIST (FR-005a)
session:
  cookie_domain: ${SESSION_COOKIE_DOMAIN}:               # e.g. .alkem.io hosted; empty (host-only) local
  idle_timeout_hours: ${SESSION_IDLE_TIMEOUT_HOURS}:8
  enc_key: ${OIDC_SESSION_ENC_KEY}:                      # REQUIRED: base64 32-byte AES-256 key
```

### Hosted `.env` (production)
```
OIDC_ISSUER=https://identity.alkem.io/
OIDC_CLIENT_ID=ecosystem-analytics
OIDC_CLIENT_SECRET=<from k8s secret ecosystem-analytics-client-secret>   # backend only
OIDC_TOKEN_AUTH_METHOD=client_secret_basic
OIDC_REDIRECT_URI=https://ecosystem-analytics.alkem.io/api/auth/oidc/callback
OIDC_AUDIENCE=ecosystem-analytics                # REQUIRED — Alkemio rejects tokens with no allow-listed aud (FR-005a)
SESSION_COOKIE_DOMAIN=.alkem.io                  # same-site as the IdP => session cookie is SameSite=Lax
OIDC_SESSION_ENC_KEY=<base64 32 bytes>
```

### Local-against-production `.env` (developer machine — NO production secret, FR-019)
```
# If :4000 is taken by a local Alkemio backend, move the BFF and point the Vite proxy at it:
ECOSYSTEM_ANALYTICS_BACKEND_PORT=4100            # then set frontend/vite.config.ts proxy target to :4100
OIDC_ISSUER=https://identity.alkem.io/
OIDC_CLIENT_ID=ecosystem-analytics-local         # SEPARATE public client (PKCE, no secret)
# OIDC_CLIENT_SECRET intentionally unset
OIDC_TOKEN_AUTH_METHOD=none
OIDC_REDIRECT_URI=http://localhost:5173/api/auth/oidc/callback
OIDC_AUDIENCE=ecosystem-analytics                # REQUIRED — an allow-listed aud Alkemio accepts (FR-005a)
ALKEMIO_GRAPHQL_ENDPOINT=https://alkem.io/api/private/graphql   # production data (interactive, user Bearer token)
SESSION_COOKIE_DOMAIN=                           # empty => host-only + SameSite=None;Secure (cross-site IdP, FR-021)
OIDC_SESSION_ENC_KEY=<base64 32 bytes, dev-local>
```

Generate an encryption key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

Provider-side, the `ecosystem-analytics-local` public client must whitelist `http://localhost:5173/api/auth/oidc/callback` and be allowed to request audience `ecosystem-analytics`.

## Run

```bash
# server
cd server && pnpm run dev      # :4000 (or :4100 if ECOSYSTEM_ANALYTICS_BACKEND_PORT is set)

# frontend (proxies /api → backend, so the browser sees a single origin for data calls)
cd frontend && pnpm run dev    # :5173
```

Open `http://localhost:5173` → you are redirected to Alkemio's hosted login → after authenticating you land back on the local app, signed in, seeing **production** data scoped to your own account.

> Note: the dev proxy makes *data* calls same-origin, but the OIDC **callback** is still a cross-site redirect from `identity.alkem.io`. That is why the local session cookie must be `SameSite=None; Secure` (FR-021) — `Lax` is silently dropped on that redirect and produces a sign-in→re-login loop.

## Smoke test (maps to acceptance scenarios)

1. **US1**: open the app with no session → redirected to Alkemio login (not an in-app form) → sign in → land on requested page → spaces/graph load (AS1–3).
2. **US1 social**: sign in via Microsoft/LinkedIn on Alkemio's page → returned signed-in, no method-specific EA UI (AS5).
3. **US2 dual-deploy**: same build, hosted vs local, differ only by `.env` (SC-002).
4. **US3 SSO (hosted)**: already logged into Alkemio in the browser → reach hosted EA without re-entering credentials (SC-003).
5. **US4 expiry**: delete the `oidc_sessions` row (or wait out idle timeout) → next action → clean redirect to login, no error page (AS US4-1).
6. **US4 logout**: `POST /api/auth/logout` → session gone, tokens revoked at Hydra, next visit requires sign-in (AS US4-2).
7. **Not authorized**: an account outside the `ecosystem-analytics` audience → `/not-authorized` page, no crash (FR-015).
8. **Forgery**: tamper `state` on the callback → `400`, no session (FR-013).

## Verification commands

```bash
cd server && pnpm run test        # auth contract + unit (crypto, session, refresh, state/nonce)
cd frontend && pnpm run test
cd frontend && pnpm run build     # tsc strict must pass
cd server && pnpm run build
```

Confirm SC-004 by hand: load the app, then inspect browser DevTools → Application → Cookies/Storage and Network — there must be **no** access/refresh token or client secret anywhere browser-side, only the opaque `ea_session` cookie.

## Constitution note

Principle I was amended from the Kratos API Flow to redirect-based Alkemio OIDC in
`.specify/memory/constitution.md` (**v3.1.0 → v4.0.0**, Sync Impact Report at the top). The amendment
is already applied — do **not** re-run `/speckit.constitution` (it would erroneously bump again). See
`plan.md` → Constitution Check.
