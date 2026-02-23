# Kratos Session Tokenization — Infrastructure Dependency

The Ecosystem Analytics tool authenticates via a popup that opens the Alkemio/Kratos login page. After login, the popup needs to obtain a **signed JWT** from Kratos and pass it back to the parent window. This requires Kratos **session tokenization** to be configured on the Alkemio infrastructure.

## Current Status

- Kratos version deployed: **v1.3.0** (supports tokenization)
- Tokenization configured: **No** — `kratos.yml` has no `session.whoami.tokenizer` section
- Alkemio server JWT support: **Yes** — `getSessionFromJwt()` already exists and accepts `Authorization: Bearer <jwt>` with an embedded Kratos `Session` payload

## What Needs to Be Added

Three files/changes are needed in the Kratos configuration:

### 1. JWKS Key File

Generate a signing key pair (EdDSA recommended):

```bash
# Example using Ory's tooling or any JWKS generator
# Save as /etc/config/kratos/jwk.eddsa.json
```

The key must be in JWKS format. The public key is used by consumers to verify the JWT signature.

### 2. JsonNet Claims Mapper

Create `/etc/config/kratos/analytics.claims.jsonnet`:

```jsonnet
local session = std.extVar('session');
{
  claims: {
    session: session,
  },
}
```

This embeds the full Kratos `Session` object in the JWT claims, matching the `KratosPayload` interface the Alkemio server expects:

```typescript
interface KratosPayload {
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  nbf: number;
  sub: string;        // identity ID (auto-set by Kratos)
  session: Session;   // embedded by claims mapper
}
```

### 3. Kratos Config Update

Add to `kratos.yml` under the existing `session:` block:

```yaml
session:
  lifespan: 48h
  earliest_possible_extend: 24h
  whoami:
    tokenizer:
      templates:
        analytics:
          ttl: 5m
          jwks_url: file:///etc/config/kratos/jwk.eddsa.json
          claims_mapper_url: file:///etc/config/kratos/analytics.claims.jsonnet
```

- **`ttl: 5m`** — Short-lived JWT (the popup obtains it once, the frontend holds it in memory)
- **`jwks_url`** — Path to the JWKS key file for signing
- **`claims_mapper_url`** — Path to the JsonNet file that shapes the JWT claims

## How It Works

After the user authenticates in the popup:

```
1. Popup has Kratos session cookie (set during login)
2. Popup calls: GET /sessions/whoami?tokenize_as=analytics
3. Response includes { tokenized: "<signed-jwt>" }
4. Popup sends JWT to parent window via postMessage
5. Parent stores JWT in memory
6. JWT sent as Authorization: Bearer <jwt> to BFF
7. BFF forwards to Alkemio GraphQL API
8. Alkemio server decodes JWT via getSessionFromJwt()
```

## Fallback (If Tokenization Is Not Available)

If Kratos tokenization cannot be configured, an alternative is a **session bridge page** hosted on the Alkemio domain (e.g., `alkem.io/auth/session-bridge`):

1. The popup loads this page (on the Alkemio domain, so it has the session cookie)
2. The page calls Kratos `toSession()` — the cookie is sent automatically
3. The page extracts identity info (user ID, email) from the session response
4. The page sends identity info to the parent window via `postMessage`

**Tradeoffs vs tokenization:**

| Aspect | Tokenization (preferred) | Session bridge (fallback) |
| --- | --- | --- |
| Security | Signed JWT with short TTL | Unsigned data via postMessage |
| Infrastructure change | Kratos config + key file | Custom HTML page on Alkemio domain |
| Server compatibility | Already supported (`getSessionFromJwt`) | Would need a different auth validation path |
| Token forwarding to GraphQL | JWT forwarded as Bearer header | Would need to call `toSession({ xSessionToken })` or similar |

## References

- [Ory docs: Issue JWTs for Ory Sessions](https://www.ory.com/docs/identities/session-to-jwt-cors)
- [Kratos PR #3472: Session tokenization](https://github.com/ory/kratos/pull/3472)
- Alkemio server JWT handling: `server/src/services/infrastructure/kratos/kratos.service.ts` (`getSessionFromJwt`)
- Alkemio Kratos config: `server/.build/ory/kratos/kratos.yml`
