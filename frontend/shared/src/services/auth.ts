/**
 * Frontend auth service (shared) — redirect-based Alkemio OIDC.
 *
 * No token in the browser: EA's session is an httpOnly `ea_session` cookie set by
 * the BFF. `login()` redirects to the BFF (which 302s to Alkemio), `fetchMe()`
 * reads the current identity, `logout()` ends the session.
 */
import type { AccessReport } from '@server/types/access.js';
import { scopeImageCacheBustToUser } from '../lib/imageCacheBust.js';

export interface MeResponse {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  alkemioServerUrl: string;
  /**
   * Where this person stands with the application that served the request (feature
   * 026). Optional only so a shell still renders against an older BFF.
   */
  access?: AccessReport;
}

let loginRedirectStarted = false;

/**
 * Navigate to the BFF's sign-in start — at most ONCE per page.
 *
 * A page that has lost its session (every deploy invalidates all sessions) fires
 * several requests in parallel and gets several 401s; if each one navigated, the
 * browser would start several OIDC flows a few milliseconds apart, and only the
 * last would survive — with the earlier ones' callback responses still landing
 * and interfering with the cookie the survivor needs. One redirect is all that
 * is ever needed: the first `returnTo` is as good as any (they all describe this
 * page). The flag lives for the life of the document, which ends on navigation.
 */
export function redirectToLogin(returnTo: string): void {
  if (loginRedirectStarted) return;
  loginRedirectStarted = true;
  window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Begin sign-in by redirecting to the BFF (which 302s to Alkemio). */
export function login(returnTo?: string): void {
  redirectToLogin(returnTo ?? window.location.pathname + window.location.search);
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

/**
 * "Check again" (feature 026): ask the BFF to re-decide this person's access to the
 * current application from Alkemio, now. A `401` means the session itself is gone.
 */
export async function recheckAccess(): Promise<AccessReport> {
  const res = await fetch('/api/auth/access/recheck', { method: 'POST', credentials: 'include' });
  if (res.status === 401) {
    redirectToLogin(window.location.origin + window.location.pathname + window.location.search);
    throw new Error('Session expired');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { access: AccessReport }).access;
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
