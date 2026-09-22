import i18next from 'i18next';
import type { ApiError } from '@server/types/api.js';
import { redirectToLogin } from './auth.js';

export const API_BASE = import.meta.env.VITE_ECOSYSTEM_ANALYTICS_BACKEND_URL || '';

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

/** The BFF answered a streaming request with something other than an event stream. */
export class StreamNotSupportedError extends Error {
  constructor(contentType: string | null) {
    super(`Expected text/event-stream, got ${contentType ?? 'no content type'}`);
    this.name = 'StreamNotSupportedError';
  }
}

/**
 * POST a JSON body and consume the BFF's Server-Sent Events reply (feature 025).
 *
 * Frames are `event: <name>` / `data: <json>` pairs separated by a blank line; comment
 * lines (`: keep-alive`) are ignored. Every parsed `data` object is handed to `onEvent`
 * as it arrives. Resolves when the stream closes; rejects with {@link NetworkError} if
 * the connection drops, with {@link StreamNotSupportedError} if the response is not an
 * event stream (the caller may then fall back to a plain JSON request), and routes a
 * `401` through the once-guarded login redirect like every other request.
 */
export async function apiStream<E>(
  path: string,
  body: unknown,
  onEvent: (event: E) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      credentials: 'include',
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    console.error(`[api] POST ${path} (stream) failed at the transport:`, cause);
    throw new NetworkError(cause);
  }

  if (response.status === 401) {
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
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('text/event-stream')) {
    throw new StreamNotSupportedError(contentType);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new NetworkError(new Error('No response body'));

  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch = (block: string) => {
    // One frame = the concatenation of its `data:` lines; `event:` is informational
    // because every payload also carries its `type`.
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    let parsed: E;
    try {
      parsed = JSON.parse(data) as E;
    } catch {
      return; // malformed frame — skip, never abort the whole load
    }
    onEvent(parsed);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf('\n\n');
      while (sep >= 0) {
        dispatch(buffer.slice(0, sep));
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) dispatch(buffer);
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new NetworkError(cause);
  }
}
