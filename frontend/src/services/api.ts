import { getToken, clearToken } from './auth.js';
import type { ApiError } from '@server/types/api.js';

const API_BASE = import.meta.env.VITE_ECOSYSTEM_ANALYTICS_BACKEND_URL || '';

/**
 * Base fetch wrapper that attaches the bearer token and handles 401 responses.
 * The frontend communicates exclusively with the BFF (FR-020).
 */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    window.location.href = '/';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: 'UNKNOWN',
      message: `HTTP ${response.status}`,
    }));
    throw new Error(error.detail ?? error.message ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),

  /** Generate a dashboard dataset for a single space */
  generateDashboard: (spaceId: string, forceRefresh?: boolean) =>
    apiFetch<import('@server/types/dashboard.js').DashboardDataset>('/api/dashboard/generate', {
      method: 'POST',
      body: JSON.stringify({ spaceId, forceRefresh }),
    }),
};
