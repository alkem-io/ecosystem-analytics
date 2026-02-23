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
