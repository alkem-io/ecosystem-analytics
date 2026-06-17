import { GraphQLClient } from 'graphql-request';
import { loadConfig } from '../config.js';
import { getSdk, type Sdk } from './generated/graphql.js';
import type { AuthContext } from '../auth/middleware.js';
import { decrypt } from '../auth/oidc/crypto.js';
import { ensureFreshAccessToken } from '../auth/oidc/refresh.js';

/**
 * Create a typed Alkemio SDK authorized with the session's Hydra access token.
 *
 * Before each use it lazily refreshes the access token when it is at/near expiry
 * while the refresh grant is still valid (FR-008) — transparent to the caller.
 * The decrypted token lives only in this function's scope and the outgoing
 * Authorization header; it is never logged or returned to the browser (FR-014).
 *
 * The legacy Kratos `cookie` mode has been removed — auth is OIDC-only.
 */
export async function createAlkemioSdk(auth: AuthContext): Promise<Sdk> {
  const config = loadConfig();
  const session = await ensureFreshAccessToken(auth.session);
  const accessToken = decrypt(session.accessTokenEnc, config.session.encKey);
  const client = new GraphQLClient(config.alkemioGraphqlEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return getSdk(client);
}

/**
 * Detect an Alkemio GraphQL authentication failure (a `401`, or an
 * UNAUTHENTICATED/UNAUTHORIZED GraphQL error) that a token refresh could not
 * resolve. Such a failure means EA's session is no longer usable upstream and
 * must be invalidated so the visitor re-authenticates (FR-009).
 */
export function isAlkemioAuthError(err: unknown): boolean {
  const e = err as {
    response?: {
      status?: number;
      errors?: Array<{ extensions?: { code?: string }; message?: string }>;
    };
  };
  if (e?.response?.status === 401) return true;
  const errors = e?.response?.errors ?? [];
  return errors.some((x) => {
    const code = x?.extensions?.code ?? '';
    const msg = x?.message ?? '';
    return (
      /UNAUTHENTICATED|UNAUTHORIZED|AUTHENTICATION/i.test(code) ||
      /\b401\b|unauthenticated|not authenticated/i.test(msg)
    );
  });
}
