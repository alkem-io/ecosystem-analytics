/**
 * Feature 025 — one round trip per hub for the orchestrator choice.
 *
 * Both the data provider (which widens the load to every candidate, research R7) and
 * the Ecosystem tab's `useOrchestratorChoice` need `GET /api/ecosystem/orchestrator/:hub`.
 * Sharing the promise here keeps that to a single request per hub per page, so opening
 * the Ecosystem tab adds nothing to the network (SC-001). Writes (`choose`/`reset`)
 * refresh the cached value through {@link rememberOrchestratorChoice}.
 */
import { api } from '../../services/api.js';
import type { OrchestratorChoiceResponse } from '../hooks/useOrchestratorChoice.js';

const cache = new Map<string, Promise<OrchestratorChoiceResponse>>();

export function fetchOrchestratorChoice(hubNameId: string): Promise<OrchestratorChoiceResponse> {
  let p = cache.get(hubNameId);
  if (!p) {
    p = api.get<OrchestratorChoiceResponse>(
      `/api/ecosystem/orchestrator/${encodeURIComponent(hubNameId)}`,
    );
    cache.set(hubNameId, p);
    // A failed fetch must not poison the memo for the rest of the page.
    p.catch(() => cache.delete(hubNameId));
  }
  return p;
}

/** After a successful write, make the cache answer with the server's new state. */
export function rememberOrchestratorChoice(res: OrchestratorChoiceResponse): void {
  cache.set(res.hubNameId, Promise.resolve(res));
}

/** Drop the memo for a hub (a re-load requested by the tab). */
export function forgetOrchestratorChoice(hubNameId: string): void {
  cache.delete(hubNameId);
}
