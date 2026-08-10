import { useEffect, useState } from 'react';
import { api, useAppConfig } from '../../index.js';
import type { GemeenteLocationsResponse } from '@server/types/api.js';

/**
 * The position of every Dutch gemeente (feature 019).
 *
 * Unlike the other dashboard hooks this takes no selection and no toggles — the response
 * is identical for every request, which is exactly why the Usage Explorer can recompute
 * its ranking locally on each zoom instead of asking the server (FR-005b, FR-016).
 *
 * Because the payload is invariant, it is memoised for the lifetime of the page: switching
 * tabs, changing the selection, or toggling GD never re-fetches it. The server caches it
 * for a week on top of that, so only the very first visit pays the Alkemio sweep.
 */

/** Page-lifetime memo, keyed by API namespace so VNG and GovTech don't share a slot. */
const inflight = new Map<string, Promise<GemeenteLocationsResponse>>();

export interface UseGemeenteLocationsResult {
  data: GemeenteLocationsResponse | null;
  loading: boolean;
  error: string | null;
}

export function useGemeenteLocations(): UseGemeenteLocationsResult {
  const { apiNamespace } = useAppConfig();
  const [data, setData] = useState<GemeenteLocationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    let promise = inflight.get(apiNamespace);
    if (!promise) {
      promise = api.get<GemeenteLocationsResponse>(`/api/${apiNamespace}/gemeente-locations`);
      inflight.set(apiNamespace, promise);
      // A failed fetch must not poison the memo — otherwise a single transient error
      // would leave the tab permanently broken for the rest of the session.
      promise.catch(() => inflight.delete(apiNamespace));
    }

    promise
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiNamespace]);

  return { data, loading, error };
}
