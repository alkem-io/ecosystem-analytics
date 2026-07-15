/**
 * Frontend auth service (shared) — redirect-based Alkemio OIDC.
 *
 * No token in the browser: EA's session is an httpOnly `ea_session` cookie set by
 * the BFF. `login()` redirects to the BFF (which 302s to Alkemio), `fetchMe()`
 * reads the current identity, `logout()` ends the session.
 */
import { scopeImageCacheBustToUser } from '../lib/imageCacheBust.js';

export interface MeResponse {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  alkemioServerUrl: string;
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
    const me = (await res.json()) as MeResponse;
    // Identity is the only place the user id is known, and every app fetches it before
    // rendering visuals — bind the per-user image cache-bust token here so no app has to
    // remember to. Missing it would silently serve stale cached images after a refresh.
    scopeImageCacheBustToUser(me.userId);
    return me;
  } catch {
    return null;
  }
}

/** End the EA session, then return to the login screen. */
export async function logout(redirectTo = '/login'): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // best-effort; cookie is cleared server-side regardless
  } finally {
    window.location.href = redirectTo;
  }
}
