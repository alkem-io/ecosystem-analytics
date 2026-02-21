/**
 * Frontend auth service — manages the bearer token in memory.
 * The token is NEVER persisted to localStorage, sessionStorage, or cookies (TR-015).
 */

let bearerToken: string | null = null;

/** Store the token in memory (called after auth callback redirect) */
export function setToken(token: string): void {
  bearerToken = token;
}

/** Get the current token (null if not authenticated) */
export function getToken(): string | null {
  return bearerToken;
}

/** Clear the token (logout) */
export function clearToken(): void {
  bearerToken = null;
}

/** Check if the user is authenticated */
export function isAuthenticated(): boolean {
  return bearerToken !== null;
}

/** Extract token from URL params after auth callback redirect */
export function extractTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    // Clean the URL without reloading
    window.history.replaceState({}, '', window.location.pathname);
    return token;
  }
  return null;
}
