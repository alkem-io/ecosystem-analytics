/**
 * Frontend auth service — redirect-based Alkemio OIDC.
 *
 * There is NO token in the browser. EA's session is an httpOnly `ea_session`
 * cookie set by the BFF; the browser only ever holds that opaque reference and
 * sends it automatically (same-origin) with `credentials: 'include'`.
 *
 * Flow:
 * 1. `login()` redirects the browser to the BFF, which 302s to Alkemio's hosted
 *    login page (any method: password, Microsoft, LinkedIn, …).
 * 2. After authenticating, Alkemio redirects back to the BFF callback, which
 *    establishes the session and lands the user on their requested page.
 * 3. `fetchMe()` reads the current identity; `logout()` ends the session.
 */

export interface MeResponse {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Begin sign-in by redirecting to the BFF (which 302s to Alkemio). */
export function login(returnTo?: string): void {
  const target = returnTo ?? window.location.pathname + window.location.search;
  window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(target)}`;
}

/** Fetch the current signed-in identity; resolves to null when unauthenticated. */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}

/** End the EA session, then return to the login screen. */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // best-effort; cookie is cleared server-side regardless
  } finally {
    window.location.href = '/login';
  }
}

// --- Legacy shims ----------------------------------------------------------
// Image-proxy URL builders across several graph components still call
// getToken() to optionally append `&token=`. Tokens no longer exist
// client-side; returning null makes those builders emit a clean cookie-auth
// proxy URL. Retained to avoid churning every view component.

/** @deprecated Tokens are not exposed to the browser; the session cookie authenticates. */
export function getToken(): string | null {
  return null;
}

/** @deprecated Sign-out goes through {@link logout}; retained as a no-op for legacy callers. */
export function clearToken(): void {
  /* no-op */
}
