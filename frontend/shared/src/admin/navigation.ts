import { useEffect, useState } from 'react';

/**
 * Feature 027 (research R11) — the dashboards have no router; the admin area is the one
 * other "page", reached at `/admin`. Navigation is `history.pushState` plus an event, so
 * Back and Forward work and nothing else in the shell has to change.
 */
const EVENT = 'ea:navigate';

export const ADMIN_PATH = '/admin';

export function navigate(path: string, state: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined' || window.location.pathname === path) return;
  window.history.pushState(state, '', path);
  window.dispatchEvent(new Event(EVENT));
}

/** Open the admin area from the dashboard, remembering that Back can simply return. */
export function openAdmin(): void {
  navigate(ADMIN_PATH, { fromDashboard: true });
}

/**
 * Leave the admin area: step back in history when it was opened from the dashboard (so
 * the dashboard is exactly where it was, and Back/Forward stay natural), otherwise go to
 * the dashboard.
 */
export function leaveAdmin(): void {
  if (typeof window !== 'undefined' && (window.history.state as { fromDashboard?: boolean })?.fromDashboard) {
    window.history.back();
    return;
  }
  navigate('/');
}

/** The current pathname, kept in step with pushState navigation and Back/Forward. */
export function usePathname(): string {
  const read = () => (typeof window === 'undefined' ? '/' : window.location.pathname);
  const [path, setPath] = useState(read);
  useEffect(() => {
    const update = () => setPath(read());
    window.addEventListener('popstate', update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return path;
}

/** `/admin`, with or without a trailing slash. */
export const isAdminPath = (path: string) => path.replace(/\/+$/, '') === ADMIN_PATH;
