import type { ApiError } from '@server/types/api.js';

const API_BASE = import.meta.env.VITE_ECOSYSTEM_ANALYTICS_BACKEND_URL || '';

/**
 * Base fetch wrapper shared by both frontends. The browser talks only to the BFF
 * and authenticates via the httpOnly `ea_session` cookie (`credentials: 'include'`).
 * A `401` means the session is gone/expired → hand off to the BFF login redirect.
 */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    // Absolute origin so re-auth lands back on THIS frontend (the OIDC callback
    // runs on a single registered origin; an allow-listed absolute returnTo
    // bounces the user back here — Explorer or VNG). See server validateReturnTo.
    const returnTo = window.location.origin + window.location.pathname + window.location.search;
    window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      error: 'UNKNOWN',
      message: `HTTP ${response.status}`,
    }));
    throw new Error(error.message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
