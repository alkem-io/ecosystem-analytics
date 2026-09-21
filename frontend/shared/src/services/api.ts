import i18next from 'i18next';
import type { ApiError } from '@server/types/api.js';
import { redirectToLogin } from './auth.js';

const API_BASE = import.meta.env.VITE_ECOSYSTEM_ANALYTICS_BACKEND_URL || '';

/**
 * A transport failure: the request never reached the BFF, or the connection dropped
 * before a response arrived.
 *
 * `fetch()` rejects on exactly one class of problem — the server was unreachable, the
 * connection was reset, or the page navigated/reloaded mid-flight — and reports every
 * one of them as `TypeError: Failed to fetch`. That string is accurate in a console and
 * useless in a UI, and it is what the dashboard's long requests (the graph acquisition
 * behind the Funnel, Cities and Initiatives tabs) surface when they are interrupted.
 * Every hook renders `err.message` verbatim, so the message is fixed HERE rather than in
 * each of them.
 */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(
      i18next.t('states.networkError', {
        defaultValue: 'Could not reach the server. Check your connection and try again.',
      }),
    );
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

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

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (cause) {
    // Keep the raw reason in the console — the replacement message above is for the
    // reader, and a dropped connection still needs to be diagnosable.
    console.error(`[api] ${options.method ?? 'GET'} ${path} failed at the transport:`, cause);
    throw new NetworkError(cause);
  }

  if (response.status === 401) {
    // Absolute origin so re-auth lands back on THIS frontend (the OIDC callback
    // runs on a single registered origin; an allow-listed absolute returnTo
    // bounces the user back here — Explorer or VNG). See server validateReturnTo.
    const returnTo = window.location.origin + window.location.pathname + window.location.search;
    redirectToLogin(returnTo);
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
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
