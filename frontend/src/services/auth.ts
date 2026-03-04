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

/** SSO detection response from the BFF */
export interface SsoDetectResult {
  detected: boolean;
  displayName?: string;
  avatarUrl?: string | null;
  token?: string;
}

/**
 * Detect an existing Alkemio/Kratos browser session by calling the BFF.
 * The browser sends cookies automatically via `credentials: 'include'`.
 * Returns null if detection fails or times out (2 seconds).
 */
export async function detectSsoSession(): Promise<SsoDetectResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch('/api/auth/sso/detect', {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
    });

    if (!res.ok) return null;
    return (await res.json()) as SsoDetectResult;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
