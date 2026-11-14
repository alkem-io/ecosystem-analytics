import { useCallback, useEffect, useState } from 'react';
import type { MonitorScope } from '@server/types/admin.js';
import { api } from '../../services/api.js';

/**
 * Feature 027 — the Spaces the monitor reports on, from `GET /api/vng/scope` (the monitor's
 * own settings store, not an innovation hub). Only dashboards with `managedScope` use it.
 */

const STALE_EVENT = 'ea:monitor-scope-stale';

/**
 * Mark the scope stale after a manager saved the Included Spaces, so every mounted
 * `useMonitorScope` re-fetches (and the dashboard reloads with the new set).
 */
export function markMonitorScopeStale(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STALE_EVENT));
}

export interface UseMonitorScopeResult {
  scope: MonitorScope | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMonitorScope({ enabled }: { enabled: boolean }): UseMonitorScopeResult {
  const [scope, setScope] = useState<MonitorScope | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    window.addEventListener(STALE_EVENT, refetch);
    return () => window.removeEventListener(STALE_EVENT, refetch);
  }, [enabled, refetch]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<MonitorScope>('/api/vng/scope')
      .then((res) => {
        if (!cancelled) setScope(res);
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
  }, [enabled, nonce]);

  return { scope, loading, error, refetch };
}
