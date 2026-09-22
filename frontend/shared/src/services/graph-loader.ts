/**
 * Feature 025 — the ONE place the dashboards ask the BFF for a graph dataset.
 *
 * `loadGraph()` sends the selection to `POST /api/graph/generate` and resolves with the
 * processed dataset (plus the dashboard counts bundle when the BFF has a profile for the
 * app). Progress events are forwarded to `onEvent` as they arrive — on the streamed
 * transport (contracts/api-graph-generate-stream.md) they come from the server; on the
 * JSON fallback the loader synthesises the minimum (`processing` → `done`) so the strip
 * still behaves.
 *
 * The dashboards always ask for RELATIONAL data only (`includeActivity: false`,
 * `includeExtendedProfiles: false`) — activity and extended organisation profiles are
 * separate on-demand items (spec FR-012/FR-012a).
 */
import type { GraphDataset } from '@server/types/graph.js';
import type {
  DashboardCountsBundle,
  GraphGenerationBundle,
  GraphGenerationRequest,
  LoadEvent,
} from '@server/types/api.js';
import { API_BASE, apiStream, NetworkError, StreamNotSupportedError } from './api.js';
import { redirectToLogin } from './auth.js';

export interface LoadGraphRequest {
  app: string;
  spaceIds: string[];
  includeInitiatives: boolean;
  forceRefresh: boolean;
}

export interface LoadGraphResult {
  dataset: GraphDataset;
  dashboard?: DashboardCountsBundle;
}

export type LoadGraphFn = (
  request: LoadGraphRequest,
  onEvent: (event: LoadEvent) => void,
  signal: AbortSignal,
) => Promise<LoadGraphResult>;

function toBody(request: LoadGraphRequest): GraphGenerationRequest {
  return {
    spaceIds: request.spaceIds,
    app: request.app,
    includeInitiatives: request.includeInitiatives,
    forceRefresh: request.forceRefresh,
    includeActivity: false,
    includeExtendedProfiles: false,
  };
}

/** JSON transport: one request, one body; progress synthesised. */
export async function loadGraphJson(
  request: LoadGraphRequest,
  onEvent: (event: LoadEvent) => void,
  signal: AbortSignal,
): Promise<LoadGraphResult> {
  onEvent({ type: 'stage', item: 'spaces', stage: 'processing' });
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/graph/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-EA-Bundle': '1' },
      body: JSON.stringify(toBody(request)),
      credentials: 'include',
      signal,
    });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new NetworkError(cause);
  }
  if (response.status === 401) {
    redirectToLogin(window.location.origin + window.location.pathname + window.location.search);
    throw new Error('Session expired');
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error((err as { message?: string }).message ?? `HTTP ${response.status}`);
  }
  const body = (await response.json()) as GraphGenerationBundle | GraphDataset;
  // A bare dataset (a BFF or test stub that ignores `X-EA-Bundle`) is still a valid answer.
  const bundle: GraphGenerationBundle = 'dataset' in body ? body : { dataset: body };
  onEvent({ type: 'item', item: 'spaces', stage: 'done' });
  if (request.includeInitiatives) onEvent({ type: 'item', item: 'gd-initiatives', stage: 'done' });
  return { dataset: bundle.dataset, dashboard: bundle.dashboard };
}

/**
 * Streamed transport (US2): server-reported stages; resolves on the terminal `result`.
 * Falls back to the JSON transport when the BFF does not answer with an event stream.
 */
export async function loadGraph(
  request: LoadGraphRequest,
  onEvent: (event: LoadEvent) => void,
  signal: AbortSignal,
): Promise<LoadGraphResult> {
  let result: LoadGraphResult | null = null;
  try {
    await apiStream<LoadEvent>(
      '/api/graph/generate',
      toBody(request),
      (event) => {
        if (event.type === 'result') {
          result = { dataset: event.dataset, dashboard: event.dashboard };
          return;
        }
        onEvent(event);
      },
      signal,
    );
  } catch (err) {
    if (err instanceof StreamNotSupportedError) return loadGraphJson(request, onEvent, signal);
    throw err;
  }
  if (!result) throw new NetworkError(new Error('stream ended without a result'));
  return result;
}
