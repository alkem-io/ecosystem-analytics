import { useEffect, useState } from 'react';
import { api } from '@ea/shared';
import type { VngDashboardResponse } from '@server/types/api.js';

/** Request body for POST /api/vng/dashboard (contracts/api-vng-dashboard.md). */
export interface DashboardRequest {
  spaceIds: string[];
  includeGemeentes: boolean;
  includeInitiatives: boolean;
  /** GD checkbox — fold GD initiatives into the gemeente-distribution chart. */
  includeGemeenteDelers: boolean;
}

/** Options for {@link useDashboard}; `refreshNonce` forces a re-fetch when bumped. */
export interface UseDashboardOptions {
  refreshNonce?: number;
}

interface UseDashboardResult {
  data: VngDashboardResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch the data-source-aware dashboard counts for the current selection (US3).
 * Recomputes whenever the effective space set or the relevant toggles change.
 */
export function useDashboard(
  req: DashboardRequest,
  options: UseDashboardOptions = {},
): UseDashboardResult {
  const { refreshNonce = 0 } = options;
  const [data, setData] = useState<VngDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Serialize the request so the effect re-runs on any meaningful change. The
  // refreshNonce is folded in so an explicit refresh re-fetches the counts too.
  const key = `${JSON.stringify(req)}|${refreshNonce}`;

  useEffect(() => {
    if (req.spaceIds.length === 0) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .post<VngDashboardResponse>('/api/vng/dashboard', req)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}
