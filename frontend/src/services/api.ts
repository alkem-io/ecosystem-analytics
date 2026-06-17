import type { ApiError } from '@server/types/api.js';

const API_BASE = import.meta.env.VITE_ECOSYSTEM_ANALYTICS_BACKEND_URL || '';

/**
 * Base fetch wrapper. The frontend talks only to the BFF (FR-020) and
 * authenticates via the httpOnly `ea_session` cookie — sent automatically with
 * `credentials: 'include'`. There is no Authorization header. A `401` means the
 * session is gone/expired, so we hand off to the BFF login redirect (FR-009).
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
    const returnTo = window.location.pathname + window.location.search;
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
