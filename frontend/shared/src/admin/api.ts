import type {
  AdminAccessView,
  ClassificationChangeResult,
  GdSourceSummaryView,
  IncludedSpaceProblem,
  IncludedSpacesView,
  InitiativeClassificationsView,
  InitiativeRef,
  SettingsChangeView,
  SpaceCandidate,
} from '@server/types/admin.js';
import { redirectToLogin } from '../services/auth.js';
import { API_BASE, NetworkError } from '../services/api.js';
import { throwIfAccessDenied } from '../access/access-signal.js';

/**
 * Typed client for `/api/vng/admin/*` (feature 027, contracts/api-admin.md). Unlike the
 * plain `api` helper it keeps the status and body of a refusal (409, 422, 404), because
 * the admin screens act on them. A 401 goes to sign-in and a 403 ACCESS_DENIED raises the
 * shared access signal, exactly as every other request does.
 */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; [k: string]: unknown },
  ) {
    super(body?.error ?? `HTTP ${status}`);
    this.name = 'AdminApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }
  if (res.status === 401) {
    redirectToLogin(window.location.origin + window.location.pathname + window.location.search);
    throw new Error('Session expired');
  }
  await throwIfAccessDenied(res);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AdminApiError(res.status, body);
  return body as T;
}

const BASE = '/api/vng/admin';
const get = <T>(path: string) => request<T>(`${BASE}${path}`);
const put = <T>(path: string, body: unknown) =>
  request<T>(`${BASE}${path}`, { method: 'PUT', body: JSON.stringify(body) });

export const adminApi = {
  access: () => get<AdminAccessView>('/access'),
  includedSpaces: () => get<IncludedSpacesView>('/included-spaces'),
  history: (before?: number, limit = 20) =>
    get<{ changes: SettingsChangeView[]; next: number | null }>(
      `/included-spaces/history?limit=${limit}${before !== undefined ? `&before=${before}` : ''}`,
    ),
  saveIncludedSpaces: (body: { baseRevision: number; spaceNameIds: string[]; confirmEmpty?: boolean }) =>
    put<IncludedSpacesView>('/included-spaces', body),
  searchSpaces: (q: string) =>
    get<{ results: SpaceCandidate[] }>(`/space-search?q=${encodeURIComponent(q)}`),
  resolveSpace: (ref: string) =>
    get<{ space: SpaceCandidate }>(`/space-resolve?ref=${encodeURIComponent(ref)}`),
  initiatives: (q = '') =>
    get<{ initiatives: InitiativeRef[] }>(`/initiatives?q=${encodeURIComponent(q)}`),
  classifications: (nameId: string) =>
    get<InitiativeClassificationsView>(`/initiatives/${encodeURIComponent(nameId)}/classifications`),
  saveClassifications: (
    nameId: string,
    changes: Array<{ entryId: string; expectedSelectedValueIds: string[]; selectedValueIds: string[] }>,
  ) =>
    put<{ results: ClassificationChangeResult[]; classifications: InitiativeClassificationsView }>(
      `/initiatives/${encodeURIComponent(nameId)}/classifications`,
      { changes },
    ),
  gdSource: () => get<GdSourceSummaryView>('/gd-source'),
};

export type { IncludedSpaceProblem };
