import { useEffect, useState } from 'react';

/**
 * Feature 027 (research R11) — the dashboards have no router; the admin area is the one
 * other "page", reached at `/admin`. Navigation is `history.pushState` plus an event, so
 * Back and Forward work and nothing else in the shell has to change.
 */
const EVENT = 'ea:navigate';

export const ADMIN_PATH = '/admin';

export function navigate(path: string): void {
  if (typeof window === 'undefined' || window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event(EVENT));
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
