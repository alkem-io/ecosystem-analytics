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
  const stats = statsFor(auth);
  const client = new GraphQLClient(config.alkemioGraphqlEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    // Count every request and its response size for THIS auth context (feature 025,
    // research R9): the acquisition summary prints `requests=<n> bytes=<n>` so the
    // platform cost of one load can be read from the log (SC-004 / SC-002a).
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      stats.requests += 1;
      const res = await fetch(input, init);
      const len = Number(res.headers.get('content-length'));
      if (Number.isFinite(len) && len > 0) {
        stats.bytes += len;
        return res;
      }
      // No content-length (chunked): measure the body once and hand back a fresh
      // Response so graphql-request can still consume it.
      const buf = await res.arrayBuffer();
      stats.bytes += buf.byteLength;
      return new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers });
    },
  });
  return getSdk(client);
}

/** Per-auth-context request counters (feature 025). Reset with {@link resetRequestStats}. */
export interface RequestStats {
  requests: number;
  bytes: number;
}

const requestStats = new WeakMap<object, RequestStats>();

function statsFor(auth: AuthContext): RequestStats {
  let stats = requestStats.get(auth);
  if (!stats) {
    stats = { requests: 0, bytes: 0 };
    requestStats.set(auth, stats);
  }
  return stats;
}

/** Read the Alkemio request/byte counters accumulated for this auth context. */
export function getRequestStats(auth: AuthContext): RequestStats {
  return { ...statsFor(auth) };
}

/** Zero the counters — call at the start of a load so the summary is per load. */
export function resetRequestStats(auth: AuthContext): void {
  const stats = statsFor(auth);
  stats.requests = 0;
  stats.bytes = 0;
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
