import { getToken, clearToken } from './auth.js';
import { api } from './api.js';
import type { StreamEvent, SessionResponse } from '../types/query.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * POST /api/query/ask — streams  SSE events as an async iterable.
 */
export async function* askQuery(
  query: string,
  sessionId?: string,
): AsyncGenerator<StreamEvent> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const body = JSON.stringify({ query, sessionId });

  const response = await fetch(`${API_BASE}/api/query/ask`, {
    method: 'POST',
    headers,
    body,
  });

  if (response.status === 401) {
    clearToken();
    window.location.href = '/';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((errorBody as { error: string }).error);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6)) as StreamEvent;
          yield event;
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  }

  // Process any remaining data in buffer
  if (buffer.startsWith('data: ')) {
    try {
      const event = JSON.parse(buffer.slice(6)) as StreamEvent;
      yield event;
    } catch {
      // Skip
    }
  }
}

/** POST /api/query/feedback */
export function submitFeedback(messageId: string, comment?: string) {
  return api.post<{ success: boolean }>('/api/query/feedback', { messageId, comment });
}

/** GET /api/query/session/:sessionId */
export function getSession(sessionId: string) {
  return api.get<SessionResponse>(`/api/query/session/${encodeURIComponent(sessionId)}`);
}
