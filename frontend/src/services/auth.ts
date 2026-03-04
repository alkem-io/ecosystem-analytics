/**
 * Frontend auth service — manages the Alkemio-issued session token.
 * The token is persisted in localStorage so it survives page refreshes.
 *
 * Authentication flow:
 * 1. User enters email/password in the login form
 * 2. Frontend sends credentials to BFF (POST /api/auth/login)
 * 3. BFF authenticates with Alkemio Kratos API flow
 * 4. BFF returns the Kratos session_token
 * 5. Frontend stores token in localStorage, sends as Bearer to BFF on every request
 * 6. BFF forwards token to Alkemio GraphQL API
 */

const TOKEN_KEY = 'alkemio_token';

/** Store the token in localStorage */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Get the current token (null if not authenticated) */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Clear the token (logout) */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Check if the user is authenticated */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/** SSO detection response returned to the caller */
export interface SsoDetectResult {
  detected: boolean;
  displayName?: string;
  avatarUrl?: string | null;
  token?: string;
}

/**
 * Detect an existing Alkemio/Kratos browser session.
 *
 * The `ory_kratos_session` cookie is host-scoped to alkem.io, so the browser
 * will only send it to requests targeting that domain — not to the BFF on a
 * different subdomain. Therefore the frontend calls Kratos whoami directly
 * (with `credentials: 'include'`), and extracts the session token from the
 * response.
 *
 * Returns null if detection fails or times out (4 seconds total).
 */
export async function detectSsoSession(): Promise<SsoDetectResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    // 1. Get the Kratos whoami URL from the BFF
    const configRes = await fetch('/api/auth/sso/config', { signal: controller.signal });
    if (!configRes.ok) return null;
    const { whoamiUrl } = (await configRes.json()) as { whoamiUrl: string };

    // 2. Call Kratos whoami directly — browser attaches the ory_kratos_session
    //    cookie because the request targets the same domain that set it.
    const whoamiRes = await fetch(whoamiUrl, {
      credentials: 'include',
      signal: controller.signal,
    });
    if (!whoamiRes.ok) return null;

    const session = (await whoamiRes.json()) as KratosWhoamiResponse;

    const displayName =
      session.identity?.traits?.name?.first && session.identity?.traits?.name?.last
        ? `${session.identity.traits.name.first} ${session.identity.traits.name.last}`
        : (session.identity?.traits?.email ?? 'Unknown');

    const token = session.tokenized ?? session.session_token ?? undefined;

    return { detected: true, displayName, avatarUrl: null, token };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Minimal type for the Kratos whoami response */
interface KratosWhoamiResponse {
  id: string;
  active?: boolean;
  session_token?: string;
  tokenized?: string;
  identity?: {
    id: string;
    traits?: {
      email?: string;
      name?: { first?: string; last?: string };
    };
  };
}
